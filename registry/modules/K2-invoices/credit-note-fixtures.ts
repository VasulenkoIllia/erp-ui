/**
 * Засів кредит-нот модуля K2 (ADR-0072) від засіву рахунків: у кожній компанії — виставлена кредит-нота на
 * частину рахунку зі знижкою документа (`…-05`: один рядок частково, другий цілком) і чернетка на всі рядки
 * рахунку в євро (`…-12`, курс рахунку). Обидві датовані сьогодні: закритий період демо їх не стосується.
 */
import { todayIn, type CalendarDate } from "@/lib/dates"
import { itemLinesOf } from "@/lib/document-lines"
import { formatDocumentNumber } from "@/lib/numbering"

import {
  CREDIT_NOTES,
  DEFAULT_INVOICE_STATUS,
  type CreditNoteCard,
  type InvoiceCard,
} from "./contract"
import type { FixtureLocale, InvoiceFixtureCounter } from "./fixtures"
import { creditNoteBody } from "./mock-credit-notes"

/** Шаблон серії кредит-нот (ADR-0058) мовою даних: «КН-2026-0001». */
export const CREDIT_NOTE_NUMBER_TEMPLATE: Record<FixtureLocale, string> = {
  uk: "КН-{YYYY}-{####}",
  en: "CN-{YYYY}-{####}",
}

interface CreditNoteSeed {
  /** Номер засіяного рахунку компанії: `inv-<компанія>-05`. */
  readonly invoice: string
  readonly issued: boolean
  /** Скільки рядків рахунку повернути: перший — одну одиницю, решта — цілком. */
  readonly lines: number
}

const SEEDS: readonly CreditNoteSeed[] = [
  { invoice: "05", issued: true, lines: 2 },
  { invoice: "12", issued: false, lines: Number.POSITIVE_INFINITY },
]

export interface CreditNoteFixtures {
  readonly creditNotes: CreditNoteCard[]
  readonly counters: InvoiceFixtureCounter[]
}

/** Кредит-ноти засіву за рахунками засіву `invoices` (`createInvoiceFixtures`). */
export function createCreditNoteFixtures(
  invoices: readonly InvoiceCard[],
  {
    locale = "uk",
    today = todayIn(),
  }: { readonly locale?: FixtureLocale; readonly today?: CalendarDate } = {},
): CreditNoteFixtures {
  const creditNotes: CreditNoteCard[] = []
  const counters = new Map<string, InvoiceFixtureCounter>()
  const issue = (companyId: string | null) => {
    const year = Number(today.slice(0, 4))
    const key = `${companyId ?? "-"}:${String(year)}`
    const value = (counters.get(key)?.value ?? 0) + 1
    counters.set(key, { resource: CREDIT_NOTES, companyId, year, value })
    return formatDocumentNumber(CREDIT_NOTE_NUMBER_TEMPLATE[locale], {
      date: today,
      value,
    })
  }
  for (const invoice of invoices) {
    const seed = SEEDS.find(({ invoice: suffix }) =>
      invoice.id.endsWith(`-${suffix}`),
    )
    if (!seed) continue
    const companyId = invoice.companyId ?? null
    const lines = itemLinesOf(invoice.lines)
      .slice(0, seed.lines)
      .map((line, index) => ({
        id: line.id,
        quantity: index === 0 && seed.issued ? "1" : line.quantity,
      }))
    const built = creditNoteBody(invoice, lines, new Map())
    if (built.issues)
      throw new Error(
        `K2-invoices: credit note for ${invoice.id} does not add up`,
      )
    creditNotes.push({
      ...built.body,
      id: `cn-${companyId ?? "shared"}-${seed.invoice}`,
      version: 1,
      companyId,
      number: seed.issued ? issue(companyId) : null,
      date: today,
      invoiceId: invoice.id,
      status: seed.issued ? "issued" : DEFAULT_INVOICE_STATUS,
      docStatus: seed.issued ? "submitted" : "draft",
    })
  }
  return { creditNotes, counters: [...counters.values()] }
}
