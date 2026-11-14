import { useGetOne, type RaRecord } from "ra-core"
import type { Control, FieldPath, FieldValues } from "react-hook-form"

import { DateInput } from "@/registry/erp/date-input"
import { FormField } from "@/registry/erp/form"
import type { RecordFormItem } from "@/registry/erp/record-form"
import { RecordPicker } from "@/registry/erp/record-picker"
import { useCompanyId } from "@/registry/hooks/use-company"
import { companyScope } from "@/registry/lib/company-scope"
import type { CalendarDate } from "@/registry/lib/dates"

/**
 * Поля шапки форми документа (ADR-0086): клієнт — вибір із ресурсу клієнтів проекту з пошуком на
 * сервері — і дата. Спільне для документних модулів (B3, K2, K4): модуль дає підписи своїми словами й
 * що робити з вибором клієнта (знімок назви, реквізити покупця, рахунки клієнта).
 *
 *   documentClientItem({ control, clients, label, searchPlaceholder, missingLabel, onValueChange })
 *   dateFormItem({ control, name: "date", label, min: posting.min, description: posting.hint })
 */

/** Клієнти документа: ресурс, з якого їх вибирають, поле назви й картка клієнта, якщо вона є в проекті. */
export interface DocumentClients {
  /** Ресурс API клієнтів: `organizations` модуля B1 чи свій ресурс проекту. */
  readonly resource: string
  /** Поле назви клієнта в записі ресурсу. */
  readonly labelField: string
  /** Другий рядок варіанта вибору: код ЄДРПОУ, місто. */
  readonly descriptionField?: string
  /** Адреса картки клієнта; без неї назва в документі — текст, а не посилання. */
  readonly href?: (id: string) => string
}

/** Непорожній рядок поля `field` запису; інше — `undefined`. */
export function recordText(
  record: RaRecord,
  field: string | undefined,
): string | undefined {
  const value: unknown = field ? record[field] : undefined
  return typeof value === "string" && value ? value : undefined
}

/** Назва клієнта з запису ресурсу клієнтів: поле назви чи `id`. */
export const clientLabelOf =
  (clients: Pick<DocumentClients, "labelField">) =>
  (record: RaRecord): string =>
    recordText(record, clients.labelField) ?? String(record.id)

/** Назва клієнта за `id` у порівнянні конфлікту: значення сервера — інший клієнт. */
export function DocumentClientName({
  clients,
  id,
}: {
  clients: DocumentClients
  id: string
}) {
  const companyId = useCompanyId()
  const { data } = useGetOne<RaRecord>(clients.resource, {
    id,
    meta: companyScope(companyId),
  })
  return data ? clientLabelOf(clients)(data) : id
}

/** Значення поля клієнта й його зміна: модуль сам вирішує, що змінити разом із вибором. */
export interface ClientField {
  readonly value: string
  readonly onChange: (id: string) => void
}

/**
 * Поле «Клієнт» форми документа з ключем `clientId`: вибір із ресурсу клієнтів, назва в порівнянні
 * конфлікту, обов'язкове. `onValueChange` — вибір змінився (`id` — `null`, коли поле очистили): модуль
 * ставить `clientId`, знімок назви й своє.
 */
export function documentClientItem<
  TValues extends FieldValues & { clientId: string },
>({
  control,
  clients,
  label,
  searchPlaceholder,
  missingLabel,
  readOnly = false,
  onValueChange,
}: {
  control: Control<TValues>
  clients: DocumentClients
  label: string
  searchPlaceholder: string
  /** Підпис вибору, поки запис клієнта не прийшов: знімок назви чи «Клієнта не знайдено». */
  missingLabel: () => string
  readOnly?: boolean
  onValueChange: (
    field: ClientField,
    id: string | null,
    record: RaRecord | null,
  ) => void
}): RecordFormItem & { id: "clientId" } {
  const optionLabel = clientLabelOf(clients)
  return {
    id: "clientId",
    label,
    text: (id) =>
      typeof id === "string" && id ? (
        <DocumentClientName clients={clients} id={id} />
      ) : null,
    render: (props) => (
      <FormField
        {...props}
        control={control}
        name={"clientId" as FieldPath<TValues>}
        render={({ field, control: aria }) => (
          <RecordPicker<RaRecord>
            {...aria}
            ref={field.ref}
            resource={clients.resource}
            label={props.label}
            value={
              typeof field.value === "string" && field.value
                ? field.value
                : null
            }
            onValueChange={(id, record) => {
              onValueChange(
                {
                  value: typeof field.value === "string" ? field.value : "",
                  onChange: field.onChange,
                },
                id,
                record,
              )
            }}
            onBlur={field.onBlur}
            optionLabel={optionLabel}
            optionDescription={(record) =>
              recordText(record, clients.descriptionField)
            }
            searchPlaceholder={searchPlaceholder}
            missingLabel={missingLabel()}
            required
            readOnly={readOnly}
          />
        )}
      />
    ),
  }
}

/**
 * Поле дати форми з ключем `name`: календар і введення з клавіатури; `min` — перший відкритий день
 * закритого періоду (PF13), підказка — `description`. Дату раніше `min` з клавіатури відхилить сервер.
 */
export function dateFormItem<
  TValues extends FieldValues,
  Name extends FieldPath<TValues>,
>({
  control,
  name,
  label,
  description,
  min,
  readOnly = false,
}: {
  control: Control<TValues>
  name: Name
  label: string
  description?: string | undefined
  min?: CalendarDate | undefined
  readOnly?: boolean
}): RecordFormItem & { id: Name } {
  return {
    id: name,
    label,
    ...(description ? { description } : {}),
    render: (props) => (
      <FormField
        {...props}
        control={control}
        name={name}
        render={({ field, control: aria }) => (
          <DateInput
            {...aria}
            ref={field.ref}
            value={typeof field.value === "string" ? field.value : ""}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
            min={min}
            readOnly={readOnly}
          />
        )}
      />
    ),
  }
}
