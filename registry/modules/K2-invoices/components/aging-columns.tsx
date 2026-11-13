import { useMemo } from "react"

import { RecordLink } from "@/components/erp/record-link"
import type { DataTableColumn } from "@/lib/data-table-core"
import { useFormat } from "@/lib/format"

import { agingBucketsOf, type AgingBucket } from "../aging-buckets"
import type { AgingRow } from "../contract"
import { useInvoicesModule } from "../module-context"
import { useInvoicesT } from "../use-invoices-t"

type InvoicesT = ReturnType<typeof useInvoicesT>

/** Вкладка списку рахунків, що чекають оплати: туди веде назва клієнта. */
const AWAITING_TAB = "issued"
/**
 * Найменша ширина колонки кошика, rem: діапазон днів коротший за «Строк не настав» і «Понад 90 днів». Так звіт
 * із межами за замовчуванням вміщається на 1440 без обрізаних заголовків.
 */
const BUCKET_MIN_WIDTH: Record<AgingBucket["kind"], number> = {
  notDue: 9,
  range: 7,
  over: 8,
}

/** Підпис кошика: «Строк не настав», «1–30 днів», «Понад 90 днів». */
const bucketLabel = (t: InvoicesT, bucket: AgingBucket) =>
  bucket.kind === "notDue"
    ? t("debts.buckets.notDue")
    : bucket.kind === "range"
      ? t("debts.buckets.range", {
          count: bucket.to,
          from: bucket.from,
          to: bucket.to,
        })
      : t("debts.buckets.over", { count: bucket.days })

/** Сума рядка; нуль — риска, а скрінрідер чує «немає». */
function AgingAmount({
  amount,
  currency,
}: {
  amount: number
  currency: string
}) {
  const t = useInvoicesT()
  const format = useFormat()
  if (amount === 0)
    return (
      <span className="text-muted-foreground">
        <span aria-hidden="true">—</span>
        <span className="sr-only">{t("debts.none")}</span>
      </span>
    )
  return (
    <span className="tabular-nums">{format.money({ amount, currency })}</span>
  )
}

/** Борг кошика за індексом: рядок без нього — не за контрактом, збій сторінки, а не тихий нуль. */
function bucketAmount(row: AgingRow, index: number): number {
  const amount = row.buckets[index]
  if (amount === undefined)
    throw new Error(
      `K2-invoices: aging row ${row.id} has ${String(row.buckets.length)} buckets, expected more than ${String(index)}`,
    )
  return amount
}

/**
 * Адреса рахунків клієнта у валюті рядка, що чекають оплати. Фільтр «Валюта» є лише з валютами компанії
 * (`withCurrency`): без них усі рахунки в базовій валюті.
 */
function invoicesHref(list: string, withCurrency: boolean, row: AgingRow) {
  const params = new URLSearchParams({ clientId: row.clientId })
  if (withCurrency) params.set("currency", row.currency)
  params.set("tab", AWAITING_TAB)
  return `${list}?${params.toString()}`
}

/**
 * Колонки звіту «Борги клієнтів» (ADR-0084): клієнт — посилання на його рахунки, що чекають оплати; кошики
 * днів за межами фабрики; «Разом» у валюті рядка й «Разом у базовій валюті» (без курсу — «без курсу»). На
 * вузькому контейнері кошики переносяться під рядок, а не ховаються: першим «Строк не настав», найдавніший
 * борг — останнім.
 */
export function useAgingColumns(): readonly DataTableColumn<AgingRow>[] {
  const t = useInvoicesT()
  const format = useFormat()
  const { agingBuckets, preload, paths, currencies } = useInvoicesModule()
  const withCurrency = Boolean(currencies)
  return useMemo(() => {
    const buckets = agingBucketsOf(agingBuckets)
    return [
      {
        id: "client",
        header: t("debts.columns.client"),
        cell: (row) => (
          <RecordLink
            to={invoicesHref(paths.invoices, withCurrency, row)}
            preload={preload}
          >
            {row.clientName}
            <span className="sr-only">, {t("debts.openInvoices")}</span>
          </RecordLink>
        ),
        sortField: "clientName",
        minWidth: 10,
        grow: 3,
        sticky: true,
        card: "title",
      },
      ...buckets.map((bucket, index): DataTableColumn<AgingRow> => ({
        id: `bucket${String(index)}`,
        header: bucketLabel(t, bucket),
        cell: (row) => (
          <AgingAmount
            amount={bucketAmount(row, index)}
            currency={row.currency}
          />
        ),
        align: "end",
        minWidth: BUCKET_MIN_WIDTH[bucket.kind],
        priority: 4 + buckets.length - 1 - index,
        overflow: "wrap",
      })),
      {
        id: "total",
        header: t("debts.columns.total"),
        cell: (row) => (
          <AgingAmount amount={row.total} currency={row.currency} />
        ),
        sortField: "total",
        firstSortOrder: "DESC",
        align: "end",
        minWidth: 9,
        priority: 3,
      },
      {
        id: "baseTotal",
        header: t("debts.columns.baseTotal"),
        cell: (row) =>
          row.baseTotal === null ? (
            <span className="text-muted-foreground">
              {t("invoice.exchange.noRateShort")}
            </span>
          ) : (
            <span className="tabular-nums">
              {format.money({
                amount: row.baseTotal,
                currency: row.baseCurrency,
              })}
            </span>
          ),
        sortField: "baseTotal",
        firstSortOrder: "DESC",
        align: "end",
        minWidth: 12,
        priority: 2,
      },
    ]
  }, [t, format, agingBuckets, preload, paths, withCurrency])
}
