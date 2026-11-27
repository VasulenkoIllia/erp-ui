import * as React from "react"
import { MoveRightIcon, RefreshCwIcon } from "lucide-react"

import { SelectionBar } from "@/registry/erp/data-table-selection"
import { PageState } from "@/registry/erp/page-state"
import { announce } from "@/registry/lib/announce"
import { errorStateKind, MAX_PER_PAGE } from "@/registry/lib/api"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import { ukBoard } from "@/registry/lib/i18n-uk-board"
import { Button } from "@/registry/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/registry/ui/dropdown-menu"
import { Spinner } from "@/registry/ui/spinner"
import type { RaRecord } from "@/registry/lib/ra-core"
import type { BoardColumnData } from "@/registry/templates/board-data"

/**
 * Частина templates/board: рядок стану дошки (кількість, «Оновлено о…», «Оновити», панель вибраного з
 * «Перемістити в…»), збій колонки з повтором і «Показати ще» колонки. Ставиться разом із шаблоном.
 *
 * - «Показати ще»: поки вантажиться, кнопка лишається з фокусом (`aria-disabled`); коли картки прийшли,
 *   скрінрідер чує «Показано 40 з 87», а якщо кнопка зникла (усе завантажено, межа сторінки), фокус — на
 *   меню першої нової картки, інакше на назву колонки (WCAG 2.4.3, 4.1.3).
 */

/** Рядок стану: кількість (live-регіон), «Оновлено о…» з «Оновити», панель вибраного. */
export function BoardStatus({
  data,
  total,
  countLabel,
  isSelectable = true,
  container,
}: {
  data: readonly BoardColumnData<unknown>[]
  total: number | undefined
  countLabel: ((count: number, formatted: string) => string) | undefined
  /** Чи є на дошці вибір: без нього немає й «вибрати все». */
  isSelectable?: boolean
  container: React.RefObject<HTMLElement | null>
}) {
  const t = useErpUiT(ukBoard)
  const format = useFormat()
  const isFetching = data.some((column) => column.isFetching)
  const times = data.map((column) => column.updatedAt).filter(Boolean)
  const updatedAt = times.length ? Math.min(...times) : 0
  let count = ""
  if (total !== undefined) {
    const formatted = format.number(total)
    count =
      countLabel?.(total, formatted) ??
      t("board.cards", { count: total, value: formatted })
  }
  return (
    <div className="flex min-h-control flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
      <p role="status" className="flex items-center gap-2 tabular-nums">
        {isFetching ? <Spinner aria-hidden /> : null}
        {count}
      </p>
      {updatedAt ? (
        <span className="tabular-nums">
          {t("dataTable.updatedAt", { time: format.date(updatedAt, "time") })}
        </span>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        className="-mx-1"
        onClick={() => {
          for (const column of data) column.refetch()
        }}
      >
        <RefreshCwIcon aria-hidden />
        {t("dataTable.refresh")}
      </Button>
      <SelectionBar
        cards={isSelectable && (total ?? 0) > 0}
        onCleared={() => {
          // Кнопка зникає разом із вибором — фокус на першу колонку дошки (WCAG 2.4.3); усі згорнуті — на
          // першу кнопку «розгорнути».
          const root = container.current
          ;(
            root?.querySelector<HTMLElement>("h2") ??
            root?.querySelector<HTMLElement>("[data-kanban-toggle]")
          )?.focus()
        }}
      />
    </div>
  )
}

/**
 * «Перемістити в…» на панелі вибраного (ADR-0103): колонки модуля, а коли вибрано «усі за фільтром» —
 * причина замість колонок (SPEC §8.4): дошка переносить лише вибрані картки.
 */
export function BulkMove({
  columns,
  isAll,
  onMove,
}: {
  columns: readonly { id: string; label: string }[]
  isAll: boolean
  onMove: (column: string) => void
}) {
  const t = useErpUiT(ukBoard)
  const reason = isAll ? t("board.bulk.allMode") : undefined
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        <MoveRightIcon aria-hidden />
        {t("board.card.moveTo")}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("board.card.moveTo")}</DropdownMenuLabel>
          {reason ? (
            // Причина — текст для читання, а не вимкнена дія: повний контраст (WCAG 1.4.3).
            <DropdownMenuItem
              disabled
              className="whitespace-normal text-muted-foreground data-disabled:opacity-100"
            >
              {reason}
            </DropdownMenuItem>
          ) : (
            columns.map((column) => (
              <DropdownMenuItem
                key={column.id}
                onClick={() => {
                  onMove(column.id)
                }}
              >
                {column.label}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Збій однієї колонки (SPEC §8.1, стан 8): решта дошки працює. */
export function ColumnError({
  column,
  error,
  onRetry,
}: {
  column: string
  error: unknown
  onRetry: () => void
}) {
  const t = useErpUiT(ukBoard)
  const kind = errorStateKind(error)
  return (
    <PageState
      kind={kind}
      compact
      title={t("board.columnFailed", { column })}
      onRetry={kind === "forbidden" ? undefined : onRetry}
    />
  )
}

/** Чи є що дозавантажити: інакше в колонки немає підвалу. */
export const hasMore = (column: BoardColumnData<unknown>) =>
  column.total !== undefined &&
  column.cards !== undefined &&
  column.cards.length < column.total

/**
 * «Показати ще» з оголошенням і фокусом після завантаження: поки колонка вантажить більшу сторінку, чекаємо;
 * далі «Показано N з M», а кнопки вже немає — фокус на меню першої нової картки.
 */
export function useLoadMore<T extends RaRecord>(
  data: readonly BoardColumnData<T>[],
  onMore: (column: string) => void,
  container: React.RefObject<HTMLElement | null>,
): (column: string) => void {
  const t = useErpUiT(ukBoard)
  const format = useFormat()
  const pending = React.useRef<{ column: string; shown: number }>(null)
  React.useLayoutEffect(() => {
    const target = pending.current
    if (!target) return
    const column = data.find(({ id }) => id === target.column)
    if (column?.isFetching) return
    pending.current = null
    if (!column?.cards || column.total === undefined) return
    announce(
      t("board.shown", {
        shown: format.number(column.cards.length),
        total: format.number(column.total),
      }),
    )
    const root = container.current
    const active = document.activeElement
    if (!root || (active && active !== document.body)) return
    const first = column.cards[target.shown]
    const menu = first
      ? root.querySelector<HTMLElement>(
          `[data-kanban-card="${CSS.escape(String(first.id))}"] [data-kanban-card-menu]`,
        )
      : null
    ;(
      menu ??
      root.querySelector<HTMLElement>(
        `[data-kanban-column="${CSS.escape(column.id)}"] h2`,
      )
    )?.focus()
  })
  return (column) => {
    pending.current = {
      column,
      shown: data.find(({ id }) => id === column)?.cards?.length ?? 0,
    }
    onMore(column)
  }
}

/** «Показати ще» з «Показано 20 з 87»; на межі сторінки сервера — порада уточнити фільтр. */
export function ColumnMore<T>({
  column,
  onMore,
}: {
  column: BoardColumnData<T>
  onMore: (column: string) => void
}) {
  const t = useErpUiT(ukBoard)
  const format = useFormat()
  if (!hasMore(column)) return null
  const shown = column.cards?.length ?? 0
  const values = {
    shown: format.number(shown),
    total: format.number(column.total ?? shown),
  }
  if (column.perPage >= MAX_PER_PAGE)
    return (
      <p className="text-sm text-muted-foreground">
        {t("board.limit", values)}
      </p>
    )
  return (
    <div className="space-y-1">
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        aria-disabled={column.isFetching || undefined}
        onClick={() => {
          if (!column.isFetching) onMore(column.id)
        }}
      >
        {column.isFetching ? <Spinner aria-hidden /> : null}
        {t("board.loadMore")}
      </Button>
      <p className="text-center text-xs text-muted-foreground tabular-nums">
        {t("board.shown", values)}
      </p>
    </div>
  )
}
