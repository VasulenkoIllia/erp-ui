/**
 * Зв'язок рахунку із замовленням модуля B3 у моках модуля K2 (ADR-0061, ADR-0070): рахунок із замовлення,
 * рахунок, що діє, і джерела потоку документів. Модуль B3 не імпортується — лише назва ресурсу
 * замовлень і поля, які рахунок бере. Частина `mocks.ts`: застосунок їх окремо не бере.
 */
import { addDays, type CalendarDate } from "@/lib/dates"
import type { DocumentBodyLine } from "@/lib/document-lines"
import { partyDetailsFrom, type PartyDetails } from "@/lib/document-parties"
import {
  inheritedFieldValues,
  type ExtensionField,
} from "@/lib/extension-fields"
import {
  documentFlowSource,
  documentLifecycleLinks,
  type DocumentFlowMockSource,
} from "@/lib/mock-document-flow"
import type { MockTransitionRecord } from "@/lib/mock-transitions"
import type { MockResourceDb } from "@/lib/mocks"

import {
  DEFAULT_INVOICE_STATUS,
  INVOICE_DUE_DAYS,
  INVOICES,
  REVERSAL_STATUS,
  type Invoice,
  type InvoiceCard,
  type K2Document,
} from "./contract"

/** Ресурс замовлень модуля B3: зв'язок `basedOn` у потоці документів. */
export const ORDERS_RESOURCE = "orders"

/**
 * Замовлення, з якого виставляють рахунок: те, що рахунок бере, без типу модуля B3. Поля розширення
 * замовлення — під своїми ключами (індекс запису моку).
 */
export type InvoiceOrderSource = MockTransitionRecord & {
  readonly clientId: string
  readonly clientName: string
  readonly currency: string
  readonly lines: readonly DocumentBodyLine[]
  readonly discountPercent: number
  readonly discountAmount: number
}

/** Сторони нового рахунку: наша компанія й клієнт замовлення з його картки. */
export interface InvoiceMockParties {
  supplier(companyId: string | null): Partial<PartyDetails>
  buyer(
    companyId: string | null,
    client: { readonly id: string; readonly name: string },
  ): Partial<PartyDetails>
}

/**
 * Рахунок-чернетка із замовлення (рішення власника 10.11.2026, ADR-0070): клієнт, валюта, рядки й знижка
 * замовлення, `orderId`; дата — `date` (сьогодні чи перший відкритий день), «Сплатити до» — за
 * `INVOICE_DUE_DAYS`. Сторони — з профілю компанії й картки клієнта. Поля розширення рахунку (`fields`)
 * беруть значення поля замовлення з тим самим ключем, якщо воно підходить.
 */
export function invoiceFromOrder(
  order: InvoiceOrderSource,
  {
    date,
    parties,
    fields,
  }: {
    date: CalendarDate
    parties: InvoiceMockParties
    fields?: readonly ExtensionField[] | undefined
  },
): Record<string, unknown> {
  const companyId = order.companyId ?? null
  const client = { id: order.clientId, name: order.clientName }
  return {
    ...inheritedFieldValues(order, fields),
    clientId: order.clientId,
    clientName: order.clientName,
    currency: order.currency,
    lines: order.lines,
    discountPercent: order.discountPercent,
    discountAmount: order.discountAmount,
    date,
    dueDate: addDays(date, INVOICE_DUE_DAYS),
    supplier: partyDetailsFrom(parties.supplier(companyId)),
    buyer: partyDetailsFrom({
      name: client.name,
      ...parties.buyer(companyId, client),
    }),
    status: DEFAULT_INVOICE_STATUS,
    orderId: order.id,
  }
}

/** Рахунок діє: не скасований, не сторнований і не сам сторно. Тоді замовлення не скасовують. */
export const isActiveInvoice = (invoice: Invoice) =>
  invoice.docStatus !== "cancelled" &&
  !invoice.reversedBy &&
  invoice.status !== REVERSAL_STATUS

/** Документ модуля в потоці: номер, дата, статус модуля, стан і сума (у сторно — з мінусом). */
export const documentFlowNode = (document: K2Document) => ({
  number: document.number,
  date: document.date,
  status: document.status,
  docStatus: document.docStatus,
  total: { amount: document.total, currency: document.currency },
})

/** Джерело потоку рахунків: зв'язки життєвого циклу й «На підставі» замовлення B3. */
export function invoicesFlowSource(
  invoices: MockResourceDb<InvoiceCard>,
): DocumentFlowMockSource {
  return documentFlowSource({
    resource: INVOICES,
    db: invoices,
    node: documentFlowNode,
    links: (invoice) => [
      ...documentLifecycleLinks(INVOICES)(invoice),
      ...(invoice.orderId
        ? [
            {
              kind: "basedOn" as const,
              resource: ORDERS_RESOURCE,
              id: invoice.orderId,
            },
          ]
        : []),
    ],
  })
}
