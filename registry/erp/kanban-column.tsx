import * as React from "react"
import { ChevronsLeftIcon } from "lucide-react"

import type { KanbanColumn } from "@/registry/erp/kanban"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import { ukBoard } from "@/registry/lib/i18n-uk-board"
import { Button } from "@/registry/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/registry/ui/select"
import { Skeleton } from "@/registry/ui/skeleton"

/**
 * Частина erp/kanban: шапка колонки (назва з кількістю, сума, згортання, швидке створення, стан) і
 * перемикач колонки на вузькому контейнері. Ставиться разом з erp/kanban.
 */

const SKELETON_CARDS = 3

export function ColumnSwitch<T>({
  columns,
  value,
  onValueChange,
}: {
  columns: readonly KanbanColumn<T>[]
  value: string
  onValueChange: (column: string) => void
}) {
  const t = useErpUiT(ukBoard)
  const format = useFormat()
  const id = React.useId()
  const items = columns.map((column) => ({
    value: column.id,
    label:
      column.total === undefined
        ? column.label
        : t("board.columnOption", {
            column: column.label,
            value: format.number(column.total),
          }),
  }))
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {t("board.column")}
      </label>
      <Select
        items={items}
        value={value}
        onValueChange={(next: string | null) => {
          if (next) onValueChange(next)
        }}
      >
        <SelectTrigger id={id} className="min-w-0 flex-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function ColumnHead<T>({
  column,
  headingId,
  collapsed,
  onToggle,
}: {
  column: KanbanColumn<T>
  headingId: string
  collapsed: boolean
  onToggle: ((column: string, collapsed: boolean) => void) | undefined
}) {
  const t = useErpUiT(ukBoard)
  const format = useFormat()
  const total =
    column.total === undefined ? undefined : format.number(column.total)
  if (collapsed)
    return (
      <div data-kanban-column={column.id} className="min-w-0">
        <Button
          variant="ghost"
          data-kanban-toggle={column.id}
          aria-label={t("board.expand", {
            column: column.label,
            count: column.total ?? 0,
            value: total ?? "",
          })}
          className="h-auto w-full flex-col justify-start gap-2 rounded-lg border bg-muted/40 px-0 py-3 [writing-mode:vertical-rl]"
          onClick={() => onToggle?.(column.id, false)}
        >
          <span className="break-words">{column.label}</span>
          {/* Пробіл між назвою й числом: видимий текст «Програно 3» має збігатися з назвою кнопки (WCAG 2.5.3). */}
          {total === undefined ? null : (
            <>
              {" "}
              <span className="text-muted-foreground tabular-nums">
                {total}
              </span>
            </>
          )}
        </Button>
      </div>
    )
  return (
    <div
      data-kanban-column={column.id}
      className="min-w-0 space-y-2 rounded-lg border bg-muted/40 p-2"
    >
      <div className="flex items-start gap-2">
        <h2
          id={headingId}
          tabIndex={-1}
          className="flex min-w-0 flex-1 items-baseline gap-2 text-sm font-medium break-words outline-none"
        >
          <span className="min-w-0">{column.label}</span>
          {total === undefined ? null : (
            <span className="text-muted-foreground tabular-nums">
              <span className="sr-only">, </span>
              {total}
            </span>
          )}
        </h2>
        {onToggle ? (
          <Button
            variant="ghost"
            size="icon-sm"
            data-kanban-toggle={column.id}
            aria-label={t("board.collapse", { column: column.label })}
            className="touch-target relative"
            onClick={() => {
              onToggle(column.id, true)
            }}
          >
            <ChevronsLeftIcon aria-hidden />
          </Button>
        ) : null}
      </div>
      {column.summary ? (
        <p className="text-sm font-medium tabular-nums">{column.summary}</p>
      ) : null}
      {column.header}
      {column.state ?? (column.cards === undefined ? <CardsSkeleton /> : null)}
    </div>
  )
}

function CardsSkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: SKELETON_CARDS }, (_, index) => (
        <Skeleton key={index} className="h-16 w-full rounded-lg" />
      ))}
    </div>
  )
}
