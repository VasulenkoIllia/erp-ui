/**
 * Чиста логіка таблиці даних (erp/data-table, ADR-0016) без React — щоб тестувати окремо.
 *
 * - Вікна: великий список вантажиться з сервера шматками по `WINDOW_SIZE` рядків (сторінки ADR-0002),
 *   лише ті, що видно, плюс запас `PREFETCH_ROWS`, щоб прокрутка не впиралась у порожні рядки.
 * - Розкладка колонок за шириною контейнера (SPEC §9): коли колонки не влазять, менш важливі
 *   (більший `priority`) переносяться під рядок чи ховаються; колонки «лишити» дають горизонтальну
 *   прокрутку з липкою колонкою-ідентифікатором.
 * - Навігація гріда з клавіатури за W3C APG Grid: стрілки, Home/End, Ctrl+Home/End, PageUp/PageDown.
 * - Опис колонки (`DataTableColumn`) і набір можливостей TanStack Table — спільні для гріда й карток.
 */
import {
  columnVisibilityFeature,
  rowSortingFeature,
  tableFeatures,
} from "@tanstack/react-table"
import type { ReactNode } from "react"

/** Можливості TanStack Table 9 у таблиці кіта: сортування (на сервері) і видимість колонок. */
export const DATA_TABLE_FEATURES = tableFeatures({
  rowSortingFeature,
  columnVisibilityFeature,
})
export type DataTableFeatures = typeof DATA_TABLE_FEATURES

/** Колонка таблиці: декларативно, з поведінкою на вузькому контейнері (SPEC §9). */
export interface DataTableColumn<T> {
  id: string
  /** Заголовок мовою інтерфейсу. */
  header: string
  cell: (row: T) => ReactNode
  /** Поле сортування на сервері (ADR-0002 `sort`); без нього колонка не сортується. */
  sortField?: string
  /** Перший напрям при виборі колонки: дати й суми — від більших. */
  firstSortOrder?: "ASC" | "DESC"
  align?: "start" | "end"
  /** Мінімальна ширина, rem (за замовчуванням 8); решту місця колонки ділять за `grow`. */
  minWidth?: number
  grow?: number
  /** 1 — найважливіша (за замовчуванням — порядок колонки). */
  priority?: number
  /** Коли не влазить: лишити (горизонтальна прокрутка), перенести під рядок, сховати. */
  overflow?: ColumnOverflow
  /** Липка колонка-ідентифікатор: лишається зліва при горизонтальній прокрутці. Лише перші колонки підряд (прапорець вибору, номер). */
  sticky?: boolean
  /**
   * Місце в картці на телефоні: назва, рядок під назвою, позначка поруч із назвою, поле, дії,
   * прапорець вибору перед назвою; `none` — не показувати. За замовчуванням перша колонка — назва,
   * решта — поля.
   */
  card?:
    "title" | "subtitle" | "badge" | "field" | "actions" | "select" | "none"
  /** Заголовок лише для скрінрідера (колонка дій). */
  headerHidden?: boolean
  /** Свій вміст заголовка замість назви (прапорець «вибрати все»); `header` — назва колонки. */
  renderHeader?: () => ReactNode
}

export const DEFAULT_MIN_WIDTH = 8

/** Вікно рядків, яких ще немає: вантажиться чи не вдалося (SPEC §8.1, стани 4 і 8). */
export type RowWindowState = {
  /** Перший і останній рядок вікна, з 0. */
  first: number
  last: number
} & (
  { status: "loading" } | { status: "error"; error: unknown; retry: () => void }
)

/** Що бачать грід і картки: рядок за номером, стан його вікна, межі списку. */
export interface DataTableSource<T> {
  rowCount: number
  rowAt: (index: number) => T | undefined
  windowAt: (index: number) => RowWindowState | undefined
  /** Які рядки видно (з 0, включно) — джерело вантажить їхні вікна. */
  setRange?: (start: number, end: number) => void
  /** Віртуальна прокрутка у власній області — для великого списку; інакше висота за вмістом. */
  virtual: boolean
  /** Скільки рядків списку до першого показаного (сторінка 2 по 20 — 20): для aria-rowindex. */
  rowOffset: number
  /** Усього рядків у списку (aria-rowcount, aria-setsize). */
  totalCount: number
  /** Змінюється з фільтром чи сортуванням: прокрутка й фокус — на початок. */
  listKey: string
}

/** Рядків в одному запиті до сервера. */
export const WINDOW_SIZE = 100
/** Скільки рядків за межами видимого вже має бути завантажено. */
export const PREFETCH_ROWS = 30

/** Номер вікна (сторінки ADR-0002, з 1) для рядка. */
export function windowOf(index: number, windowSize = WINDOW_SIZE): number {
  return Math.floor(index / windowSize) + 1
}

/**
 * Вікна, які покривають рядки [start, end] з запасом `prefetch`.
 * `rowCount` — якщо вже відомо, скільки рядків є: зайвих вікон за кінцем списку не просимо.
 */
export function windowsForRange(
  start: number,
  end: number,
  {
    windowSize = WINDOW_SIZE,
    prefetch = PREFETCH_ROWS,
    rowCount,
  }: { windowSize?: number; prefetch?: number; rowCount?: number } = {},
): number[] {
  return clampWindows(
    windowOf(Math.max(start - prefetch, 0), windowSize),
    windowOf(Math.max(end + prefetch, 0), windowSize),
    rowCount,
    windowSize,
  )
}

/** Вікна з `first` по `last`, без вікон за кінцем списку, коли `rowCount` уже відомо. */
export function clampWindows(
  first: number,
  last: number,
  rowCount: number | undefined,
  windowSize = WINDOW_SIZE,
): number[] {
  const lastWindow =
    rowCount === undefined
      ? Infinity
      : windowOf(Math.max(rowCount - 1, 0), windowSize)
  const from = Math.min(first, lastWindow)
  const to = Math.min(Math.max(last, from), lastWindow)
  return Array.from({ length: to - from + 1 }, (_, i) => from + i)
}

/**
 * Номери рядків для рендеру: видимі плюс рядок у фокусі, за порядком. Порядок у DOM — порядок
 * списку: скрінрідер читає рядки по черзі, а React не переставляє вузол, у якому фокус.
 */
export function withActiveRow(
  indexes: number[],
  activeIndex: number,
): number[] {
  if (activeIndex < 0 || indexes.includes(activeIndex)) return indexes
  return [...indexes, activeIndex].sort((a, b) => a - b)
}

/* ------------------------------ Розкладка колонок ----------------------------- */

/** Що робити з колонкою, коли вона не влазить у контейнер (SPEC §9). */
export type ColumnOverflow = "keep" | "wrap" | "hide"

export interface LayoutColumn {
  id: string
  /** Мінімальна ширина, rem. */
  minWidth: number
  /** 1 — найважливіша. */
  priority: number
  overflow: ColumnOverflow
}

export interface ColumnLayout {
  /** Колонки в рядку, у вихідному порядку. */
  inline: string[]
  /** Колонки, перенесені під рядок. */
  wrapped: string[]
  hidden: string[]
  /** Сума мінімальних ширин колонок у рядку, rem: більша за контейнер — горизонтальна прокрутка. */
  minWidth: number
}

/**
 * Які колонки лишаються в рядку, які переносяться під нього, які ховаються, якщо контейнер має
 * `available` rem. Першою поступається найменш важлива колонка (за рівного пріоритету — правіша).
 */
export function layoutColumns(
  columns: readonly LayoutColumn[],
  available: number,
): ColumnLayout {
  const inline = new Set(columns.map((column) => column.id))
  const wrapped = new Set<string>()
  const hidden = new Set<string>()
  const width = () =>
    columns.reduce(
      (sum, column) => sum + (inline.has(column.id) ? column.minWidth : 0),
      0,
    )
  while (width() > available) {
    let yielding: LayoutColumn | undefined
    for (const column of columns) {
      if (!inline.has(column.id) || column.overflow === "keep") continue
      if (!yielding || column.priority >= yielding.priority) yielding = column
    }
    if (!yielding) break
    inline.delete(yielding.id)
    ;(yielding.overflow === "wrap" ? wrapped : hidden).add(yielding.id)
  }
  const ordered = (set: Set<string>) =>
    columns.filter((column) => set.has(column.id)).map((column) => column.id)
  return {
    inline: ordered(inline),
    wrapped: ordered(wrapped),
    hidden: ordered(hidden),
    minWidth: width(),
  }
}

/**
 * Липкі колонки — перші підряд колонки рядка з `sticky` (прапорець вибору й номер): зсув кожної від
 * початку рядка й загальна ширина під `scroll-padding`, rem. Коли колонки ширші за контейнер, кожна
 * має мінімальну ширину, тож зсуви точні.
 */
export function stickyColumns(
  inline: readonly string[],
  columnOf: (
    id: string,
  ) => Pick<DataTableColumn<never>, "sticky" | "minWidth"> | undefined,
): { offsets: number[]; width: number } {
  const offsets: number[] = []
  let width = 0
  for (const id of inline) {
    const column = columnOf(id)
    if (!column?.sticky) break
    offsets.push(width)
    width += column.minWidth ?? DEFAULT_MIN_WIDTH
  }
  return { offsets, width }
}

/* ------------------------------ Навігація гріда ------------------------------ */

/** Позиція фокуса в гріді: `row` -1 — рядок заголовків, `col` — номер клітинки в рядку з 0. */
export interface GridPosition {
  row: number
  col: number
}

export interface GridBounds {
  rowCount: number
  colCount: number
  /** Скільки рядків видно — крок PageUp/PageDown. */
  pageRows: number
}

const NAVIGATION_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
])

export function isGridNavigationKey(key: string): boolean {
  return NAVIGATION_KEYS.has(key)
}

/** Куди перейти з `from` за клавішею (W3C APG Grid); null — клавіша не для навігації. */
export function moveInGrid(
  from: GridPosition,
  key: string,
  ctrl: boolean,
  { rowCount, colCount, pageRows }: GridBounds,
): GridPosition | null {
  const clampRow = (row: number) => Math.min(Math.max(row, -1), rowCount - 1)
  const clampCol = (col: number) =>
    Math.min(Math.max(col, 0), Math.max(colCount - 1, 0))
  const step = Math.max(pageRows, 1)
  switch (key) {
    case "ArrowUp":
      return { row: clampRow(from.row - 1), col: from.col }
    case "ArrowDown":
      return { row: clampRow(from.row + 1), col: from.col }
    case "ArrowLeft":
      return { row: from.row, col: clampCol(from.col - 1) }
    case "ArrowRight":
      return { row: from.row, col: clampCol(from.col + 1) }
    case "Home":
      return ctrl ? { row: -1, col: 0 } : { row: from.row, col: 0 }
    case "End":
      return ctrl
        ? { row: rowCount - 1, col: clampCol(colCount - 1) }
        : { row: from.row, col: clampCol(colCount - 1) }
    case "PageUp":
      // З першої сторінки — до першого рядка даних, а не на заголовки.
      return {
        row: from.row <= 0 ? -1 : Math.max(from.row - step, 0),
        col: from.col,
      }
    case "PageDown":
      return { row: clampRow(Math.max(from.row, 0) + step), col: from.col }
    default:
      return null
  }
}
