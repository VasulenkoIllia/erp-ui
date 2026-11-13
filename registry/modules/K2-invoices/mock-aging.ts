/**
 * Звіт старіння боргу в моках (ADR-0084): `GET /sales-invoices/aging` — рахунки, які людина бачить у
 * списку, з боргом > 0 на сьогодні, рядком на клієнта й валюту. Частина `mocks.ts`: є лише з оплатами
 * модуля K4, бо без них рахунок не має боргу (ADR-0073).
 */
import { http, type HttpHandler } from "msw/http"

import { fromSearchParams, type FilterValue, type SortField } from "@/lib/api"
import { DEFAULT_BASE_CURRENCY } from "@/lib/company"
import type { CalendarDate } from "@/lib/dates"
import { validation } from "@/lib/mock-account-state"
import { mockRequestPermissions } from "@/lib/mock-company-roles"
import { scenarioFor } from "@/lib/mock-scenarios"
import { mockGrantsRecords } from "@/lib/mock-scope"
import {
  applyScenario,
  currentMockUser,
  errorResponse,
  json,
  unauthenticated,
} from "@/lib/mock-server"
import type { MockResourceDb } from "@/lib/mocks"

import { DEFAULT_AGING_BUCKETS, parseAgingBuckets } from "./aging-buckets"
import {
  INVOICE_AGING,
  INVOICES,
  type AgingRow,
  type InvoiceCard,
} from "./contract"
import { agingRowsOf } from "./debt-aging"
import { invoiceDebt } from "./invoice-debt"
import { isOpenInvoice } from "./mock-credit-notes"
import type { InvoiceMockRates } from "./mock-exchange"
import type { InvoiceSettlement } from "./mock-payments"

/** Без `sort` у запиті — хто винен найбільше в базовій валюті. */
const DEFAULT_SORT: readonly SortField[] = [
  { field: "baseTotal", order: "desc" },
]
const SORT_FIELDS = new Set(["clientName", "total", "baseTotal"])
const collator = new Intl.Collator("uk", { sensitivity: "base" })

/** Рядок за фільтрами контракту: `clientId` і `currency` — «одне з», `q` — підрядок назви клієнта. */
function matches(row: AgingRow, filter: Record<string, FilterValue>) {
  const listed = (value: FilterValue | undefined) =>
    value === undefined ? null : [value].flat().map(String)
  const clients = listed(filter.clientId)
  const currencies = listed(filter.currency)
  const query = typeof filter.q === "string" ? filter.q.trim() : ""
  return (
    (!clients || clients.includes(row.clientId)) &&
    (!currencies || currencies.includes(row.currency)) &&
    row.clientName
      .toLocaleLowerCase("uk")
      .includes(query.toLocaleLowerCase("uk"))
  )
}

/** Порівняння за полем сортування; рядок без суми в базовій валюті — останнім в обидва боки. */
function compareBy(a: AgingRow, b: AgingRow, { field, order }: SortField) {
  const sign = order === "desc" ? -1 : 1
  if (field === "clientName")
    return sign * collator.compare(a.clientName, b.clientName)
  const left = field === "total" ? a.total : a.baseTotal
  const right = field === "total" ? b.total : b.baseTotal
  if (left === null || right === null)
    return left === right ? 0 : left === null ? 1 : -1
  return sign * (left - right)
}

/** Межі з параметра `buckets`: немає — за замовчуванням, не межі — `null`. */
function boundsOf(param: FilterValue | undefined): readonly number[] | null {
  if (param === undefined) return DEFAULT_AGING_BUCKETS
  return typeof param === "string" ? parseAgingBuckets(param) : null
}

export function createAgingHandler({
  baseUrl = "/api/v1",
  db,
  settlement,
  rates,
  today,
}: {
  readonly baseUrl?: string | undefined
  readonly db: MockResourceDb<InvoiceCard>
  readonly settlement: InvoiceSettlement
  readonly rates: InvoiceMockRates | undefined
  readonly today: () => CalendarDate
}): HttpHandler {
  return http.get(`${baseUrl}/${INVOICE_AGING}`, async ({ request }) => {
    const scenario = scenarioFor(INVOICES)
    const early = await applyScenario(scenario)
    if (early) return early
    const user = currentMockUser()
    if (!user) return unauthenticated()
    const access = mockRequestPermissions(request, user)
    if (access instanceof Response) return access
    const rules = db.accessOf(user, access.permissions)
    if (!mockGrantsRecords(rules, "read"))
      return errorResponse(403, {
        code: "forbidden",
        message: `Missing permission ${INVOICES}:read`,
      })
    const { page, perPage, sort, filter } = fromSearchParams(
      new URL(request.url).searchParams,
    )
    const { buckets, ...rowFilter } = filter
    const bounds = boundsOf(buckets)
    if (!bounds) return validation({ buckets: "invalid" })
    if (scenario === "empty") return json({ data: [], total: 0 })
    const { companyId } = access
    const invoices = db
      .select({}, companyId, rules)
      .filter(isOpenInvoice)
      .map((invoice) => ({
        ...invoice,
        debt: invoiceDebt({
          total: invoice.total,
          creditedTotal: settlement.credited(invoice.id),
          paidTotal: settlement.paid(invoice.id),
          refundedTotal: settlement.refunded(invoice.id),
        }),
      }))
    const order = (sort.length ? sort : DEFAULT_SORT).filter(({ field }) =>
      SORT_FIELDS.has(field),
    )
    const rows = agingRowsOf(invoices, {
      today: today(),
      bounds,
      baseCurrency: rates?.baseCurrency(companyId) ?? DEFAULT_BASE_CURRENCY,
    })
      .filter((row) => matches(row, rowFilter))
      .sort((a, b) => {
        for (const field of order) {
          const diff = compareBy(a, b, field)
          if (diff) return diff
        }
        return 0
      })
    const start = (page - 1) * perPage
    return json({
      data: rows.slice(start, start + perPage),
      total: rows.length,
    })
  })
}
