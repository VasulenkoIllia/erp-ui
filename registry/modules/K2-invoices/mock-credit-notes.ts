/**
 * Правила кредит-нот у моках модуля K2 (ADR-0072): частина `mocks.ts`, застосунок окремо їх не бере;
 * обробники ресурсу — `mock-credit-note-handlers.ts`.
 *
 * - Кредит-нота — документ ресурсу `sales-credit-notes` на підставі виставленого рахунку: дія рахунку
 *   `creditNote` (`fromInvoice`) створює чернетку з рядками, які ще не повернули, датою сьогодні (перший
 *   відкритий день) і валютою, курсом і сторонами рахунку.
 * - Чернетку «сервер» перебудовує на кожен запис: з рядків запиту бере лише `id` рядка рахунку й кількість,
 *   решту — з рахунку; кількість разом із виставленими кредит-нотами не більша, ніж у рахунку (422
 *   `exceeds_invoice`). Суми — частка рядка рахунку (`credit-note-sums`), «Виставити» рахує їх ще раз, бо
 *   за час чернетки могли виставити інші кредит-ноти. Проведена й скасована кредит-нота тримає свої суми.
 * - Виставлена кредит-нота: рахунок не скасовують і не сторнують (`linked`), повністю покритий — без нової
 *   (`credited`). Чернетку не виставляють, коли рахунок уже скасовано чи сторновано, чи кількості вже
 *   повернули інші (`exceeds_invoice`).
 */
import { z } from "zod"

import type { CalendarDate } from "@/lib/dates"
import {
  itemLinesOf,
  quantitySchema,
  type SavedDocumentLine,
} from "@/lib/document-lines"
import type { MockResourceDb } from "@/lib/mocks"
import { RECORD_DENIAL_REASONS } from "@/lib/record-access"

import {
  CREDIT_NOTE_ISSUES,
  DEFAULT_INVOICE_STATUS,
  REVERSAL_STATUS,
  type CreditNote,
  type CreditNoteBasis,
  type CreditNoteCard,
  type InvoiceCard,
} from "./contract"
import {
  addTotals,
  creditedLine,
  creditNoteTotals,
  NOTHING_CREDITED,
  quantityText,
  quantityUnits,
  type CreditedPart,
} from "./credit-note-sums"
import { creditedExchange } from "./mock-exchange"

const {
  exceedsInvoice: EXCEEDS_INVOICE,
  invoiceInactive: INVOICE_INACTIVE,
  credited: FULLY_CREDITED,
} = CREDIT_NOTE_ISSUES

/** Кредит-нота зменшує борг: виставлена, не сторнована й не сама сторно. */
export const isActiveCreditNote = (note: CreditNote) =>
  note.docStatus === "submitted" &&
  !note.reversedBy &&
  note.status !== REVERSAL_STATUS

/** Рахунок, до якого ще роблять кредит-ноти: виставлений і не сторнований. */
export const isOpenInvoice = (invoice: InvoiceCard) =>
  invoice.docStatus === "submitted" &&
  !invoice.reversedBy &&
  invoice.status !== REVERSAL_STATUS

/** Повернене з рядка рахунку: кількість тисячними й суми рядків кредит-нот. */
export interface CreditedLine {
  readonly units: bigint
  readonly totals: CreditedPart["totals"]
}

/** Повернене за `id` рядка рахунку: виставлені кредит-ноти рахунку без `except`. */
export function creditedLines(
  notes: readonly CreditNoteCard[],
  invoiceId: string,
  except?: string,
): Map<string, CreditedLine> {
  const credited = new Map<string, CreditedLine>()
  for (const note of notes) {
    if (note.invoiceId !== invoiceId || note.id === except) continue
    if (!isActiveCreditNote(note)) continue
    for (const line of note.lines) {
      const sum = credited.get(line.id)
      credited.set(line.id, {
        units: (sum?.units ?? 0n) + quantityUnits(line.quantity),
        totals: sum ? addTotals(sum.totals, line.totals) : line.totals,
      })
    }
  }
  return credited
}

/** Повернене з рядка для розрахунку частки (`credit-note-sums`). */
const creditedPart = (credited: CreditedLine | undefined): CreditedPart =>
  credited
    ? { quantity: quantityText(credited.units), totals: credited.totals }
    : NOTHING_CREDITED

/** Рядки рахунку, які ще можна повернути, з кількістю залишку. */
export function remainingLines(
  invoice: InvoiceCard,
  credited: ReadonlyMap<string, CreditedLine>,
): { line: SavedDocumentLine; available: bigint }[] {
  return itemLinesOf(invoice.lines)
    .map((line) => ({
      line,
      available:
        quantityUnits(line.quantity) - (credited.get(line.id)?.units ?? 0n),
    }))
    .filter(({ available }) => available > 0n)
}

/** Рядок запиту кредит-ноти: `id` рядка рахунку й кількість, решту сервер не бере. */
const requestLineSchema = z.object({
  id: z.string().min(1),
  quantity: quantitySchema,
})

export type Issue = {
  readonly path: (string | number)[]
  readonly message: string
}

/** Те, що сервер бере для чернетки з рахунку й рахує сам. */
export type CreditNoteBody = Pick<
  CreditNoteCard,
  | "clientId"
  | "clientName"
  | "currency"
  | "supplier"
  | "buyer"
  | "invoiceNumber"
  | "invoiceDate"
  | "discountPercent"
  | "discountAmount"
  | "lines"
  | "totals"
  | "total"
  | "exchange"
>

/** Тіло чернетки кредит-ноти з рахунку: рядки, суми, знижка й курс, або помилки рядків. */
export function creditNoteBody(
  invoice: InvoiceCard,
  input: unknown,
  credited: ReadonlyMap<string, CreditedLine>,
):
  | { readonly issues: Issue[] }
  | { readonly issues: null; readonly body: CreditNoteBody } {
  const invoiceLines = new Map(
    itemLinesOf(invoice.lines).map((line) => [line.id, line]),
  )
  const requested = Array.isArray(input) ? input : []
  const issues: Issue[] = requested.length
    ? []
    : [{ path: ["lines"], message: "required" }]
  const seen = new Set<string>()
  const lines: SavedDocumentLine[] = []
  for (const [index, raw] of requested.entries()) {
    const parsed = requestLineSchema.safeParse(raw)
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        issues.push({
          path: ["lines", index, ...issue.path.map(String)],
          message: issue.message,
        })
      continue
    }
    const { id, quantity } = parsed.data
    const line = invoiceLines.get(id)
    if (!line || seen.has(id)) {
      issues.push({ path: ["lines", index], message: "not_in_invoice" })
      continue
    }
    seen.add(id)
    const before = credited.get(id)
    if (
      (before?.units ?? 0n) + quantityUnits(quantity) >
      quantityUnits(line.quantity)
    ) {
      issues.push({
        path: ["lines", index, "quantity"],
        message: EXCEEDS_INVOICE,
      })
      continue
    }
    lines.push(creditedLine(line, creditedPart(before), quantity))
  }
  if (issues.length) return { issues }
  const totals = creditNoteTotals(lines)
  return {
    issues: null,
    body: {
      clientId: invoice.clientId,
      clientName: invoice.clientName,
      currency: invoice.currency,
      supplier: invoice.supplier,
      buyer: invoice.buyer,
      // Рахунок без номера — чернетка: з неї кредит-ноти не роблять, схема шапки відхилить порожній.
      invoiceNumber: invoice.number ?? "",
      invoiceDate: invoice.date,
      discountPercent: invoice.discountPercent,
      discountAmount: invoice.discountAmount > 0 ? totals.documentDiscount : 0,
      lines,
      totals,
      total: totals.total,
      exchange: creditedExchange(invoice.exchange, {
        currency: invoice.currency,
        total: totals.total,
      }),
    },
  }
}

/**
 * Позначки рахунку від його кредит-нот: з виставленою — не скасувати й не сторнувати (`linked`), повністю
 * покритий — без нової кредит-ноти.
 */
export function invoiceCreditDeniedActions(
  invoice: InvoiceCard,
  notes: readonly CreditNoteCard[],
  action: string,
): Record<string, string> | undefined {
  if (!isOpenInvoice(invoice)) return undefined
  const credited = creditedLines(notes, invoice.id)
  const denied: Record<string, string> = {}
  if (credited.size) {
    denied.cancel = RECORD_DENIAL_REASONS.linked
    denied.reverse = RECORD_DENIAL_REASONS.linked
  }
  if (!remainingLines(invoice, credited).length) denied[action] = FULLY_CREDITED
  return Object.keys(denied).length ? denied : undefined
}

/** Сума виставлених кредит-нот рахунку в його валюті. */
export const creditedTotalOf = (
  invoiceId: string,
  notes: readonly CreditNoteCard[],
) =>
  notes
    .filter((note) => note.invoiceId === invoiceId && isActiveCreditNote(note))
    .reduce((sum, note) => sum + note.total, 0)

/**
 * Чернетка кредит-ноти з рахунку: рядки з кількістю, яку ще не повернули, дата `date`; решту бере
 * схема з рахунку.
 */
export function creditNoteFromInvoice(
  invoice: InvoiceCard,
  notes: readonly CreditNoteCard[],
  date: CalendarDate,
): Record<string, unknown> {
  return {
    invoiceId: invoice.id,
    date,
    status: DEFAULT_INVOICE_STATUS,
    lines: remainingLines(invoice, creditedLines(notes, invoice.id)).map(
      ({ line, available }) => ({
        id: line.id,
        quantity: quantityText(available),
      }),
    ),
  }
}

/** Сховища, з якими працює схема кредит-ноти: рахунки й самі кредит-ноти (для повернених кількостей). */
export interface CreditNoteStores {
  readonly invoices: MockResourceDb<InvoiceCard>
  readonly creditNotes: () => readonly CreditNoteCard[]
}

/** Рахунок сховища за `id`. */
export const invoiceOf = (stores: CreditNoteStores, id: string) =>
  stores.invoices.all().find((invoice) => invoice.id === id)

/**
 * Рядки рахунку для форми чернетки (`basis` картки): кількість у рахунку, скільки ще можна повернути разом
 * із цією кредит-нотою, суми рядка рахунку.
 */
export function creditNoteBasis(
  note: CreditNoteCard,
  stores: CreditNoteStores,
): Record<string, CreditNoteBasis> | undefined {
  if (note.docStatus !== "draft") return undefined
  const invoice = invoiceOf(stores, note.invoiceId)
  if (!invoice) return undefined
  const credited = creditedLines(stores.creditNotes(), note.invoiceId, note.id)
  return Object.fromEntries(
    itemLinesOf(invoice.lines)
      .filter((line) => note.lines.some((own) => own.id === line.id))
      .map((line) => {
        const before = credited.get(line.id)
        const available = quantityUnits(line.quantity) - (before?.units ?? 0n)
        return [
          line.id,
          {
            quantity: line.quantity,
            available: quantityText(available > 0n ? available : 0n),
            totals: line.totals,
            credited: creditedPart(before).totals,
          },
        ]
      }),
  )
}

/**
 * Позначки чернетки кредит-ноти: рахунок скасовано чи сторновано, або рядки вже повернули інші кредит-ноти
 * — «Виставити» не можна, причина на кнопці.
 */
export function creditNoteDeniedActions(
  note: CreditNoteCard,
  stores: CreditNoteStores,
): Record<string, string> | undefined {
  if (note.docStatus !== "draft") return undefined
  const invoice = invoiceOf(stores, note.invoiceId)
  if (!invoice || !isOpenInvoice(invoice)) return { submit: INVOICE_INACTIVE }
  const built = creditNoteBody(
    invoice,
    note.lines,
    creditedLines(stores.creditNotes(), note.invoiceId, note.id),
  )
  // Інших помилок рядків у збереженій чернетці немає: їх відхиляє схема запису ще на збереженні.
  return built.issues ? { submit: EXCEEDS_INVOICE } : undefined
}
