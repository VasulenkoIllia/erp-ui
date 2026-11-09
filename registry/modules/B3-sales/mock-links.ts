/**
 * Зв'язок пропозиції із замовленням у моках модуля B3 (ADR-0061, ADR-0067): замовлення з пропозиції,
 * позначки `linked`, звільнення пропозиції після видалення чернетки замовлення й джерела потоку
 * документів. Частина `mocks.ts`: застосунок їх окремо не бере.
 */
import { addDays, todayIn } from "@/lib/dates"
import {
  documentFlowSource,
  documentLifecycleLinks,
  type DocumentFlowMockSource,
} from "@/lib/mock-document-flow"
import type { MockResourceDb } from "@/lib/mocks"
import {
  RECORD_DENIAL_REASONS,
  type RecordDeniedActions,
} from "@/lib/record-access"

import {
  CREATE_ORDER,
  DEFAULT_ORDER_STATUS,
  ORDERS,
  QUOTES,
  type OrderCard,
  type QuoteCard,
  type SalesDocument,
} from "./contract"

/** Нова чернетка сервера (виправлена копія, замовлення з пропозиції): друга дата за стільки днів від сьогодні. */
export const NEW_DUE_DAYS = { quotes: 14, orders: 7 } as const

/** Документ продажу в потоці: номер, дата, статус модуля, стан і сума. */
const flowNode = (document: SalesDocument) => ({
  number: document.number,
  date: document.date,
  status: document.status,
  docStatus: document.docStatus,
  total: { amount: document.total, currency: document.currency },
})

/**
 * Замовлення з пропозиції: клієнт, валюта, рядки й знижка пропозиції, зв'язок `quoteId`; дата —
 * сьогодні, «Виконати до» — за тиждень. Поля розширення пропозиції в замовлення не переходять: у
 * замовлення свої.
 */
export function orderFromQuote(quote: QuoteCard): Record<string, unknown> {
  const today = todayIn()
  return {
    clientId: quote.clientId,
    clientName: quote.clientName,
    currency: quote.currency,
    lines: quote.lines,
    discountPercent: quote.discountPercent,
    discountAmount: quote.discountAmount,
    date: today,
    dueDate: addDays(today, NEW_DUE_DAYS.orders),
    status: DEFAULT_ORDER_STATUS,
    quoteId: quote.id,
  }
}

/**
 * Пропозиція із замовленням (ADR-0067): друге замовлення не створюється (`order`), а поки замовлення
 * не скасоване — пропозицію не скасовують (`cancel`). Обидві позначки — `linked`.
 */
export function quoteOrderDenials(
  quote: QuoteCard,
  orders: MockResourceDb<OrderCard>,
): RecordDeniedActions | undefined {
  if (!quote.orderId) return undefined
  const isActive = orders
    .all()
    .some(
      (order) => order.quoteId === quote.id && order.docStatus !== "cancelled",
    )
  return {
    [CREATE_ORDER]: RECORD_DENIAL_REASONS.linked,
    ...(isActive ? { cancel: RECORD_DENIAL_REASONS.linked } : {}),
  }
}

/** Видалили чернетку замовлення, створену з пропозиції: пропозиція знову може дати замовлення. */
export function releaseQuoteOrder(
  quotes: MockResourceDb<QuoteCard>,
  removed: Pick<OrderCard, "id" | "quoteId">,
): void {
  const quote = removed.quoteId
    ? quotes.all().find((candidate) => candidate.id === removed.quoteId)
    : undefined
  if (quote?.orderId !== removed.id) return
  const result = quotes.patch(quote.id, { orderId: null })
  // Схема пропозиції не бере `orderId: null` — помилка моку, а не відповідь сервера.
  if (result && "fieldErrors" in result)
    throw new Error(
      `Mock: cannot release ${quote.id}: ${JSON.stringify(result.fieldErrors)}`,
    )
}

/** Джерела потоку в порядку процесу: пропозиції, потім замовлення зі зв'язком `basedOn`. */
export function salesFlowSources(
  quotes: MockResourceDb<QuoteCard>,
  orders: MockResourceDb<OrderCard>,
): DocumentFlowMockSource[] {
  return [
    documentFlowSource({ resource: QUOTES, db: quotes, node: flowNode }),
    documentFlowSource({
      resource: ORDERS,
      db: orders,
      node: flowNode,
      links: (order) => [
        ...documentLifecycleLinks(ORDERS)(order),
        ...(order.quoteId
          ? [{ kind: "basedOn" as const, resource: QUOTES, id: order.quoteId }]
          : []),
      ],
    }),
  ]
}
