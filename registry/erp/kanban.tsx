import * as React from "react"

import {
  ColumnCell,
  ColumnHead,
  ColumnSwitch,
  HeadSlot,
  type CellDrag,
} from "@/registry/erp/kanban-column"
import { useBoardAutoScroll } from "@/registry/erp/kanban-drag"
import { onKanbanKeyDown } from "@/registry/erp/kanban-keyboard"
import {
  remPx,
  useElementSize,
  useFillHeight,
} from "@/registry/hooks/use-element-size"
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
 * - Перетягування (`drag`, erp/kanban-drag, ADR-0103): картку кидають у клітинку колонки своєї доріжки чи
 *   на шапку колонки (і згорнутої); на вузькому контейнері колонка одна, тож перетягування немає. Меню
 *   «Перемістити в…» картки лишається (SPEC §9, WCAG 2.5.7).
 * - Стрілки між картками — erp/kanban-keyboard.
 * - На широкому контейнері дошка прокручується сама до низу екрана (`useFillHeight`, як таблиця): шапки
 *   колонок лишаються вгорі, назви доріжок — ліворуч, а фокус не ховається під шапками (WCAG 2.4.11).
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

export interface KanbanDrag<T> {
  /** Чи можна тягнути картку: право, позначка запису, картка зайнята. */
  canDrag: (card: T) => boolean
  /** Картку кинули в колонку. */
  onDrop: (card: T, column: string) => void
}

export interface KanbanProps<T> {
  /** Назва дошки для скрінрідера: «Угоди». */
  label: string
  columns: readonly KanbanColumn<T>[]
  getCardId: (card: T) => string
  renderCard: (card: T, column: KanbanColumn<T>) => React.ReactNode
  /**
   * Стан картки поза записом (вибрана, переноситься): з ним картка перемальовується, лише коли змінився запис,
   * колонка чи цей ключ (ADR-0103), і колонка на 500 карток не рендериться вся на кожну дію. Тоді `renderCard`
   * бере з-поза запису лише те, що є в ключі, а мову й формат — хуками в компонентах картки. Колонку картка
   * бачить за `id`: назва, кількість і сума колонки в ключ не входять.
   */
  cardKey?: (card: T) => string
  lanes?: KanbanLanes<T>
  /** Згорнуті колонки (на широкому контейнері). */
  collapsed?: ReadonlySet<string>
  /** Без нього кнопок згортання немає. */
  onCollapsedChange?: (column: string, collapsed: boolean) => void
  /** Вузький контейнер — одна колонка з перемикачем (`useKanbanNarrow`). */
  narrow: boolean
  /** Іде оновлення даних: `aria-busy`. */
  busy?: boolean
  /** Перетягування карток; без нього картки переносить лише меню. */
  drag?: KanbanDrag<T>
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
  cardKey,
  lanes,
  collapsed = NONE,
  onCollapsedChange,
  narrow,
  busy = false,
  drag,
  className,
}: KanbanProps<T>) {
  const t = useErpUiT(ukBoard)
  const root = React.useRef<HTMLElement>(null)
  const scroller = React.useRef<HTMLDivElement>(null)
  const headRow = React.useRef<HTMLDivElement>(null)
  const ids = React.useId()
  const fillHeight = useFillHeight(scroller, !narrow)
  const headHeight = useElementSize(headRow, "height")
  const board = drag && !narrow ? ids : undefined
  useBoardAutoScroll(scroller, board)
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
  const cellDrag: CellDrag<T> | undefined =
    drag && board !== undefined
      ? {
          board,
          canDrag: drag.canDrag,
          onDrop: (id, column) => {
            const card = columns
              .flatMap((each) => each.cards ?? [])
              .find((each) => getCardId(each) === id)
            if (card) drag.onDrop(card, column)
          },
        }
      : undefined

  return (
    <section
      ref={root}
      aria-label={label}
      aria-busy={busy}
      data-slot="kanban"
      className={cn("min-w-0 space-y-3", className)}
      onKeyDownCapture={onKanbanKeyDown}
    >
      {narrow && columns.length > 1 && activeColumn ? (
        <ColumnSwitch
          columns={columns}
          value={activeColumn.id}
          onValueChange={setActive}
        />
      ) : null}
      <div
        ref={scroller}
        data-slot="kanban-scroll"
        className="pb-2"
        // Прокрутка інлайн: автопрокрутка перетягування перевіряє її за обчисленим стилем (і в тестах).
        style={{
          overflowX: "auto",
          maxHeight: fillHeight,
          ...(headHeight ? { scrollPaddingTop: headHeight } : {}),
        }}
      >
        <div
          className="grid gap-x-3 gap-y-2"
          style={{ gridTemplateColumns: narrow ? "minmax(0, 1fr)" : template }}
        >
          {/* Один липкий рядок шапок із непрозорим тлом: картки під ним не просвічують (ADR-0103). */}
          <div
            ref={headRow}
            className="sticky top-0 z-10 col-span-full grid grid-cols-subgrid bg-background"
          >
            {shown.map((column) => (
              <HeadSlot
                key={column.id}
                column={column.id}
                // Колонка без завантажених карток (скелетон, помилка) картку не приймає: та зникла б до відповіді.
                drag={column.cards === undefined ? undefined : cellDrag}
              >
                <ColumnHead
                  column={column}
                  headingId={headingId(column.id)}
                  collapsed={isCollapsed(column)}
                  onToggle={narrow ? undefined : toggle}
                />
              </HeadSlot>
            ))}
          </div>
          {rows.map((row) => (
            <React.Fragment key={row.id}>
              {row.lane ? (
                <h3 className="col-span-full pt-2 text-sm font-medium break-words">
                  {/* Назва доріжки лишається ліворуч, коли дошку гортають убік. */}
                  <span className="sticky start-0 inline-block max-w-full">
                    {row.lane}
                  </span>
                </h3>
              ) : null}
              {shown.map((column) => (
                <ColumnCell
                  key={column.id}
                  column={column}
                  cards={row.cards.get(column.id)}
                  collapsed={isCollapsed(column)}
                  laneId={row.id}
                  laneLabel={row.lane}
                  headingId={headingId(column.id)}
                  getCardId={getCardId}
                  renderCard={renderCard}
                  cardKey={cardKey}
                  drag={cellDrag}
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
