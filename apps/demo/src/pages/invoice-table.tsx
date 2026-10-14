import { keepPreviousData } from "@tanstack/react-query"
import { type LucideIcon } from "lucide-react"
import { useGetList, type SortPayload } from "ra-core"
import { useMemo, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { DataTable, type DataTableProps } from "@/registry/erp/data-table"
import type { DataTableSelectionOptions } from "@/registry/erp/data-table-selection"
import { useCompanyId } from "@/registry/hooks/use-company"
import type { RowSelection } from "@/registry/hooks/use-row-selection"
import { useWindowedList } from "@/registry/hooks/use-windowed-list"
import { companyScope } from "@/registry/lib/company-scope"
import type { DataTableColumn } from "@/registry/lib/data-table-core"
import { useFormat } from "@/registry/lib/format"
import { ACTION_ICONS, STATUS_ICONS } from "@/registry/lib/icons"
import { Badge } from "@/registry/ui/badge"
import { Button } from "@/registry/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/registry/ui/tooltip"

import { type Invoice, type InvoiceStatus } from "@/data/invoices"

import {
  InvoiceAmountCell,
  InvoiceClientCell,
  type InlineConflict,
} from "./invoice-cells"

/**
 * Список рахунків стрес-сторінки (DataPage, SPEC §18.1) на erp/data-table: колонки й два джерела —
 * прокрутка вікнами (useWindowedList) і сторінки (useGetList); вибір рядків для масового погодження,
 * клієнт і сума редагуються в комірці (ADR-0018).
 */

const usePageT = () => useTranslation("demo", { keyPrefix: "dataPage" }).t

/** Рядків на сторінці в поданні «Сторінки» (малий список, SPEC §7). */
const PER_PAGE = 20
const RESOURCE = "invoices"

const STATUS_BADGES: Record<
  InvoiceStatus,
  {
    variant: "secondary" | "info" | "warning" | "success" | "destructive"
    icon: LucideIcon
  }
> = {
  draft: { variant: "secondary", icon: STATUS_ICONS.draft },
  approved: { variant: "info", icon: ACTION_ICONS.approve },
  sent: { variant: "info", icon: STATUS_ICONS.info },
  partially_paid: { variant: "warning", icon: STATUS_ICONS.pending },
  paid: { variant: "success", icon: STATUS_ICONS.success },
  overdue: { variant: "destructive", icon: STATUS_ICONS.destructive },
}

function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const t = usePageT()
  const { variant, icon: Icon } = STATUS_BADGES[status]
  return (
    <Badge variant={variant}>
      <Icon aria-hidden />
      {t(`statuses.${status}`)}
    </Badge>
  )
}

const getInvoiceId = (invoice: Invoice) => invoice.id

/** Колонки: пріоритет і поведінка на вузькому контейнері (SPEC §9), місце в картці. */
function useInvoiceColumns(
  canEdit: boolean,
  onEdit: (invoice: Invoice) => void,
  onConflict: (conflict: InlineConflict) => void,
): DataTableColumn<Invoice>[] {
  const t = usePageT()
  const format = useFormat()
  return useMemo(
    () => [
      {
        id: "number",
        header: t("columns.number"),
        cell: (invoice) => (
          <span className="tabular-nums">{invoice.number}</span>
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
          <EditButton
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
    [t, format, canEdit, onEdit, onConflict],
  )
}

type ListProps = Pick<
  DataTableProps<Invoice>,
  | "label"
  | "columns"
  | "getRowId"
  | "sort"
  | "onSortChange"
  | "isFiltered"
  | "onResetFilters"
  | "empty"
  | "countLabel"
> &
  DataTableSelectionOptions<Invoice> & {
    filter: Record<string, unknown>
    sort: SortPayload
  }

/** Великий список: віртуальна прокрутка, рядки вікнами по 100 з сервера. */
function WindowedInvoices({ filter, sort, ...props }: ListProps) {
  const list = useWindowedList<Invoice>(RESOURCE, { sort, filter })
  return <DataTable {...props} sort={sort} list={list} />
}

/** Малий список: сторінки по 20, як у звичайному списку ra-core. */
function PagedInvoices({ filter, sort, ...props }: ListProps) {
  const companyId = useCompanyId()
  // Інший фільтр, сортування чи компанія — знову з першої сторінки.
  const listKey = JSON.stringify([filter, sort, companyId])
  const [paging, setPaging] = useState({ page: 1, listKey })
  const page = paging.listKey === listKey ? paging.page : 1
  const {
    data,
    total,
    isPending,
    isFetching,
    isPlaceholderData,
    error,
    refetch,
    dataUpdatedAt,
  } = useGetList<Invoice>(
    RESOURCE,
    {
      pagination: { page, perPage: PER_PAGE },
      sort,
      filter,
      meta: companyScope(companyId),
    },
    { placeholderData: keepPreviousData },
  )
  // Поки летить нова сторінка, видно попередню: номер і діапазон — тих рядків, що на екрані.
  const [shownPage, setShownPage] = useState(page)
  if (!isPlaceholderData && data && shownPage !== page) setShownPage(page)
  const retry = () => {
    void refetch()
  }
  return (
    <DataTable
      {...props}
      sort={sort}
      rows={data}
      pagination={{
        page: isPlaceholderData ? shownPage : page,
        perPage: PER_PAGE,
        total: total ?? data?.length ?? 0,
        onPageChange: (next) => {
          setPaging({ page: next, listKey })
        },
      }}
      isPending={isPending}
      isRefreshing={isFetching && !isPending}
      error={error}
      onRetry={retry}
      updatedAt={dataUpdatedAt}
      onRefresh={retry}
    />
  )
}

/** SPEC §8.4: без права дія неактивна, але у фокусі й пояснює причину. */
function EditButton({
  label,
  canEdit,
  onEdit,
}: {
  label: string
  canEdit: boolean
  onEdit: () => void
}) {
  const t = usePageT()
  const Edit = ACTION_ICONS.edit
  if (canEdit) {
    return (
      <Button variant="ghost" size="icon" aria-label={label} onClick={onEdit}>
        <Edit aria-hidden />
      </Button>
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={label}
            disabled
            focusableWhenDisabled
          />
        }
      >
        <Edit aria-hidden />
      </TooltipTrigger>
      <TooltipContent>{t("readOnlyHint")}</TooltipContent>
    </Tooltip>
  )
}

export type InvoiceTableProps = Pick<
  ListProps,
  "filter" | "sort" | "onSortChange" | "isFiltered" | "onResetFilters" | "empty"
> & {
  view: "scroll" | "pages"
  canEdit: boolean
  onEdit: (invoice: Invoice) => void
  onConflict: (conflict: InlineConflict) => void
  selection: RowSelection
  /** Масові дії панелі вибраного. */
  bulkActions: (count: number) => ReactNode
}

/** Рахунки на erp/data-table: прокрутка вікнами або сторінки. */
export function InvoiceTable({
  view,
  canEdit,
  onEdit,
  onConflict,
  ...props
}: InvoiceTableProps) {
  const t = usePageT()
  const listProps: ListProps = {
    ...props,
    label: t("tableLabel"),
    columns: useInvoiceColumns(canEdit, onEdit, onConflict),
    getRowId: getInvoiceId,
    countLabel: (count, value) => t("count", { count, value }),
    rowLabel: (invoice) => t("rowLabel", { number: invoice.number }),
    selectionLabel: (count, value, all) =>
      t(all ? "selectedAll" : "selected", { count, value }),
  }
  return view === "scroll" ? (
    <WindowedInvoices {...listProps} />
  ) : (
    <PagedInvoices {...listProps} />
  )
}
