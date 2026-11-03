/** Ставки, рядок і помічники тестів підсумків документа (ADR-0056, ADR-0059). */
import {
  computeDocumentTotals,
  NO_DISCOUNT,
  type DocumentTotals,
  type TotalsDiscount,
  type TotalsLine,
  type TotalsLineTax,
} from "@/registry/lib/document-totals"

export const VAT_20: TotalsLineTax = { id: "vat-20", rate: 20, included: false }
export const VAT_20_IN_PRICE: TotalsLineTax = {
  id: "vat-20-in",
  rate: 20,
  included: true,
}
export const VAT_7: TotalsLineTax = { id: "vat-7", rate: 7, included: false }
export const VAT_0: TotalsLineTax = { id: "vat-0", rate: 0, included: false }

/** Рядок вільним текстом, без довідників. */
export const ROW = {
  kind: "item" as const,
  id: "1",
  name: "Послуга",
  itemId: null,
  quantity: "1",
  unit: null,
  price: "10",
  discountPercent: 0,
  discountAmount: 0,
  tax: null,
}

export const line = (
  quantity: string,
  price: string,
  tax: TotalsLineTax | null = null,
  discountPercent = 0,
  discountAmount = 0,
): TotalsLine => ({ quantity, price, tax, discountPercent, discountAmount })

export function totalsOf(
  lines: readonly TotalsLine[],
  digits = 2,
  discount: TotalsDiscount = NO_DISCOUNT,
): DocumentTotals {
  const totals = computeDocumentTotals(lines, digits, discount)
  if (!totals) throw new Error("Сума за межами контракту")
  return totals
}

export const shares = (totals: DocumentTotals) =>
  totals.lines.map((row) => row.documentDiscount)
