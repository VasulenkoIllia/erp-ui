import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useLocation } from "react-router"

import type { DataTableColumn } from "@/registry/lib/data-table-core"
import { useFormat } from "@/registry/lib/format"

import type { Invoice } from "@/data/invoices"

import {
  InvoiceAmountCell,
  InvoiceClientCell,
  type InlineConflict,
} from "./invoice-cells"
import type { InvoiceColumnId } from "./invoice-extension"
import { InvoiceEditButton, InvoiceNumberLink } from "./invoice-row"
import { InvoiceStatusBadge } from "./invoice-status"

/**
 * Колонки списку рахунків стрес-сторінки (DataPage, SPEC §18.1) для шаблону List Report: номер —
 * посилання на картку, клієнт і сума редагуються в комірці (ADR-0018), дія «Редагувати» в рядку.
 */

const usePageT = () => useTranslation("demo", { keyPrefix: "dataPage" }).t

export const getInvoiceId = (invoice: Invoice) => invoice.id

/**
 * Колонки: пріоритет і поведінка на вузькому контейнері (SPEC §9), місце в картці. Ключі — точки
 * розширення (`InvoiceColumnId`, invoice-extension.ts).
 */
export function useInvoiceColumns(
  canEdit: boolean,
  onEdit: (invoice: Invoice) => void,
  onConflict: (conflict: InlineConflict) => void,
): (DataTableColumn<Invoice> & { id: InvoiceColumnId })[] {
  const t = usePageT()
  const format = useFormat()
  // Адреса списку (вкладка, фільтри, вид) — для «До списку» на картці; одна на всі комірки.
  const { search } = useLocation()
  return useMemo(
    () => [
      {
        id: "number",
        header: t("columns.number"),
        cell: (invoice) => (
          <InvoiceNumberLink invoice={invoice} listSearch={search} />
        ),
        sortField: "number",
        minWidth: 7,
        sticky: true,
        card: "title",
      },
      {
        id: "client",
        header: t("columns.client"),
        cell: (invoice) => (
          <InvoiceClientCell
            invoice={invoice}
            readOnly={!canEdit}
            onConflict={onConflict}
          />
        ),
        sortField: "client",
        minWidth: 14,
        grow: 2,
        card: "subtitle",
      },
      {
        id: "date",
        header: t("columns.date"),
        cell: (invoice) => (
          <span className="tabular-nums">
            {format.date(invoice.date, "date")}
          </span>
        ),
        sortField: "date",
        firstSortOrder: "DESC",
        minWidth: 7,
        priority: 5,
        overflow: "wrap",
      },
      {
        id: "dueDate",
        header: t("columns.dueDate"),
        cell: (invoice) => (
          <span className="tabular-nums">
            {format.date(invoice.dueDate, "date")}
          </span>
        ),
        sortField: "dueDate",
        firstSortOrder: "DESC",
        minWidth: 7,
        priority: 6,
        overflow: "hide",
        card: "none",
      },
      {
        id: "amount",
        header: t("columns.amount"),
        cell: (invoice) => (
          <InvoiceAmountCell
            invoice={invoice}
            readOnly={!canEdit}
            onConflict={onConflict}
          />
        ),
        sortField: "amount",
        firstSortOrder: "DESC",
        align: "end",
        minWidth: 9,
        priority: 3,
      },
      {
        id: "status",
        header: t("columns.status"),
        cell: (invoice) => <InvoiceStatusBadge status={invoice.status} />,
        minWidth: 9,
        priority: 4,
        card: "badge",
      },
      {
        id: "actions",
        header: t("columns.actions"),
        headerHidden: true,
        cell: (invoice) => (
          <InvoiceEditButton
            label={t("edit", { number: invoice.number })}
            canEdit={canEdit}
            onEdit={() => {
              onEdit(invoice)
            }}
          />
        ),
        minWidth: 3.5,
        grow: 0,
        align: "end",
        card: "actions",
      },
    ],
    [t, format, canEdit, onEdit, onConflict, search],
  )
}
