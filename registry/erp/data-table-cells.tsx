"use client"

import * as React from "react"
import type { Cell, Header, Row } from "@tanstack/react-table"
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react"

import type { VirtualRow } from "@/registry/hooks/use-virtual-rows"
import type {
  ColumnLayout,
  DataTableColumn,
  DataTableFeatures,
  RowWindowState,
} from "@/registry/lib/data-table-core"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"
import { Button } from "@/registry/ui/button"
import { Skeleton } from "@/registry/ui/skeleton"

/**
 * Рядки й клітинки табличного вигляду erp/data-table (erp/data-table-grid): шапка із сортуванням,
 * рядок даних, перенесені під рядок колонки, рядок вікна, що вантажиться чи не завантажилось.
 * Ставиться разом з erp/data-table. Клітинки позначені `data-cell`, `data-row`, `data-col` для
 * hooks/use-grid-keyboard.
 */

/** Без вертикальних відступів: висоту рядка задає щільність (`min-h-row`), кнопка займає її всю. */
export const cellClass =
  "flex min-w-0 items-center px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"

export function HeaderCell<T>({
  column,
  sorted,
  onSort,
  pos,
  sticky,
  overflowing,
}: {
  column: DataTableColumn<T>
  sorted: false | "asc" | "desc"
  onSort: ((event: unknown) => void) | undefined
  pos: number
  sticky: boolean
  overflowing: boolean
}) {
  const Icon = !sorted
    ? ArrowUpDownIcon
    : sorted === "asc"
      ? ArrowUpIcon
      : ArrowDownIcon
  return (
    <div
      role="columnheader"
      aria-colindex={pos + 1}
      aria-sort={
        sorted ? (sorted === "asc" ? "ascending" : "descending") : undefined
      }
      data-cell=""
      data-row={-1}
      data-col={pos}
      className={cn(
        cellClass,
        "font-medium whitespace-nowrap text-foreground",
        column.align === "end" && "justify-end text-end",
        sticky && "sticky start-0 z-10 bg-background",
        sticky && overflowing && "border-e",
      )}
    >
      {column.sortField && onSort ? (
        <Button
          variant="ghost"
          size="sm"
          className="-mx-2"
          onClick={(event) => {
            onSort(event)
          }}
        >
          {column.header}
          <Icon
            aria-hidden
            className={sorted ? undefined : "text-muted-foreground"}
          />
        </Button>
      ) : (
        <span className={column.headerHidden ? "sr-only" : undefined}>
          {column.header}
        </span>
      )}
    </div>
  )
}

export function WrappedCells<T extends object>({
  cells,
  wrapped,
  byId,
  first,
  index,
  render,
}: {
  cells: Cell<DataTableFeatures, T, unknown>[]
  wrapped: string[]
  byId: Map<string, DataTableColumn<T>>
  first: number
  index: number
  render: (cell: Cell<DataTableFeatures, T, unknown>) => React.ReactNode
}) {
  return (
    <div
      role="presentation"
      className="col-span-full flex flex-wrap gap-x-4 gap-y-1 px-2 pb-2 text-sm text-muted-foreground"
    >
      {wrapped.map((id, i) => {
        const cell = cells.find((c) => c.column.id === id)
        if (!cell) return null
        return (
          <div
            key={id}
            role="gridcell"
            aria-colindex={first + i + 1}
            data-cell=""
            data-row={index}
            data-col={first + i}
            className="flex min-w-0 items-center gap-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {/* Назву колонки скрінрідер бере з aria-colindex (прихований columnheader). */}
            <span aria-hidden>{byId.get(id)?.header}:</span>
            {render(cell)}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Клітинки рядка, якого ще немає: скелетон, поки вікно вантажиться, або повідомлення про збій із
 * повтором. Функція, а не компонент: рядок і клітинки (ключі — id колонок) лишаються тими самими
 * вузлами DOM, коли дані приходять, тож фокус у клітинці не губиться.
 */
function placeholderCells({
  index,
  state,
  inline,
  showError,
  loadingLabel,
}: {
  index: number
  state: RowWindowState | undefined
  inline: string[]
  showError: boolean
  loadingLabel: string
}): React.ReactNode[] {
  if (state?.status === "error") {
    const retry = (event: React.MouseEvent<HTMLElement>) => {
      // Кнопка зникне разом із повідомленням: фокус — на клітинку, а не в нікуди.
      event.currentTarget.closest<HTMLElement>("[data-cell]")?.focus()
      state.retry()
    }
    return [
      <div
        key={inline[0] ?? "error"}
        role="gridcell"
        aria-colindex={1}
        data-cell=""
        data-row={index}
        data-col={0}
        className={cn(cellClass, "col-span-full gap-2 text-sm")}
      >
        {showError ? <WindowFailed state={state} onRetry={retry} /> : null}
      </div>,
    ]
  }
  return inline.map((id, pos) => (
    <div
      key={id}
      role="gridcell"
      aria-colindex={pos + 1}
      data-cell=""
      data-row={index}
      data-col={pos}
      className={cellClass}
    >
      {pos === 0 ? <span className="sr-only">{loadingLabel}</span> : null}
      <Skeleton aria-hidden className="h-4 w-3/4" />
    </div>
  ))
}

/** Вікно рядків не завантажилось: які рядки й «Повторити» (SPEC §8.1, стан 8). Грід і картки. */
export function WindowFailed({
  state,
  onRetry,
}: {
  state: Extract<RowWindowState, { status: "error" }>
  onRetry: (event: React.MouseEvent<HTMLElement>) => void
}) {
  const t = useErpUiT()
  const format = useFormat()
  return (
    <>
      <span className="text-destructive-foreground">
        {t("dataTable.windowFailed", {
          from: format.number(state.first + 1),
          to: format.number(state.last + 1),
        })}
      </span>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {t("pageState.error.retry")}
      </Button>
    </>
  )
}

type GridLayout = Pick<ColumnLayout, "inline" | "wrapped">

/** Рядок заголовків: видимі колонки — із сортуванням, перенесені — лише для скрінрідера. */
export function GridHeader<T extends object>({
  headers,
  layout: { inline, wrapped },
  byId,
  template,
  sticky,
  overflowing,
}: {
  headers: Header<DataTableFeatures, T, unknown>[]
  layout: GridLayout
  byId: Map<string, DataTableColumn<T>>
  template: string
  sticky: boolean
  overflowing: boolean
}) {
  return (
    <div
      role="row"
      aria-rowindex={1}
      className="grid h-row"
      style={{ gridTemplateColumns: template }}
    >
      {inline.map((id, pos) => {
        const header = headers.find((h) => h.column.id === id)
        const column = byId.get(id)
        if (!header || !column) return null
        return (
          <HeaderCell
            key={id}
            column={column}
            sorted={header.column.getIsSorted()}
            onSort={
              header.column.getCanSort()
                ? header.column.getToggleSortingHandler()
                : undefined
            }
            pos={pos}
            sticky={pos === 0 && sticky}
            overflowing={overflowing}
          />
        )
      })}
      {wrapped.map((id, i) => (
        <div
          key={id}
          role="columnheader"
          aria-colindex={inline.length + i + 1}
          className="sr-only"
        >
          {byId.get(id)?.header}
        </div>
      ))}
    </div>
  )
}

export interface GridRowProps<T extends object> {
  item: VirtualRow
  /** Рядок TanStack Table; немає — вікно ще вантажиться чи не завантажилось. */
  row: Row<DataTableFeatures, T> | undefined
  rowIndex: number
  layout: GridLayout
  byId: Map<string, DataTableColumn<T>>
  template: string
  sticky: boolean
  overflowing: boolean
  /** Позиція віртуального рядка, px; undefined — звичайний потік (сторінка). */
  top: number | undefined
  measureRef: ((el: HTMLDivElement | null) => void) | undefined
  windowState: RowWindowState | undefined
  showError: boolean
  /** Висота рядка, що вантажиться, px: як у рядка з даними. */
  placeholderHeight: number
  render: (cell: Cell<DataTableFeatures, T, unknown>) => React.ReactNode
}

/**
 * Рядок гріда. Рядок і клітинки (ключі — id колонок) — ті самі вузли до й після завантаження
 * вікна, тож фокус у клітинці не губиться; вміст клітинки має ключ запису, тож стан елементів у ній
 * (відкрите меню) не переходить на інший запис, коли список зсунувся.
 */
export function GridRow<T extends object>({
  item,
  row,
  rowIndex,
  layout: { inline, wrapped },
  byId,
  template,
  sticky,
  overflowing,
  top,
  measureRef,
  windowState,
  showError,
  placeholderHeight,
  render,
}: GridRowProps<T>) {
  const t = useErpUiT()
  const cells = row?.getVisibleCells() ?? []
  return (
    <div
      role="row"
      data-index={item.index}
      aria-rowindex={rowIndex}
      aria-busy={row ? undefined : true}
      ref={measureRef}
      style={{
        ...(top === undefined
          ? {}
          : { position: "absolute", insetInline: 0, top }),
        ...(row ? {} : { minHeight: placeholderHeight }),
        gridTemplateColumns: template,
      }}
      className={cn(
        "grid min-h-row border-b bg-background hover:bg-muted",
        // У віртуальному списку останній вузол міняється з прокруткою: без рамки він «стрибав» би на 1 px.
        top === undefined && "last:border-b-0",
      )}
    >
      {row
        ? inline.map((id, pos) => {
            const cell = cells.find((c) => c.column.id === id)
            const column = byId.get(id)
            return cell && column ? (
              <div
                key={id}
                role="gridcell"
                aria-colindex={pos + 1}
                data-cell=""
                data-row={item.index}
                data-col={pos}
                className={cn(
                  cellClass,
                  column.align === "end" && "justify-end text-end",
                  pos === 0 && sticky && "sticky start-0 z-10 bg-inherit",
                  pos === 0 && sticky && overflowing && "border-e",
                )}
              >
                <React.Fragment key={row.id}>{render(cell)}</React.Fragment>
              </div>
            ) : null
          })
        : placeholderCells({
            index: item.index,
            state: windowState,
            inline,
            showError,
            loadingLabel: t("dataTable.loadingRow"),
          })}
      {row && wrapped.length ? (
        <WrappedCells
          cells={cells}
          wrapped={wrapped}
          byId={byId}
          first={inline.length}
          index={item.index}
          render={(cell) => (
            <React.Fragment key={row.id}>{render(cell)}</React.Fragment>
          )}
        />
      ) : null}
    </div>
  )
}
