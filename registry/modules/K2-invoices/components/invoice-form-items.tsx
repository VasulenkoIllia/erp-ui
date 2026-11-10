import { useGetOne, type RaRecord } from "ra-core"
import { useMemo } from "react"
import { useWatch, type UseFormReturn } from "react-hook-form"

import { DateInput } from "@/components/erp/date-input"
import type { DocumentLinesValues } from "@/components/erp/document-lines-schema"
import { FormField } from "@/components/erp/form"
import { FormSelect } from "@/components/erp/form-select"
import type { RecordFormItem } from "@/components/erp/record-form"
import { RecordPicker } from "@/components/erp/record-picker"
import { useCompanyId } from "@/hooks/use-company"
import { usePostingDate, type PostingDate } from "@/hooks/use-period-lock"
import { companyScope } from "@/lib/company-scope"
import { partyDetailsFrom, type PartyDetails } from "@/lib/document-parties"

import type { InvoiceFormFieldId } from "../extension"
import { useInvoicesModule, type InvoiceClients } from "../module-context"
import { useInvoicesT } from "../use-invoices-t"
import {
  useInvoiceCurrencyChoice,
  type InvoiceCurrencyChoice,
} from "./invoice-currency"

/** Значення форми рахунку: шапка, сторони, рядки й знижка документа, поля розширення. */
export type InvoiceFormValues = DocumentLinesValues & {
  clientId: string
  /** Знімок назви клієнта (ADR-0056): його надсилає форма разом із `clientId`. */
  clientName: string
  date: string
  dueDate: string
  /** ISO 4217: базова валюта компанії чи інша валюта компанії (ADR-0071). */
  currency: string
  supplier: PartyDetails
  buyer: PartyDetails
} & Record<string, unknown>

type InvoiceFormItem = RecordFormItem & { id: InvoiceFormFieldId }

const textOf = (record: RaRecord, field: string | undefined) => {
  const value: unknown = field ? record[field] : undefined
  return typeof value === "string" && value ? value : undefined
}
export const clientLabel = (clients: InvoiceClients) => (record: RaRecord) =>
  textOf(record, clients.labelField) ?? String(record.id)

/** Реквізити покупця з запису клієнта: функція проекту (`clients.party`) чи лише назва. */
export const buyerOf =
  (clients: InvoiceClients) =>
  (record: RaRecord): Partial<PartyDetails> =>
    clients.party?.(record) ?? { name: clientLabel(clients)(record) }

/** Назва клієнта за `id` у порівнянні конфлікту: значення сервера — інший клієнт. */
function ClientName({ id }: { id: string }) {
  const { clients } = useInvoicesModule()
  const companyId = useCompanyId()
  const { data } = useGetOne<RaRecord>(clients.resource, {
    id,
    meta: companyScope(companyId),
  })
  return data ? clientLabel(clients)(data) : id
}

/** Поле «Валюта»: варіанти й підказка; без опції `currencies` фабрики поля немає. */
interface CurrencyField extends InvoiceCurrencyChoice {
  readonly hint: string | undefined
}

/**
 * Поле «Валюта» (ADR-0071), коли проект дав валюти компанії: підказка про курс — у рахунку не в базовій
 * валюті, про збій переліку — коли валют компанії не отримали.
 */
function useCurrencyField(
  form: UseFormReturn<InvoiceFormValues>,
  base: string | undefined,
): CurrencyField | null {
  const t = useInvoicesT()
  const { currencies } = useInvoicesModule()
  const current = useWatch({ control: form.control, name: "currency" })
  const choice = useInvoiceCurrencyChoice(base, current)
  return useMemo(() => {
    if (!currencies) return null
    const hint = choice.failed
      ? t("invoiceForm.currenciesFailed")
      : base && current !== base
        ? t("invoiceForm.currencyHint", { base })
        : undefined
    return { ...choice, hint }
  }, [currencies, choice, current, base, t])
}

/**
 * Поля шапки рахунку: клієнт (вибір із ресурсу клієнтів проекту з пошуком на сервері; новий клієнт — нові
 * реквізити покупця з його картки), дата з першим відкритим днем закритого періоду (PF13), «Сплатити до» й
 * валюта, коли проект дав валюти компанії (ADR-0071). Ключі — `InvoiceFormFieldId`: розширення ховає,
 * переносить і підписує їх без заміни.
 */
export function useInvoiceHeaderItems(
  form: UseFormReturn<InvoiceFormValues>,
  readOnly: boolean,
  baseCurrency: string | undefined,
): InvoiceFormItem[] {
  const t = useInvoicesT()
  const { clients } = useInvoicesModule()
  // Новий об'єкт на кожен рендер: у залежностях — лише значення.
  const { min, hint } = usePostingDate()
  const currency = useCurrencyField(form, baseCurrency)
  return useMemo(
    () => [
      ...headerItems(form, readOnly, clients, { min, hint }, t),
      ...(currency ? [currencyItem(form, readOnly, currency, t)] : []),
    ],
    [form, readOnly, clients, min, hint, currency, t],
  )
}

function currencyItem(
  form: UseFormReturn<InvoiceFormValues>,
  readOnly: boolean,
  currency: CurrencyField,
  t: ReturnType<typeof useInvoicesT>,
): InvoiceFormItem {
  return {
    id: "currency",
    label: t("invoiceForm.fields.currency"),
    ...(currency.hint ? { description: currency.hint } : {}),
    render: (props) => (
      <FormField
        {...props}
        control={form.control}
        name="currency"
        render={({ field, control: aria }) => (
          <FormSelect
            {...aria}
            ref={field.ref}
            items={currency.items}
            value={field.value}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
            readOnly={readOnly}
          />
        )}
      />
    ),
  }
}

function headerItems(
  form: UseFormReturn<InvoiceFormValues>,
  readOnly: boolean,
  clients: InvoiceClients,
  posting: PostingDate,
  t: ReturnType<typeof useInvoicesT>,
): InvoiceFormItem[] {
  const { control, setValue } = form
  const label = clientLabel(clients)
  const buyer = buyerOf(clients)
  return [
    {
      id: "clientId",
      label: t("invoiceForm.fields.clientId"),
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
                const isOther = (id ?? "") !== field.value
                field.onChange(id ?? "")
                // Знімок назви — разом із вибором: без запису (очистили) назви немає.
                setValue("clientName", record ? label(record) : "", {
                  shouldDirty: true,
                })
                // Інший клієнт — його реквізити: покупець попереднього клієнта тут уже хибний. Той самий
                // клієнт удруге не стирає дописане вручну («в особі», підписант).
                if (record && isOther)
                  setValue("buyer", partyDetailsFrom(buyer(record)), {
                    shouldDirty: true,
                    shouldValidate: form.formState.isSubmitted,
                  })
              }}
              onBlur={field.onBlur}
              optionLabel={label}
              optionDescription={(record) =>
                textOf(record, clients.descriptionField)
              }
              searchPlaceholder={t("invoiceForm.clientSearch")}
              missingLabel={
                form.getValues("clientName") || t("invoiceForm.clientMissing")
              }
              required
              readOnly={readOnly}
            />
          )}
        />
      ),
    },
    {
      id: "date",
      label: t("invoiceForm.fields.date"),
      // Закритий період (PF13): підказка й перший відкритий день; дату з клавіатури відхилить сервер.
      ...(posting.hint ? { description: posting.hint } : {}),
      render: (props) => (
        <FormField
          {...props}
          control={control}
          name="date"
          render={({ field, control: aria }) => (
            <DateInput
              {...aria}
              ref={field.ref}
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              min={posting.min}
              readOnly={readOnly}
            />
          )}
        />
      ),
    },
    {
      id: "dueDate",
      label: t("invoiceForm.fields.dueDate"),
      render: (props) => (
        <FormField
          {...props}
          control={control}
          name="dueDate"
          render={({ field, control: aria }) => (
            <DateInput
              {...aria}
              ref={field.ref}
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              readOnly={readOnly}
            />
          )}
        />
      ),
    },
  ]
}
