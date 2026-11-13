/**
 * Демо-дані модуля K4 (SPEC §17) від засіву рахунків застосунку (`PaymentInvoices.seed`, моки модуля K2):
 * у кожній компанії — оплата на два рахунки того самого клієнта (новіший сплачено на всю суму рахунку,
 * старший — наполовину), половина боргу рахунку з кредит-нотою карткою, частина рахунку у валюті, сторнована
 * оплата найстаршого рахунку в закритому періоді зі сторно сьогодні й скасована оплата. Новіший рахунок із
 * кредит-нотою після оплати має переплату: повернення (ADR-0083) — половина переплати першого такого рахунку.
 * Якого рахунку немає — тієї оплати теж. Номери — за шаблоном серії й лічильником, який засів уже видав
 * (`counters`).
 */
import { addDays, todayIn, type CalendarDate } from "@/lib/dates"
import type { DocumentExchange } from "@/lib/currency-conversion"
import { formatDocumentNumber } from "@/lib/numbering"

import {
  PAYMENTS,
  RECEIVED_STATUS,
  REFUNDED_STATUS,
  REFUNDS,
  REVERSAL_STATUS,
  type Payment,
  type PaymentAllocation,
  type PaymentMethod,
} from "./contract"
import {
  isActivePayment,
  isPayable,
  paidByInvoice,
  type PaymentInvoiceSource,
} from "./mock-payments"

export type FixtureLocale = "uk" | "en"

/** Шаблон серії оплат (ADR-0058) мовою даних: «ОП-2026-0001». */
export const PAYMENT_NUMBER_TEMPLATE: Record<FixtureLocale, string> = {
  uk: "ОП-{YYYY}-{####}",
  en: "PAY-{YYYY}-{####}",
}

/** Шаблон серії повернень (ADR-0083) мовою даних: «ПВ-2026-0001». */
export const REFUND_NUMBER_TEMPLATE: Record<FixtureLocale, string> = {
  uk: "ПВ-{YYYY}-{####}",
  en: "REF-{YYYY}-{####}",
}

/** Скільки номерів серії видав засів: ресурс, компанія, рік дати документа, останнє значення. */
export interface PaymentFixtureCounter {
  readonly resource: string
  readonly companyId: string | null
  readonly year: number
  readonly value: number
}

export interface PaymentFixtureOptions {
  readonly locale?: FixtureLocale
  /** Сьогодні: від нього дати оплат. Тести ставлять сталу дату. */
  readonly today?: CalendarDate
  /** Базова валюта компанії: оплата рахунку в іншій валюті має курс (`exchange`). */
  readonly baseCurrency?: (companyId: string | null) => string
  /** Курс оплати у валюті на дату (моки модуля A1 через `rates` моків оплат). */
  readonly exchange?: (
    payment: Pick<Payment, "companyId" | "currency" | "date" | "amount">,
  ) => DocumentExchange | null
}

export interface PaymentFixtures {
  readonly payments: Payment[]
  /** Повернення переплати (ADR-0083). */
  readonly refunds: Payment[]
  /** Лічильники серій `sales-payments` і `sales-refunds`. */
  readonly counters: PaymentFixtureCounter[]
}

/** Призначення засіву мовою даних. */
const REFERENCES: Record<FixtureLocale, (numbers: string) => string> = {
  uk: (numbers) => `Оплата за рахунком № ${numbers}`,
  en: (numbers) => `Payment for invoice ${numbers}`,
}
const REFUND_REFERENCES: Record<FixtureLocale, (numbers: string) => string> = {
  uk: (numbers) => `Повернення переплати за рахунком № ${numbers}`,
  en: (numbers) => `Refund of overpayment for invoice ${numbers}`,
}

/** Оплата засіву до номера: рахунки й суми, спосіб, дата, стан. */
interface Seed {
  readonly key: string
  readonly allocations: readonly {
    readonly invoice: PaymentInvoiceSource
    readonly amount: number
  }[]
  readonly method: PaymentMethod
  readonly date: CalendarDate
  readonly state: "received" | "cancelled" | "reversed"
}

/** Наступний день після найпізнішого рахунку, але не пізніше за сьогодні. */
function dayAfter(
  invoices: readonly PaymentInvoiceSource[],
  today: CalendarDate,
): CalendarDate {
  const latest =
    invoices
      .map((invoice) => invoice.date)
      .sort()
      .at(-1) ?? today
  const next = addDays(latest, 1)
  return next > today ? today : next
}

/** Частка боргу засіву: половина, 40 % — копійки донизу, не менше копійки. */
const share = (debt: number, percent: number) =>
  Math.max(1, Math.floor((debt * percent) / 100))

/** Оплати засіву компанії за її рахунками з боргом, від старших. */
function companySeeds(
  open: readonly PaymentInvoiceSource[],
  baseCurrency: string | undefined,
  today: CalendarDate,
): Seed[] {
  const debt = (invoice: PaymentInvoiceSource) => invoice.debt
  const used = new Set<string>()
  const take = (match: (invoice: PaymentInvoiceSource) => boolean) => {
    const found = open.find(
      (invoice) => !used.has(invoice.id) && match(invoice),
    )
    if (found) used.add(found.id)
    return found
  }
  const seeds: Seed[] = []
  const older = take((invoice) =>
    open.some(
      (other) =>
        other.id !== invoice.id &&
        other.clientId === invoice.clientId &&
        other.currency === invoice.currency,
    ),
  )
  const newer =
    older &&
    take(
      (invoice) =>
        invoice.clientId === older.clientId &&
        invoice.currency === older.currency,
    )
  // Новіший сплачено на всю суму рахунку: кредит-нота на нього після оплати дає переплату (ADR-0083).
  if (older && newer)
    seeds.push({
      key: "multi",
      allocations: [
        { invoice: older, amount: share(debt(older), 50) },
        { invoice: newer, amount: newer.total },
      ],
      method: "bank",
      date: dayAfter([older, newer], today),
      state: "received",
    })
  // Борг менший за рахунок: на рахунок уже є кредит-нота.
  const credited = take((invoice) => invoice.debt < invoice.total)
  if (credited)
    seeds.push({
      key: "partial",
      allocations: [{ invoice: credited, amount: share(debt(credited), 50) }],
      method: "card",
      date: dayAfter([credited], today),
      state: "received",
    })
  const foreign = take(
    (invoice) =>
      baseCurrency !== undefined && invoice.currency !== baseCurrency,
  )
  if (foreign)
    seeds.push({
      key: "foreign",
      allocations: [{ invoice: foreign, amount: share(debt(foreign), 40) }],
      method: "bank",
      date: dayAfter([foreign], today),
      state: "received",
    })
  const oldest = take(() => true)
  if (oldest)
    seeds.push({
      key: "reversed",
      allocations: [{ invoice: oldest, amount: debt(oldest) }],
      method: "cash",
      date: dayAfter([oldest], today),
      state: "reversed",
    })
  const latest = [...open].reverse().find((invoice) => !used.has(invoice.id))
  if (latest)
    seeds.push({
      key: "cancelled",
      allocations: [{ invoice: latest, amount: debt(latest) }],
      method: "bank",
      date: dayAfter([latest], today),
      state: "cancelled",
    })
  return seeds
}

/** Номери серій засіву: шаблон мовою даних і лічильник за ресурсом, компанією й роком дати. */
function seedNumbering(locale: FixtureLocale) {
  const counters = new Map<string, PaymentFixtureCounter>()
  const issue = (
    resource: string,
    companyId: string | null,
    date: CalendarDate,
  ) => {
    const year = Number(date.slice(0, 4))
    const key = `${resource}:${companyId ?? "-"}:${String(year)}`
    const value = (counters.get(key)?.value ?? 0) + 1
    counters.set(key, { resource, companyId, year, value })
    const template =
      resource === REFUNDS
        ? REFUND_NUMBER_TEMPLATE[locale]
        : PAYMENT_NUMBER_TEMPLATE[locale]
    const number = formatDocumentNumber(template, { date, value })
    if (!number) throw new Error("K4-payments: numbering template is invalid")
    return number
  }
  return { issue, counters: () => [...counters.values()] }
}

/** Сторно засіву: проведене сьогодні, сума з мінусом, курс першого. */
function seedReversal(payment: Payment, number: string, today: CalendarDate) {
  const reversal: Payment = {
    ...payment,
    id: `${payment.id}-reversal`,
    number,
    date: today,
    amount: -payment.amount,
    exchange: payment.exchange
      ? {
          ...payment.exchange,
          baseTotal:
            payment.exchange.baseTotal === null
              ? null
              : -payment.exchange.baseTotal || 0,
        }
      : null,
    status: REVERSAL_STATUS,
    docStatus: "submitted",
    reversalOf: payment.id,
  }
  payment.reversedBy = reversal.id
  return reversal
}

/** Оплати засіву за рахунками засіву `invoices` застосунку й повернення переплати за ними. */
export function createPaymentFixtures(
  invoices: readonly PaymentInvoiceSource[],
  {
    locale = "uk",
    today = todayIn(),
    baseCurrency,
    exchange,
  }: PaymentFixtureOptions = {},
): PaymentFixtures {
  const numbering = seedNumbering(locale)
  const companies = [
    ...new Set(invoices.map((invoice) => invoice.companyId ?? null)),
  ]
  const payments: Payment[] = []
  const refunds: Payment[] = []
  for (const companyId of companies) {
    const own = invoices
      .filter((invoice) => (invoice.companyId ?? null) === companyId)
      .sort((a, b) => a.date.localeCompare(b.date))
    const owner = companyId ?? "shared"
    const seeds = companySeeds(
      own.filter(isPayable),
      baseCurrency?.(companyId),
      today,
    )
    // Номери — від старших оплат, як їх видавав би сервер; сторно — сьогодні, останнім.
    const byDate = [...seeds].sort((a, b) => a.date.localeCompare(b.date))
    const created = new Map(
      byDate.map((seed) => [
        seed.key,
        seedPayment(seed, `pay-${owner}-${seed.key}`, companyId, {
          reference: REFERENCES[locale],
          number: numbering.issue(PAYMENTS, companyId, seed.date),
          exchange,
        }),
      ]),
    )
    const companyPayments: Payment[] = []
    for (const seed of seeds) {
      const payment = created.get(seed.key)
      if (!payment) continue
      companyPayments.push(payment)
      if (seed.state === "reversed")
        companyPayments.push(
          seedReversal(
            payment,
            numbering.issue(PAYMENTS, companyId, today),
            today,
          ),
        )
    }
    payments.push(...companyPayments)
    const refund = refundSeed(own, companyPayments, today)
    if (refund)
      refunds.push(
        seedPayment(refund, `ref-${owner}-${refund.key}`, companyId, {
          reference: REFUND_REFERENCES[locale],
          number: numbering.issue(REFUNDS, companyId, refund.date),
          exchange,
          createdStatus: REFUNDED_STATUS,
        }),
      )
  }
  return { payments, refunds, counters: numbering.counters() }
}

/**
 * Повернення засіву (ADR-0083): половина переплати першого рахунку, який після оплат засіву має переплату
 * (кредит-нота після оплати), датоване сьогодні — після кредит-ноти.
 */
function refundSeed(
  invoices: readonly PaymentInvoiceSource[],
  payments: readonly Payment[],
  today: CalendarDate,
): Seed | undefined {
  const paid = paidByInvoice(payments.filter(isActivePayment))
  const overpaid = invoices.find(
    (invoice) =>
      invoice.isOpen &&
      invoice.number !== null &&
      invoice.debt - (paid.get(invoice.id) ?? 0) < 0,
  )
  if (!overpaid) return undefined
  const overpayment = (paid.get(overpaid.id) ?? 0) - overpaid.debt
  return {
    key: "overpaid",
    allocations: [{ invoice: overpaid, amount: share(overpayment, 50) }],
    method: "bank",
    date: today,
    state: "received",
  }
}

/** Оплата (чи повернення) засіву: рознесення зі знімками рахунків, сума — їхня сума. */
function seedPayment(
  seed: Seed,
  id: string,
  companyId: string | null,
  context: {
    readonly reference: (numbers: string) => string
    readonly number: string
    readonly exchange: PaymentFixtureOptions["exchange"]
    /** Статус проведеного: «Отримано» оплати чи «Повернено» повернення. */
    readonly createdStatus?: string
  },
): Payment {
  const first = seed.allocations[0]?.invoice
  if (!first) throw new Error(`K4-payments: fixture ${id} has no invoices`)
  const allocations: PaymentAllocation[] = seed.allocations.map(
    ({ invoice, amount }) => ({
      invoiceId: invoice.id,
      invoiceNumber: invoice.number ?? "",
      invoiceDate: invoice.date,
      amount,
    }),
  )
  const amount = allocations.reduce((sum, item) => sum + item.amount, 0)
  const base = {
    companyId,
    currency: first.currency,
    date: seed.date,
    amount,
  }
  return {
    id,
    version: 1,
    ...base,
    number: context.number,
    clientId: first.clientId,
    clientName: first.clientName,
    method: seed.method,
    reference: context.reference(
      allocations.map((item) => item.invoiceNumber).join(", "),
    ),
    allocations,
    exchange: context.exchange?.(base) ?? null,
    status:
      seed.state === "received"
        ? (context.createdStatus ?? RECEIVED_STATUS)
        : seed.state,
    docStatus: seed.state === "cancelled" ? "cancelled" : "submitted",
  }
}
