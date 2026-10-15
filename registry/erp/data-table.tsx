"use client"

import * as React from "react"
import { RefreshCwIcon } from "lucide-react"
import type { SortPayload } from "ra-core"

import { CardSortSelect, DataTableCards } from "@/registry/erp/data-table-cards"
import { DataTableGrid } from "@/registry/erp/data-table-grid"
import {
  DataTablePager,
  useClampPage,
  type DataTablePagination,
} from "@/registry/erp/data-table-pager"
import {
  SelectionBar,
  SelectionProvider,
  tableTabStop,
  useTableSelection,
  type DataTableSelectionProps,
  type SelectionScope,
} from "@/registry/erp/data-table-selection"
import { PageState } from "@/registry/erp/page-state"
import {
  remPx,
  useElementSize,
  useFillHeight,
} from "@/registry/hooks/use-element-size"
import type { WindowedList } from "@/registry/hooks/use-windowed-list"
import { errorStateKind } from "@/registry/lib/api"
import {
  DEFAULT_MIN_WIDTH,
  layoutColumns,
  type DataTableColumn,
  type DataTableSource,
} from "@/registry/lib/data-table-core"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"
import { Button } from "@/registry/ui/button"
import { Skeleton } from "@/registry/ui/skeleton"
import { Spinner } from "@/registry/ui/spinner"

/**
 * Таблиця даних ERP (SPEC §7 List Report, §8.1, §9, §10; ADR-0016) на TanStack Table 9 + Virtual.
 *
 * - Великий список — `list` з `useWindowedList`: віртуальна прокрутка у власній області на всю
 *   висоту екрана під заголовком, рядки вікнами по 100 з сервера, `aria-rowcount` — увесь список.
 * - Малий список — `rows` (одна сторінка) і `pagination`: висота за вмістом, кнопки сторінок.
 * - Колонки — `DataTableColumn` (lib/data-table-core): пріоритет і поведінка «лишити / перенести / сховати»
 *   на вузькому контейнері, липка колонка-ідентифікатор, сортування на сервері.
 * - Ширина контейнера, а не вікна (`@container`, SPEC §9): нижче `cardsBelow` rem — картки (feed).
 * - Грід за W3C APG: одна зупинка Tab, стрілки, Home/End, PageUp/PageDown, Ctrl+Home/End, Enter/F2
 *   у клітинку з кількома елементами, Esc — назад; `aria-sort` у заголовках.
 * - Стани SPEC §8.1: скелетон (2), оновлення з видимими даними (3), дозавантаження (4), порожньо (5),
 *   нічого не знайдено (6), помилка (7), збій частини рядків із повтором (8), немає доступу (9),
 *   офлайн (10), «Оновлено о…» з кнопкою (11), вибір «сторінка / усе» (12). Рядок стану — постійний
 *   live-регіон: скрінрідер чує «Завантаження даних», «Оновлюємо…» і кількість після зміни фільтра
 *   (WCAG 4.1.3).
 * - Вибір рядків і масові дії (`selection` з `useRowSelection`, ADR-0018) — erp/data-table-selection.
 */

export type { DataTablePagination }

/** Джерело рядків: великий список вікнами або малий список (сторінка). */
export type DataTableRows<T> =
  | {
      /** Великий список вікнами (useWindowedList). Стани й «Оновити» беруться з нього. */
      list: WindowedList<T>
      rows?: never
      pagination?: never
    }
  | {
      list?: never
      /** Рядки малого списку (поточна сторінка); undefined — ще вантажаться. */
      rows: readonly T[] | undefined
      pagination?: DataTablePagination
    }

export type DataTableProps<T> = DataTableRows<T> &
  /** Вибір рядків (`useRowSelection`) з `rowLabel`: колонка прапорців і панель вибраного. */
  DataTableSelectionProps<T> & {
    /** Назва таблиці для скрінрідера: «Рахунки клієнтам». */
    label: string
    columns: readonly DataTableColumn<T>[]
    getRowId: (row: T) => string
    sort?: SortPayload
    /** Без нього заголовки й картки не пропонують сортування. */
    onSortChange?: (sort: SortPayload) => void
    isPending?: boolean
    isRefreshing?: boolean
    error?: unknown
    onRetry?: () => void
    /** Чи задано фільтри: порожній результат — «нічого не знайдено», а не «порожньо вперше». */
    isFiltered?: boolean
    onResetFilters?: () => void
    /** Стан «порожньо вперше» з дією «Створити»; за замовчуванням — PageState `empty`. */
    empty?: React.ReactNode
    /** Лічильник у рядку стану: (10000) => «10 000 рахунків»; за замовчуванням — «10 000 записів». */
    countLabel?: (count: number, formatted: string) => string
    /** Коли отримано дані, мс: мітка «Оновлено о…» (SPEC §8.1, стан 11). */
    updatedAt?: number
    onRefresh?: () => void
    /** Нижче цієї ширини контейнера, rem, — картки замість таблиці. */
    cardsBelow?: number
    className?: string
  }

const CARDS_BELOW_REM = 40

function toSource<T>(
  list: WindowedList<T> | undefined,
  rows: readonly T[] | undefined,
  pagination: DataTablePagination | undefined,
): DataTableSource<T> {
  if (list)
    return {
      rowCount: list.rowCount,
      rowAt: list.rowAt,
      windowAt: list.windowAt,
      setRange: list.setRange,
      virtual: true,
      rowOffset: 0,
      totalCount: list.rowCount,
      listKey: list.listKey,
    }
  const all = rows ?? []
  return {
    rowCount: all.length,
    rowAt: (index) => all[index],
    windowAt: () => undefined,
    virtual: false,
    rowOffset: pagination ? (pagination.page - 1) * pagination.perPage : 0,
    totalCount: pagination?.total ?? all.length,
    listKey: pagination ? `page-${String(pagination.page)}` : "rows",
  }
}

export function DataTable<T extends object>({
  label,
  columns,
  getRowId,
  list,
  rows,
  pagination,
  sort,
  onSortChange,
  isPending = list?.isPending ?? false,
  isRefreshing = list?.isRefreshing ?? false,
  error = list?.error,
  onRetry = list?.refetch,
  isFiltered = false,
  onResetFilters,
  empty,
  countLabel,
  updatedAt = list?.updatedAt,
  onRefresh = list?.refetch,
  cardsBelow = CARDS_BELOW_REM,
  selection,
  rowLabel,
  bulkActions,
  selectionLabel,
  className,
}: DataTableProps<T>) {
  const t = useErpUiT()
  const format = useFormat()
  const container = React.useRef<HTMLDivElement>(null)
  const width = useElementSize(container, "width")
  const rem = React.useMemo(
    () => (width === null ? null : width / remPx()),
    [width],
  )
  const cards = rem !== null && rem < cardsBelow
  const source = toSource(list, rows, pagination)
  const count = pagination?.total ?? source.rowCount
  const {
    options: selectionOptions,
    shown,
    isSelected,
  } = useTableSelection(
    { selection, rowLabel, bulkActions, selectionLabel },
    columns,
    getRowId,
  )
  const scope: SelectionScope = {
    kind: list ? "all" : "page",
    pageIds: list ? [] : (rows ?? []).map(getRowId),
    total: count,
  }
  const layout = React.useMemo(
    () =>
      layoutColumns(
        shown.map((column, index) => ({
          id: column.id,
          minWidth: column.minWidth ?? DEFAULT_MIN_WIDTH,
          priority: column.priority ?? index + 1,
          overflow: column.overflow ?? "keep",
        })),
        rem ?? Infinity,
      ),
    [shown, rem],
  )

  const bodyRef = React.useRef<HTMLDivElement>(null)
  const fillHeight = useFillHeight(bodyRef, source.virtual)
  const showsError = Boolean(error) && !isPending
  const focusOnRetry = useFocusAfterSwap(bodyRef, showsError)
  useClampPage(pagination, isPending || isRefreshing || showsError)

  const busy = isPending || isRefreshing || Boolean(list?.isLoadingRows)
  const formattedCount = format.number(count)
  let announcement = ""
  if (isPending) announcement = t("pageState.loading")
  else if (isRefreshing) announcement = t("dataTable.refreshing")
  else if (!error)
    announcement = countLabel
      ? countLabel(count, formattedCount)
      : t("dataTable.rows", { count, value: formattedCount })

  let body: React.ReactNode
  if (showsError) {
    const kind = errorStateKind(error)
    body = (
      <PageState
        kind={kind}
        onRetry={kind === "forbidden" ? undefined : onRetry}
      />
    )
  } else if (isPending || width === null) {
    body = <TableSkeleton />
  } else if (count === 0) {
    body = isFiltered ? (
      <PageState kind="no-results" onReset={onResetFilters} />
    ) : (
      (empty ?? <PageState kind="empty" />)
    )
  } else if (cards) {
    body = (
      <DataTableCards
        label={label}
        columns={shown}
        getRowId={getRowId}
        source={source}
        height={fillHeight}
        busy={busy}
        isSelected={isSelected}
      />
    )
  } else {
    body = (
      <DataTableGrid
        label={label}
        columns={shown}
        getRowId={getRowId}
        sort={sort}
        onSortChange={onSortChange}
        layout={layout}
        source={source}
        height={fillHeight}
        busy={busy}
        overflowing={rem !== null && layout.minWidth > rem}
        isSelected={isSelected}
      />
    )
  }

  return (
    <SelectionProvider
      options={selectionOptions}
      getRowId={getRowId}
      scope={scope}
    >
      <div
        ref={container}
        data-slot="data-table"
        className={cn("@container min-w-0 space-y-2", className)}
      >
        <div className="flex min-h-control flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <p
            role="status"
            data-slot="data-table-status"
            className="flex items-center gap-2 tabular-nums"
          >
            {isPending || isRefreshing ? <Spinner aria-hidden /> : null}
            {announcement}
          </p>
          {updatedAt && !isPending && !error ? (
            <span className="tabular-nums">
              {t("dataTable.updatedAt", {
                time: format.date(updatedAt, "time"),
              })}
            </span>
          ) : null}
          {onRefresh && !isPending && !error ? (
            <Button
              variant="ghost"
              size="sm"
              className="-mx-1"
              onClick={onRefresh}
            >
              <RefreshCwIcon aria-hidden />
              {t("dataTable.refresh")}
            </Button>
          ) : null}
          {cards && sort && onSortChange && !showsError ? (
            <CardSortSelect
              columns={columns}
              sort={sort}
              onSortChange={onSortChange}
            />
          ) : null}
          <SelectionBar
            cards={cards && count > 0 && !showsError}
            onCleared={() => {
              tableTabStop(container.current)?.focus()
            }}
          />
        </div>
        <div ref={bodyRef} data-slot="data-table-body" {...focusOnRetry}>
          {body}
        </div>
        {pagination && count > 0 && !error && !isPending ? (
          <DataTablePager
            pagination={pagination}
            label={label}
            shown={source.rowCount}
          />
        ) : null}
      </div>
    </SelectionProvider>
  )
}

const SKELETON_ROWS = 8

/** Первинне завантаження: скелетон у формі таблиці; озвучує рядок стану. */
function TableSkeleton() {
  return (
    <div aria-hidden className="space-y-1 rounded-lg border p-2">
      {Array.from({ length: SKELETON_ROWS }, (_, i) => (
        <Skeleton key={i} className="h-row w-full" />
      ))}
    </div>
  )
}

/**
 * Таблицю з фокусом замінив стан помилки (чи навпаки, після повтору): фокус — на «Повторити» чи
 * на зупинку Tab таблиці, а не в нікуди (WCAG 2.4.3).
 * Повертає обробники фокуса області: чи був фокус у таблиці, коли її замінило.
 */
function useFocusAfterSwap(
  ref: React.RefObject<HTMLElement | null>,
  swapped: boolean,
) {
  const hadFocus = React.useRef(false)
  React.useLayoutEffect(() => {
    const lost =
      !document.activeElement || document.activeElement === document.body
    if (!hadFocus.current || !lost) return
    // Помилка — на «Повторити»; таблиця повернулась після повтору — на її зупинку Tab.
    ref.current
      ?.querySelector<HTMLElement>(swapped ? "button" : '[tabindex="0"]')
      ?.focus()
  }, [ref, swapped])
  return {
    onFocus: () => {
      hadFocus.current = true
    },
    onBlur: (event: React.FocusEvent<HTMLElement>) => {
      const to = event.relatedTarget as Node | null
      if (to) {
        if (!event.currentTarget.contains(to)) hadFocus.current = false
        return
      }
      // Фокус пішов «у нікуди»: клік у порожнє місце (елемент лишився) чи заміна таблиці (зник).
      const from = event.target
      setTimeout(() => {
        if (from.isConnected) hadFocus.current = false
      }, 0)
    },
  }
}
