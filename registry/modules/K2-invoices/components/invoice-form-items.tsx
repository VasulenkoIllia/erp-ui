import type { RaRecord } from "ra-core"
import { useMemo } from "react"
import { useWatch, type UseFormReturn } from "react-hook-form"

import {
  clientLabelOf,
  dateFormItem,
  documentClientItem,
} from "@/components/erp/document-form-items"
import type { DocumentLinesValues } from "@/components/erp/document-lines-schema"
import { FormField } from "@/components/erp/form"
import { FormSelect } from "@/components/erp/form-select"
import type { RecordFormItem } from "@/components/erp/record-form"
import { usePostingDate, type PostingDate } from "@/hooks/use-period-lock"
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

/** Реквізити покупця з запису клієнта: функція проекту (`clients.party`) чи лише назва. */
export const buyerOf =
  (clients: InvoiceClients) =>
  (record: RaRecord): Partial<PartyDetails> =>
    clients.party?.(record) ?? { name: clientLabelOf(clients)(record) }

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
  const { control, setValue, getValues } = form
  const label = clientLabelOf(clients)
  const buyer = buyerOf(clients)
  return [
    documentClientItem({
      control,
      clients,
      label: t("invoiceForm.fields.clientId"),
      searchPlaceholder: t("invoiceForm.clientSearch"),
      missingLabel: () =>
        getValues("clientName") || t("invoiceForm.clientMissing"),
      readOnly,
      onValueChange: (field, id, record) => {
        const isOther = (id ?? "") !== field.value
        field.onChange(id ?? "")
        // Знімок назви — разом із вибором: без запису (очистили) назви немає.
        setValue("clientName", record ? label(record) : "", {
          shouldDirty: true,
        })
        // Інший клієнт — його реквізити: покупець попереднього клієнта тут уже хибний. Той самий клієнт
        // удруге не стирає дописане вручну («в особі», підписант).
        if (record && isOther)
          setValue("buyer", partyDetailsFrom(buyer(record)), {
            shouldDirty: true,
            shouldValidate: form.formState.isSubmitted,
          })
      },
    }),
    // Закритий період (PF13): підказка й перший відкритий день; дату з клавіатури відхилить сервер.
    dateFormItem({
      control,
      name: "date",
      label: t("invoiceForm.fields.date"),
      description: posting.hint,
      min: posting.min,
      readOnly,
    }),
    dateFormItem({
      control,
      name: "dueDate",
      label: t("invoiceForm.fields.dueDate"),
      readOnly,
    }),
  ]
}
