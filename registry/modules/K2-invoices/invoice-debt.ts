/**
 * Борг рахунку й статус «Оплачено» (ADR-0072, ADR-0073): чисті функції для картки й моків. Борг —
 * «виставлено мінус кредит-ноти мінус оплачено»; від'ємний — переплата (кредит-нота після оплати).
 */
import { PAID_STATUS, type Invoice } from "./contract"

/** Статуси, між якими сервер переводить рахунок за оплатами: інших (скасований, сторно) оплати не змінюють. */
const SETTLED_STATUSES: readonly string[] = ["issued", PAID_STATUS]

/** Рахунок у статусі, який сервер веде за оплатами: «Виставлено» чи «Оплачено». */
export const isSettling = (invoice: Pick<Invoice, "status">) =>
  SETTLED_STATUSES.includes(invoice.status)

/** Борг рахунку в його валюті, мінорні одиниці; переплата — від'ємний. */
export const invoiceDebt = (
  invoice: Pick<Invoice, "total" | "creditedTotal" | "paidTotal">,
) => invoice.total - (invoice.creditedTotal ?? 0) - (invoice.paidTotal ?? 0)

/**
 * Статус рахунку за оплатами, як його ставить сервер: «Оплачено», коли є оплата й разом із кредит-нотами вона
 * покриває рахунок, інакше «Виставлено». Рахунок не в цих двох статусах (чернетка, скасований, статус
 * розширення) — як є.
 */
export function settledStatus(
  invoice: Pick<Invoice, "status" | "total" | "creditedTotal" | "paidTotal">,
): string {
  if (!isSettling(invoice)) return invoice.status
  return (invoice.paidTotal ?? 0) > 0 && invoiceDebt(invoice) <= 0
    ? PAID_STATUS
    : "issued"
}
