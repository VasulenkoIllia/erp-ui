import { useCallback, useMemo, type RefObject } from "react"
import type { UseFormReturn } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { FormField } from "@/components/erp/form"
import { FormSelect } from "@/components/erp/form-select"
import {
  RecordFormDialog,
  type RecordFormItem,
} from "@/components/erp/record-form"
import { Input } from "@/components/ui/input"
import { useRecordForm } from "@/hooks/use-record-form"
import { useErpUiT } from "@/lib/i18n"

import {
  ADDRESS_KINDS,
  ORGANIZATIONS,
  organizationCardSchemaFor,
  type Address,
  type AddressKind,
  type OrganizationCard,
} from "../contract"
import { useContactsModule } from "../module-context"
import { useContactsT } from "../use-contacts-t"
import { itemFieldOf, withItem } from "./detail-items"
import { choiceText, useCodeItems } from "./form-schema"

/**
 * Форма адреси організації в діалозі (ADR-0026, ADR-0028): нова й зміна. Запит — `PATCH` організації
 * з усіма адресами й `version`; конфлікт — порівняння полів цієї адреси, помилки сервера — біля
 * полів (`addresses.<індекс>.line` → «Вулиця, будинок, офіс»).
 */

/** Країни у формі (ISO 3166-1 alpha-2): Україна й сусіди, ЄС, Велика Британія, США. */
const COUNTRIES = [
  "UA",
  "PL",
  "MD",
  "RO",
  "SK",
  "HU",
  "CZ",
  "DE",
  "LT",
  "LV",
  "EE",
  "GB",
  "US",
] as const
const DEFAULT_COUNTRY = "UA"
const LINE_MAX = 200
const CITY_MAX = 100
/** Поштовий індекс в Україні — 5 цифр. */
const UA_POSTAL_CODE = /^\d{5}$/

type AddressFormValues = Omit<Address, "id">

const valuesOf = (address: Address): AddressFormValues => ({
  kind: address.kind,
  line: address.line,
  postalCode: address.postalCode,
  city: address.city,
  country: address.country,
})

/** Тип нової адреси — перший, якого ще немає: спершу юридична, далі фактична й поштова. */
const kindForNew = (addresses: readonly Address[]): AddressKind =>
  ADDRESS_KINDS.find((kind) => !addresses.some((a) => a.kind === kind)) ??
  "actual"

export interface AddressFormDialogProps {
  /** Організація з адресами (детальний запис картки). */
  readonly organization: OrganizationCard
  /** Адреса для зміни; без неї — нова. */
  readonly address?: Address
  readonly onClose: () => void
  readonly onSaved: () => void
  /** Куди повернути фокус після закриття: «Додати адресу» чи меню рядка. */
  readonly finalFocus?: RefObject<HTMLElement | null>
}

function useAddressSchema() {
  const t = useContactsT()
  const kitT = useErpUiT()
  return useMemo(
    () =>
      z
        .object({
          kind: z.enum(ADDRESS_KINDS),
          line: z
            .string()
            .trim()
            .min(1, kitT("validation.required"))
            .max(LINE_MAX, t("organization.detail.tooLong", { max: LINE_MAX })),
          postalCode: z.string().trim(),
          city: z
            .string()
            .trim()
            .max(CITY_MAX, t("organization.detail.tooLong", { max: CITY_MAX })),
          country: z.string().length(2),
        })
        .superRefine((values, ctx) => {
          if (
            values.country === DEFAULT_COUNTRY &&
            values.postalCode &&
            !UA_POSTAL_CODE.test(values.postalCode)
          )
            ctx.addIssue({
              code: "custom",
              path: ["postalCode"],
              message: t("organization.addresses.form.postalCode"),
            })
        }),
    [t, kitT],
  )
}

export function AddressFormDialog({
  organization,
  address,
  onClose,
  onSaved,
  finalFocus,
}: AddressFormDialogProps) {
  const t = useContactsT()
  const kitT = useErpUiT()
  const { extension } = useContactsModule()
  const recordSchema = useMemo(
    () => organizationCardSchemaFor(extension.organizations),
    [extension.organizations],
  )
  const empty = useMemo<AddressFormValues>(
    () => ({
      kind: kindForNew(organization.addresses),
      line: "",
      postalCode: "",
      city: organization.city,
      country: DEFAULT_COUNTRY,
    }),
    [organization.addresses, organization.city],
  )
  const schema = useAddressSchema()
  // Стабільна: з неї форма рахує порівняння конфлікту.
  const toValues = useCallback(
    (record: OrganizationCard) => {
      const saved = record.addresses.find((item) => item.id === address?.id)
      return saved ? valuesOf(saved) : empty
    },
    [address?.id, empty],
  )
  const state = useRecordForm<AddressFormValues, OrganizationCard>({
    resource: ORGANIZATIONS,
    record: organization,
    schema,
    defaultValues: address ? valuesOf(address) : empty,
    recordSchema,
    // Уся колекція: зміну цієї адреси застосовуємо до адрес, від яких рахуємо версію.
    toPayload: (values, _keys, target) => ({
      addresses: withItem(target?.addresses ?? [], address?.id, values),
    }),
    toValues,
    fieldOfServerError: itemFieldOf("addresses"),
    onSaved: () => {
      const line = state.form.getValues("line")
      toast.success(
        t(
          address
            ? "organization.addresses.form.saved"
            : "organization.addresses.form.added",
          { line },
        ),
      )
      onSaved()
    },
    onUnchanged: onClose,
  })
  const items = useAddressItems(state.form, address?.country)
  return (
    <RecordFormDialog
      onClose={onClose}
      title={t(
        address
          ? "organization.addresses.form.editTitle"
          : "organization.addresses.form.createTitle",
      )}
      description={organization.name}
      submitLabel={
        address ? kitT("recordForm.save") : t("organization.detail.add")
      }
      state={state}
      items={items}
      finalFocus={finalFocus}
    />
  )
}

/** Поля адреси: тип і країна, вулиця на всю ширину, індекс і місто. */
function useAddressItems(
  form: UseFormReturn<AddressFormValues>,
  savedCountry: string | undefined,
): RecordFormItem[] {
  const t = useContactsT()
  const { control } = form
  const kinds = ADDRESS_KINDS.map((value) => ({
    value,
    label: t(`organization.addresses.kinds.${value}`),
  }))
  const countries = useCodeItems(COUNTRIES, savedCountry, "region")
  const text = (id: keyof AddressFormValues, autoComplete: string) => ({
    id,
    label: t(`organization.addresses.form.fields.${id}`),
    render: (props: { label: string; className?: string }) => (
      <FormField
        {...props}
        control={control}
        name={id}
        render={({ field, control: aria }) => (
          <Input {...field} {...aria} autoComplete={autoComplete} />
        )}
      />
    ),
  })
  return [
    {
      id: "kind",
      label: t("organization.addresses.form.fields.kind"),
      text: choiceText(kinds),
      render: (props) => (
        <FormField
          {...props}
          control={control}
          name="kind"
          render={({ field, control: aria }) => (
            <FormSelect
              {...aria}
              ref={field.ref}
              items={kinds}
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
      ),
    },
    {
      id: "country",
      label: t("organization.addresses.form.fields.country"),
      text: choiceText(countries),
      render: (props) => (
        <FormField
          {...props}
          control={control}
          name="country"
          render={({ field, control: aria }) => (
            <FormSelect
              {...aria}
              ref={field.ref}
              items={countries}
              value={field.value}
              onValueChange={(next) => {
                field.onChange(next)
                // Інша країна — інше правило індексу: перевірити, якщо його вже вводили.
                if (form.getFieldState("postalCode").isTouched)
                  void form.trigger("postalCode")
              }}
              onBlur={field.onBlur}
            />
          )}
        />
      ),
    },
    { ...text("line", "street-address"), wide: true },
    text("postalCode", "postal-code"),
    text("city", "address-level2"),
  ]
}
