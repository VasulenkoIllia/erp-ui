import { useMemo } from "react"
import { Link } from "react-router"

import { RecordLink } from "@/components/erp/record-link"
import { StatusBadge } from "@/components/erp/status-badge"
import type { DataTableColumn } from "@/lib/data-table-core"
import { useFormat } from "@/lib/format"
import type { ResolvedStatuses } from "@/lib/statuses"

import type { CreditNote, Invoice, K2Document } from "../contract"
import { CREDIT_NOTE_KIND } from "../credit-note-kind"
import type { K2DocumentKind } from "../document-kind"
import type { CreditNoteColumnId, InvoiceColumnId } from "../extension"
import { INVOICE_KIND } from "../invoice-kind"
import { useInvoicesModule } from "../module-context"
import { useInvoicesT } from "../use-invoices-t"
import { InvoiceAmount, InvoiceDueDate, InvoiceNumber } from "./invoice-display"

type InvoiceColumn = DataTableColumn<Invoice> & { id: InvoiceColumnId }
type CreditNoteColumn = DataTableColumn<CreditNote> & { id: CreditNoteColumnId }
type CommonId = "number" | "client" | "status" | "date" | "total"
type CommonColumns = Record<
  CommonId,
  DataTableColumn<K2Document> & { id: CommonId }
>

/**
 * Колонки, однакові в рахунку й кредит-ноті: номер-посилання на картку (чернетка — «Без номера»), клієнт,
 * статус, дата й сума з податком (у сторно — з мінусом; у документі у валюті під нею — у базовій валюті,
 * ADR-0071); на телефоні — картки (номер, клієнт під ним, статус-бейдж).
 */
function useCommonColumns(
  kind: K2DocumentKind,
  statuses: ResolvedStatuses,
): CommonColumns {
  const t = useInvoicesT()
  const format = useFormat()
  const { paths, preload } = useInvoicesModule()
  return useMemo(() => {
    const list = `${kind.key}s` as const
    const record = kind.pathsOf(paths).record
    return {
      number: {
        id: "number",
        header: t(`${list}.columns.number`),
        cell: (document) => (
          <RecordLink to={record(document.id)} preload={preload} fromList>
            <InvoiceNumber number={document.number} />
          </RecordLink>
        ),
        sortField: "number",
        minWidth: 10,
        sticky: true,
        card: "title",
      },
      client: {
        id: "client",
        header: t(`${list}.columns.client`),
        cell: (document) => document.clientName,
        sortField: "clientName",
        minWidth: 12,
        grow: 3,
        overflow: "wrap",
        card: "subtitle",
      },
      status: {
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
      date: {
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
      total: {
        id: "total",
        header: t(`${list}.columns.total`),
        cell: (document) => <InvoiceAmount invoice={document} />,
        sortField: "total",
        firstSortOrder: "DESC",
        align: "end",
        minWidth: 10,
        priority: 3,
      },
    }
  }, [t, format, paths, preload, statuses, kind])
}

/**
 * Колонки списку рахунків: спільні й «Сплатити до» з позначкою «Прострочено». Ключі — `InvoiceColumnId`.
 */
export function useInvoiceColumns(
  statuses: ResolvedStatuses,
): readonly InvoiceColumn[] {
  const t = useInvoicesT()
  const common = useCommonColumns(INVOICE_KIND, statuses)
  return useMemo(
    () => [
      common.number,
      common.client,
      common.status,
      common.date,
      {
        id: "dueDate",
        header: t("invoices.columns.dueDate"),
        cell: (invoice: Invoice) => <InvoiceDueDate invoice={invoice} />,
        sortField: "dueDate",
        minWidth: 12,
        priority: 5,
        overflow: "wrap",
      },
      common.total,
    ],
    [t, common],
  )
}

/**
 * Колонки списку кредит-нот (ADR-0072): спільні й «Рахунок» — номер рахунку-підстави з посиланням на його
 * картку. Ключі — `CreditNoteColumnId`.
 */
export function useCreditNoteColumns(
  statuses: ResolvedStatuses,
): readonly CreditNoteColumn[] {
  const t = useInvoicesT()
  const { paths } = useInvoicesModule()
  const common = useCommonColumns(CREDIT_NOTE_KIND, statuses)
  return useMemo(
    () => [
      common.number,
      common.client,
      {
        id: "invoice",
        header: t("creditNotes.columns.invoice"),
        cell: (note: CreditNote) => (
          <Link
            to={paths.invoice(note.invoiceId)}
            className="tabular-nums underline-offset-4 hover:underline focus-visible:underline"
          >
            {note.invoiceNumber}
          </Link>
        ),
        sortField: "invoiceNumber",
        minWidth: 10,
        priority: 5,
      },
      common.status,
      common.date,
      common.total,
    ],
    [t, paths, common],
  )
}
