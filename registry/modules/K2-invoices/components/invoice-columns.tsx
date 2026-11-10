import { useMemo } from "react"

import { RecordLink } from "@/components/erp/record-link"
import { StatusBadge } from "@/components/erp/status-badge"
import type { DataTableColumn } from "@/lib/data-table-core"
import { useFormat } from "@/lib/format"
import type { ResolvedStatuses } from "@/lib/statuses"

import type { Invoice } from "../contract"
import type { InvoiceColumnId } from "../extension"
import { invoiceDocumentPaths } from "../invoice-kind"
import { useInvoicesModule } from "../module-context"
import { useInvoicesT } from "../use-invoices-t"
import { InvoiceAmount, InvoiceDueDate, InvoiceNumber } from "./invoice-display"

type InvoiceColumn = DataTableColumn<Invoice> & { id: InvoiceColumnId }

/**
 * Колонки списку рахунків: номер-посилання на картку (чернетка — «Без номера»), клієнт, статус, дата,
 * «Сплатити до» з позначкою «Прострочено», сума з податком (у сторно — з мінусом; у рахунку у валюті під
 * нею — у базовій валюті, ADR-0071); на телефоні — картки
 * (номер, клієнт під ним, статус-бейдж). Ключі — `InvoiceColumnId`.
 */
export function useInvoiceColumns(
  statuses: ResolvedStatuses,
): readonly InvoiceColumn[] {
  const t = useInvoicesT()
  const format = useFormat()
  const { paths, preload } = useInvoicesModule()
  return useMemo(() => {
    const documentPaths = invoiceDocumentPaths(paths)
    return [
      {
        id: "number",
        header: t("invoices.columns.number"),
        cell: (invoice) => (
          <RecordLink
            to={documentPaths.record(invoice.id)}
            preload={preload}
            fromList
          >
            <InvoiceNumber number={invoice.number} />
          </RecordLink>
        ),
        sortField: "number",
        minWidth: 10,
        sticky: true,
        card: "title",
      },
      {
        id: "client",
        header: t("invoices.columns.client"),
        cell: (invoice) => invoice.clientName,
        sortField: "clientName",
        minWidth: 12,
        grow: 3,
        overflow: "wrap",
        card: "subtitle",
      },
      {
        id: "status",
        header: t("invoices.columns.status"),
        cell: (invoice) => (
          <StatusBadge
            status={statuses.byId.get(invoice.status) ?? invoice.status}
          />
        ),
        minWidth: 9,
        card: "badge",
      },
      {
        id: "date",
        header: t("invoices.columns.date"),
        cell: (invoice) => (
          <span className="tabular-nums">
            {format.date(invoice.date, "date")}
          </span>
        ),
        sortField: "date",
        firstSortOrder: "DESC",
        minWidth: 8,
        priority: 4,
      },
      {
        id: "dueDate",
        header: t("invoices.columns.dueDate"),
        cell: (invoice) => <InvoiceDueDate invoice={invoice} />,
        sortField: "dueDate",
        minWidth: 12,
        priority: 5,
        overflow: "wrap",
      },
      {
        id: "total",
        header: t("invoices.columns.total"),
        cell: (invoice) => <InvoiceAmount invoice={invoice} />,
        sortField: "total",
        firstSortOrder: "DESC",
        align: "end",
        minWidth: 10,
        priority: 3,
      },
    ]
  }, [t, format, paths, preload, statuses])
}
