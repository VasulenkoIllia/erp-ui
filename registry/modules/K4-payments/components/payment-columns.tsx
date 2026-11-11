import { useMemo } from "react"

import { RecordLink } from "@/components/erp/record-link"
import { StatusBadge } from "@/components/erp/status-badge"
import type { DataTableColumn } from "@/lib/data-table-core"
import { useFormat } from "@/lib/format"
import type { ResolvedStatuses } from "@/lib/statuses"

import type { Payment } from "../contract"
import type { PaymentColumnId } from "../extension"
import { usePaymentsModule } from "../module-context"
import { usePaymentsT } from "../use-payments-t"
import { PaymentAmount, PaymentInvoices } from "./payment-display"
import { usePaymentMethods } from "./payment-statuses"

type PaymentColumn = DataTableColumn<Payment> & { id: PaymentColumnId }

/**
 * Колонки списку оплат: номер-посилання на картку, клієнт, рахунки (номери з посиланнями на картки рахунків),
 * спосіб, статус, дата й сума (у сторно — з мінусом; в оплаті у валюті під нею — у базовій валюті,
 * ADR-0071); на телефоні — картки (номер, клієнт під ним, статус-бейдж). Ключі — `PaymentColumnId`.
 */
export function usePaymentColumns(
  statuses: ResolvedStatuses,
): readonly PaymentColumn[] {
  const t = usePaymentsT()
  const format = useFormat()
  const methods = usePaymentMethods()
  const { paths, preload } = usePaymentsModule()
  return useMemo(
    () => [
      {
        id: "number",
        header: t("payments.columns.number"),
        cell: (payment) => (
          <RecordLink to={paths.payment(payment.id)} preload={preload} fromList>
            <span className="tabular-nums">{payment.number}</span>
          </RecordLink>
        ),
        sortField: "number",
        minWidth: 10,
        sticky: true,
        card: "title",
      },
      {
        id: "client",
        header: t("payments.columns.client"),
        cell: (payment) => payment.clientName,
        sortField: "clientName",
        minWidth: 12,
        grow: 3,
        overflow: "wrap",
        card: "subtitle",
      },
      {
        id: "invoices",
        header: t("payments.columns.invoices"),
        cell: (payment) => <PaymentInvoices payment={payment} />,
        minWidth: 12,
        priority: 5,
        overflow: "wrap",
      },
      {
        id: "method",
        header: t("payments.columns.method"),
        cell: (payment) => methods.labelOf(payment.method),
        minWidth: 9,
        priority: 6,
      },
      {
        id: "status",
        header: t("payments.columns.status"),
        cell: (payment) => (
          <StatusBadge
            status={statuses.byId.get(payment.status) ?? payment.status}
          />
        ),
        minWidth: 9,
        card: "badge",
      },
      {
        id: "date",
        header: t("payments.columns.date"),
        cell: (payment) => (
          <span className="tabular-nums">
            {format.date(payment.date, "date")}
          </span>
        ),
        sortField: "date",
        firstSortOrder: "DESC",
        minWidth: 8,
        priority: 4,
      },
      {
        id: "amount",
        header: t("payments.columns.amount"),
        cell: (payment) => <PaymentAmount payment={payment} />,
        sortField: "amount",
        firstSortOrder: "DESC",
        align: "end",
        minWidth: 10,
        priority: 3,
      },
    ],
    [t, format, methods, paths, preload, statuses],
  )
}

/**
 * Фільтри й вкладки списку оплат: «Клієнт» (ресурс клієнтів проекту), «Дата», «Спосіб» і вкладки «Усі» та
 * статуси (зі статусами розширення).
 */
export function usePaymentListFilters(statuses: ResolvedStatuses) {
  const t = usePaymentsT()
  const methods = usePaymentMethods()
  const { clients } = usePaymentsModule()
  const filters = useMemo(
    () => [
      {
        kind: "record" as const,
        id: "clientId" as const,
        field: "clientId",
        label: t("payments.filters.clientId"),
        resource: clients.resource,
        labelField: clients.labelField,
        ...(clients.descriptionField
          ? { descriptionField: clients.descriptionField }
          : {}),
      },
      {
        kind: "date-range" as const,
        id: "date" as const,
        field: "date",
        label: t("payments.filters.date"),
      },
      {
        kind: "options" as const,
        id: "method" as const,
        field: "method",
        label: t("payments.filters.method"),
        options: methods.items.map((method) => ({
          value: method.id,
          label: method.label,
        })),
      },
    ],
    [t, clients, methods],
  )
  const tabs = useMemo(
    () => [
      { id: "all", label: t("payments.tabs.all"), filter: {} },
      ...statuses.options.map((status) => ({
        id: status.id,
        label: status.label,
        filter: { status: status.id },
      })),
    ],
    [t, statuses.options],
  )
  return { filters, tabs }
}
