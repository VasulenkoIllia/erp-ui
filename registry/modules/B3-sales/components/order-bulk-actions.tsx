import type * as React from "react"

import type { ListReportBulk } from "@/components/templates/list-report"
import type { RowSelection } from "@/hooks/use-row-selection"
import type { FilterValue } from "@/lib/api"

import type { Order } from "../contract"
import { ORDER_KIND } from "../sales-kinds"
import {
  salesBulkOf,
  useSalesBulkDelete,
  useSalesBulkTransition,
  useSalesRowLabel,
} from "./sales-bulk-action"
import { useSalesTransitions } from "./sales-statuses"

/**
 * «Підтвердити», «Позначити виконаним», «Скасувати» з причиною й «Видалити» для вибраних замовлень
 * (ADR-0066, ADR-0067): фонова задача сервера, звіт про невдалі з причиною кожного. Дія графа, яку
 * розширення сховало, зі списку теж зникає. Діалоги — на сторінці поруч зі списком (`dialogs`).
 */
export function useOrderBulkActions(
  selection: RowSelection,
  filter: Record<string, FilterValue>,
): { bulk: ListReportBulk<Order>; dialogs: React.ReactNode } {
  const scope = { kind: ORDER_KIND, selection, filter }
  const transitions = useSalesTransitions(ORDER_KIND)
  const submitTransition = transitions.find((item) => item.id === "submit")
  const completeTransition = transitions.find((item) => item.id === "complete")
  const cancelTransition = transitions.find((item) => item.id === "cancel")
  const submit = useSalesBulkTransition(scope, {
    key: "orders.bulk.submit",
    transition: submitTransition,
    icon: "submit",
    isPrimary: true,
  })
  const complete = useSalesBulkTransition(scope, {
    key: "orders.bulk.complete",
    transition: completeTransition,
    icon: "approve",
  })
  const cancel = useSalesBulkTransition(scope, {
    key: "orders.bulk.cancel",
    transition: cancelTransition,
    icon: "cancelDocument",
  })
  const remove = useSalesBulkDelete(scope)
  const rowLabel = useSalesRowLabel(ORDER_KIND)
  return salesBulkOf(
    [
      { id: "submit", action: submit, isShown: Boolean(submitTransition) },
      {
        id: "complete",
        action: complete,
        isShown: Boolean(completeTransition),
      },
      { id: "cancel", action: cancel, isShown: Boolean(cancelTransition) },
      { id: "delete", action: remove, isShown: true },
    ],
    rowLabel,
  )
}
