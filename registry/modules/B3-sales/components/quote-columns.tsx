import { useMemo } from "react"

import { RecordLink } from "@/components/erp/record-link"
import { StatusBadge } from "@/components/erp/status-badge"
import type { DataTableColumn } from "@/lib/data-table-core"
import { useFormat } from "@/lib/format"
import type { ResolvedStatuses } from "@/lib/statuses"

import type { Quote } from "../contract"
import type { QuoteColumnId } from "../extension"
import { useSalesModule } from "../module-context"
import { useSalesT } from "../use-sales-t"
import { QuoteNumber, QuoteValidity } from "./quote-display"

type QuoteColumn = DataTableColumn<Quote> & { id: QuoteColumnId }

/**
 * Колонки списку пропозицій: номер-посилання на картку (чернетка — «Без номера»), клієнт, статус, дата,
 * «Дійсна до» з позначкою «Термін минув», сума з податком; на телефоні — картки (номер, клієнт під ним,
 * статус-бейдж). Ключі — `QuoteColumnId`.
 */
export function useQuoteColumns(
  statuses: ResolvedStatuses,
): readonly QuoteColumn[] {
  const t = useSalesT()
  const format = useFormat()
  const { paths, preload } = useSalesModule()
  return useMemo(
    () => [
      {
        id: "number",
        header: t("quotes.columns.number"),
        cell: (quote) => (
          <RecordLink to={paths.quote(quote.id)} preload={preload} fromList>
            <QuoteNumber number={quote.number} />
          </RecordLink>
        ),
        sortField: "number",
        minWidth: 10,
        sticky: true,
        card: "title",
      },
      {
        id: "client",
        header: t("quotes.columns.client"),
        cell: (quote) => quote.clientName,
        sortField: "clientName",
        minWidth: 12,
        grow: 3,
        overflow: "wrap",
        card: "subtitle",
      },
      {
        id: "status",
        header: t("quotes.columns.status"),
        cell: (quote) => (
          <StatusBadge
            status={statuses.byId.get(quote.status) ?? quote.status}
          />
        ),
        minWidth: 9,
        card: "badge",
      },
      {
        id: "date",
        header: t("quotes.columns.date"),
        cell: (quote) => (
          <span className="tabular-nums">
            {format.date(quote.date, "date")}
          </span>
        ),
        sortField: "date",
        firstSortOrder: "DESC",
        minWidth: 8,
        priority: 4,
      },
      {
        id: "validUntil",
        header: t("quotes.columns.validUntil"),
        cell: (quote) => <QuoteValidity quote={quote} />,
        sortField: "validUntil",
        minWidth: 12,
        priority: 5,
        overflow: "wrap",
      },
      {
        id: "total",
        header: t("quotes.columns.total"),
        cell: (quote) => (
          <span className="tabular-nums">
            {format.money({ amount: quote.total, currency: quote.currency })}
          </span>
        ),
        sortField: "total",
        firstSortOrder: "DESC",
        align: "end",
        minWidth: 10,
        priority: 3,
      },
    ],
    [t, format, paths, preload, statuses],
  )
}
