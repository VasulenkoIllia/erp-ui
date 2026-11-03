import type {
  DocumentBodyLine,
  DocumentLineTax,
  DocumentLineUnit,
} from "@/registry/lib/document-lines"
import { createDictionariesFixtures } from "@/registry/modules/A6-dictionaries/fixtures"

import { makeProducts } from "@/data/products"

/**
 * Документ сторінки «Великий документ» (UI05b, ADR-0060): розділи по 25 рядків, нотатка в кожному
 * четвертому розділі, назви й ціни товарів моку `products` вільним текстом. Довідники — сталі фікстури
 * A6, а вибраного запису в рядках немає: сторінка міряє редактор, а не мережу (`pnpm perf`).
 */

/** 99 — найбільший документ, у якому в DOM усі рядки (поріг редактора — 100). */
export const DOCUMENT_SIZES = [12, 99, 500] as const
export type DocumentSize = (typeof DOCUMENT_SIZES)[number]

/** Розмір з адреси `?lines=99`: так `pnpm perf` відкриває документ без зайвої дії. */
export const documentSizeOf = (value: string | null): DocumentSize | null =>
  DOCUMENT_SIZES.find((size) => String(size) === value) ?? null

const SECTION_SIZE = 25
/** Короткий документ — два невеликі розділи. */
const SMALL_SECTION_SIZE = 6
const NOTE_EVERY_SECTIONS = 4
const SMALL_NOTE_EVERY_SECTIONS = 2
const QUANTITIES = ["1", "2", "0.5", "12", "3.25"] as const

const fixtures = createDictionariesFixtures()

export const DOCUMENT_UNITS: readonly (DocumentLineUnit & { id: string })[] =
  fixtures.units.map((unit) => ({ id: unit.id, name: unit.shortName }))
export const DOCUMENT_TAXES: readonly DocumentLineTax[] = fixtures.taxes.map(
  ({ id, name, rate, included }) => ({ id, name, rate, included }),
)

const unitOf = (id: string) =>
  DOCUMENT_UNITS.find((unit) => unit.id === id) ?? null
const VAT_20 = DOCUMENT_TAXES.find((tax) => tax.rate === 20) ?? null

export interface DocumentTexts {
  /** Назва розділу за номером. */
  readonly section: (index: number) => string
  readonly note: string
}

/** `size` рядків разом із заголовками розділів і нотатками. */
export function documentLines(
  size: DocumentSize,
  texts: DocumentTexts,
): DocumentBodyLine[] {
  const products = makeProducts()
  const isSmall = size <= SECTION_SIZE
  const perSection = isSmall ? SMALL_SECTION_SIZE : SECTION_SIZE
  const noteEvery = isSmall ? SMALL_NOTE_EVERY_SECTIONS : NOTE_EVERY_SECTIONS
  return Array.from({ length: size }, (_, index): DocumentBodyLine => {
    const id = `big-${String(index + 1)}`
    const section = Math.floor(index / perSection)
    const position = index % perSection
    if (position === 0)
      return { kind: "section", id, title: texts.section(section + 1) }
    if (position === perSection - 1 && (section + 1) % noteEvery === 0)
      return { kind: "note", id, text: texts.note }
    const product = products[index % products.length]
    const isService = product?.category === "service"
    return {
      kind: "item",
      id,
      name: product?.name ?? id,
      itemId: null,
      quantity: QUANTITIES[index % QUANTITIES.length] ?? "1",
      unit: unitOf(isService ? "h" : "pcs"),
      price: String(product?.price ?? 100),
      discountPercent: index % 7 === 0 ? 5 : 0,
      discountAmount: 0,
      tax: VAT_20,
    }
  })
}
