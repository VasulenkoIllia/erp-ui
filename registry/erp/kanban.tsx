import * as React from "react"

import { ColumnHead, ColumnSwitch } from "@/registry/erp/kanban-column"
import { remPx, useElementSize } from "@/registry/hooks/use-element-size"
import { useErpUiT } from "@/registry/lib/i18n"
import { ukBoard } from "@/registry/lib/i18n-uk-board"
import { cn } from "@/registry/lib/utils"

/**
 * Дошка-канбан (SPEC §7 Board, §9, §10; UI07, ADR-0100) — вигляд без даних: колонки з назвою, кількістю
 * й сумою, доріжки, згортання колонки, місце для швидкого створення, картки. Дані, права й дії дає
 * templates/board (подання List Report) чи сторінка проекту зі своїм сервером; картка — `KanbanCard`
 * (erp/kanban-card), швидке створення — `KanbanQuickCreate` (erp/kanban-quick-create).
 *
 * - Ширина контейнера, а не вікна (SPEC §9): вужче за `KANBAN_NARROW_REM` — одна колонка з перемикачем
 *   «Колонка» (`narrow` з `useKanbanNarrow`); згортання там не діє, бо колонка одна.
 * - Колонка — заголовок h2 з кількістю, під ним сума й швидке створення; картки — список із назвою
 *   колонки (з доріжками — «колонка, доріжка»). Доріжки — рядки дошки з заголовком h3; картка з
 *   доріжкою поза переліком — у доріжці «Інше» в кінці.
 * - Згорнута колонка — вузька смужка з кнопкою «Розгорнути» (назва й кількість); фокус переходить на
 *   кнопку-пару, а не губиться (WCAG 2.4.3).
 * - Поки картки колонки вантажаться — скелетон у ній; стан колонки (помилка з повтором) — під шапкою.
 * - Перетягування немає: картку переносить меню «Перемістити в…» картки (SPEC §9, WCAG 2.5.7).
 */

/** Вужче за цю ширину контейнера, rem, — одна колонка з перемикачем (SPEC §9). */
export const KANBAN_NARROW_REM = 42
/** Найменша ширина розгорнутої колонки, rem; ширші контейнери ділять місце порівну. */
const COLUMN_MIN_REM = 16
/** Ширина згорнутої колонки, rem. */
const COLLAPSED_REM = 3
/** Ключ доріжки «Інше»: картки з доріжкою, якої немає в переліку; модуль такого ключа не дає. */
const OTHER_LANE = "erp-ui:other-lane"

export interface KanbanColumn<T> {
  id: string
  label: string
  /** Карток у колонці за фільтром; `undefined` — ще невідомо. */
  total?: number
  /** Сума колонки готовим текстом: «340 000,00 ₴». */
  summary?: string
  /** Завантажені картки; `undefined` — ще вантажаться (скелетон). */
  cards?: readonly T[]
  /** Під шапкою, над картками: швидке створення. */
  header?: React.ReactNode
  /** Стан колонки замість скелетона: помилка з повтором; завантажені картки лишаються під ним. */
  state?: React.ReactNode
  /** Під картками: «Показати ще», «Показано 500 з 812». */
  footer?: React.ReactNode
}

export interface KanbanLane {
  id: string
  label: string
}

export interface KanbanLanes<T> {
  items: readonly KanbanLane[]
  /** Доріжка картки; невідома — «Інше». */
  of: (card: T) => string
}

export interface KanbanProps<T> {
  /** Назва дошки для скрінрідера: «Угоди». */
  label: string
  columns: readonly KanbanColumn<T>[]
  getCardId: (card: T) => string
  renderCard: (card: T, column: KanbanColumn<T>) => React.ReactNode
  lanes?: KanbanLanes<T>
  /** Згорнуті колонки (на широкому контейнері). */
  collapsed?: ReadonlySet<string>
  /** Без нього кнопок згортання немає. */
  onCollapsedChange?: (column: string, collapsed: boolean) => void
  /** Вузький контейнер — одна колонка з перемикачем (`useKanbanNarrow`). */
  narrow: boolean
  /** Іде оновлення даних: `aria-busy`. */
  busy?: boolean
  className?: string
}

/** Чи контейнер `ref` вужчий за `KANBAN_NARROW_REM`; до першого виміру — ні. */
export function useKanbanNarrow(
  ref: React.RefObject<HTMLElement | null>,
): boolean {
  const width = useElementSize(ref, "width")
  return width !== null && width / remPx() < KANBAN_NARROW_REM
}

const NONE: ReadonlySet<string> = new Set()

export function Kanban<T>({
  label,
  columns,
  getCardId,
  renderCard,
  lanes,
  collapsed = NONE,
  onCollapsedChange,
  narrow,
  busy = false,
  className,
}: KanbanProps<T>) {
  const t = useErpUiT(ukBoard)
  const root = React.useRef<HTMLElement>(null)
  const ids = React.useId()
  const [active, setActive] = React.useState<string | undefined>()
  const activeColumn =
    columns.find((column) => column.id === active) ?? columns[0]
  const shown = narrow ? (activeColumn ? [activeColumn] : []) : columns
  const isCollapsed = (column: KanbanColumn<T>) =>
    !narrow && collapsed.has(column.id)
  // Кнопка згортання зникає разом зі станом — після рендеру нового стану фокус на кнопку-пару в тій
  // самій колонці.
  const focusToggle = React.useRef<{ column: string; collapsed: boolean }>(null)
  React.useLayoutEffect(() => {
    const pending = focusToggle.current
    if (!pending || collapsed.has(pending.column) !== pending.collapsed) return
    focusToggle.current = null
    root.current
      ?.querySelector<HTMLElement>(
        `[data-kanban-toggle="${CSS.escape(pending.column)}"]`,
      )
      ?.focus()
  })
  const toggle = onCollapsedChange
    ? (column: string, value: boolean) => {
        focusToggle.current = { column, collapsed: value }
        onCollapsedChange(column, value)
      }
    : undefined
  const rows = laneRows(shown, lanes, t("board.otherLane"))
  const template = shown
    .map((column) =>
      isCollapsed(column)
        ? `${String(COLLAPSED_REM)}rem`
        : `minmax(${String(COLUMN_MIN_REM)}rem, 1fr)`,
    )
    .join(" ")
  // Id назви — з порядкового номера: ключ колонки може мати пробіл, а `aria-labelledby` — це список id.
  const headingIds = new Map(
    shown.map((column, index) => [column.id, `${ids}-${String(index)}`]),
  )
  const headingId = (column: string) => headingIds.get(column) ?? ids
  const hasFooter = shown.some(
    (column) => column.footer && !isCollapsed(column),
  )

  return (
    <section
      ref={root}
      aria-label={label}
      aria-busy={busy}
      data-slot="kanban"
      className={cn("min-w-0 space-y-3", className)}
    >
      {narrow && columns.length > 1 && activeColumn ? (
        <ColumnSwitch
          columns={columns}
          value={activeColumn.id}
          onValueChange={setActive}
        />
      ) : null}
      <div className="overflow-x-auto pb-2">
        <div
          className="grid gap-x-3 gap-y-2"
          style={{ gridTemplateColumns: narrow ? "minmax(0, 1fr)" : template }}
        >
          {shown.map((column) => (
            <ColumnHead
              key={column.id}
              column={column}
              headingId={headingId(column.id)}
              collapsed={isCollapsed(column)}
              onToggle={narrow ? undefined : toggle}
            />
          ))}
          {rows.map((row) => (
            <React.Fragment key={row.id}>
              {row.lane ? (
                <h3 className="col-span-full pt-2 text-sm font-medium break-words">
                  {row.lane}
                </h3>
              ) : null}
              {shown.map((column) => (
                <ColumnCell
                  key={column.id}
                  column={column}
                  cards={row.cards.get(column.id)}
                  collapsed={isCollapsed(column)}
                  laneLabel={row.lane}
                  headingId={headingId(column.id)}
                  getCardId={getCardId}
                  renderCard={renderCard}
                />
              ))}
            </React.Fragment>
          ))}
          {hasFooter
            ? shown.map((column) => (
                <div key={column.id} className="min-w-0">
                  {isCollapsed(column) ? null : column.footer}
                </div>
              ))
            : null}
        </div>
      </div>
    </section>
  )
}

interface LaneRow<T> {
  id: string
  /** Назва доріжки; без доріжок — `undefined` (один рядок без заголовка). */
  lane?: string
  /** Картки колонки в цій доріжці; `undefined` — колонка ще вантажиться. */
  cards: Map<string, readonly T[] | undefined>
}

/** Рядки дошки: доріжки з переліку, «Інше» (якщо в ньому є картки) чи один рядок без доріжок. */
function laneRows<T>(
  columns: readonly KanbanColumn<T>[],
  lanes: KanbanLanes<T> | undefined,
  otherLabel: string,
): LaneRow<T>[] {
  if (!lanes)
    return [
      {
        id: "",
        cards: new Map(columns.map((column) => [column.id, column.cards])),
      },
    ]
  const known = new Set(lanes.items.map((lane) => lane.id))
  const laneOf = (card: T) => {
    const id = lanes.of(card)
    return known.has(id) ? id : OTHER_LANE
  }
  const rows = [...lanes.items, { id: OTHER_LANE, label: otherLabel }].map(
    (lane): LaneRow<T> => ({
      id: lane.id,
      lane: lane.label,
      cards: new Map(
        columns.map((column) => [
          column.id,
          column.cards?.filter((card) => laneOf(card) === lane.id),
        ]),
      ),
    }),
  )
  const other = rows.at(-1)
  const hasOther = columns.some((column) =>
    column.cards?.some((card) => laneOf(card) === OTHER_LANE),
  )
  return hasOther && other ? rows : rows.slice(0, -1)
}

function ColumnCell<T>({
  column,
  cards,
  collapsed,
  laneLabel,
  headingId,
  getCardId,
  renderCard,
}: {
  column: KanbanColumn<T>
  cards: readonly T[] | undefined
  collapsed: boolean
  laneLabel: string | undefined
  headingId: string
  getCardId: (card: T) => string
  renderCard: (card: T, column: KanbanColumn<T>) => React.ReactNode
}) {
  const t = useErpUiT(ukBoard)
  // Згорнута колонка чи ще без карток: клітинка порожня, усе видно в шапці.
  if (collapsed || cards === undefined) return <div className="min-w-0" />
  if (!cards.length)
    return (
      <div className="min-w-0 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
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
    <ul
      {...name}
      data-kanban-cards={column.id}
      className="flex min-w-0 flex-col gap-2"
    >
      {cards.map((card) => (
        <li key={getCardId(card)} data-kanban-card={getCardId(card)}>
          {renderCard(card, column)}
        </li>
      ))}
    </ul>
  )
}
