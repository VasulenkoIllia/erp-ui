import { formatDate, formatMoney } from "@/lib/format"
import { nbuPaymentQr, type PaymentQr } from "@/lib/payment-qr"

import { AWAITING_PAYMENT, type Invoice, type InvoiceDetail } from "../contract"
import { invoiceDebt, isSettling } from "../invoice-debt"

/** Мова призначення платежу: банк України, тож українською незалежно від мови аркуша. */
const PURPOSE_LOCALE = "uk-UA"

/**
 * Призначення платежу (ADR-0070): «Оплата за рахунком № РХ-2026-0001 від 02.11.2026, у т.ч. ПДВ 200,00 ₴»
 * чи «…, без ПДВ».
 */
export function paymentPurpose(
  invoice: Pick<Invoice, "number" | "date" | "currency">,
  totals: InvoiceDetail["totals"],
): string {
  const date = formatDate(invoice.date, "date", PURPOSE_LOCALE)
  const tax =
    totals.tax > 0
      ? `у т.ч. ПДВ ${formatMoney({ amount: totals.tax, currency: invoice.currency }, PURPOSE_LOCALE)}`
      : "без ПДВ"
  return `Оплата за рахунком № ${invoice.number ?? ""} від ${date}, ${tax}`
}

/**
 * QR-код оплати рахунку (НБУ, `lib/payment-qr`): лише для виставленого рахунку, що чекає оплати, —
 * отримувач і реквізити з постачальника рахунку, сума — борг: виставлено мінус кредит-ноти мінус оплачено
 * (ADR-0074). `null` — рахунок не до оплати (чернетка, скасований, сторно) чи борг нуль: QR на аркуші немає
 * й пояснювати нічого, «До сплати» на аркуші вже каже, що платити нічого.
 */
export function invoicePaymentQr(
  invoice: Invoice,
  totals: InvoiceDetail["totals"],
): PaymentQr | null {
  if (!AWAITING_PAYMENT.includes(invoice.status) || !invoice.number) return null
  const debt = invoiceDebt(invoice)
  if (debt <= 0) return null
  return nbuPaymentQr({
    name: invoice.supplier.name,
    iban: invoice.supplier.iban,
    code: invoice.supplier.code,
    amount: debt,
    currency: invoice.currency,
    purpose: paymentPurpose(invoice, totals),
  })
}

/** Рядок розрахунку під «Разом» на аркуші рахунку. */
export interface InvoiceSettlementRow {
  readonly key: "credited" | "paid" | "debt" | "overpaid"
  /** Мінорні одиниці валюти рахунку, без знака. */
  readonly amount: number
}

/**
 * Рядки під «Разом» на аркуші (ADR-0074): «Кредит-ноти», коли є виставлені; «Оплачено», коли є оплати;
 * «До сплати» — борг, і він же сума QR; переплата — «Переплата». Рахунок без кредит-нот і оплат чи не в
 * статусі, який сервер веде за оплатами, — без рядків, аркуш як раніше.
 */
export function invoiceSettlementRows(
  invoice: Invoice,
): InvoiceSettlementRow[] {
  const credited = invoice.creditedTotal ?? 0
  const paid = invoice.paidTotal ?? 0
  if (!isSettling(invoice) || (!credited && !paid)) return []
  const rows: InvoiceSettlementRow[] = []
  if (credited) rows.push({ key: "credited", amount: credited })
  if (paid) rows.push({ key: "paid", amount: paid })
  const debt = invoiceDebt(invoice)
  rows.push(
    debt < 0
      ? { key: "overpaid", amount: -debt }
      : { key: "debt", amount: debt },
  )
  return rows
}
