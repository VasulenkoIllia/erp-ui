/**
 * Віртуальні рядки форми у вікні сторінки (UI05b, ADR-0060): `erp/repeating-rows` понад поріг малює
 * лише рядки на екрані й поруч. Прокручується сама сторінка, а не вкладена область: форма на сторінці
 * з `erp/save-bar` лишається звичайною формою, і на телефоні немає прокрутки в прокрутці.
 *
 * - Рядки, що лишаються в DOM поза екраном (`keep`, `keepLive`): у фокусі, куди зараз піде фокус, з
 *   першою помилкою. Порядок у DOM — порядок рядків.
 * - Список усередині власної прокрутки (діалог, шторка): вікно сторінки там не прокручується, тож
 *   малюються всі рядки.
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

export interface WindowRowsOptions {
  count: number
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

/**
 * Рядків над і під екраном. Одного досить, щоб Tab з останнього видимого рядка потрапив у наступний; більше
 * — дорожча кожна дія з рядками: зсув індексу перепідписує всі поля намальованих рядків на форму.
 */
const OVERSCAN = 1

/** Предок із власною вертикальною прокруткою, яка вже прокручується. */
function hasScrollParent(element: HTMLElement) {
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (node === document.body) return false
    const { overflowY } = getComputedStyle(node)
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight
    )
      return true
  }
  return false
}

/** Видимий діапазон і рядки, що лишаються в DOM, без повторів і в порядку рядків. */
const withKept = (visible: readonly number[], kept: readonly number[]) =>
  [...new Set([...visible, ...kept])].sort((a, b) => a - b)

export function useWindowRows({
  count,
  listRef,
  getItemKey,
  keep,
  keepLive,
  estimateSize,
}: WindowRowsOptions) {
  const [isNested, setIsNested] = React.useState(false)
  const isActive = !isNested
  const [scrollMargin, setScrollMargin] = React.useState(0)
  React.useLayoutEffect(() => {
    const list = listRef.current
    if (!isActive || !list) return
    if (hasScrollParent(list)) {
      setIsNested(true)
      return
    }
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
  }, [isActive, listRef])

  // Остання висота кожного рядка: середня рахується з рядків, а не з повторних вимірів того самого.
  const measured = React.useRef({
    sizes: new Map<React.Key, number>(),
    total: 0,
  })
  const rangeExtractor = React.useCallback(
    (range: Range) =>
      withKept(
        defaultRangeExtractor(range),
        [...keep, ...keepLive()].filter(
          (index) => index >= 0 && index < range.count,
        ),
      ),
    [keep, keepLive],
  )
  const virtualizer = useWindowVirtualizer<HTMLLIElement>({
    count: isActive ? count : 0,
    enabled: isActive,
    getItemKey,
    estimateSize: () =>
      measured.current.sizes.size
        ? measured.current.total / measured.current.sizes.size
        : estimateSize,
    measureElement: (element, entry, instance) => {
      const size = measureElement(element, entry, instance)
      const { sizes } = measured.current
      const key = getItemKey(instance.indexFromElement(element))
      measured.current.total += size - (sizes.get(key) ?? 0)
      sizes.set(key, size)
      return size
    },
    overscan: OVERSCAN,
    scrollMargin,
    rangeExtractor,
    // Без розміру вікна перший кадр після ввімкнення не має діапазону й не малює навіть закріплених
    // рядків: сотий доданий рядок не отримав би фокус.
    initialRect: { width: window.innerWidth, height: window.innerHeight },
  })
  return {
    /** null — віртуалізації немає, малюються всі рядки. */
    items: isActive ? virtualizer.getVirtualItems() : null,
    totalSize: virtualizer.getTotalSize(),
    /** Зсув рядка всередині списку: `start` рахується від верху сторінки. */
    offsetOf: (start: number) => start - scrollMargin,
    measureElement: virtualizer.measureElement,
  }
}
