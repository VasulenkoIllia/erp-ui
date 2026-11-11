/**
 * Оплати модуля K4 у моках модуля K2 (ADR-0073): рахунки для моків оплат (`forPayments`), статус
 * «Оплачено» від оплаченого й заборона скасувати чи сторнувати рахунок з оплатою, що діє. Частина
 * `mocks.ts`: модулі не імпортують один одного, оплачене дає застосунок (`paidTotal` моків K4).
 */
import type { CalendarDate } from "@/lib/dates"
import type { MockResourceDb } from "@/lib/mocks"

import {
  INVOICE_PAYMENT_ISSUES,
  INVOICES,
  type CreditNoteCard,
  type InvoiceCard,
} from "./contract"
import { createCreditNoteFixtures } from "./credit-note-fixtures"
import { createInvoiceFixtures, type InvoiceFixtureOptions } from "./fixtures"
import { invoiceDebt, settledStatus } from "./invoice-debt"
import { creditedTotalOf, isOpenInvoice } from "./mock-credit-notes"

/** Оплати застосунку для моків рахунків: сума оплат, що діють, за рахунком (моки K4, `paidTotal`). */
export interface InvoiceMockPayments {
  readonly paidTotal: (invoiceId: string) => number
}

/** Рахунок для моків оплат: те саме, що `PaymentInvoiceSource` модуля K4. */
export interface InvoicePaymentSource {
  readonly id: string
  readonly companyId: string | null | undefined
  readonly clientId: string
  readonly clientName: string
  readonly number: string | null
  readonly date: CalendarDate
  readonly dueDate: CalendarDate
  readonly currency: string
  readonly total: number
  /** Борг: «виставлено мінус кредит-ноти мінус оплачено». */
  readonly debt: number
  /** Рахунок виставлений і діє: не скасований, не сторнований і не сам сторно. */
  readonly isOpen: boolean
}

/**
 * Рахунки для моків оплат (`createPaymentsMocks({ invoices: invoicesMocks.forPayments })`): те саме, що
 * `PaymentInvoices` модуля K4 — ресурс, рахунки сховища, засів без сховища й перерахунок статусу.
 */
export interface InvoicesForPayments {
  readonly resource: string
  readonly all: () => readonly InvoicePaymentSource[]
  readonly seed: () => readonly InvoicePaymentSource[]
  readonly settle: (invoiceId: string) => void
}

/** Сума кредит-нот і оплат рахунку за його `id`. */
export interface InvoiceSettlement {
  readonly credited: (invoiceId: string) => number
  readonly paid: (invoiceId: string) => number
}

export function invoicePaymentSource(
  invoice: InvoiceCard,
  settlement: InvoiceSettlement,
): InvoicePaymentSource {
  return {
    id: invoice.id,
    companyId: invoice.companyId,
    clientId: invoice.clientId,
    clientName: invoice.clientName,
    number: invoice.number,
    date: invoice.date,
    dueDate: invoice.dueDate,
    currency: invoice.currency,
    total: invoice.total,
    debt: invoiceDebt({
      total: invoice.total,
      creditedTotal: settlement.credited(invoice.id),
      paidTotal: settlement.paid(invoice.id),
    }),
    isOpen: isOpenInvoice(invoice),
  }
}

/** Засів рахунків і кредит-нот без сховищ: рахунки й сума кредит-нот засіву за рахунком. */
export function invoiceSeedOf(options: InvoiceFixtureOptions) {
  const { invoices } = createInvoiceFixtures(options)
  const notes = createCreditNoteFixtures(invoices, options).creditNotes
  const credited = (invoiceId: string) => creditedTotalOf(invoiceId, notes)
  return { invoices, credited }
}

/**
 * Рахунки засіву для засіву оплат без моків рахунків (ADR-0073): засів серії оплат
 * (`paymentsNumberingSeeds` моків K4) будують до моків, як і серію рахунків. Ті самі опції, що й у
 * `createInvoicesMocks`; борг — за кредит-нотами засіву, без оплат.
 */
export function invoicePaymentSeed(
  options: InvoiceFixtureOptions = {},
): InvoicePaymentSource[] {
  const { invoices, credited } = invoiceSeedOf(options)
  return invoices.map((invoice) =>
    invoicePaymentSource(invoice, { credited, paid: () => 0 }),
  )
}

/** Статус рахунку за оплатами й кредит-нотами, як його ставить сервер. */
export const settledStatusOf = (
  invoice: InvoiceCard,
  settlement: InvoiceSettlement,
) =>
  settledStatus({
    status: invoice.status,
    total: invoice.total,
    creditedTotal: settlement.credited(invoice.id),
    paidTotal: settlement.paid(invoice.id),
  })

/**
 * Перерахувати статус рахунку сховища після зміни оплат чи кредит-нот: «Оплачено» чи знову «Виставлено»,
 * з новою версією, журналом і подією, як зміна сервера.
 */
export function settleInvoice(
  db: MockResourceDb<InvoiceCard>,
  invoiceId: string,
  settlement: InvoiceSettlement,
) {
  // Мок падає голосно: інакше оплата збережена, а рахунок лишився б у старому статусі.
  const invoice = db.all().find(({ id }) => id === invoiceId)
  if (!invoice)
    throw new Error(`K2-invoices: no invoice ${invoiceId} to settle`)
  const status = settledStatusOf(invoice, settlement)
  if (status === invoice.status) return
  const patched = db.patch(invoice.id, { status })
  if (!patched || "fieldErrors" in patched)
    throw new Error(
      `K2-invoices: invoice ${invoiceId} rejected status ${status}: ${JSON.stringify(patched?.fieldErrors)}`,
    )
}

/** Рахунок з оплатою, що діє, не скасовують і не сторнують: спершу скасовують чи сторнують оплату. */
export function invoicePaymentDeniedActions(
  invoice: InvoiceCard,
  paidTotal: number,
): Record<string, string> | undefined {
  if (!isOpenInvoice(invoice) || paidTotal <= 0) return undefined
  return {
    cancel: INVOICE_PAYMENT_ISSUES.hasPayments,
    reverse: INVOICE_PAYMENT_ISSUES.hasPayments,
  }
}

/**
 * Зв'язок рахунків з оплатами K4 у `createInvoicesMocks` (ADR-0073): суми кредит-нот і оплат рахунку
 * сховищ, засів зі статусом за оплатами засіву, перерахунок статусу й рахунки для моків оплат. Сховища
 * рахунків і кредит-нот — функціями: їх створюють пізніше, звертаються до них лише на запит.
 */
export function invoicePaymentsLink({
  fixtureOptions,
  payments,
  invoices,
  creditNotes,
}: {
  readonly fixtureOptions: InvoiceFixtureOptions
  readonly payments: InvoiceMockPayments | undefined
  readonly invoices: () => MockResourceDb<InvoiceCard>
  readonly creditNotes: () => readonly CreditNoteCard[]
}) {
  const settlement: InvoiceSettlement = {
    credited: (invoiceId) => creditedTotalOf(invoiceId, creditNotes()),
    paid: (invoiceId) => payments?.paidTotal(invoiceId) ?? 0,
  }
  const settle = (invoiceId: string) => {
    settleInvoice(invoices(), invoiceId, settlement)
  }
  const forPayments: InvoicesForPayments = {
    resource: INVOICES,
    all: () =>
      invoices()
        .all()
        .map((invoice) => invoicePaymentSource(invoice, settlement)),
    seed: () => invoicePaymentSeed(fixtureOptions),
    settle,
  }
  return {
    settlement,
    settle,
    forPayments,
    /**
     * Засів зі статусом за оплатами засіву моків K4: вони сіються з `forPayments.seed`, а не зі сховища
     * рахунків, тож рекурсії немає.
     */
    settledSeed: () => {
      const { invoices: seeded, credited } = invoiceSeedOf(fixtureOptions)
      if (!payments) return seeded
      const paid = (invoiceId: string) => payments.paidTotal(invoiceId)
      return seeded.map((invoice) => ({
        ...invoice,
        status: settledStatusOf(invoice, { credited, paid }),
      }))
    },
  }
}
