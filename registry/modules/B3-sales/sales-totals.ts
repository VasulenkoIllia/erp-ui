/**
 * Суми документа продажу, як їх рахує сервер (ADR-0056, ADR-0059): рядкам товарів — `totals`, документу —
 * `totals` і `total` для списку. Беруть моки й фікстури пропозицій і замовлень; інтерфейс рахує ті самі
 * суми редактором рядків.
 */
import {
  itemLinesOf,
  type DocumentBodyLine,
  type SavedDocumentBodyLine,
  type SavedDocumentTotals,
} from "@/lib/document-lines"
import { computeDocumentTotals } from "@/lib/document-totals"
import { currencyDigits } from "@/lib/format"

export interface SalesBody {
  readonly currency: string
  readonly lines: readonly DocumentBodyLine[]
  readonly discountPercent: number
  readonly discountAmount: number
}

export interface SalesSums {
  readonly lines: SavedDocumentBodyLine[]
  readonly totals: SavedDocumentTotals
  readonly total: number
}

/** null — документ не рахується в межах контракту (`documentTotalsIssue` каже чому). */
export function salesSumsOf(body: SalesBody): SalesSums | null {
  const computed = computeDocumentTotals(
    itemLinesOf(body.lines),
    currencyDigits(body.currency),
    body,
  )
  if (!computed) return null
  const { lines: lineTotals, ...totals } = computed
  let item = 0
  const lines = body.lines.map((line): SavedDocumentBodyLine => {
    if (line.kind !== "item") return line
    const sums = lineTotals[item]
    item += 1
    if (!sums) throw new Error("B3-sales: line totals are out of order")
    return { ...line, totals: sums }
  })
  return { lines, totals, total: totals.total }
}
