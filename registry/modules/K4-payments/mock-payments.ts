/**
 * Правила оплат у моках модуля K4 (ADR-0073): частина `mocks.ts`, застосунок окремо їх не бере.
 *
 * - Рахунки дає застосунок (`PaymentInvoices`, моки модуля K2): модулі не імпортують один одного. Борг
 *   рахунку — «виставлено мінус кредит-ноти мінус оплачено» (ADR-0072) — рахують моки рахунків; оплачене їм дають
 *   оплати, що діють: проведені, не сторновані й не самі сторно (`paidByInvoice`).
 * - Нова оплата з тіла запиту: рахунки того самого клієнта й валюти, що чекають оплати, кожному не більше
 *   за борг, сума оплати дорівнює сумі рознесення. Назву клієнта, номери й дати рахунків бере «сервер».
 * - Потік документів: оплата — «на підставі» кожного свого рахунку (`paymentsFlowSource`).
 */
import { z } from "zod"

import { moneyAmountSchema } from "@/lib/api"
import { isCalendarDate, type CalendarDate } from "@/lib/dates"
import {
  documentFlowSource,
  documentLifecycleLinks,
  type DocumentFlowMockSource,
} from "@/lib/mock-document-flow"
import { fieldErrors } from "@/lib/mock-records"
import { inMockCompany } from "@/lib/mock-scope"
import type { MockResourceDb } from "@/lib/mocks"

import {
  PAYMENT_ISSUES,
  PAYMENT_REFERENCE_MAX,
  PAYMENTS,
  REQUEST_ID_MAX,
  REVERSAL_STATUS,
  type OpenInvoice,
  type Payment,
  type PaymentAllocation,
} from "./contract"

/** Рахунок для оплат: те, що моки K4 беруть із моків рахунків застосунку. */
export interface PaymentInvoiceSource {
  readonly id: string
  readonly companyId?: string | null | undefined
  readonly clientId: string
  readonly clientName: string
  /** Номер виставленого рахунку; чернетка номера не має. */
  readonly number: string | null
  readonly date: CalendarDate
  readonly dueDate: CalendarDate
  readonly currency: string
  /** Підсумок рахунку, мінорні одиниці. */
  readonly total: number
  /** Борг: «виставлено мінус кредит-ноти мінус оплачено»; у засіві — без оплат. */
  readonly debt: number
  /** Рахунок виставлений і діє: не скасований, не сторнований і не сам сторно. */
  readonly isOpen: boolean
}

/**
 * Рахунки застосунку для моків оплат (моки модуля K2, `forPayments`): ресурс для потоку документів,
 * рахунки сховища, рахунки засіву без сховища (засів оплат від них) і перерахунок статусу рахунку після
 * зміни оплат.
 */
export interface PaymentInvoices {
  readonly resource: string
  readonly all: () => readonly PaymentInvoiceSource[]
  readonly seed: () => readonly PaymentInvoiceSource[]
  readonly settle: (invoiceId: string) => void
}

/** Оплата зменшує борг: проведена, не сторнована й не сама сторно. */
export const isActivePayment = (payment: Payment) =>
  payment.docStatus === "submitted" &&
  !payment.reversedBy &&
  payment.status !== REVERSAL_STATUS

/** Оплачене за `id` рахунку: рознесення оплат, що діють. */
export function paidByInvoice(
  payments: readonly Payment[],
): Map<string, number> {
  const paid = new Map<string, number>()
  for (const payment of payments) {
    if (!isActivePayment(payment)) continue
    for (const { invoiceId, amount } of payment.allocations)
      paid.set(invoiceId, (paid.get(invoiceId) ?? 0) + amount)
  }
  return paid
}

/** Рахунки клієнта з боргом у компанії запиту, від найранішої «Сплатити до». */
export function openInvoicesOf(
  invoices: readonly PaymentInvoiceSource[],
  clientId: string,
  companyId: string | null,
): OpenInvoice[] {
  return invoices
    .filter(
      (invoice) =>
        isPayable(invoice) &&
        invoice.clientId === clientId &&
        inMockCompany(invoice.companyId, companyId),
    )
    .sort(
      (a, b) =>
        a.dueDate.localeCompare(b.dueDate) || a.date.localeCompare(b.date),
    )
    .map((invoice) => ({
      id: invoice.id,
      number: invoice.number ?? "",
      date: invoice.date,
      dueDate: invoice.dueDate,
      currency: invoice.currency,
      total: invoice.total,
      debt: invoice.debt,
    }))
}

/** Рахунок чекає оплати: виставлений, діє й має борг. */
export const isPayable = (invoice: PaymentInvoiceSource) =>
  invoice.isOpen && invoice.number !== null && invoice.debt > 0

/** Тіло `POST /sales-payments`, як його перевіряє сервер; поля розширення йдуть далі до схеми запису. */
const requestSchema = z.looseObject({
  requestId: z.string().min(1).max(REQUEST_ID_MAX),
  date: z.string().refine(isCalendarDate),
  clientId: z.string().min(1),
  currency: z.string().length(3),
  method: z.string().min(1),
  reference: z.string().trim().max(PAYMENT_REFERENCE_MAX).nullable().optional(),
  amount: moneyAmountSchema.positive(),
  allocations: z
    .array(
      z.object({
        invoiceId: z.string().min(1),
        amount: moneyAmountSchema.positive(),
      }),
    )
    .min(1),
})
export type PaymentRequest = z.infer<typeof requestSchema>

/** Ключ ідемпотентності з тіла запиту: для повтору до всіх інших перевірок. */
export function requestIdOf(raw: unknown): string | undefined {
  const parsed = requestSchema.shape.requestId.safeParse(
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>).requestId
      : undefined,
  )
  return parsed.success ? parsed.data : undefined
}

/** Рознесення запиту на рахунки сховища: знімки рахунків чи помилки полів. */
function allocate(
  request: PaymentRequest,
  invoices: readonly PaymentInvoiceSource[],
  companyId: string | null,
):
  | { allocations: PaymentAllocation[]; clientName: string }
  | {
      fieldErrors: Record<string, string>
    } {
  const errors: Record<string, string> = {}
  const seen = new Set<string>()
  const allocations: PaymentAllocation[] = []
  let clientName = ""
  request.allocations.forEach(({ invoiceId, amount }, index) => {
    const invoice = invoices.find(
      (candidate) =>
        candidate.id === invoiceId &&
        inMockCompany(candidate.companyId, companyId),
    )
    const path = `allocations.${String(index)}`
    if (seen.has(invoiceId)) {
      errors[`${path}.invoiceId`] = "duplicate"
      return
    }
    seen.add(invoiceId)
    if (
      !invoice ||
      !isPayable(invoice) ||
      invoice.clientId !== request.clientId ||
      invoice.currency !== request.currency
    ) {
      errors[`${path}.invoiceId`] = PAYMENT_ISSUES.invoiceUnavailable
      return
    }
    if (amount > invoice.debt) {
      errors[`${path}.amount`] = PAYMENT_ISSUES.exceedsDebt
      return
    }
    clientName = invoice.clientName
    allocations.push({
      invoiceId,
      invoiceNumber: invoice.number ?? "",
      invoiceDate: invoice.date,
      amount,
    })
  })
  return Object.keys(errors).length
    ? { fieldErrors: errors }
    : { allocations, clientName }
}

/**
 * Нова оплата з тіла запиту, як її будує сервер: перевірений запит і тіло запису (поля запиту й розширення,
 * назва клієнта, рознесення зі знімками рахунків); помилки — 422 біля полів. Поля, які веде сервер, номер,
 * статус і курс — у обробнику.
 */
export function paymentFromRequest(
  raw: unknown,
  invoices: readonly PaymentInvoiceSource[],
  companyId: string | null,
):
  | { request: PaymentRequest; body: Record<string, unknown> }
  | { fieldErrors: Record<string, string> } {
  const parsed = requestSchema.safeParse(raw)
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) }
  const request = parsed.data
  const built = allocate(request, invoices, companyId)
  if ("fieldErrors" in built) return built
  const allocated = built.allocations.reduce(
    (sum, allocation) => sum + allocation.amount,
    0,
  )
  if (allocated !== request.amount)
    return { fieldErrors: { amount: PAYMENT_ISSUES.notAllocated } }
  // Ключ ідемпотентності — не поле оплати.
  const fields: Record<string, unknown> = { ...request }
  delete fields.requestId
  return {
    request,
    body: {
      ...fields,
      reference: request.reference || null,
      clientName: built.clientName,
      allocations: built.allocations,
    },
  }
}

/** Оплата в потоці: номер, дата, статус модуля, стан і сума (у сторно — з мінусом). */
const paymentFlowNode = (payment: Payment) => ({
  number: payment.number,
  date: payment.date,
  status: payment.status,
  docStatus: payment.docStatus,
  total: { amount: payment.amount, currency: payment.currency },
})

export function paymentsFlowSource(
  db: MockResourceDb<Payment>,
  invoicesResource: string,
): DocumentFlowMockSource {
  return documentFlowSource({
    resource: PAYMENTS,
    db,
    node: paymentFlowNode,
    links: (payment) => [
      ...documentLifecycleLinks(PAYMENTS)(payment),
      ...payment.allocations.map((allocation) => ({
        kind: "basedOn" as const,
        resource: invoicesResource,
        id: allocation.invoiceId,
      })),
    ],
  })
}
