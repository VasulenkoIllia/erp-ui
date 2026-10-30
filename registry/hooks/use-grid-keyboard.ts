/**
 * Клавіатура гріда за W3C APG Grid (SPEC §10) для erp/data-table.
 *
 * - Одна зупинка Tab: `tabindex="0"` має лише активна клітинка, решта клітинок і елементів у них — -1
 *   (клітинки при цьому фокусуються кліком).
 * - Клітинка з одним елементом (кнопка сортування, «Редагувати») фокусує сам елемент; з кількома —
 *   клітинку, Enter чи F2 переводить фокус в перший елемент, і тоді Tab ходить між елементами
 *   клітинки; Esc чи вихід фокуса з клітинки повертає одну зупинку на клітинку.
 * - Клавіші, які вже обробив елемент у клітинці (меню, поле), грід не перехоплює.
 * - Стрілки, Home/End (рядок), Ctrl+Home/End (увесь грід), PageUp/PageDown — `moveInGrid`.
 *   Віртуальний рядок, куди переходить фокус, рендериться одразу (`activeRow` → rangeExtractor),
 *   тож Ctrl+End веде на рядок 10 000 без прокрутки всіх проміжних.
 * - Клітинки позначені `data-cell`, `data-row` (-1 — заголовки), `data-col`.
 */
import * as React from "react"
import { flushSync } from "react-dom"

import {
  isGridNavigationKey,
  moveInGrid,
  type GridPosition,
} from "@/registry/lib/data-table-core"
import { isShortcutKey, SHORTCUTS } from "@/registry/lib/shortcuts"

/** `data-grid-skip` — фокусоване лише програмно (оболонка редактора), не зупинка Tab клітинки. */
const FOCUSABLE =
  "a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([data-cell]):not([data-grid-skip])"
/** Елементи, яким потрібні стрілки й Home/End самі: навігацію гріда тоді не перехоплюємо. */
const TEXT_ENTRY =
  "input:not([type=checkbox]):not([type=radio]):not([type=button]), textarea, select, [contenteditable=''], [contenteditable='true'], [role=combobox], [role=textbox], [aria-expanded=true]"

function widgetsIn(cell: HTMLElement): HTMLElement[] {
  // Прихований <input> поруч із прапорцем Base UI (aria-hidden) — не елемент клітинки.
  return [...cell.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) =>
      el.closest("[data-cell]") === cell &&
      el.getAttribute("aria-hidden") !== "true",
  )
}

/** Куди ставити фокус у клітинці: єдиний елемент або сама клітинка. */
function targetOf(cell: HTMLElement): HTMLElement {
  const widgets = widgetsIn(cell)
  return widgets.length === 1 && widgets[0] ? widgets[0] : cell
}

/** Фокус в одному з кількох елементів клітинки: Tab ходить між ними. */
function isInsideCell(cell: HTMLElement, focused: Element | null): boolean {
  return (
    focused instanceof HTMLElement &&
    focused !== cell &&
    cell.contains(focused) &&
    targetOf(cell) === cell
  )
}

/** Одна зупинка Tab у клітинці або, коли фокус усередині, — усі її елементи (сама клітинка — ні). */
function setCellStops(cell: HTMLElement, inside: boolean) {
  for (const widget of widgetsIn(cell)) widget.tabIndex = inside ? 0 : -1
  if (inside) cell.tabIndex = -1
  else targetOf(cell).tabIndex = 0
}

/** Тихо -1 усім клітинкам і їхнім елементам; атрибут ставиться й `div`, щоб клітинка фокусувалась кліком. */
function resetStops(grid: HTMLElement) {
  for (const el of grid.querySelectorAll<HTMLElement>(
    `[data-cell], [data-cell] :is(${FOCUSABLE})`,
  ))
    if (el.getAttribute("tabindex") !== "-1") el.tabIndex = -1
}

function positionOf(cell: HTMLElement): GridPosition {
  return { row: Number(cell.dataset.row), col: Number(cell.dataset.col) }
}

function cellAt(grid: HTMLElement, { row, col }: GridPosition) {
  // Рядок без такої клітинки (рядок помилки вікна) — його перша клітинка.
  return (
    grid.querySelector<HTMLElement>(
      `[data-cell][data-row="${String(row)}"][data-col="${String(col)}"]`,
    ) ??
    grid.querySelector<HTMLElement>(`[data-cell][data-row="${String(row)}"]`)
  )
}

export interface GridKeyboardOptions {
  gridRef: React.RefObject<HTMLElement | null>
  /** Новий фільтр чи сортування — активна клітинка повертається в рядок заголовків. */
  listKey: string
  rowCount: number
  colCount: number
  /** Клітинок у рядку заголовків (перенесені колонки там не видно). */
  headerColCount: number
  /** Скільки рядків видно — крок PageUp/PageDown (читається в момент натискання). */
  pageRows: () => number
}

export function useGridKeyboard({
  gridRef,
  listKey,
  rowCount,
  colCount,
  headerColCount,
  pageRows,
}: GridKeyboardOptions) {
  const [active, setActive] = React.useState<GridPosition>({ row: -1, col: 0 })
  const [shownKey, setShownKey] = React.useState(listKey)
  if (shownKey !== listKey) {
    setShownKey(listKey)
    if (active.row >= 0) setActive({ row: -1, col: active.col })
  }
  const activeRow = Math.min(active.row, rowCount - 1)

  // Фокус у гріді: якщо його вузол зник (вміст клітинки перемонтувався, рядок оновився), фокус
  // повертається в активну клітинку, а не в <body>.
  const hasFocus = React.useRef(false)
  React.useLayoutEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    resetStops(grid)
    const cell =
      cellAt(grid, { row: activeRow, col: active.col }) ??
      grid.querySelector<HTMLElement>("[data-cell]")
    if (!cell) return
    setCellStops(cell, isInsideCell(cell, document.activeElement))
    const lost =
      !document.activeElement || document.activeElement === document.body
    if (hasFocus.current && lost) targetOf(cell).focus({ preventScroll: true })
  })

  const onBlur = (event: React.FocusEvent<HTMLElement>) => {
    const to = event.relatedTarget
    // Фокус пішов «у нікуди», а вузол лишився — людина пішла сама; вузол зник — повернемо.
    if (to ? !gridRef.current?.contains(to) : event.target.isConnected)
      hasFocus.current = false
    // Фокус вийшов із клітинки з кількома елементами — знову одна зупинка. Повернення з меню
    // (портал) знову відкриє елементи в onFocus.
    const cell = event.target.closest<HTMLElement>("[data-cell]")
    if (!cell || cell.contains(to) || targetOf(cell) !== cell) return
    if (!widgetsIn(cell).some((widget) => widget.tabIndex === 0)) return
    const pos = positionOf(cell)
    if (pos.row === activeRow && pos.col === active.col)
      setCellStops(cell, false)
    else for (const widget of widgetsIn(cell)) widget.tabIndex = -1
  }

  const onFocus = (event: React.FocusEvent<HTMLElement>) => {
    hasFocus.current = true
    const cell = event.target.closest<HTMLElement>("[data-cell]")
    if (!cell || !gridRef.current?.contains(cell)) return
    // Повернення з меню чи клік на елемент клітинки з кількома елементами — Tab між ними.
    if (isInsideCell(cell, event.target)) setCellStops(cell, true)
    const pos = positionOf(cell)
    setActive((current) =>
      current.row === pos.row && current.col === pos.col ? current : pos,
    )
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const grid = gridRef.current
    const target = event.target as HTMLElement
    const cell = target.closest<HTMLElement>("[data-cell]")
    if (
      !grid ||
      !cell ||
      !grid.contains(cell) ||
      event.defaultPrevented ||
      event.altKey ||
      event.metaKey
    )
      return
    const inWidget = target !== cell
    if (inWidget && targetOf(cell) !== target) {
      // Клітинка з кількома елементами: Tab ходить між ними, Esc — назад на клітинку.
      if (isShortcutKey(SHORTCUTS.gridExit, event.key)) {
        event.preventDefault()
        setCellStops(cell, false)
        cell.focus()
      }
      return
    }
    if (!inWidget && isShortcutKey(SHORTCUTS.gridEnter, event.key)) {
      const first = widgetsIn(cell)[0]
      if (first) {
        event.preventDefault()
        setCellStops(cell, true)
        first.focus()
      }
      return
    }
    if (inWidget && target.matches(TEXT_ENTRY)) return
    if (!isGridNavigationKey(event.key)) return
    const next = moveInGrid(positionOf(cell), event.key, event.ctrlKey, {
      rowCount,
      colCount,
      pageRows: pageRows(),
    })
    if (!next) return
    if (next.row === -1) next.col = Math.min(next.col, headerColCount - 1)
    event.preventDefault()
    // Рядок має з'явитись у DOM до фокуса: віртуальний список рендерить його синхронно.
    flushSync(() => {
      setActive(next)
    })
    const nextCell = cellAt(grid, next)
    if (!nextCell) return
    targetOf(nextCell).focus({ preventScroll: true })
    // Липку шапку видно завжди: перехід на неї з даних (Ctrl+Home, PageUp) — ще й до першого рядка.
    if (next.row === -1 && positionOf(cell).row !== -1)
      grid.scrollTo({ top: 0 })
    nextCell.scrollIntoView({ block: "nearest", inline: "nearest" })
  }

  return { activeRow, onFocus, onBlur, onKeyDown }
}
