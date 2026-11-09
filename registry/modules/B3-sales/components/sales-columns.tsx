import { useMemo } from "react"

import { RecordLink } from "@/components/erp/record-link"
import { StatusBadge } from "@/components/erp/status-badge"
import type { DataTableColumn } from "@/lib/data-table-core"
import { useFormat } from "@/lib/format"
import type { ResolvedStatuses } from "@/lib/statuses"

import type { SalesDocument } from "../contract"
import type { SalesDocumentIds } from "../extension"
import { useSalesModule } from "../module-context"
import type { SalesDocumentKind } from "../sales-kinds"
import { useSalesT } from "../use-sales-t"
import { SalesDueDate, SalesNumber } from "./sales-display"

type SalesColumn<D, Due extends string> = DataTableColumn<D> & {
  id: SalesDocumentIds<Due>["column"]
}

/**
 * Колонки списку документів продажу: номер-посилання на картку (чернетка — «Без номера»), клієнт,
 * статус, дата, друга дата з позначкою («Термін минув», «Прострочено»), сума з податком; на телефоні —
 * картки (номер, клієнт під ним, статус-бейдж). Ключі — `SalesDocumentIds["column"]`.
 */
export function useSalesColumns<D extends SalesDocument, Due extends string>(
  kind: SalesDocumentKind<D, Due>,
  statuses: ResolvedStatuses,
): readonly SalesColumn<D, Due>[] {
  const t = useSalesT()
  const format = useFormat()
  const { paths, preload } = useSalesModule()
  const { list } = kind.keys
  return useMemo(() => {
    const documentPaths = kind.pathsOf(paths)
    return [
      {
        id: "number",
        header: t(`${list}.columns.number`),
        cell: (document) => (
          <RecordLink
            to={documentPaths.record(document.id)}
            preload={preload}
            fromList
          >
            <SalesNumber number={document.number} />
          </RecordLink>
        ),
        sortField: "number",
        minWidth: 10,
        sticky: true,
        card: "title",
      },
      {
        id: "client",
        header: t(`${list}.columns.client`),
        cell: (document) => document.clientName,
        sortField: "clientName",
        minWidth: 12,
        grow: 3,
        overflow: "wrap",
        card: "subtitle",
      },
      {
        id: "status",
        header: t(`${list}.columns.status`),
        cell: (document) => (
          <StatusBadge
            status={statuses.byId.get(document.status) ?? document.status}
          />
        ),
        minWidth: 9,
        card: "badge",
      },
      {
        id: "date",
        header: t(`${list}.columns.date`),
        cell: (document) => (
          <span className="tabular-nums">
            {format.date(document.date, "date")}
          </span>
        ),
        sortField: "date",
        firstSortOrder: "DESC",
        minWidth: 8,
        priority: 4,
      },
      {
        id: kind.due.field,
        header: t(kind.due.column),
        cell: (document) => <SalesDueDate kind={kind} document={document} />,
        sortField: kind.due.field,
        minWidth: 12,
        priority: 5,
        overflow: "wrap",
      },
      {
        id: "total",
        header: t(`${list}.columns.total`),
        cell: (document) => (
          <span className="tabular-nums">
            {format.money({
              amount: document.total,
              currency: document.currency,
            })}
          </span>
        ),
        sortField: "total",
        firstSortOrder: "DESC",
        align: "end",
        minWidth: 10,
        priority: 3,
      },
    ]
  }, [t, format, paths, preload, statuses, kind, list])
}
