import * as React from "react"
import { useWatch, type Control } from "react-hook-form"

import { lineSumOf } from "@/registry/erp/document-line-fields"
import type { DocumentLinesValues } from "@/registry/erp/document-lines-schema"
import {
  DocumentLinesTotals,
  isCountable,
  previewTotals,
  type DocumentLinesTotalsProps,
  type TotalsPreview,
} from "@/registry/erp/document-lines-totals"
import {
  itemLinesOf,
  savedDocumentLineSchema,
  type DocumentBodyLine,
  type DocumentLine,
} from "@/registry/lib/document-lines"
import {
  computeDocumentTotals,
  type Totals,
  type TotalsDiscount,
} from "@/registry/lib/document-totals"
import { currencyDigits } from "@/registry/lib/format"

/**
 * Попередній розрахунок `erp/document-lines-editor` (UI05b, ADR-0060): на всі рядки підписаний лише
 * він, а не кожен рядок. Підсумки й суми розділів рахуються нижчим пріоритетом (`useDeferredValue`):
 * набране в полі з'являється одразу, суми встигають слідом, і 500 рядків не гальмують введення.
 *
 * - Сума рядка (`lineTotalsOf`) — лише з самого рядка: кількість × ціна мінус знижка рядка. Рядок
 *   рахує її сам і не перемальовується від змін в інших рядках.
 * - Сума розділу — сума колонки «Сума» його рядків, які вже можна порахувати (рішення власника
 *   03.11.2026). Її лише видно: сервер суми розділу не зберігає.
 * - Збережений документ у режимі лише для читання показує суми рядків сервера, і сума розділу
 *   складається з них же: рядки й розділ сходяться (ADR-0056, п. 5).
 */

/** Суми сервера в збереженому рядку (`savedDocumentLineSchema`); рядок форми їх не має. */
const savedLineTotals = (line: DocumentLine): Totals | undefined =>
  "totals" in line
    ? savedDocumentLineSchema.shape.totals.safeParse(line.totals).data
    : undefined

/**
 * Суми рядка без знижки документа; undefined — рядок ще не порахувати. `readOnly` — суми сервера, якщо
 * рядок збережений.
 */
export function lineTotalsOf(
  line: DocumentLine,
  digits: number,
  readOnly = false,
): Totals | undefined {
  if (readOnly) {
    const saved = savedLineTotals(line)
    if (saved) return saved
  }
  return isCountable(line)
    ? computeDocumentTotals([line], digits)?.lines[0]
    : undefined
}

/**
 * Суми розділів за `id` рядка розділу: індекс зсувається від вставки чи порядку раніше, ніж відкладений
 * розрахунок наздожене рядки. Рядки до першого розділу ні до якого не належать.
 */
export function sectionSums(
  lines: readonly DocumentBodyLine[],
  digits: number,
  readOnly = false,
): ReadonlyMap<string, number> {
  const sums = new Map<string, number>()
  let section: string | null = null
  for (const line of lines) {
    if (line.kind === "section") {
      section = line.id
      sums.set(section, 0)
      continue
    }
    const totals =
      line.kind === "item" && section !== null
        ? lineTotalsOf(line, digits, readOnly)
        : undefined
    if (section !== null && totals)
      sums.set(section, (sums.get(section) ?? 0) + lineSumOf(totals))
  }
  return sums
}

interface LinesPreview {
  /** Рядки товарів і послуг: назви ставок для підсумків. */
  readonly lines: readonly DocumentLine[]
  readonly preview: TotalsPreview
  readonly sectionSums: ReadonlyMap<string, number>
  /** Знижка документа без затримки: від неї залежить вид знижки в полі. */
  readonly discount: TotalsDiscount
}

const PreviewContext = React.createContext<LinesPreview | null>(null)

/** Сума розділу за його `id`; undefined — розрахунку ще немає. */
export const useSectionSum = (id: string) =>
  React.useContext(PreviewContext)?.sectionSums.get(id)

export function DocumentLinesPreview({
  control,
  currency,
  readOnly,
  children,
}: {
  control: Control<DocumentLinesValues>
  currency: string
  readOnly: boolean
  children: React.ReactNode
}) {
  const lines = useWatch({ control, name: "lines" })
  const [discountPercent, discountAmount] = useWatch({
    control,
    name: ["discountPercent", "discountAmount"],
  })
  const deferredLines = React.useDeferredValue(lines)
  const deferredPercent = React.useDeferredValue(discountPercent)
  const deferredAmount = React.useDeferredValue(discountAmount)
  const digits = currencyDigits(currency)
  const computed = React.useMemo(() => {
    const items = itemLinesOf(deferredLines)
    return {
      lines: items,
      preview: previewTotals(items, digits, {
        discountPercent: deferredPercent,
        discountAmount: deferredAmount,
      }),
      sectionSums: sectionSums(deferredLines, digits, readOnly),
    }
  }, [deferredLines, digits, deferredPercent, deferredAmount, readOnly])
  const value = React.useMemo(
    () => ({ ...computed, discount: { discountPercent, discountAmount } }),
    [computed, discountPercent, discountAmount],
  )
  return <PreviewContext value={value}>{children}</PreviewContext>
}

/** Підсумки під рядками з попереднього розрахунку. */
export function DocumentLinesPreviewTotals(
  props: Omit<DocumentLinesTotalsProps, "lines" | "preview" | "discount">,
) {
  const value = React.useContext(PreviewContext)
  if (!value) return null
  return (
    <DocumentLinesTotals
      {...props}
      lines={value.lines}
      preview={value.preview}
      discount={value.discount}
    />
  )
}
