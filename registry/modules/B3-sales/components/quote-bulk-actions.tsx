import type * as React from "react"

import type { ListReportBulk } from "@/components/templates/list-report"
import type { RowSelection } from "@/hooks/use-row-selection"
import type { FilterValue } from "@/lib/api"

import type { Quote } from "../contract"
import { QUOTE_KIND } from "../sales-kinds"
import {
  salesBulkOf,
  useSalesBulkDelete,
  useSalesBulkTransition,
  useSalesRowLabel,
} from "./sales-bulk-action"
import { useSalesTransitions } from "./sales-statuses"

/**
 * «Надіслати», «Скасувати» з причиною й «Видалити» для вибраних пропозицій (ADR-0066): фонова задача
 * сервера, звіт про невдалі з причиною кожної. Дія графа, яку розширення сховало, зі списку теж
 * зникає. Діалоги — на сторінці поруч зі списком (`dialogs`).
 */
export function useQuoteBulkActions(
  selection: RowSelection,
  filter: Record<string, FilterValue>,
): { bulk: ListReportBulk<Quote>; dialogs: React.ReactNode } {
  const scope = { kind: QUOTE_KIND, selection, filter }
  const transitions = useSalesTransitions(QUOTE_KIND)
  const submitTransition = transitions.find((item) => item.id === "submit")
  const cancelTransition = transitions.find((item) => item.id === "cancel")
  const submit = useSalesBulkTransition(scope, {
    key: "quotes.bulk.submit",
    transition: submitTransition,
    icon: "send",
    isPrimary: true,
  })
  const cancel = useSalesBulkTransition(scope, {
    key: "quotes.bulk.cancel",
    transition: cancelTransition,
    icon: "cancelDocument",
  })
  const remove = useSalesBulkDelete(scope)
  const rowLabel = useSalesRowLabel(QUOTE_KIND)
  return salesBulkOf(
    [
      { id: "submit", action: submit, isShown: Boolean(submitTransition) },
      { id: "cancel", action: cancel, isShown: Boolean(cancelTransition) },
      { id: "delete", action: remove, isShown: true },
    ],
    rowLabel,
  )
}
