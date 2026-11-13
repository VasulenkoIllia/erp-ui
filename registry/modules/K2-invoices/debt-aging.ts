/**
 * Старіння боргу за рахунками (ADR-0084): борг рахунку в базовій валюті й рядки звіту за клієнтом і
 * валютою. Чисті функції для моків і тестів; сервер рахує за тими самими правилами.
 */
import {
  convertMinorAmount,
  type DocumentExchange,
} from "@/lib/currency-conversion"
import { daysBetween, type CalendarDate } from "@/lib/dates"

import { agingBucketIndex, agingBucketsOf } from "./aging-buckets"
import type { AgingRow } from "./contract"

/** Відкритий рахунок для звіту: клієнт, валюта, строк, борг і курс. */
export interface AgingInvoice {
  readonly clientId: string
  readonly clientName: string
  readonly date: CalendarDate
  readonly dueDate: CalendarDate
  readonly currency: string
  /** Борг рахунку (`invoiceDebt`), мінорні одиниці; не більший за нуль — рахунок у звіт не йде. */
  readonly debt: number
  readonly exchange?: DocumentExchange | null | undefined
}

/**
 * Борг рахунку в базовій валюті за курсом рахунку, закріпленим на «Виставити» (власник, вікторина
 * 13.11.2026): без переоцінки й курсових різниць. Рахунок у базовій валюті — сам борг; курсу немає чи
 * перерахунок в іншу базову валюту — `null`.
 */
export function baseDebtOf(
  invoice: Pick<AgingInvoice, "currency" | "debt" | "exchange">,
  baseCurrency: string,
): number | null {
  if (invoice.currency === baseCurrency) return invoice.debt
  const { exchange } = invoice
  if (!exchange?.rate || exchange.baseCurrency !== baseCurrency) return null
  return convertMinorAmount(
    invoice.debt,
    invoice.currency,
    exchange.rate,
    baseCurrency,
  )
}

/** Ключ рядка: валюта (три літери) першою, тож `id` клієнта з двокрапкою не плутає ключ. */
const rowKey = (invoice: Pick<AgingInvoice, "currency" | "clientId">) =>
  `${invoice.currency}:${invoice.clientId}`

/**
 * Рядки звіту на дату `today`: лише рахунки з боргом > 0 (переплата іншого рахунку борг не зменшує),
 * за клієнтом і валютою. Назва клієнта — з найновішого рахунку; `baseTotal` — `null`, коли хоч у одного
 * рахунку курсу немає. Порядок — як у рахунків, сортує викликач.
 */
export function agingRowsOf(
  invoices: readonly AgingInvoice[],
  {
    today,
    bounds,
    baseCurrency,
  }: {
    readonly today: CalendarDate
    readonly bounds: readonly number[]
    readonly baseCurrency: string
  },
): AgingRow[] {
  const rows = new Map<string, AgingRow>()
  /** Дата найновішого рахунку рядка: назва клієнта — з нього. */
  const latest = new Map<string, CalendarDate>()
  for (const invoice of invoices) {
    if (invoice.debt <= 0) continue
    const key = rowKey(invoice)
    const row = rows.get(key) ?? {
      id: key,
      clientId: invoice.clientId,
      clientName: invoice.clientName,
      currency: invoice.currency,
      buckets: agingBucketsOf(bounds).map(() => 0),
      total: 0,
      baseCurrency,
      baseTotal: 0,
    }
    const bucket = agingBucketIndex(daysBetween(invoice.dueDate, today), bounds)
    row.buckets[bucket] = (row.buckets[bucket] ?? 0) + invoice.debt
    row.total += invoice.debt
    const base = baseDebtOf(invoice, baseCurrency)
    row.baseTotal =
      base === null || row.baseTotal === null ? null : row.baseTotal + base
    if (invoice.date >= (latest.get(key) ?? invoice.date)) {
      row.clientName = invoice.clientName
      latest.set(key, invoice.date)
    }
    rows.set(key, row)
  }
  return [...rows.values()]
}
