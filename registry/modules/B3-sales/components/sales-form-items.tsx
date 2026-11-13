import { useMemo } from "react"
import type { UseFormReturn } from "react-hook-form"

import {
  clientLabelOf,
  dateFormItem,
  documentClientItem,
} from "@/components/erp/document-form-items"
import type { DocumentLinesValues } from "@/components/erp/document-lines-schema"
import type { RecordFormItem } from "@/components/erp/record-form"

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
  const { control, setValue, getValues } = form
  const label = clientLabelOf(clients)
  const keys = kind.keys.form
  return [
    documentClientItem({
      control,
      clients,
      label: t(`${keys}.fields.clientId`),
      searchPlaceholder: t(`${keys}.clientSearch`),
      missingLabel: () => getValues("clientName") || t(`${keys}.clientMissing`),
      readOnly,
      onValueChange: (field, id, record) => {
        field.onChange(id ?? "")
        // Знімок назви — разом із вибором: без запису (очистили) назви немає.
        setValue("clientName", record ? label(record) : "", {
          shouldDirty: true,
        })
      },
    }),
    dateFormItem({
      control,
      name: "date",
      label: t(`${keys}.fields.date`),
      readOnly,
    }),
    {
      ...dateFormItem({
        control,
        name: kind.due.field,
        label: t(kind.due.formLabel),
        readOnly,
      }),
      id: kind.due.field,
    },
  ]
}
