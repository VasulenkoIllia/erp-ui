"use client"

import * as React from "react"
import { keepPreviousData } from "@tanstack/react-query"
import { useGetList, type RaRecord, type SortPayload } from "ra-core"

import { DataTable, type DataTableProps } from "@/registry/erp/data-table"
import type { DataTableSelectionProps } from "@/registry/erp/data-table-selection"
import { FilterBar } from "@/registry/erp/filter-bar"
import { PageSkeleton } from "@/registry/erp/page-state"
import { SavedViewsMenu } from "@/registry/erp/saved-views-menu"
import { StatusTabs } from "@/registry/erp/status-tabs"
import { useCompanyId } from "@/registry/hooks/use-company"
import { useListCounts } from "@/registry/hooks/use-list-counts"
import {
  useListState,
  type ListStateApi,
  type ListStateOptions,
} from "@/registry/hooks/use-list-state"
import {
  useRowSelection,
  type RowSelection,
} from "@/registry/hooks/use-row-selection"
import {
  useSavedViews,
  type SavedViewsApi,
} from "@/registry/hooks/use-saved-views"
import { useWindowedList } from "@/registry/hooks/use-windowed-list"
import { companyScope } from "@/registry/lib/company-scope"
import type { FilterDefinition } from "@/registry/lib/filters"
import type { ListFilter, ListTab } from "@/registry/lib/list-state"
import { cn } from "@/registry/lib/utils"

/**
 * Шаблон List Report — список сутностей (SPEC §7, §8.1, §9; ADR-0022).
 *
 * - Склад: заголовок і дії, вкладки-статуси з лічильниками (erp/status-tabs), FilterBar із
 *   чипами (erp/filter-bar), особисті збережені види (erp/saved-views-menu), панель масових дій
 *   (erp/data-table-selection), DataTable з картками на телефоні й пагінацією (erp/data-table).
 * - Стан — `useListReport`: адреса сторінки (hooks/use-list-state), види, лічильники вкладок і вибір
 *   рядків. Хук окремо від розкладки: сторінці потрібні вибір і фільтр для своїх масових дій і
 *   діалогів.
 * - Колонки, фільтри, вкладки й дії — списки з ключами (`id`), порядок — порядок у списку: розширення
 *   модуля додає, ховає чи переставляє елемент за ключем, не знаючи, як модуль його будує (ADR-0020).
 * - `mode`: `scroll` — великий список вікнами по 100 з сервера (useWindowedList), `pages` — малий
 *   список сторінками (`getList` ra-core).
 * - Поки не застосовано вид за замовчуванням, таблиця — скелетон: дані не вантажаться двічі.
 */

const LIST_REPORT_PER_PAGE = 20

export interface ListReportOptions extends Pick<
  ListStateOptions,
  "params" | "onParamsChange"
> {
  /** Вкладка й сортування за замовчуванням; стабільні між рендерами (константа чи `useMemo`). */
  defaults: ListStateOptions["defaults"]
  /** Ресурс API (ADR-0002): `invoices`. */
  resource: string
  /** Вкладки-статуси; стабільні між рендерами (`useMemo`). */
  tabs?: readonly ListTab[]
  /** Фільтри панелі; стабільні між рендерами. Без опису в запит іде лише пошук `q`. */
  filters?: readonly FilterDefinition[]
}

export interface ListReportState {
  resource: string
  tabs: readonly ListTab[]
  filters: readonly FilterDefinition[]
  /** Вкладка, фільтри, сортування й вид в адресі сторінки. */
  list: ListStateApi
  views: SavedViewsApi
  counts: Readonly<Record<string, number | undefined>>
  /** Вибір рядків; інший фільтр чи компанія — скидається (ADR-0018). */
  selection: RowSelection
}

const NO_TABS: readonly ListTab[] = []
const NO_FILTERS: readonly FilterDefinition[] = []

export function useListReport({
  resource,
  params,
  onParamsChange,
  defaults,
  tabs = NO_TABS,
  filters = NO_FILTERS,
}: ListReportOptions): ListReportState {
  const views = useSavedViews(resource)
  const list = useListState({
    params,
    onParamsChange,
    defaults,
    tabs,
    filters,
    views: views.views,
    viewsFailed: Boolean(views.error),
  })
  const counts = useListCounts(resource, list.state.filter, tabs, {
    enabled: list.isReady,
  })
  const companyId = useCompanyId()
  const selection = useRowSelection([list.queryFilter, companyId])
  return { resource, tabs, filters, list, views, counts, selection }
}

/** Дія в шапці чи біля фільтрів. */
export interface ListReportAction {
  id: string
  node: React.ReactNode
}

/**
 * Масова дія панелі вибраного: `render(count)` — кнопка для `count` вибраних записів. Панель є лише
 * з вибором, тож дія з хуками — власним компонентом: `render: (count) => <Export count={count} />`.
 */
export interface ListReportBulkAction {
  id: string
  render: (count: number) => React.ReactNode
}

/** Вибір рядків і масові дії: без них колонки прапорців немає. */
export interface ListReportBulk<T> {
  actions: readonly ListReportBulkAction[]
  /** Назва рядка для прапорця: «рахунок 2026-0001» → «Вибрати рахунок 2026-0001». */
  rowLabel: (row: T) => string
  /** Лічильник: (25, "25", false) → «Вибрано 25 рахунків»; `all` — усі за фільтром. */
  selectionLabel?: (count: number, formatted: string, all: boolean) => string
}

type TableOptions<T> = Pick<
  DataTableProps<T>,
  "columns" | "countLabel" | "empty" | "cardsBelow"
>

export interface ListReportProps<T extends RaRecord> extends TableOptions<T> {
  /**
   * Колонки — стабільні між рендерами (`useMemo`): новий масив перебудовує таблицю. Розширення
   * зливає колонки до шаблону, теж у `useMemo`.
   */
  columns: TableOptions<T>["columns"]
  /** Ключ рядка; за замовчуванням — `id` запису. */
  getRowId?: (row: T) => string
  report: ListReportState
  /**
   * Заголовок сторінки (h1). Без нього шапки немає: сторінка ставить `ListReportHeader` сама — щоб
   * шапка була одразу, поки список ще не можна зібрати (перевірка сесії), чи список у колонці FCL
   * без власного h1.
   */
  title?: string
  /** Під заголовком: пояснення списку, хто дивиться. */
  description?: React.ReactNode
  /** Ціль фокуса після переходу на сторінку (h1). */
  headingRef?: React.Ref<HTMLHeadingElement>
  /** Дії списку в шапці: «Створити», «Імпорт». */
  actions?: readonly ListReportAction[]
  /** Біля «Фільтри», після меню видів: перемикачі подання. */
  toolbar?: readonly ListReportAction[]
  /** Назва групи вкладок для скрінрідера: «Статус рахунку». */
  tabsLabel?: string
  /** Підказка в полі пошуку; без неї поля пошуку немає. */
  searchPlaceholder?: string
  /** Назва таблиці для скрінрідера: «Рахунки клієнтам». */
  tableLabel: string
  bulk?: ListReportBulk<T>
  mode?: "scroll" | "pages"
  /** Рядків на сторінці в `pages`. */
  perPage?: number
  className?: string
}

export function ListReport<T extends RaRecord>({
  report,
  title,
  description,
  headingRef,
  actions,
  toolbar,
  tableLabel,
  tabsLabel = title ?? tableLabel,
  searchPlaceholder,
  bulk,
  mode = "scroll",
  perPage = LIST_REPORT_PER_PAGE,
  getRowId = recordId,
  className,
  ...options
}: ListReportProps<T>) {
  const { resource, tabs, filters, list, views, counts, selection } = report
  const selectionProps: DataTableSelectionProps<T> = bulk
    ? {
        selection,
        rowLabel: bulk.rowLabel,
        selectionLabel: bulk.selectionLabel,
        bulkActions: (count) =>
          bulk.actions.map((action) => (
            <BulkActionSlot
              key={action.id}
              render={action.render}
              count={count}
            />
          )),
      }
    : {}
  const table: ListTableProps<T> = {
    ...options,
    ...selectionProps,
    getRowId,
    resource,
    label: tableLabel,
    filter: list.queryFilter,
    sort: list.state.sort,
    onSortChange: list.setSort,
    isFiltered: list.isFiltered,
    onResetFilters: () => {
      list.applyView(null)
    },
  }

  let content: React.ReactNode = <PageSkeleton rows={8} />
  if (list.isReady)
    content =
      mode === "scroll" ? (
        <WindowedTable {...table} />
      ) : (
        <PagedTable {...table} perPage={perPage} />
      )

  return (
    <div data-slot="list-report" className={cn("min-w-0 space-y-6", className)}>
      {title === undefined ? null : (
        <ListReportHeader
          title={title}
          description={description}
          headingRef={headingRef}
          actions={actions}
        />
      )}
      <div className="space-y-4">
        {tabs.length > 0 ? (
          <StatusTabs
            label={tabsLabel}
            tabs={tabs}
            value={list.state.tab}
            onValueChange={list.setTab}
            counts={counts}
          />
        ) : null}
        <FilterBar
          filters={filters}
          value={list.state.filter}
          onValueChange={list.setFilter}
          searchPlaceholder={searchPlaceholder}
          actions={
            <>
              <SavedViewsMenu resource={resource} views={views} list={list} />
              {renderActions(toolbar)}
            </>
          }
        />
        {content}
      </div>
    </div>
  )
}

export type ListReportHeaderProps = Pick<
  ListReportProps<RaRecord>,
  "description" | "headingRef" | "actions"
> & { title: string }

/**
 * Шапка списку: h1, пояснення й дії; на вузькому контейнері дії під заголовком. Окремо — коли сторінка
 * ставить шапку сама (`ListReport` без `title`): тоді шапка — той самий вузол від першого кадру, а не
 * новий після перевірки сесії (перший екран не зсувається на пізніше, фокус не губиться).
 */
export function ListReportHeader({
  title,
  description,
  headingRef,
  actions,
}: ListReportHeaderProps) {
  return (
    <header data-slot="list-report-header" className="@container">
      <div className="flex flex-col gap-3 @2xl:flex-row @2xl:items-start @2xl:justify-between">
        <div className="min-w-0 space-y-1">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-2xl font-semibold break-words focus-visible:outline-none"
          >
            {title}
          </h1>
          {description ? (
            <div className="space-y-1 text-muted-foreground">{description}</div>
          ) : null}
        </div>
        {actions?.length ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            {renderActions(actions)}
          </div>
        ) : null}
      </div>
    </header>
  )
}

const recordId = (row: RaRecord) => String(row.id)

/** Окремий компонент на дію: хуки в `render` не залежать від того, скільки дій і чи є вибір. */
function BulkActionSlot({
  render,
  count,
}: {
  render: ListReportBulkAction["render"]
  count: number
}) {
  return render(count)
}

function renderActions(actions: readonly ListReportAction[] | undefined) {
  return actions?.map((action) => (
    <React.Fragment key={action.id}>{action.node}</React.Fragment>
  ))
}

type ListTableProps<T> = Pick<
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
> &
  DataTableSelectionProps<T> & {
    resource: string
    filter: ListFilter
    sort: SortPayload
  }

/** Великий список: віртуальна прокрутка, рядки вікнами по 100 з сервера. */
function WindowedTable<T extends RaRecord>({
  resource,
  filter,
  sort,
  ...props
}: ListTableProps<T>) {
  const list = useWindowedList<T>(resource, { sort, filter })
  return <DataTable {...props} sort={sort} list={list} />
}

/** Малий список: сторінки, як у звичайному списку ra-core. */
function PagedTable<T extends RaRecord>({
  resource,
  filter,
  sort,
  perPage,
  ...props
}: ListTableProps<T> & { perPage: number }) {
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
  // Поки летить нова сторінка, видно попередню: номер і діапазон — тих рядків, що на екрані.
  const [shownPage, setShownPage] = React.useState(page)
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
        perPage,
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
