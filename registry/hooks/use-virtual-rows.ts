/**
 * Віртуальні рядки erp/data-table — спільне для гріда й карток (ADR-0016), на TanStack Virtual.
 *
 * - Рядок у фокусі лишається в DOM, навіть прокручений геть, на своєму місці за порядком
 *   (`withActiveRow`).
 * - Видимі рядки → `source.setRange`. Новий список (фільтр, сортування) — прокрутка на початок і
 *   перші рядки, а не діапазон старого списку: інакше пішли б запити вікон із середини нового.
 * - Якір на рядку у фокусі: коли рядки над ним змінюють висоту (вікно довантажилось, перенесені
 *   колонки), прокрутка зсувається разом із ними, тож рядок у фокусі не виїжджає з екрана
 *   (Ctrl+End на рядок 10 000; WCAG 2.4.11).
 * - Невдале вікно — повідомлення з повтором лише в першому показаному рядку цього вікна.
 */
import * as React from "react"
import {
  defaultRangeExtractor,
  useVirtualizer,
  type Range,
  type VirtualItem,
  type Virtualizer,
} from "@tanstack/react-virtual"

import {
  withActiveRow,
  type DataTableSource,
} from "@/registry/lib/data-table-core"

export interface VirtualRowsOptions<T> {
  source: DataTableSource<T>
  scrollRef: React.RefObject<HTMLDivElement | null>
  /** Рядок, що має фокус (roving tabindex); -1 — жоден. */
  activeIndex: number
  /** Орієнтовна висота рядка, px: до вимірювання. */
  estimateSize: number
  overscan: number
  gap?: number
  /** Висота липкої шапки над рядками, px: рядки починаються під нею. */
  headerHeight?: number
}

export interface VirtualRow {
  index: number
  key: React.Key
  start: number
}

/** Рядки, де показати збій вікна з повтором: перший показаний рядок кожного невдалого вікна. */
function failedWindowRows<T>(
  items: readonly VirtualRow[],
  source: DataTableSource<T>,
): Set<number> {
  const windows = new Set<number>()
  const rows = new Set<number>()
  for (const item of items) {
    const state = source.windowAt(item.index)
    if (state?.status !== "error" || windows.has(state.first)) continue
    windows.add(state.first)
    rows.add(item.index)
  }
  return rows
}

/** Чи зсувати прокрутку, коли рядок `item` змінив висоту: якір — рядок у фокусі, якщо його видно. */
function adjustsScroll<TItem extends Element>(
  item: VirtualItem,
  instance: Virtualizer<HTMLDivElement, TItem>,
  activeIndex: number,
): boolean {
  const offset = instance.scrollOffset ?? 0
  const range = instance.range
  const focused =
    instance.scrollElement?.contains(document.activeElement) === true
  if (
    focused &&
    range &&
    activeIndex >= range.startIndex &&
    activeIndex <= range.endIndex
  )
    return item.index < activeIndex
  // Як за замовчуванням у TanStack Virtual: лише рядки над видимою областю.
  return instance.itemSizeCache.has(item.key)
    ? item.end <= offset && instance.scrollDirection !== "backward"
    : item.start < offset
}

export function useVirtualRows<T, TItem extends Element>({
  source,
  scrollRef,
  activeIndex,
  estimateSize,
  overscan,
  gap,
  headerHeight = 0,
}: VirtualRowsOptions<T>) {
  const rangeExtractor = React.useCallback(
    (range: Range) => withActiveRow(defaultRangeExtractor(range), activeIndex),
    [activeIndex],
  )
  // React Compiler у кіті не ввімкнено; компонент із useVirtualizer і не має мемоізуватись ним.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer<HTMLDivElement, TItem>({
    count: source.virtual ? source.rowCount : 0,
    enabled: source.virtual,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    overscan,
    gap,
    rangeExtractor,
    scrollMargin: headerHeight,
    scrollPaddingStart: headerHeight,
  })

  const active = React.useRef(activeIndex)
  React.useLayoutEffect(() => {
    active.current = activeIndex
    virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item, _d, v) =>
      adjustsScroll(item, v, active.current)
  }, [virtualizer, activeIndex])
  // Оцінка відома лише після монтування (CSS-змінна щільності): невиміряні рядки — за новою.
  React.useLayoutEffect(() => {
    virtualizer.measure()
  }, [virtualizer, estimateSize])

  // Спершу рядки, потім діапазон: getVirtualItems оновлює range у цьому ж рендері.
  const items: VirtualRow[] = source.virtual
    ? virtualizer.getVirtualItems()
    : Array.from({ length: source.rowCount }, (_, index) => ({
        index,
        key: index,
        start: 0,
      }))
  const start = virtualizer.range?.startIndex
  const end = virtualizer.range?.endIndex
  const { listKey, setRange } = source
  const rangeKey = React.useRef(listKey)
  React.useEffect(() => {
    if (rangeKey.current !== listKey) {
      rangeKey.current = listKey
      scrollRef.current?.scrollTo({ top: 0 })
      if (start !== undefined && end !== undefined) setRange?.(0, end - start)
      return
    }
    if (start !== undefined && end !== undefined) setRange?.(start, end)
  }, [listKey, setRange, start, end, scrollRef])

  return { virtualizer, items, failedRows: failedWindowRows(items, source) }
}
