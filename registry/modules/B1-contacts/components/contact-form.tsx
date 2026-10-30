import { useCallback, useMemo, useRef, useState, type RefObject } from "react"
import type { Control, UseFormReturn } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import {
  useExtensionForm,
  type ExtensionFormApi,
} from "@/components/erp/extension-field-input"
import { FormField } from "@/components/erp/form"
import {
  RecordFormDialog,
  type RecordFormItem,
} from "@/components/erp/record-form"
import { RecordPicker } from "@/components/erp/record-picker"
import { Input } from "@/components/ui/input"
import { useRecordForm } from "@/hooks/use-record-form"
import { applyKeyedChanges } from "@/lib/extensions"
import { useErpUiT } from "@/lib/i18n"

import {
  CONTACTS,
  contactSchemaFor,
  ORGANIZATIONS,
  type Contact,
  type Organization,
} from "../contract"
import type { ContactFormFieldId } from "../extension"
import { useContactsModule } from "../module-context"
import { useContactsT } from "../use-contacts-t"
import { useContactChannelItems } from "./contact-channel-fields"
import { useSegmentItem } from "./segment-field"
import {
  ContactOrganization,
  useHiddenOrganizationText,
} from "./contact-organization"
import {
  ORGANIZATION_SORT,
  useOrganizationDescription,
} from "./contact-sections"
import {
  hiddenFormFields,
  moduleFieldsOf,
  useContactFieldSchemas,
} from "./form-schema"
import { OrganizationFormDialog } from "./organization-form"
import { useAnnounceHandover, useResponsibleForm } from "./responsible"

/**
 * Форма контакту в діалозі (ADR-0026): створення зі списку і зміна з картки. Поля модуля — ім'я,
 * організація (вибір із пошуком на сервері, UI40; порожньо — приватна особа; «Створити…» відкриває
 * форму організації поверх і ставить нову організацію в поле), посада, телефон, email, сегменти;
 * поля розширення — з `form` розширення проекту.
 */

type ContactFormValues = {
  name: string
  organizationId: string | null
  position: string
  phone: string
  email: string
  segments: string[]
} & Record<string, unknown>

const MODULE_FIELDS = [
  "name",
  "organizationId",
  "position",
  "phone",
  "email",
  "segments",
] as const satisfies readonly ContactFormFieldId[]

/** Ім'я обов'язкове в контракті: розширення його не ховає. */
const LOCKED_FIELDS: readonly ContactFormFieldId[] = ["name"]

function useContactFormSchema(
  extensionShape: Record<string, z.ZodType>,
  hidden: ReadonlySet<string>,
) {
  const common = useContactFieldSchemas(hidden)
  return useMemo(
    () =>
      z.object({
        name: common.name,
        organizationId: z.string().nullable(),
        position: z.string().trim(),
        phone: common.phone,
        email: common.email,
        segments: z.array(z.string()),
        ...extensionShape,
      }),
    [common, extensionShape],
  )
}

/** Поле організації: вибір із пошуком на сервері й «Створити…» (форму відкриває `onCreate`). */
function useOrganizationItem(
  control: Control<ContactFormValues>,
  picker: RefObject<HTMLButtonElement | null>,
  onCreate: (name: string) => void,
): RecordFormItem & { id: "organizationId" } {
  const t = useContactsT()
  const describe = useOrganizationDescription()
  const hiddenText = useHiddenOrganizationText()
  return {
    id: "organizationId",
    label: t("contact.form.fields.organizationId"),
    description: t("contact.form.organizationHint"),
    text: (id) =>
      typeof id === "string" ? (
        <ContactOrganization id={id} link={false} />
      ) : null,
    render: (props) => (
      <FormField
        {...props}
        control={control}
        name="organizationId"
        render={({ field, control: aria }) => (
          <RecordPicker<Organization>
            {...aria}
            ref={(node) => {
              picker.current = node
              field.ref(node)
            }}
            resource={ORGANIZATIONS}
            label={props.label}
            value={field.value}
            onValueChange={(id) => {
              field.onChange(id)
            }}
            onBlur={field.onBlur}
            optionLabel={(organization) => organization.name}
            optionDescription={describe}
            sort={ORGANIZATION_SORT}
            searchPlaceholder={t("contact.organization.searchPlaceholder")}
            clearable
            missingLabel={hiddenText}
            create={{
              onCreate,
              deniedReason: t("organizations.createDenied"),
            }}
          />
        )}
      />
    ),
  }
}

/** Поля модуля в порядку форми; розширення додає свої, ховає, переставляє й перейменовує. */
function useContactItems(
  form: UseFormReturn<ContactFormValues>,
  picker: RefObject<HTMLButtonElement | null>,
  onCreateOrganization: (name: string) => void,
): (RecordFormItem & { id: ContactFormFieldId })[] {
  const t = useContactsT()
  const { control } = form
  const organization = useOrganizationItem(
    control,
    picker,
    onCreateOrganization,
  )
  const channels = useContactChannelItems(control, "contact.form.fields")
  const segments = useSegmentItem(control, t("contact.form.fields.segments"))
  return [
    {
      id: "name",
      label: t("contact.form.fields.name"),
      render: (props) => (
        <FormField
          {...props}
          control={control}
          name="name"
          render={({ field, control: aria }) => (
            <Input {...field} {...aria} autoComplete="name" />
          )}
        />
      ),
    },
    organization,
    {
      id: "position",
      label: t("contact.form.fields.position"),
      render: (props) => (
        <FormField
          {...props}
          control={control}
          name="position"
          render={({ field, control: aria }) => (
            <Input {...field} {...aria} autoComplete="organization-title" />
          )}
        />
      ),
    },
    ...channels,
    segments,
  ]
}

function useFormValues(ext: ExtensionFormApi<ContactFormFieldId>) {
  const toValues = useCallback(
    (contact: Contact): ContactFormValues => ({
      name: contact.name,
      organizationId: contact.organizationId,
      position: contact.position,
      phone: contact.phone,
      email: contact.email,
      segments: contact.segments,
      ...ext.values(contact),
    }),
    [ext],
  )
  const emptyValues = (): ContactFormValues => ({
    name: "",
    organizationId: null,
    position: "",
    phone: "",
    email: "",
    segments: [],
    ...ext.values(),
  })
  return { toValues, emptyValues }
}

export interface ContactFormDialogProps {
  /** Контакт для зміни; без нього — створення. */
  readonly contact?: Contact
  readonly onClose: () => void
  readonly onSaved: (contact: Contact) => void
  /** Куди повернути фокус після закриття: кнопка «Створити контакт» чи «Змінити». */
  readonly finalFocus?: RefObject<HTMLElement | null>
}

/** Діалог змонтований, лише поки відкритий: `{editing ? <ContactFormDialog … /> : null}`. */
export function ContactFormDialog({
  contact,
  onClose,
  onSaved,
  finalFocus,
}: ContactFormDialogProps) {
  const t = useContactsT()
  const kitT = useErpUiT()
  const { extension } = useContactsModule()
  const form = extension.contacts?.form
  const announceHandover = useAnnounceHandover(ORGANIZATIONS)
  const responsible = useResponsibleForm(extension.contacts?.fields, form, {
    resource: CONTACTS,
    isNew: !contact,
    after: "segments",
  })
  const ext = useExtensionForm(responsible.fields, responsible.changes)
  const hidden = useMemo(() => hiddenFormFields(form, LOCKED_FIELDS), [form])
  const schema = useContactFormSchema(ext.shape, hidden)
  // Конфлікт: `current` розбирає схема з полями розширення — їх видно в порівнянні.
  const recordSchema = useMemo(
    () => contactSchemaFor(extension.contacts),
    [extension.contacts],
  )
  const { toValues, emptyValues } = useFormValues(ext)
  const state = useRecordForm<ContactFormValues, Contact>({
    resource: CONTACTS,
    record: contact,
    schema,
    defaultValues: contact ? toValues(contact) : emptyValues(),
    recordSchema,
    toPayload: (values, keys) => ({
      ...moduleFieldsOf(values, MODULE_FIELDS, keys),
      ...ext.payload(values, keys),
    }),
    toValues,
    onSaved: (saved) => {
      toast.success(
        t(contact ? "contact.form.saved" : "contact.form.created", {
          name: saved.name,
        }),
      )
      onSaved(saved)
    },
    onUnchanged: onClose,
  })
  const picker = useRef<HTMLButtonElement>(null)
  // Текст пошуку для форми нової організації; `null` — форма закрита.
  const [creating, setCreating] = useState<string | null>(null)
  const items = applyKeyedChanges(
    useContactItems(state.form, picker, setCreating),
    ext.items(state.form.control),
    { locked: LOCKED_FIELDS },
  )
  return (
    <RecordFormDialog
      onClose={onClose}
      title={t(contact ? "contact.form.editTitle" : "contact.form.createTitle")}
      description={contact?.name}
      submitLabel={kitT(contact ? "recordForm.save" : "recordForm.create")}
      state={state}
      items={items}
      finalFocus={finalFocus}
    >
      {creating === null ? null : (
        <OrganizationFormDialog
          initialName={creating}
          finalFocus={picker}
          nested
          onClose={() => {
            setCreating(null)
          }}
          onSaved={(organization) => {
            setCreating(null)
            announceHandover(organization)
            state.form.setValue("organizationId", String(organization.id), {
              shouldDirty: true,
              shouldTouch: true,
              shouldValidate: true,
            })
          }}
        />
      )}
    </RecordFormDialog>
  )
}
