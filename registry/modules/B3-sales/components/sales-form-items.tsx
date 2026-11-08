import { useGetOne, type RaRecord } from "ra-core"
import { useMemo } from "react"
import type { UseFormReturn } from "react-hook-form"

import { DateInput } from "@/components/erp/date-input"
import { FormField } from "@/components/erp/form"
import type { RecordFormItem } from "@/components/erp/record-form"
import { RecordPicker } from "@/components/erp/record-picker"
import type { DocumentLinesValues } from "@/components/erp/document-lines-schema"
import { useCompanyId } from "@/hooks/use-company"
import { companyScope } from "@/lib/company-scope"

import type { SalesDocument } from "../contract"
import type { SalesDocumentIds } from "../extension"
import { useSalesModule, type SalesClients } from "../module-context"
import type { SalesDocumentKind } from "../sales-kinds"
import { useSalesT } from "../use-sales-t"

/**
 * Значення форми документа продажу: шапка, рядки й знижка документа, поля розширення; друга дата —
 * під ключем свого поля (`validUntil`, `dueDate`).
 */
export type SalesFormValues = DocumentLinesValues & {
  clientId: string
  /** Знімок назви клієнта (ADR-0056): його надсилає форма разом із `clientId`. */
  clientName: string
  date: string
} & Record<string, unknown>

type SalesFormItem<Due extends string> = RecordFormItem & {
  id: SalesDocumentIds<Due>["formField"]
}

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
 * Поля шапки документа продажу: клієнт (вибір із ресурсу клієнтів проекту з пошуком на сервері), дата
 * й друга дата («Дійсна до», «Виконати до»). Ключі — `SalesDocumentIds["formField"]`: розширення
 * ховає, переносить і підписує їх без заміни.
 */
export function useSalesHeaderItems<
  D extends SalesDocument,
  Due extends string,
>(
  kind: SalesDocumentKind<D, Due>,
  form: UseFormReturn<SalesFormValues>,
  readOnly: boolean,
): SalesFormItem<Due>[] {
  const t = useSalesT()
  const { clients } = useSalesModule()
  return useMemo(
    () => headerItems(kind, form, readOnly, clients, t),
    [kind, form, readOnly, clients, t],
  )
}

function headerItems<D extends SalesDocument, Due extends string>(
  kind: SalesDocumentKind<D, Due>,
  form: UseFormReturn<SalesFormValues>,
  readOnly: boolean,
  clients: SalesClients,
  t: ReturnType<typeof useSalesT>,
): SalesFormItem<Due>[] {
  const { control, setValue } = form
  const label = clientLabel(clients)
  const keys = kind.keys.form
  return [
    {
      id: "clientId",
      label: t(`${keys}.fields.clientId`),
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
              searchPlaceholder={t(`${keys}.clientSearch`)}
              missingLabel={
                form.getValues("clientName") || t(`${keys}.clientMissing`)
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
      label: t(`${keys}.fields.date`),
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
      id: kind.due.field,
      label: t(kind.due.formLabel),
      render: (props) => (
        <FormField
          {...props}
          control={control}
          name={kind.due.field}
          render={({ field, control: aria }) => (
            <DateInput
              {...aria}
              ref={field.ref}
              value={typeof field.value === "string" ? field.value : ""}
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
