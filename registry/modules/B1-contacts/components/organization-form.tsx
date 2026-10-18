import { useCallback, useMemo, type RefObject } from "react"
import type { UseFormReturn } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import {
  useExtensionForm,
  type ExtensionFormApi,
} from "@/components/erp/extension-field-input"
import { FormField } from "@/components/erp/form"
import { FormSelect } from "@/components/erp/form-select"
import {
  RecordFormDialog,
  type RecordFormItem,
} from "@/components/erp/record-form"
import { UaIdInput, uaIdIssueKey } from "@/components/erp/ua-id-input"
import { Input } from "@/components/ui/input"
import { useRecordForm } from "@/hooks/use-record-form"
import { applyKeyedChanges } from "@/lib/extensions"
import { useErpUiT } from "@/lib/i18n"
import type { ResolvedStatuses } from "@/lib/statuses"
import { validateUaId } from "@/lib/ua-ids"

import {
  DEFAULT_ORGANIZATION_STATUS,
  ORGANIZATION_TYPES,
  ORGANIZATIONS,
  organizationSchemaFor,
  type Organization,
  type OrganizationType,
} from "../contract"
import type { OrganizationFormFieldId } from "../extension"
import { useContactsModule } from "../module-context"
import { useContactsT } from "../use-contacts-t"
import { useContactChannelItems } from "./contact-channel-fields"
import { useSegmentItem } from "./segment-field"
import {
  hiddenFormFields,
  moduleFieldsOf,
  useContactFieldSchemas,
} from "./form-schema"
import { codeLabelKey } from "./organization-columns"
import { useOrganizationStatuses } from "./organization-statuses"

/**
 * Форма організації в діалозі (ADR-0026): створення зі списку чи з «Створити…» у виборі організації
 * контакту і зміна з картки. Поля модуля — назва, тип, код (ЄДРПОУ юрособи чи РНОКПП ФОП із
 * контрольною цифрою), статус, телефон, email, місто, сегменти; поля розширення — з `form` розширення
 * проекту.
 * Адреси й рахунки — у картці (ADR-0019).
 */

type OrganizationFormValues = {
  name: string
  type: OrganizationType
  code: string
  status: string
  phone: string
  email: string
  city: string
  segments: string[]
} & Record<string, unknown>

const MODULE_FIELDS = [
  "name",
  "type",
  "code",
  "status",
  "phone",
  "email",
  "city",
  "segments",
] as const satisfies readonly OrganizationFormFieldId[]

/** Назва й тип — обов'язкові в контракті: розширення їх не ховає. */
const LOCKED_FIELDS: readonly OrganizationFormFieldId[] = ["name", "type"]

function useOrganizationFormSchema(
  extensionShape: Record<string, z.ZodType>,
  hidden: ReadonlySet<string>,
) {
  const kitT = useErpUiT()
  const common = useContactFieldSchemas(hidden)
  return useMemo(
    () =>
      z
        .object({
          name: common.name,
          type: z.enum(ORGANIZATION_TYPES),
          code: z.string(),
          status: z.string(),
          phone: common.phone,
          email: common.email,
          city: z.string().trim(),
          segments: z.array(z.string()),
          ...extensionShape,
        })
        .superRefine((values, ctx) => {
          // Код залежить від типу: юрособа — ЄДРПОУ (8 цифр), ФОП — РНОКПП (10 цифр).
          const kind = values.type === "fop" ? "rnokpp" : "edrpou"
          const issue =
            values.code && !hidden.has("code")
              ? validateUaId(kind, values.code)
              : null
          if (issue)
            ctx.addIssue({
              code: "custom",
              path: ["code"],
              message: kitT(uaIdIssueKey(kind, issue)),
            })
        }),
    [kitT, common, extensionShape, hidden],
  )
}

type OrganizationFormItem = RecordFormItem & { id: OrganizationFormFieldId }

/** Підпис варіанта вибору за значенням — для порівняння при конфлікті. */
const labelOf =
  (items: readonly { value: string; label: string }[]) => (value: unknown) =>
    items.find((item) => item.value === value)?.label ?? null

/** Тип і код: код перевіряється за типом (ЄДРПОУ юрособи, РНОКПП ФОП). */
function useTypeAndCodeItems(
  form: UseFormReturn<OrganizationFormValues>,
): OrganizationFormItem[] {
  const t = useContactsT()
  const { control } = form
  const type = form.watch("type")
  const typeItems = ORGANIZATION_TYPES.map((value) => ({
    value,
    label: t(`organization.types.${value}`),
  }))
  return [
    {
      id: "type",
      label: t("organization.form.fields.type"),
      text: labelOf(typeItems),
      render: (props) => (
        <FormField
          {...props}
          control={control}
          name="type"
          render={({ field, control: aria }) => (
            <FormSelect
              {...aria}
              ref={field.ref}
              items={typeItems}
              value={field.value}
              onValueChange={(next) => {
                field.onChange(next)
                // Інший тип — інша довжина коду: перевірити код, якщо його вже вводили.
                if (form.getFieldState("code").isTouched)
                  void form.trigger("code")
              }}
              onBlur={field.onBlur}
            />
          )}
        />
      ),
    },
    {
      id: "code",
      label: t(codeLabelKey(type)),
      render: (props) => (
        <FormField
          {...props}
          control={control}
          name="code"
          render={({ field, control: aria }) => (
            <UaIdInput
              {...aria}
              kind={type === "fop" ? "rnokpp" : "edrpou"}
              ref={field.ref}
              name={field.name}
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
      ),
    },
  ]
}

/** Поля модуля в порядку форми; розширення додає свої, ховає, переставляє й перейменовує. */
function useOrganizationItems(
  form: UseFormReturn<OrganizationFormValues>,
  statuses: ResolvedStatuses,
  currentStatus: string | undefined,
): OrganizationFormItem[] {
  const t = useContactsT()
  const { control } = form
  const typeAndCode = useTypeAndCodeItems(form)
  const channels = useContactChannelItems(control, "organization.form.fields")
  const segments = useSegmentItem(
    control,
    t("organization.form.fields.segments"),
  )
  // Схований розширенням статус лишається у виборі запису, який його має.
  const hidden =
    currentStatus && !statuses.options.some((s) => s.id === currentStatus)
      ? statuses.byId.get(currentStatus)
      : undefined
  const statusItems = [...statuses.options, ...(hidden ? [hidden] : [])].map(
    (status) => ({ value: status.id, label: status.label }),
  )
  return [
    {
      id: "name",
      label: t("organization.form.fields.name"),
      wide: true,
      render: (props) => (
        <FormField
          {...props}
          control={control}
          name="name"
          render={({ field, control: aria }) => (
            <Input {...field} {...aria} autoComplete="organization" />
          )}
        />
      ),
    },
    ...typeAndCode,
    {
      id: "status",
      label: t("organization.form.fields.status"),
      text: labelOf(statusItems),
      render: (props) => (
        <FormField
          {...props}
          control={control}
          name="status"
          render={({ field, control: aria }) => (
            <FormSelect
              {...aria}
              ref={field.ref}
              items={statusItems}
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
      ),
    },
    ...channels,
    {
      id: "city",
      label: t("organization.form.fields.city"),
      render: (props) => (
        <FormField
          {...props}
          control={control}
          name="city"
          render={({ field, control: aria }) => (
            <Input {...field} {...aria} autoComplete="address-level2" />
          )}
        />
      ),
    },
    segments,
  ]
}

function moduleValuesOf(organization: Organization) {
  return {
    name: organization.name,
    type: organization.type,
    code: organization.code,
    status: organization.status,
    phone: organization.phone,
    email: organization.email,
    city: organization.city,
    segments: organization.segments,
  }
}

/** Значення форми: із запису чи порожні для створення (назва — з тексту пошуку «Створити…»). */
function useFormValues(
  ext: ExtensionFormApi<OrganizationFormFieldId>,
  statuses: ResolvedStatuses,
) {
  const toValues = useCallback(
    (organization: Organization): OrganizationFormValues => ({
      ...moduleValuesOf(organization),
      ...ext.values(organization),
    }),
    [ext],
  )
  const emptyValues = (name: string): OrganizationFormValues => ({
    name,
    type: "legal",
    code: "",
    // Статус за замовчуванням, якщо розширення його не сховало, інакше перший у виборі.
    status: statuses.options.some((s) => s.id === DEFAULT_ORGANIZATION_STATUS)
      ? DEFAULT_ORGANIZATION_STATUS
      : (statuses.options[0]?.id ?? DEFAULT_ORGANIZATION_STATUS),
    phone: "",
    email: "",
    city: "",
    segments: [],
    ...ext.values(),
  })
  return { toValues, emptyValues }
}

export interface OrganizationFormDialogProps {
  /** Організація для зміни; без неї — створення. */
  readonly organization?: Organization
  /** Назва нової організації: текст пошуку з «Створити…». */
  readonly initialName?: string
  readonly onClose: () => void
  readonly onSaved: (organization: Organization) => void
  /** Куди повернути фокус після закриття: кнопка «Створити» чи «Змінити», поле вибору організації. */
  readonly finalFocus?: RefObject<HTMLElement | null>
  /** Поверх форми контакту («Створити…»): перехід охороняє вона (`RecordFormDialog`). */
  readonly nested?: boolean
}

/** Діалог змонтований, лише поки відкритий: `{editing ? <OrganizationFormDialog … /> : null}`. */
export function OrganizationFormDialog({
  organization,
  initialName = "",
  onClose,
  onSaved,
  finalFocus,
  nested,
}: OrganizationFormDialogProps) {
  const t = useContactsT()
  const kitT = useErpUiT()
  const { extension } = useContactsModule()
  const statuses = useOrganizationStatuses()
  const form = extension.organizations?.form
  const ext = useExtensionForm(extension.organizations?.fields, form)
  const hidden = useMemo(() => hiddenFormFields(form, LOCKED_FIELDS), [form])
  const schema = useOrganizationFormSchema(ext.shape, hidden)
  // Конфлікт: `current` розбирає схема з полями й статусами розширення — їх видно в порівнянні.
  const recordSchema = useMemo(
    () => organizationSchemaFor(extension.organizations),
    [extension.organizations],
  )
  const { toValues, emptyValues } = useFormValues(ext, statuses)
  const state = useRecordForm<OrganizationFormValues, Organization>({
    resource: ORGANIZATIONS,
    record: organization,
    schema,
    defaultValues: organization
      ? toValues(organization)
      : emptyValues(initialName),
    recordSchema,
    toPayload: (values, keys) => ({
      ...moduleFieldsOf(values, MODULE_FIELDS, keys),
      ...ext.payload(values, keys),
    }),
    toValues,
    onSaved: (saved) => {
      toast.success(
        t(
          organization
            ? "organization.form.saved"
            : "organization.form.created",
          { name: saved.name },
        ),
      )
      onSaved(saved)
    },
    onUnchanged: onClose,
  })
  const items = applyKeyedChanges(
    useOrganizationItems(state.form, statuses, organization?.status),
    ext.items(state.form.control),
    { locked: LOCKED_FIELDS },
  )
  return (
    <RecordFormDialog
      onClose={onClose}
      title={t(
        organization
          ? "organization.form.editTitle"
          : "organization.form.createTitle",
      )}
      description={
        organization ? organization.name : t("organization.form.createLead")
      }
      submitLabel={kitT(organization ? "recordForm.save" : "recordForm.create")}
      state={state}
      items={items}
      finalFocus={finalFocus}
      nested={nested}
    />
  )
}
