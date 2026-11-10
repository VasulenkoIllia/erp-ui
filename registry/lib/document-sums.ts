/**
 * Суми документа з рядками, як їх рахує сервер (ADR-0056, ADR-0059): рядкам товарів — `totals`, документу —
 * `totals` і `total` для списку. Беруть моки й фікстури модулів документів (пропозиції, замовлення,
 * рахунки); інтерфейс рахує ті самі суми редактором рядків. Перенесено з модуля B3 (рішення власника
 * 10.11.2026, ADR-0070).
 */
import {
  itemLinesOf,
  type DocumentBodyLine,
  type SavedDocumentBodyLine,
  type SavedDocumentTotals,
} from "@/registry/lib/document-lines"
import { computeDocumentTotals } from "@/registry/lib/document-totals"
import { currencyDigits } from "@/registry/lib/format"

export interface DocumentSumsBody {
  readonly currency: string
  readonly lines: readonly DocumentBodyLine[]
  readonly discountPercent: number
  readonly discountAmount: number
}

export interface DocumentSums {
  readonly lines: SavedDocumentBodyLine[]
  readonly totals: SavedDocumentTotals
  readonly total: number
}

/** null — документ не рахується в межах контракту (`documentTotalsIssue` каже чому). */
export function documentSumsOf(body: DocumentSumsBody): DocumentSums | null {
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
    if (!sums) throw new Error("erp-ui: line totals are out of order")
    return { ...line, totals: sums }
  })
  return { lines, totals, total: totals.total }
}
