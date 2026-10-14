"use client"

import * as React from "react"
import {
  useTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table"
import type { SortPayload } from "ra-core"

import { GridHeader, GridRow } from "@/registry/erp/data-table-cells"
import { remPx, useElementSize } from "@/registry/hooks/use-element-size"
import { useGridKeyboard } from "@/registry/hooks/use-grid-keyboard"
import { useVirtualRows } from "@/registry/hooks/use-virtual-rows"
import {
  DATA_TABLE_FEATURES,
  DEFAULT_MIN_WIDTH,
  type ColumnLayout,
  type DataTableColumn,
  type DataTableFeatures,
  type DataTableSource,
} from "@/registry/lib/data-table-core"

/**
 * Табличний вигляд erp/data-table: грід W3C APG на рядках CSS Grid. Ставиться разом з erp/data-table.
 *
 * - Великий список — віртуальні рядки (hooks/use-virtual-rows) у власній області прокрутки з
 *   липкою шапкою; рядок у фокусі лишається в DOM і на екрані.
 * - Колонки «перенести» — другим рядком клітинок під основним, з видимим підписом.
 * - Липка колонка-ідентифікатор і `scroll-padding`: клітинка у фокусі не ховається під шапкою
 *   чи липкою колонкою (WCAG 2.4.11).
 * - Сортування — на сервері: TanStack Table лише показує стан і віддає зміну в `onSortChange`;
 *   без `onSortChange` заголовки не сортують.
 */

export interface DataTableGridProps<T> {
  label: string
  columns: readonly DataTableColumn<T>[]
  getRowId: (row: T) => string
  sort?: SortPayload
  onSortChange?: (sort: SortPayload) => void
  layout: ColumnLayout
  source: DataTableSource<T>
  height?: string
  busy: boolean
  /** Колонки ширші за контейнер: горизонтальна прокрутка з липкою колонкою. */
  overflowing: boolean
}

const OVERSCAN = 8
const FALLBACK_ROW_PX = 44

/** Висота рядка щільності (`--row-h`, rem) у px. */
function rowHeightPx(el: Element): number | null {
  const value = parseFloat(getComputedStyle(el).getPropertyValue("--row-h"))
  return Number.isFinite(value) ? value * remPx() : null
}

function toSorting<T>(
  sort: SortPayload | undefined,
  columns: readonly DataTableColumn<T>[],
): SortingState {
  const column = sort && columns.find((c) => c.sortField === sort.field)
  return column ? [{ id: column.id, desc: sort.order === "DESC" }] : []
}

function useColumnDefs<T extends object>(
  columns: readonly DataTableColumn<T>[],
  sortable: boolean,
) {
  return React.useMemo(
    () =>
      columns.map((column): ColumnDef<DataTableFeatures, T> => ({
        id: column.id,
        header: column.header,
        accessorFn: (row) => row,
        cell: ({ row }) => column.cell(row.original),
        enableSorting: sortable && Boolean(column.sortField),
        sortDescFirst: column.firstSortOrder === "DESC",
      })),
    [columns, sortable],
  )
}

/** Шаблон CSS Grid для видимих колонок: мінімальна ширина й частка вільного місця. */
function gridTemplate<T>(
  inline: string[],
  byId: Map<string, DataTableColumn<T>>,
): string {
  return inline
    .map((id) => {
      const column = byId.get(id)
      return `minmax(${String(column?.minWidth ?? DEFAULT_MIN_WIDTH)}rem, ${String(column?.grow ?? 1)}fr)`
    })
    .join(" ")
}

export function DataTableGrid<T extends object>({
  label,
  columns,
  getRowId,
  sort,
  onSortChange,
  layout,
  source,
  height,
  busy,
  overflowing,
}: DataTableGridProps<T>) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const headerRef = React.useRef<HTMLDivElement>(null)
  const headerHeight = useElementSize(headerRef, "height") ?? 0
  const [rowEstimate, setRowEstimate] = React.useState(FALLBACK_ROW_PX)

  const byId = React.useMemo(
    () => new Map(columns.map((column) => [column.id, column])),
    [columns],
  )
  const { inline, wrapped } = layout
  const sticky = byId.get(inline[0] ?? "")?.sticky === true

  const focus = useGridKeyboard({
    gridRef: scrollRef,
    listKey: source.listKey,
    rowCount: source.rowCount,
    colCount: inline.length + wrapped.length,
    headerColCount: inline.length,
    pageRows: () => {
      const el = scrollRef.current
      return el
        ? Math.max(
            Math.floor((el.clientHeight - headerHeight) / rowEstimate) - 1,
            1,
          )
        : 1
    },
  })
  const { virtualizer, items, failedRows } = useVirtualRows<T, HTMLDivElement>({
    source,
    scrollRef,
    activeIndex: focus.activeRow,
    estimateSize: rowEstimate,
    overscan: OVERSCAN,
    headerHeight,
  })

  // Висота рядка — з виміряного рядка даних (щільність, перенесені колонки, кнопки в клітинках),
  // до перших даних — з `--row-h`. Рядки, що вантажаться, мають ту саму висоту: прокрутка не
  // стрибає, коли вікно приходить. Переміряється зі зміною щільності (висота шапки) і колонок.
  // Лише з рядка даних: на Ctrl+End видно самі заглушки, і відкат до `--row-h` змінив би висоту
  // всього списку під прокруткою.
  React.useLayoutEffect(() => {
    const px = scrollRef.current ? rowHeightPx(scrollRef.current) : null
    if (px) setRowEstimate(px)
  }, [])
  const hasData = items.some((item) => source.rowAt(item.index) !== undefined)
  React.useLayoutEffect(() => {
    const row = scrollRef.current?.querySelector<HTMLElement>(
      "[role=row][data-index]:not([aria-busy])",
    )
    if (row) setRowEstimate(row.offsetHeight)
  }, [headerHeight, layout, hasData])

  const columnDefs = useColumnDefs(columns, Boolean(onSortChange))
  const sorting = toSorting(sort, columns)
  const table = useTable<DataTableFeatures, T>({
    features: DATA_TABLE_FEATURES,
    columns: columnDefs,
    data: items
      .map((item) => source.rowAt(item.index))
      .filter((row): row is T => row !== undefined),
    getRowId,
    manualSorting: true,
    enableSortingRemoval: false,
    state: {
      sorting,
      columnVisibility: Object.fromEntries(
        layout.hidden.map((id) => [id, false]),
      ),
    },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater
      const column = next[0] && byId.get(next[0].id)
      if (next[0] && column?.sortField)
        onSortChange?.({
          field: column.sortField,
          order: next[0].desc ? "DESC" : "ASC",
        })
    },
  })
  const rowsById = new Map(table.getRowModel().rows.map((row) => [row.id, row]))
  const stickyWidth = byId.get(inline[0] ?? "")?.minWidth ?? DEFAULT_MIN_WIDTH
  const template = gridTemplate(inline, byId)

  return (
    <div
      ref={scrollRef}
      role="grid"
      // Фокус — на клітинках (одна зупинка Tab), сам грід у порядок Tab не входить.
      tabIndex={-1}
      aria-label={label}
      aria-rowcount={source.totalCount + 1}
      aria-colcount={inline.length + wrapped.length}
      aria-busy={busy || undefined}
      onKeyDown={focus.onKeyDown}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      className="relative overflow-auto rounded-md border"
      style={{
        height,
        scrollPaddingTop: headerHeight,
        ...(overflowing && sticky
          ? { scrollPaddingInlineStart: `${String(stickyWidth)}rem` }
          : {}),
      }}
    >
      <div style={{ minWidth: `${String(layout.minWidth)}rem` }}>
        <div
          ref={headerRef}
          role="rowgroup"
          className="sticky top-0 z-20 border-b bg-background"
        >
          <GridHeader
            headers={table.getHeaderGroups()[0]?.headers ?? []}
            layout={layout}
            byId={byId}
            template={template}
            sticky={sticky}
            overflowing={overflowing}
          />
        </div>
        <div
          role="rowgroup"
          className={source.virtual ? "relative" : undefined}
          style={
            source.virtual ? { height: virtualizer.getTotalSize() } : undefined
          }
        >
          {items.map((item) => {
            const original = source.rowAt(item.index)
            return (
              <GridRow
                key={item.key}
                item={item}
                row={original ? rowsById.get(getRowId(original)) : undefined}
                rowIndex={source.rowOffset + item.index + 2}
                layout={layout}
                byId={byId}
                template={template}
                sticky={sticky}
                overflowing={overflowing}
                top={source.virtual ? item.start - headerHeight : undefined}
                measureRef={
                  source.virtual ? virtualizer.measureElement : undefined
                }
                windowState={original ? undefined : source.windowAt(item.index)}
                showError={failedRows.has(item.index)}
                placeholderHeight={rowEstimate}
                render={(cell) => <table.FlexRender cell={cell} />}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
