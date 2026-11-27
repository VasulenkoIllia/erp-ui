import * as React from "react"
import { ChevronsLeftIcon } from "lucide-react"

import type { KanbanColumn } from "@/registry/erp/kanban"
import {
  ANY_LANE,
  useCardDraggable,
  useCardDropTarget,
  type KanbanCardDrag,
} from "@/registry/erp/kanban-drag"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import { ukBoard } from "@/registry/lib/i18n-uk-board"
import { cn } from "@/registry/lib/utils"
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
 * Частина erp/kanban: шапка колонки (назва з кількістю, сума, згортання, швидке створення, стан),
 * перемикач колонки на вузькому контейнері, клітинка колонки в доріжці з картками; шапка й клітинка —
 * місця, куди кидають картку (erp/kanban-drag). Ставиться разом з erp/kanban.
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

/** Перетягування для клітинок і шапок: дошка, чи можна тягнути, що робити з кинутою карткою. */
export interface CellDrag<T> {
  board: string
  canDrag: (card: T) => boolean
  onDrop: (card: string, column: string) => void
}

/** Шапка колонки в рядку шапок: сюди теж кидають картку (доріжка не змінюється). */
export function HeadSlot<T>({
  column,
  drag,
  children,
}: {
  column: string
  drag: CellDrag<T> | undefined
  children: React.ReactNode
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  useCardDropTarget(
    ref,
    drag ? { board: drag.board, column, lane: ANY_LANE } : undefined,
    (card, to) => drag?.onDrop(card, to),
  )
  return (
    <div ref={ref} className={cn("min-w-0 rounded-lg", DROP_OVER)}>
      {children}
    </div>
  )
}

/** Підсвітка місця, над яким тримають картку (атрибут ставить erp/kanban-drag). */
const DROP_OVER =
  "data-drop-over:bg-accent data-drop-over:ring-2 data-drop-over:ring-primary data-drop-over:ring-inset"

export function ColumnCell<T>({
  column,
  cards,
  collapsed,
  laneId,
  laneLabel,
  headingId,
  getCardId,
  renderCard,
  cardKey,
  drag,
}: {
  column: KanbanColumn<T>
  cards: readonly T[] | undefined
  collapsed: boolean
  laneId: string
  laneLabel: string | undefined
  headingId: string
  getCardId: (card: T) => string
  renderCard: (card: T, column: KanbanColumn<T>) => React.ReactNode
  cardKey: ((card: T) => string) | undefined
  drag: CellDrag<T> | undefined
}) {
  const t = useErpUiT(ukBoard)
  const ref = React.useRef<HTMLDivElement>(null)
  const isTarget = Boolean(drag) && !collapsed && cards !== undefined
  useCardDropTarget(
    ref,
    drag && isTarget
      ? { board: drag.board, column: column.id, lane: laneId }
      : undefined,
    (card, to) => drag?.onDrop(card, to),
  )
  // Згорнута колонка чи ще без карток: клітинка порожня, усе видно в шапці.
  if (collapsed || cards === undefined) return <div className="min-w-0" />
  if (!cards.length)
    return (
      <div
        ref={ref}
        data-kanban-cell={column.id}
        data-kanban-lane={laneId}
        className={cn(
          "min-w-0 rounded-lg border border-dashed p-3 text-sm text-muted-foreground",
          DROP_OVER,
        )}
      >
        {laneLabel === undefined ? t("board.noCards") : null}
      </div>
    )
  const name =
    laneLabel === undefined
      ? { "aria-labelledby": headingId }
      : {
          "aria-label": t("board.cell", {
            column: column.label,
            lane: laneLabel,
          }),
        }
  return (
    <div
      ref={ref}
      data-kanban-cell={column.id}
      data-kanban-lane={laneId}
      className={cn("min-w-0 rounded-lg", DROP_OVER)}
    >
      <ul
        {...name}
        data-kanban-cards={column.id}
        data-kanban-lane={laneId}
        className="flex min-w-0 flex-col gap-2"
      >
        {cards.map((card) => (
          <CardItem
            key={getCardId(card)}
            id={getCardId(card)}
            drag={
              drag?.canDrag(card)
                ? {
                    board: drag.board,
                    id: getCardId(card),
                    column: column.id,
                    lane: laneId,
                  }
                : undefined
            }
          >
            <CardBody
              card={card}
              column={column.id}
              stateKey={cardKey?.(card)}
              render={() => renderCard(card, column)}
            />
          </CardItem>
        ))}
      </ul>
    </div>
  )
}

/**
 * Вміст картки: без ключа стану — щоразу, з ключем — лише за новим записом, колонкою чи ключем (`cardKey`).
 */
const CardBody = React.memo(
  function CardBody({
    render,
  }: {
    card: unknown
    column: string
    stateKey: string | undefined
    render: () => React.ReactNode
  }) {
    return render()
  },
  (previous, next) =>
    next.stateKey !== undefined &&
    previous.card === next.card &&
    previous.column === next.column &&
    previous.stateKey === next.stateKey,
)

function CardItem({
  id,
  drag,
  children,
}: {
  id: string
  drag: KanbanCardDrag | undefined
  children: React.ReactNode
}) {
  const ref = React.useRef<HTMLLIElement>(null)
  useCardDraggable(ref, drag)
  return (
    <li
      ref={ref}
      data-kanban-card={id}
      className={cn(
        "rounded-lg data-dragging:opacity-40",
        // Довгий натиск на телефоні — перетягування, а не меню посилання чи зображення.
        drag && "cursor-grab [-webkit-touch-callout:none]",
      )}
    >
      {children}
    </li>
  )
}
