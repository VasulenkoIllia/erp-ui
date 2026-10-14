/**
 * Розміри елементів для erp/data-table (ADR-0016): ширина контейнера — грід чи картки й розкладка
 * колонок (SPEC §9), висота липкої шапки — відступ віртуальних рядків, висота області прокрутки
 * «до низу екрана».
 */
import * as React from "react"

/** Розмір кореневого шрифту, px: для переведення rem ↔ px. */
export function remPx(): number {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

/**
 * Ширина (`clientWidth`) чи висота (`offsetHeight`) елемента, px, і далі — за ResizeObserver;
 * null — ще не виміряно (перший кадр).
 */
export function useElementSize(
  ref: React.RefObject<HTMLElement | null>,
  dimension: "width" | "height",
): number | null {
  const [size, setSize] = React.useState<number | null>(null)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      setSize(dimension === "width" ? el.clientWidth : el.offsetHeight)
    }
    update()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => {
      observer.disconnect()
    }
  }, [ref, dimension])
  return size
}

/**
 * Висота області прокрутки «до низу екрана»: 100dvh мінус усе, що над нею, і нижній відступ `main`
 * (під нижню панель телефона). Сторінка тоді не прокручується, прокручується лише список.
 */
export function useFillHeight(
  ref: React.RefObject<HTMLElement | null>,
  enabled: boolean,
): string | undefined {
  const [offset, setOffset] = React.useState<number | null>(null)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!enabled || !el) return
    const update = () => {
      const main = el.closest("main")
      const reserve = main
        ? parseFloat(getComputedStyle(main).paddingBottom)
        : 0
      const top = el.getBoundingClientRect().top + window.scrollY
      const next = Math.round(top + (reserve || 0))
      setOffset((current) => (current === next ? current : next))
    }
    update()
    window.addEventListener("resize", update)
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update)
    observer?.observe(document.body)
    return () => {
      window.removeEventListener("resize", update)
      observer?.disconnect()
    }
  }, [ref, enabled])
  if (!enabled) return undefined
  // erp-ui: allow-raw-value — висота від виміряного відступу; не менше 18rem на низьких екранах.
  return `max(18rem, calc(100dvh - ${String(offset ?? 0)}px))`
}
