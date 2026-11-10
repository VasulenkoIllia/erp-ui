import { formatDate, formatMoney } from "@/lib/format"
import { nbuPaymentQr, type PaymentQr } from "@/lib/payment-qr"

import { AWAITING_PAYMENT, type Invoice, type InvoiceDetail } from "../contract"

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
 * отримувач і реквізити з постачальника рахунку, сума до сплати. `null` — рахунок не до оплати (чернетка,
 * скасований, сторно): QR на аркуші немає й пояснювати нічого.
 */
export function invoicePaymentQr(
  invoice: Invoice,
  totals: InvoiceDetail["totals"],
): PaymentQr | null {
  if (!AWAITING_PAYMENT.includes(invoice.status) || !invoice.number) return null
  return nbuPaymentQr({
    name: invoice.supplier.name,
    iban: invoice.supplier.iban,
    code: invoice.supplier.code,
    amount: totals.total,
    currency: invoice.currency,
    purpose: paymentPurpose(invoice, totals),
  })
}
