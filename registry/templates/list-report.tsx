import * as React from "react"
import type { RaRecord } from "@/registry/lib/ra-core"

import type { DataTableProps } from "@/registry/erp/data-table"
import type { DataTableSelectionProps } from "@/registry/erp/data-table-selection"
import { FilterBar } from "@/registry/erp/filter-bar"
import {
  PageHeader,
  type PageHeaderAction,
  type PageHeaderProps,
} from "@/registry/erp/page-header"
import { PageSkeleton } from "@/registry/erp/page-state"
import { SavedViewsMenu } from "@/registry/erp/saved-views-menu"
import { StatusTabs } from "@/registry/erp/status-tabs"
import { useCompanyId } from "@/registry/hooks/use-company"
import { useListCounts } from "@/registry/hooks/use-list-counts"
import { useRememberedPerPage } from "@/registry/hooks/use-list-settings"
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
import type { FilterDefinition } from "@/registry/lib/filters"
import { LIST_PAGE_SIZES, withPageSize } from "@/registry/lib/list-settings"
import {
  listQueryFilter,
  type ListFilter,
  type ListTab,
} from "@/registry/lib/list-state"
import { cn } from "@/registry/lib/utils"
import {
  ListLayoutContent,
  ListLayoutSwitch,
  type ListReportContentProps,
  type ListReportLayout,
} from "@/registry/templates/list-report-layouts"
import {
  PagedTable,
  WindowedTable,
  type ListTableProps,
} from "@/registry/templates/list-report-tables"

export type { ListReportContentProps, ListReportLayout }

/**
 * Шаблон List Report — список сутностей (SPEC §7, §8.1, §9; ADR-0022).
 *
 * - Склад: заголовок і дії (erp/page-header), вкладки-статуси з лічильниками (erp/status-tabs),
 *   FilterBar із чипами (erp/filter-bar), особисті збережені види (erp/saved-views-menu), панель
 *   масових дій (erp/data-table-selection), DataTable з картками на телефоні й пагінацією
 *   (erp/data-table).
 * - Подання (`layouts`, ADR-0091): ті самі записи таблицею чи вмістом модуля — дошкою, календарем — з
 *   тими самими вкладками, фільтрами, видами й вибором (templates/list-report-layouts).
 * - Стан — `useListReport`: адреса сторінки (hooks/use-list-state), види, лічильники вкладок і вибір
 *   рядків. Хук окремо від розкладки: сторінці потрібні вибір і фільтр для своїх масових дій і
 *   діалогів.
 * - Колонки, фільтри, вкладки й дії — списки з ключами (`id`), порядок — порядок у списку: розширення
 *   модуля додає, ховає чи переставляє елемент за ключем, не знаючи, як модуль його будує (ADR-0020).
 * - `mode`: `scroll` — великий список вікнами по 100 з сервера (useWindowedList), `pages` — малий
 *   список сторінками (`getList` ra-core) з вибором «Рядків на сторінці», який запам'ятовується для
 *   ресурсу в особистих налаштуваннях (hooks/use-list-settings, ADR-0024).
 * - Закріплення записів (ADR-0024): колонку з кнопкою модуль ставить сам (`usePinColumn` з
 *   erp/pin-toggle), шаблон лише підсвічує закріплені рядки (`isPinned`); порядок дає сервер.
 * - Поки не застосовано вид за замовчуванням (і не відомий збережений розмір сторінки), таблиця —
 *   скелетон: дані не вантажаться двічі.
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
  /**
   * Подання списку: перше — за замовчуванням, без `render` — таблиця шаблону; стабільні між
   * рендерами (`useMemo`). Без них — лише таблиця.
   */
  layouts?: readonly ListReportLayout[]
  /**
   * Параметри кожного запиту списку, яких немає ні в панелі, ні в адресі: межі кошиків звіту старіння
   * (`buckets`). Людина їх не змінює й не скидає; стабільні між рендерами.
   */
  fixedFilter?: ListFilter
}

export interface ListReportState {
  resource: string
  tabs: readonly ListTab[]
  filters: readonly FilterDefinition[]
  layouts: readonly ListReportLayout[]
  /** Вкладка, фільтри, сортування, подання й вид в адресі сторінки. */
  list: ListStateApi
  views: SavedViewsApi
  counts: Readonly<Record<string, number | undefined>>
  /** Вибір рядків; інший фільтр чи компанія — скидається (ADR-0018). */
  selection: RowSelection
}

const NO_TABS: readonly ListTab[] = []
const NO_FILTERS: readonly FilterDefinition[] = []
const NO_LAYOUTS: readonly ListReportLayout[] = []

export function useListReport({
  resource,
  params,
  onParamsChange,
  defaults,
  tabs = NO_TABS,
  filters = NO_FILTERS,
  layouts = NO_LAYOUTS,
  fixedFilter,
}: ListReportOptions): ListReportState {
  const views = useSavedViews(resource)
  const listDefaults = React.useMemo(
    () =>
      layouts.length
        ? { ...defaults, layouts: layouts.map((layout) => layout.id) }
        : defaults,
    [defaults, layouts],
  )
  const state = useListState({
    params,
    onParamsChange,
    defaults: listDefaults,
    tabs,
    filters,
    views: views.views,
    viewsFailed: Boolean(views.error),
  })
  const { tab, filter } = state.state
  // Постійні параметри — під фільтром вкладки, як у лічильниках: рядки й числа вкладок рахує той самий запит.
  const filterWithFixed = React.useMemo(
    () => (fixedFilter ? { ...filter, ...fixedFilter } : filter),
    [filter, fixedFilter],
  )
  const queryFilter = React.useMemo(
    () => listQueryFilter({ tab, filter: filterWithFixed }, tabs),
    [tab, filterWithFixed, tabs],
  )
  const list = fixedFilter ? { ...state, queryFilter } : state
  const counts = useListCounts(resource, filterWithFixed, tabs, {
    enabled: list.isReady,
  })
  const companyId = useCompanyId()
  const selection = useRowSelection([list.queryFilter, companyId])
  return { resource, tabs, filters, layouts, list, views, counts, selection }
}

/** Дія в шапці чи біля фільтрів. */
export type ListReportAction = PageHeaderAction

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
  "columns" | "countLabel" | "empty" | "cardsBelow" | "isPinned"
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
   * Заголовок сторінки (h1). Без нього шапки немає: сторінка ставить `PageHeader` (erp/page-header)
   * сама — щоб шапка була одразу, поки список ще не можна зібрати (перевірка сесії), чи список у
   * колонці FCL без власного h1.
   */
  title?: string
  /** Під заголовком: пояснення списку, хто дивиться. */
  description?: React.ReactNode
  /** Ціль фокуса після переходу на сторінку (h1). */
  headingRef?: React.Ref<HTMLHeadingElement>
  /** Дії списку в шапці: «Створити», «Імпорт». */
  actions?: readonly ListReportAction[]
  /** Біля «Фільтри», після меню видів і перемикача подань: свої перемикачі сторінки. */
  toolbar?: readonly ListReportAction[]
  /** Назва групи вкладок для скрінрідера: «Статус рахунку». */
  tabsLabel?: string
  /** Підказка в полі пошуку; без неї поля пошуку немає. */
  searchPlaceholder?: string
  /** Назва таблиці (і вмісту інших подань) для скрінрідера: «Рахунки клієнтам». */
  tableLabel: string
  bulk?: ListReportBulk<T>
  /** Як таблиця вантажить рядки; на інші подання не впливає. */
  mode?: "scroll" | "pages"
  /** Рядків на сторінці в `pages`, поки людина не вибрала свій розмір. */
  perPage?: number
  /**
   * Розміри сторінки на вибір у `pages`; вибраний запам'ятовується для ресурсу в особистих
   * налаштуваннях. `[]` — без вибору й без запитів налаштувань (бекенд їх не вміє, ADR-0021).
   */
  perPageOptions?: readonly number[]
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
  perPageOptions = LIST_PAGE_SIZES,
  getRowId = recordId,
  className,
  ...options
}: ListReportProps<T>) {
  const { resource, tabs, filters, layouts, list, views, counts, selection } =
    report
  const layout = layouts.find((item) => item.id === list.state.layout)
  const sizes = withPageSize(perPageOptions, perPage)
  const pageSize = useRememberedPerPage(resource, {
    fallback: perPage,
    options: sizes,
    enabled: mode === "pages" && perPageOptions.length > 0,
  })
  const resetFilters = () => {
    list.applyView(null)
  }
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
    onResetFilters: resetFilters,
  }

  let content: React.ReactNode = <PageSkeleton rows={8} />
  if (layout?.render) {
    if (list.isReady)
      content = (
        <ListLayoutContent
          key={layout.id}
          render={layout.render}
          resource={resource}
          label={tableLabel}
          filter={list.queryFilter}
          sort={list.state.sort}
          onSortChange={list.setSort}
          isFiltered={list.isFiltered}
          onResetFilters={resetFilters}
          selection={selection}
        />
      )
  } else if (list.isReady && pageSize.isReady)
    content =
      mode === "scroll" ? (
        <WindowedTable {...table} />
      ) : (
        <PagedTable
          {...table}
          perPage={pageSize.perPage}
          {...(perPageOptions.length
            ? { perPageOptions: sizes, onPerPageChange: pageSize.setPerPage }
            : {})}
        />
      )

  return (
    <div data-slot="list-report" className={cn("min-w-0 space-y-6", className)}>
      {title === undefined ? null : (
        <PageHeader
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
              <ListLayoutSwitch
                layouts={layouts}
                value={list.state.layout}
                onValueChange={list.setLayout}
              />
              {toolbar?.map((action) => (
                <React.Fragment key={action.id}>{action.node}</React.Fragment>
              ))}
            </>
          }
        />
        {content}
      </div>
    </div>
  )
}

export type ListReportHeaderProps = PageHeaderProps

/** Шапка списку — `PageHeader` (erp/page-header) під старим ім'ям; нові сторінки беруть `PageHeader`. */
export const ListReportHeader = PageHeader

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
