import { useGetOne, type RaRecord } from "ra-core"
import { useMemo } from "react"
import type { UseFormReturn } from "react-hook-form"

import { DateInput } from "@/components/erp/date-input"
import { FormField } from "@/components/erp/form"
import { FormSelect } from "@/components/erp/form-select"
import { MoneyInput } from "@/components/erp/number-input"
import type { RecordFormItem } from "@/components/erp/record-form"
import { RecordPicker } from "@/components/erp/record-picker"
import { Input } from "@/components/ui/input"
import { useCompanyId } from "@/hooks/use-company"
import { usePostingDate, type PostingDate } from "@/hooks/use-period-lock"
import { companyScope } from "@/lib/company-scope"
import type { ExtensionValues } from "@/lib/extension-fields"

import { PAYMENT_REFERENCE_MAX } from "../contract"
import type { K4DocumentKind } from "../document-kind"
import type { PaymentFormFieldId } from "../extension"
import {
  clientLabelOf,
  usePaymentsModule,
  type PaymentClients,
} from "../module-context"
import { usePaymentsT } from "../use-payments-t"
import { usePaymentMethods, type PaymentMethodItem } from "./payment-statuses"

/** Значення форми оплати чи повернення: шапка, суми рахунків за `id` і поля розширення. */
export type PaymentFormValues = {
  clientId: string
  /** Назва вибраного клієнта: підпис вибору, поки запис клієнта не прийшов. */
  clientName: string
  /** ISO 4217: валюта рахунків клієнта; порожньо, поки рахунків немає. */
  currency: string
  date: string
  method: string
  /** Сума оплати, мінорні одиниці; порожнє поле — `null`. */
  amount: number | null
  reference: string
  /** Суми рахунків за `id`, мінорні одиниці. */
  allocations: Record<string, number | null>
} & ExtensionValues

type PaymentFormItem = RecordFormItem & { id: PaymentFormFieldId }
type T = ReturnType<typeof usePaymentsT>

/** Назва клієнта за `id` у порівнянні: значення — інший клієнт. */
function ClientName({ id }: { id: string }) {
  const { clients } = usePaymentsModule()
  const companyId = useCompanyId()
  const { data } = useGetOne<RaRecord>(clients.resource, {
    id,
    meta: companyScope(companyId),
  })
  return data ? clientLabelOf(clients)(data) : id
}

/**
 * Поля шапки форми оплати чи повернення: клієнт (вибір із ресурсу клієнтів проекту; інший клієнт — інші рахунки, суми
 * скидаються), валюта (лише коли в клієнта рахунки в кількох валютах), дата з першим відкритим днем закритого
 * періоду (PF13), спосіб, сума й призначення. Ключі — `PaymentFormFieldId`: розширення ховає, переносить і
 * підписує їх без заміни.
 */
export function usePaymentFormItems(
  kind: K4DocumentKind,
  form: UseFormReturn<PaymentFormValues>,
  currencies: readonly string[],
  /** Валюта суми: рахунків клієнта, а поки їх немає — базова валюта компанії. */
  currency: string,
): PaymentFormItem[] {
  const t = usePaymentsT()
  const { clients } = usePaymentsModule()
  const methods = usePaymentMethods()
  const { min, hint } = usePostingDate()
  return useMemo(
    () => [
      clientItem(form, clients, t),
      ...(currencies.length > 1 ? [currencyItem(form, currencies, t)] : []),
      dateItem(kind, form, { min, hint }, t),
      methodItem(form, methods.items, t),
      amountItem(kind, form, currency, t),
      referenceItem(form, t),
    ],
    [kind, form, clients, currencies, currency, min, hint, methods.items, t],
  )
}

function clientItem(
  form: UseFormReturn<PaymentFormValues>,
  clients: PaymentClients,
  t: T,
): PaymentFormItem {
  const { control, setValue, getValues } = form
  const label = clientLabelOf(clients)
  return {
    id: "clientId",
    label: t("paymentForm.fields.clientId"),
    text: (id) =>
      typeof id === "string" && id ? <ClientName id={id} /> : null,
    render: (props) => (
      <FormField
        {...props}
        control={control}
        name="clientId"
        render={({ field, control: aria }) => (
          <RecordPicker<RaRecord>
            {...aria}
            ref={field.ref}
            resource={clients.resource}
            label={props.label}
            value={field.value || null}
            onValueChange={(id, record) => {
              if ((id ?? "") === field.value) return
              field.onChange(id ?? "")
              setValue("clientName", record ? label(record) : "")
              // Інший клієнт — інші рахунки: валюту й суми форма бере з його рахунків заново.
              setValue("currency", "")
              setValue("allocations", {})
            }}
            onBlur={field.onBlur}
            optionLabel={label}
            optionDescription={(record) => {
              const value: unknown = clients.descriptionField
                ? record[clients.descriptionField]
                : undefined
              return typeof value === "string" && value ? value : undefined
            }}
            searchPlaceholder={t("paymentForm.clientSearch")}
            missingLabel={
              getValues("clientName") || t("paymentForm.clientMissing")
            }
            required
          />
        )}
      />
    ),
  }
}

function currencyItem(
  form: UseFormReturn<PaymentFormValues>,
  currencies: readonly string[],
  t: T,
): PaymentFormItem {
  const items = currencies.map((code) => ({ value: code, label: code }))
  return {
    id: "currency",
    label: t("paymentForm.fields.currency"),
    render: (props) => (
      <FormField
        {...props}
        control={form.control}
        name="currency"
        render={({ field, control: aria }) => (
          <FormSelect
            {...aria}
            ref={field.ref}
            items={items}
            value={field.value}
            onValueChange={(code: string) => {
              field.onChange(code)
              // Інша валюта — інші рахунки: суми попередніх тут уже хибні.
              form.setValue("allocations", {})
            }}
            onBlur={field.onBlur}
          />
        )}
      />
    ),
  }
}

function dateItem(
  kind: K4DocumentKind,
  form: UseFormReturn<PaymentFormValues>,
  posting: PostingDate,
  t: T,
): PaymentFormItem {
  return {
    id: "date",
    label: t(`${kind.form}.fields.date`),
    // Закритий період (PF13): підказка й перший відкритий день; дату з клавіатури відхилить сервер.
    ...(posting.hint ? { description: posting.hint } : {}),
    render: (props) => (
      <FormField
        {...props}
        control={form.control}
        name="date"
        render={({ field, control: aria }) => (
          <DateInput
            {...aria}
            ref={field.ref}
            value={field.value}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
            min={posting.min}
          />
        )}
      />
    ),
  }
}

function methodItem(
  form: UseFormReturn<PaymentFormValues>,
  methods: readonly PaymentMethodItem[],
  t: T,
): PaymentFormItem {
  const items = methods.map((method) => ({
    value: method.id,
    label: method.label,
  }))
  return {
    id: "method",
    label: t("paymentForm.fields.method"),
    text: (id) =>
      items.find((item) => item.value === id)?.label ??
      (typeof id === "string" ? id : null),
    render: (props) => (
      <FormField
        {...props}
        control={form.control}
        name="method"
        render={({ field, control: aria }) => (
          <FormSelect
            {...aria}
            ref={field.ref}
            items={items}
            value={field.value}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
          />
        )}
      />
    ),
  }
}

function amountItem(
  kind: K4DocumentKind,
  form: UseFormReturn<PaymentFormValues>,
  currency: string,
  t: T,
): PaymentFormItem {
  return {
    id: "amount",
    label: t(`${kind.form}.fields.amount`),
    description: t(`${kind.form}.amountHint`),
    render: (props) => (
      <FormField
        {...props}
        control={form.control}
        name="amount"
        render={({ field, control: aria }) => (
          <MoneyInput
            {...aria}
            ref={field.ref}
            currency={currency}
            value={
              field.value === null ? null : { amount: field.value, currency }
            }
            onValueChange={(money) => {
              field.onChange(money === null ? null : Number(money.amount))
            }}
            onBlur={field.onBlur}
          />
        )}
      />
    ),
  }
}

function referenceItem(
  form: UseFormReturn<PaymentFormValues>,
  t: T,
): PaymentFormItem {
  return {
    id: "reference",
    label: t("paymentForm.fields.reference"),
    wide: true,
    render: (props) => (
      <FormField
        {...props}
        control={form.control}
        name="reference"
        render={({ field, control: aria }) => (
          <Input
            {...field}
            {...aria}
            maxLength={PAYMENT_REFERENCE_MAX}
            autoComplete="off"
          />
        )}
      />
    ),
  }
}
