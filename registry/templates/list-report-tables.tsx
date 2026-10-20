import * as React from "react"
import { keepPreviousData } from "@tanstack/react-query"
import { useGetList, type RaRecord, type SortPayload } from "ra-core"

import {
  DataTable,
  type DataTablePagination,
  type DataTableProps,
} from "@/registry/erp/data-table"
import type { DataTableSelectionProps } from "@/registry/erp/data-table-selection"
import { useCompanyId } from "@/registry/hooks/use-company"
import { useWindowedList } from "@/registry/hooks/use-windowed-list"
import { companyScope } from "@/registry/lib/company-scope"
import type { ListFilter } from "@/registry/lib/list-state"

/**
 * Частина templates/list-report: джерела рядків таблиці списку (ADR-0022). Ставиться разом із
 * шаблоном.
 *
 * - `WindowedTable` — великий список вікнами по 100 з сервера (useWindowedList).
 * - `PagedTable` — малий список сторінками (`getList` ra-core) з «Рядків на сторінці» (ADR-0024):
 *   новий фільтр, сортування, компанія чи розмір — знову з першої сторінки.
 */

export type ListTableProps<T> = Pick<
  DataTableProps<T>,
  | "label"
  | "columns"
  | "getRowId"
  | "onSortChange"
  | "isFiltered"
  | "onResetFilters"
  | "empty"
  | "countLabel"
  | "cardsBelow"
  | "isPinned"
> &
  DataTableSelectionProps<T> & {
    resource: string
    filter: ListFilter
    sort: SortPayload
  }

/** Великий список: віртуальна прокрутка, рядки вікнами по 100 з сервера. */
export function WindowedTable<T extends RaRecord>({
  resource,
  filter,
  sort,
  ...props
}: ListTableProps<T>) {
  const list = useWindowedList<T>(resource, { sort, filter })
  return <DataTable {...props} sort={sort} list={list} />
}

/** Малий список: сторінки, як у звичайному списку ra-core. */
export function PagedTable<T extends RaRecord>({
  resource,
  filter,
  sort,
  perPage,
  perPageOptions,
  onPerPageChange,
  ...props
}: ListTableProps<T> &
  Pick<DataTablePagination, "perPage" | "perPageOptions" | "onPerPageChange">) {
  const companyId = useCompanyId()
  // Інший фільтр, сортування чи компанія — знову з першої сторінки; повернення до попереднього
  // фільтра (A → B → A) теж з першої: збережена сторінка скидається, а не чекає на нього.
  const listKey = JSON.stringify([resource, filter, sort, companyId, perPage])
  const [paging, setPaging] = React.useState({ page: 1, listKey })
  if (paging.listKey !== listKey) setPaging({ page: 1, listKey })
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
  } = useGetList<T>(
    resource,
    {
      pagination: { page, perPage },
      sort,
      filter,
      meta: companyScope(companyId),
    },
    { placeholderData: keepPreviousData },
  )
  // Поки летить нова сторінка, видно попередню: номер, розмір і діапазон — тих рядків, що на екрані
  // (вибір у «Рядків на сторінці» показує новий розмір сам).
  const [shown, setShown] = React.useState({ page, perPage })
  if (
    !isPlaceholderData &&
    data &&
    (shown.page !== page || shown.perPage !== perPage)
  )
    setShown({ page, perPage })
  const retry = () => {
    void refetch()
  }
  return (
    <DataTable
      {...props}
      sort={sort}
      rows={data}
      pagination={{
        page: isPlaceholderData ? shown.page : page,
        perPage: isPlaceholderData ? shown.perPage : perPage,
        total: total ?? data?.length ?? 0,
        onPageChange: (next) => {
          setPaging({ page: next, listKey })
        },
        perPageOptions,
        onPerPageChange,
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
