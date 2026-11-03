import { ApiError } from "@/registry/lib/api"
import type {
  DocumentFlow,
  DocumentFlowNode,
} from "@/registry/lib/document-links"

/**
 * Потоки сторінки «Потік документів» (UI13, ADR-0061) без запитів: ланцюг продажу з чотирма типами,
 * сторно й виправлена копія, стани. Типи — так, як їх назве модуль: пропозиції й замовлення B3,
 * відвантаження, рахунки K2.
 */
export const FLOW_TYPES = ["quotes", "orders", "shipments", "invoices"] as const
export type FlowType = (typeof FLOW_TYPES)[number]

const uah = (amount: number) => ({ amount, currency: "UAH" })
const from = (
  kind: "basedOn" | "amendedFrom" | "reversalOf",
  resource: FlowType,
  id: string,
) => ({ kind, resource, id })

/** Замовлення з пропозиції, два відвантаження (одне без доступу), рахунок скасовано й виправлено, чернетку видалено. */
const SALE: DocumentFlowNode[] = [
  {
    resource: "quotes",
    id: "q-12",
    access: "granted",
    number: "ПРО-2026-0012",
    date: "2026-10-20",
    status: "accepted",
    total: uah(4_800_000),
  },
  {
    resource: "orders",
    id: "o-7",
    access: "granted",
    number: "ЗАМ-2026-0007",
    date: "2026-10-22",
    docStatus: "submitted",
    total: uah(4_800_000),
    links: [from("basedOn", "quotes", "q-12")],
  },
  {
    resource: "shipments",
    id: "s-3",
    access: "granted",
    number: "ВІД-2026-0003",
    date: "2026-10-24",
    status: "shipped",
    links: [from("basedOn", "orders", "o-7")],
  },
  {
    resource: "shipments",
    id: "s-4",
    access: "forbidden",
    number: "ВІД-2026-0004",
    links: [from("basedOn", "orders", "o-7")],
  },
  {
    resource: "invoices",
    id: "i-20",
    access: "deleted",
    number: null,
    links: [from("basedOn", "orders", "o-7")],
  },
  {
    resource: "invoices",
    id: "i-21",
    access: "granted",
    number: "РАХ-2026-0021",
    date: "2026-10-25",
    docStatus: "cancelled",
    total: uah(4_800_000),
    links: [from("basedOn", "orders", "o-7")],
  },
  {
    resource: "invoices",
    id: "i-22",
    access: "granted",
    number: "РАХ-2026-0022",
    date: "2026-10-26",
    docStatus: "submitted",
    total: uah(4_750_000),
    links: [from("amendedFrom", "invoices", "i-21")],
  },
]

/** Рахунок і його сторно: перший лишається проведеним (ADR-0057). */
const REVERSAL: DocumentFlowNode[] = [
  {
    resource: "invoices",
    id: "i-30",
    access: "granted",
    number: "РАХ-2026-0030",
    date: "2026-10-28",
    docStatus: "submitted",
    total: uah(1_200_000),
  },
  {
    resource: "invoices",
    id: "i-31",
    access: "granted",
    number: "РАХ-2026-0031",
    date: "2026-11-02",
    docStatus: "submitted",
    total: uah(-1_200_000),
    links: [from("reversalOf", "invoices", "i-30")],
  },
]

export const FLOWS = {
  sale: { documents: SALE, truncated: false },
  reversal: { documents: REVERSAL, truncated: false },
  short: { documents: SALE.slice(0, 3), truncated: false },
  empty: { documents: SALE.slice(1, 2), truncated: false },
  truncated: { documents: SALE.slice(0, 3), truncated: true },
} as const satisfies Record<string, DocumentFlow>

export const DEFAULT_CURRENT = "orders:o-7"

/** Стани без запиту: як їх показує потік на картці, коли сервер не відповів. */
export const FLOW_ERRORS = {
  error: new ApiError(500, { code: "server", message: "Mock: server error" }),
  offline: new ApiError(0, { code: "offline", message: "Mock: offline" }),
  forbidden: new ApiError(403, {
    code: "forbidden",
    message: "Mock: no permission",
  }),
}
