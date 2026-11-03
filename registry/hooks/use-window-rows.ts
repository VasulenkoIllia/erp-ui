/**
 * Віртуальні рядки форми у вікні сторінки (UI05b, ADR-0060): `erp/repeating-rows` понад поріг малює
 * лише рядки на екрані й поруч. Прокручується сама сторінка, а не вкладена область: форма на сторінці
 * з `erp/save-bar` лишається звичайною формою, і на телефоні немає прокрутки в прокрутці.
 *
 * - Рядки, що лишаються в DOM поза екраном (`keep`, `keepLive`): у фокусі, куди зараз піде фокус, з
 *   першою помилкою. Порядок у DOM — порядок рядків (`withActiveRow`).
 * - Висота рядка вимірюється; невиміряні рахуються за середньою з виміряних: таблиця й картки мають
 *   різну висоту, і одна оцінка на обидві не годиться.
 * - Відступ списку від верху сторінки (`scrollMargin`) міряється знову, коли змінюється висота сторінки:
 *   над рядками з'являється зведення помилок чи повідомлення.
 */
import * as React from "react"
import {
  defaultRangeExtractor,
  measureElement,
  useWindowVirtualizer,
  type Range,
} from "@tanstack/react-virtual"

import { withActiveRow } from "@/registry/lib/data-table-core"

export interface WindowRowsOptions {
  count: number
  /** false — малюються всі рядки. */
  enabled: boolean
  listRef: React.RefObject<HTMLElement | null>
  /** Ключ рядка: виміряна висота йде за рядком, коли над ним вставили чи вилучили інший. */
  getItemKey: (index: number) => React.Key
  /** Рядки поза екраном, які лишаються в DOM, зі стану: зміна набору перераховує діапазон. */
  keep: readonly number[]
  /** Те саме з refs: читається, коли діапазон перераховується (прокрутка, зміна кількості). */
  keepLive: () => readonly number[]
  /** Висота рядка до першого виміру, px. */
  estimateSize: number
}

/** Рядків над і під екраном: Tab із останнього видимого рядка потрапляє в наступний, а не повз нього. */
const OVERSCAN = 4

export function useWindowRows({
  count,
  enabled,
  listRef,
  getItemKey,
  keep,
  keepLive,
  estimateSize,
}: WindowRowsOptions) {
  const [scrollMargin, setScrollMargin] = React.useState(0)
  React.useLayoutEffect(() => {
    const list = listRef.current
    if (!enabled || !list) return
    const update = () => {
      const margin = list.getBoundingClientRect().top + window.scrollY
      setScrollMargin((current) =>
        Math.abs(current - margin) < 1 ? current : margin,
      )
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(document.body)
    return () => {
      observer.disconnect()
    }
  }, [enabled, listRef])

  const measured = React.useRef({ total: 0, count: 0 })
  const rangeExtractor = React.useCallback(
    (range: Range) =>
      [...keep, ...keepLive()]
        .filter((index) => index < range.count)
        .reduce(withActiveRow, defaultRangeExtractor(range)),
    [keep, keepLive],
  )
  const virtualizer = useWindowVirtualizer<HTMLLIElement>({
    count: enabled ? count : 0,
    enabled,
    getItemKey,
    estimateSize: () =>
      measured.current.count
        ? measured.current.total / measured.current.count
        : estimateSize,
    measureElement: (element, entry, instance) => {
      const size = measureElement(element, entry, instance)
      measured.current.total += size
      measured.current.count += 1
      return size
    },
    overscan: OVERSCAN,
    scrollMargin,
    rangeExtractor,
  })
  return {
    /** null — віртуалізації немає, малюються всі рядки. */
    items: enabled ? virtualizer.getVirtualItems() : null,
    totalSize: virtualizer.getTotalSize(),
    /** Зсув рядка всередині списку: `start` рахується від верху сторінки. */
    offsetOf: (start: number) => start - scrollMargin,
    measureElement: virtualizer.measureElement,
  }
}
