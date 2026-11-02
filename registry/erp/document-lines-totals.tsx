import type * as React from "react"
import type { UseFormReturn } from "react-hook-form"

import { DiscountField } from "@/registry/erp/document-discount-field"
import type { DocumentLinesValues } from "@/registry/erp/document-lines-schema"
import {
  discountShape,
  isSingleDiscount,
  priceSchema,
  quantitySchema,
  type DocumentLine,
  type SavedDocumentTotals,
} from "@/registry/lib/document-lines"
import {
  computeDocumentTotals,
  documentTotalsIssue,
  lineDiscountOf,
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
 * суму), і зайва знижка документа не враховуються, і це сказано під підсумками: інакше «Разом» мовчки
 * було б іншим. Ці примітки й повідомлення про межу суми озвучує скрінрідер (`role="status"`).
 */

export interface TotalsPreview {
  /** null — сума документа за межею контракту. */
  readonly totals: DocumentTotals | null
  /** Суми рядків за індексом у формі; індексу немає — рядок не враховано. */
  readonly lines: ReadonlyMap<number, Totals>
  readonly skipped: number
  /** Знижку документа не враховано: вона більша за суму рядків чи некоректна. */
  readonly documentDiscountSkipped: boolean
}

const isValidDiscount = (discount: TotalsDiscount) =>
  discountShape.discountPercent.safeParse(discount.discountPercent).success &&
  discountShape.discountAmount.safeParse(discount.discountAmount).success &&
  isSingleDiscount(discount)

const hasDiscount = (discount: TotalsDiscount) =>
  discount.discountPercent !== 0 || discount.discountAmount !== 0

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
        documentDiscountSkipped:
          documentDiscount === NO_DISCOUNT && hasDiscount(discount),
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
  /** Знижка документа з форми. */
  discount: TotalsDiscount
  readOnly: boolean
}

export function DocumentLinesTotals({
  form,
  lines,
  preview,
  savedTotals,
  currency,
  discount,
  readOnly,
}: DocumentLinesTotalsProps) {
  const t = useErpUiT()
  const format = useFormat()
  const isSaved = Boolean(readOnly && savedTotals)
  const totals = (readOnly && savedTotals) || preview.totals
  const money = (amount: number) => format.money({ amount, currency })
  const lineDiscount = totals ? lineDiscountOf(totals) : 0
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
        discount={discount}
        label={t("documentLines.totals.documentDiscount")}
        kindLabel={t("documentLines.documentDiscountKind")}
        currency={currency}
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
      ) : null}
      {/* Порожня область лишається в дереві доступності: інакше перша примітка може не прозвучати. */}
      <div role="status" className="grid gap-1 text-sm empty:sr-only">
        {totals ? null : (
          <p className="text-destructive-foreground">
            {t("documentLines.errors.out_of_range")}
          </p>
        )}
        {preview.skipped && !isSaved ? (
          <p className="text-muted-foreground">
            {t("documentLines.totals.skipped", { count: preview.skipped })}
          </p>
        ) : null}
        {preview.documentDiscountSkipped && !isSaved ? (
          <p className="text-muted-foreground">
            {t("documentLines.totals.documentDiscountSkipped")}
          </p>
        ) : null}
      </div>
    </section>
  )
}
