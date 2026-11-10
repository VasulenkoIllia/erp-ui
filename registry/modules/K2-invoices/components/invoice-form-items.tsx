import { useGetOne, type RaRecord } from "ra-core"
import { useMemo } from "react"
import type { UseFormReturn } from "react-hook-form"

import { DateInput } from "@/components/erp/date-input"
import type { DocumentLinesValues } from "@/components/erp/document-lines-schema"
import { FormField } from "@/components/erp/form"
import type { RecordFormItem } from "@/components/erp/record-form"
import { RecordPicker } from "@/components/erp/record-picker"
import { useCompanyId } from "@/hooks/use-company"
import { usePostingDate, type PostingDate } from "@/hooks/use-period-lock"
import { companyScope } from "@/lib/company-scope"
import { partyDetailsFrom, type PartyDetails } from "@/lib/document-parties"

import type { InvoiceFormFieldId } from "../extension"
import { useInvoicesModule, type InvoiceClients } from "../module-context"
import { useInvoicesT } from "../use-invoices-t"

/** Значення форми рахунку: шапка, сторони, рядки й знижка документа, поля розширення. */
export type InvoiceFormValues = DocumentLinesValues & {
  clientId: string
  /** Знімок назви клієнта (ADR-0056): його надсилає форма разом із `clientId`. */
  clientName: string
  date: string
  dueDate: string
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

/**
 * Поля шапки рахунку: клієнт (вибір із ресурсу клієнтів проекту з пошуком на сервері; новий клієнт — нові
 * реквізити покупця з його картки), дата з першим відкритим днем закритого періоду (PF13) і «Сплатити до».
 * Ключі — `InvoiceFormFieldId`: розширення ховає, переносить і підписує їх без заміни.
 */
export function useInvoiceHeaderItems(
  form: UseFormReturn<InvoiceFormValues>,
  readOnly: boolean,
): InvoiceFormItem[] {
  const t = useInvoicesT()
  const { clients } = useInvoicesModule()
  // Новий об'єкт на кожен рендер: у залежностях — лише значення.
  const { min, hint } = usePostingDate()
  return useMemo(
    () => headerItems(form, readOnly, clients, { min, hint }, t),
    [form, readOnly, clients, min, hint, t],
  )
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
