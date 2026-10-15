import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { DataTable } from "@/registry/erp/data-table"
import { amountInWords } from "@/registry/lib/amount-in-words"
import type { DataTableColumn } from "@/registry/lib/data-table-core"
import { useFormat } from "@/registry/lib/format"
import { useLanguage } from "@/registry/lib/i18n"

import type { Invoice, InvoiceLine } from "@/data/invoices"

/**
 * Рядки рахунку на картці (шаблон Object Page, ADR-0019): малий список на erp/data-table (на телефоні —
 * картки), «Разом» і сума прописом. Рядки приходять із `GET /invoices/:id`; поки їх немає, а шапка
 * вже є з кешу списку, — скелетон таблиці; не прийшли — помилка з повтором лише в цій секції.
 */

const useCardT = () => useTranslation("demo", { keyPrefix: "invoicePage" }).t

const getLineId = (line: InvoiceLine) => line.id

function useLineColumns(currency: string): DataTableColumn<InvoiceLine>[] {
  const t = useCardT()
  const format = useFormat()
  return useMemo(
    () => [
      {
        id: "name",
        header: t("columns.name"),
        cell: (line) => line.name,
        minWidth: 14,
        grow: 2,
        sticky: true,
        card: "title",
      },
      {
        id: "quantity",
        header: t("columns.quantity"),
        cell: (line) => (
          <span className="tabular-nums">
            {`${format.number(line.quantity)} ${t(`units.${line.unit}`)}`}
          </span>
        ),
        align: "end",
        minWidth: 7,
        priority: 3,
      },
      {
        id: "price",
        header: t("columns.price"),
        cell: (line) => (
          <span className="tabular-nums">
            {format.money({ amount: line.price, currency })}
          </span>
        ),
        align: "end",
        minWidth: 9,
        priority: 4,
        overflow: "wrap",
      },
      {
        id: "total",
        header: t("columns.total"),
        cell: (line) => (
          <span className="tabular-nums">
            {format.money({ amount: line.total, currency })}
          </span>
        ),
        align: "end",
        minWidth: 9,
        priority: 2,
      },
    ],
    [t, format, currency],
  )
}

export function InvoiceLines({
  invoice,
  lines,
  isPending,
  error,
  onRetry,
}: {
  invoice: Invoice
  /** undefined — ще не завантажені чи не прийшли. */
  lines: readonly InvoiceLine[] | undefined
  isPending: boolean
  error: unknown
  onRetry: () => void
}) {
  const t = useCardT()
  const format = useFormat()
  const { language } = useLanguage()
  const columns = useLineColumns(invoice.currency)
  return (
    <div className="space-y-4">
      <DataTable
        label={t("linesLabel", { number: invoice.number })}
        columns={columns}
        getRowId={getLineId}
        rows={lines}
        isPending={isPending}
        error={error}
        onRetry={onRetry}
        countLabel={(count, value) => t("lineCount", { count, value })}
      />
      {lines ? (
        <dl className="ms-auto max-w-md space-y-1">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="font-medium">{t("total")}</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {format.money({
                amount: invoice.amount,
                currency: invoice.currency,
              })}
            </dd>
          </div>
          <div className="space-y-0.5">
            <dt className="sr-only">{t("inWords")}</dt>
            <dd className="text-sm text-muted-foreground">
              {amountInWords(
                { amount: invoice.amount, currency: invoice.currency },
                language,
              )}
            </dd>
          </div>
        </dl>
      ) : null}
    </div>
  )
}
