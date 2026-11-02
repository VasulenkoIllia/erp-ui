import type * as React from "react"
import type { UseFormReturn } from "react-hook-form"

import {
  DiscountField,
  type DiscountKind,
} from "@/registry/erp/document-line-fields"
import type { DocumentLinesValues } from "@/registry/erp/document-lines-schema"
import {
  documentLineSchema,
  isSingleDiscount,
  priceSchema,
  quantitySchema,
  type DocumentLine,
  type SavedDocumentTotals,
} from "@/registry/lib/document-lines"
import {
  computeDocumentTotals,
  documentTotalsIssue,
  NO_DISCOUNT,
  type DocumentTotals,
  type TaxTotal,
  type Totals,
  type TotalsDiscount,
} from "@/registry/lib/document-totals"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"

/**
 * Підсумки `erp/document-lines-editor` (UI05, ADR-0059): попередній розрахунок `computeDocumentTotals` під час
 * введення й знижка на весь документ. Рядок, який ще не порахувати (порожня ціна, знижка більша за
 * суму), не враховується, і це сказано під підсумками: інакше «Разом» мовчки було б меншим.
 */

export interface TotalsPreview {
  /** null — сума документа за межею контракту. */
  readonly totals: DocumentTotals | null
  /** Суми рядків за індексом у формі; індексу немає — рядок не враховано. */
  readonly lines: ReadonlyMap<number, Totals>
  readonly skipped: number
}

const { discountPercent, discountAmount } = documentLineSchema.shape

const isValidDiscount = (discount: TotalsDiscount) =>
  discountPercent.safeParse(discount.discountPercent).success &&
  discountAmount.safeParse(discount.discountAmount).success &&
  isSingleDiscount(discount)

const isCountable = (line: DocumentLine) =>
  quantitySchema.safeParse(line.quantity).success &&
  priceSchema.safeParse(line.price).success &&
  isValidDiscount(line)

/**
 * Підсумки рядків, які вже можна порахувати. Знижка сумою понад суму рядка прибирає рядок, понад суму
 * документа — саму знижку документа: помилку біля поля покаже перевірка форми.
 */
export function previewTotals(
  lines: readonly DocumentLine[],
  digits: number,
  discount: TotalsDiscount,
): TotalsPreview {
  let counted = lines.flatMap((line, index) =>
    isCountable(line) ? [index] : [],
  )
  let documentDiscount = isValidDiscount(discount) ? discount : NO_DISCOUNT
  for (;;) {
    const rows = counted.map((index) => lines[index])
    const issue = documentTotalsIssue(rows, digits, documentDiscount)
    if (issue?.code === "discount_exceeds" && issue.line === null)
      documentDiscount = NO_DISCOUNT
    else if (issue?.code === "discount_exceeds")
      counted = counted.filter((_, position) => position !== issue.line)
    else {
      const totals = issue
        ? null
        : computeDocumentTotals(rows, digits, documentDiscount)
      return {
        totals,
        lines: new Map(
          totals
            ? counted.map((index, position) => [index, totals.lines[position]])
            : [],
        ),
        skipped: lines.length - counted.length,
      }
    }
  }
}

/** Назва ставки з рядків: підсумок за ставкою має лише id, ставку й позначку «у ціні». */
function taxName(lines: readonly DocumentLine[], total: TaxTotal) {
  return (
    lines.find(
      ({ tax }) =>
        tax?.id === total.taxId &&
        tax.rate === total.rate &&
        tax.included === total.included,
    )?.tax?.name ?? `${String(total.rate)} %`
  )
}

function TotalsRow({
  label,
  value,
  isTotal = false,
}: {
  label: React.ReactNode
  value: string
  isTotal?: boolean
}) {
  return (
    <div
      className={cn(
        "flex justify-between gap-4",
        isTotal && "mt-1 border-t pt-2 text-base font-semibold",
      )}
    >
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}

interface DocumentLinesTotalsProps {
  form: UseFormReturn<DocumentLinesValues>
  lines: readonly DocumentLine[]
  preview: TotalsPreview
  /** Підсумки сервера збереженого документа: їх видно лише для читання. */
  savedTotals?: SavedDocumentTotals
  currency: string
  discountKind: DiscountKind
  onDiscountKind: (kind: DiscountKind) => void
  readOnly: boolean
}

export function DocumentLinesTotals({
  form,
  lines,
  preview,
  savedTotals,
  currency,
  discountKind,
  onDiscountKind,
  readOnly,
}: DocumentLinesTotalsProps) {
  const t = useErpUiT()
  const format = useFormat()
  const totals = (readOnly && savedTotals) || preview.totals
  const money = (amount: number) => format.money({ amount, currency })
  const lineDiscount = totals ? totals.discount - totals.documentDiscount : 0
  return (
    <section
      aria-label={t("documentLines.totals.label")}
      data-slot="document-lines-totals"
      className="grid w-full gap-3 @4xl:ms-auto @4xl:max-w-sm"
    >
      <DiscountField
        form={form}
        percentName="discountPercent"
        amountName="discountAmount"
        label={t("documentLines.totals.documentDiscount")}
        kindLabel={t("documentLines.documentDiscountKind")}
        currency={currency}
        kind={discountKind}
        onKindChange={onDiscountKind}
        readOnly={readOnly}
      />
      {totals ? (
        <dl className="grid gap-1 text-sm">
          {totals.discount > 0 ? (
            <TotalsRow
              label={t("documentLines.totals.amount")}
              value={money(totals.amount)}
            />
          ) : null}
          {lineDiscount > 0 ? (
            <TotalsRow
              label={t("documentLines.totals.lineDiscount")}
              value={money(lineDiscount)}
            />
          ) : null}
          {totals.documentDiscount > 0 ? (
            <TotalsRow
              label={t("documentLines.totals.documentDiscount")}
              value={money(totals.documentDiscount)}
            />
          ) : null}
          {totals.taxes.length ? (
            <TotalsRow
              label={t("documentLines.totals.net")}
              value={money(totals.net)}
            />
          ) : null}
          {totals.taxes.map((tax) => {
            const name = taxName(lines, tax)
            return (
              <TotalsRow
                key={`${tax.taxId}|${String(tax.rate)}|${String(tax.included)}`}
                label={
                  tax.included
                    ? t("documentLines.totals.taxIncluded", { name })
                    : name
                }
                value={money(tax.tax)}
              />
            )
          })}
          <TotalsRow
            label={t("documentLines.totals.total")}
            value={money(totals.total)}
            isTotal
          />
        </dl>
      ) : (
        <p className="text-sm text-destructive-foreground">
          {t("documentLines.errors.out_of_range")}
        </p>
      )}
      {preview.skipped && !(readOnly && savedTotals) ? (
        <p className="text-sm text-muted-foreground">
          {t("documentLines.totals.skipped", { count: preview.skipped })}
        </p>
      ) : null}
    </section>
  )
}
