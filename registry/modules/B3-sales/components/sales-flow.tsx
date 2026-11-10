import {
  DocumentFlow,
  type DocumentFlowType,
} from "@/components/erp/document-flow"

import { ORDERS, QUOTES, SALES_INVOICES } from "../contract"
import { useSalesModule } from "../module-context"
import { ORDER_KIND, QUOTE_KIND, type SalesKindBase } from "../sales-kinds"
import { useSalesT } from "../use-sales-t"
import { useSalesStatuses } from "./sales-statuses"

/**
 * Потік документів на картці пропозиції чи замовлення (UI13, ADR-0061, ADR-0067): пропозиції й
 * замовлення модуля з назвою типу, карткою й статусами модуля зі змінами розширення. Порядок і зв'язки
 * («На підставі …», «Виправлена копія …») дає сервер. Рахунок модуля K2 (ADR-0070) — з посиланням на
 * його картку, коли проект підключив рахунки, і зі станом документа кіта, а не статусом K2.
 */
export function SalesFlow({ kind, id }: { kind: SalesKindBase; id: string }) {
  const t = useSalesT()
  const { paths } = useSalesModule()
  const quoteStatuses = useSalesStatuses(QUOTE_KIND)
  const orderStatuses = useSalesStatuses(ORDER_KIND)
  const types: Readonly<Record<string, DocumentFlowType>> = {
    [QUOTES]: {
      label: t("quote.flow"),
      href: paths.quote,
      statuses: quoteStatuses,
    },
    [ORDERS]: {
      label: t("order.flow"),
      href: paths.order,
      statuses: orderStatuses,
    },
    ...(paths.invoice
      ? {
          [SALES_INVOICES]: {
            label: t("order.invoice.flow"),
            href: paths.invoice,
          },
        }
      : {}),
  }
  return <DocumentFlow resource={kind.resource} id={id} types={types} />
}
