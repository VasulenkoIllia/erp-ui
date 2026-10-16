"use client"

import * as React from "react"

import { useElementSize } from "@/registry/hooks/use-element-size"

/**
 * Активна вкладка смуги, що прокручується вбік (вузький контейнер), — у видимій частині смуги:
 * після вибору, після зміни ширини вкладок (`widths`: лічильники, що прийшли пізніше) і смуги
 * (поворот екрана). До кадру, тож смуга не блимає з активною вкладкою за краєм. Не
 * `scrollIntoView`: той прокрутив би й сторінку. Вкладки позначені `data-tab` зі своїм ключем
 * (пошук без `CSS.escape`, якого немає в jsdom). Повертає ref смуги.
 */
export function useTabInView(value: string, widths = "") {
  const scroller = React.useRef<HTMLDivElement>(null)
  const stripWidth = useElementSize(scroller, "width")
  React.useLayoutEffect(() => {
    const strip = scroller.current
    const tab = Array.from(
      strip?.querySelectorAll<HTMLElement>("[data-tab]") ?? [],
    ).find((item) => item.dataset.tab === value)
    if (!strip || !tab) return
    const box = strip.getBoundingClientRect()
    const { left, right } = tab.getBoundingClientRect()
    if (left < box.left) strip.scrollLeft -= box.left - left
    else if (right > box.right) strip.scrollLeft += right - box.right
  }, [value, widths, stripWidth])
  return scroller
}
