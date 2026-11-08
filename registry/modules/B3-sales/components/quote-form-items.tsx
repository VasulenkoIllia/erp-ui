import { useGetOne, type RaRecord } from "ra-core"
import type { UseFormReturn } from "react-hook-form"

import { DateInput } from "@/components/erp/date-input"
import { FormField } from "@/components/erp/form"
import type { RecordFormItem } from "@/components/erp/record-form"
import { RecordPicker } from "@/components/erp/record-picker"
import type { DocumentLinesValues } from "@/components/erp/document-lines-schema"
import { useCompanyId } from "@/hooks/use-company"
import { companyScope } from "@/lib/company-scope"

import type { QuoteFormFieldId } from "../extension"
import { useSalesModule, type SalesClients } from "../module-context"
import { useSalesT } from "../use-sales-t"

/** Значення форми пропозиції: шапка, рядки й знижка документа, поля розширення. */
export type QuoteFormValues = DocumentLinesValues & {
  clientId: string
  /** Знімок назви клієнта (ADR-0056): його надсилає форма разом із `clientId`. */
  clientName: string
  date: string
  validUntil: string
} & Record<string, unknown>

type QuoteFormItem = RecordFormItem & { id: QuoteFormFieldId }

const textOf = (record: RaRecord, field: string | undefined) => {
  const value: unknown = field ? record[field] : undefined
  return typeof value === "string" && value ? value : undefined
}
const clientLabel = (clients: SalesClients) => (record: RaRecord) =>
  textOf(record, clients.labelField) ?? String(record.id)

/** Назва клієнта за `id` у порівнянні конфлікту: значення сервера — інший клієнт. */
function ClientName({ id }: { id: string }) {
  const { clients } = useSalesModule()
  const companyId = useCompanyId()
  const { data } = useGetOne<RaRecord>(clients.resource, {
    id,
    meta: companyScope(companyId),
  })
  return data ? clientLabel(clients)(data) : id
}

/**
 * Поля шапки пропозиції: клієнт (вибір із ресурсу клієнтів проекту з пошуком на сервері), дата й «Дійсна
 * до». Ключі — `QuoteFormFieldId`: розширення ховає, переносить і підписує їх без заміни.
 */
export function useQuoteHeaderItems(
  form: UseFormReturn<QuoteFormValues>,
  readOnly: boolean,
): QuoteFormItem[] {
  const t = useSalesT()
  const { clients } = useSalesModule()
  const { control, setValue } = form
  const label = clientLabel(clients)
  return [
    {
      id: "clientId",
      label: t("form.fields.clientId"),
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
                field.onChange(id ?? "")
                // Знімок назви — разом із вибором: без запису (очистили) назви немає.
                setValue("clientName", record ? label(record) : "", {
                  shouldDirty: true,
                })
              }}
              onBlur={field.onBlur}
              optionLabel={label}
              optionDescription={(record) =>
                textOf(record, clients.descriptionField)
              }
              searchPlaceholder={t("form.clientSearch")}
              missingLabel={
                form.getValues("clientName") || t("form.clientMissing")
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
      label: t("form.fields.date"),
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
              readOnly={readOnly}
            />
          )}
        />
      ),
    },
    {
      id: "validUntil",
      label: t("form.fields.validUntil"),
      render: (props) => (
        <FormField
          {...props}
          control={control}
          name="validUntil"
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
