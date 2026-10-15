import { useEffect, useRef, type RefObject } from "react"
import { useLocation } from "react-router"

/** Перший екран сесії вже показано: на першому відкритті застосунку фокус не чіпаємо. */
let started = false

/**
 * Після переходу між сторінками — фокус на h1 (скрінрідер чує, куди прийшов, WCAG 2.4.3).
 * `ready` — заголовок уже є (картка показує його після даних).
 *
 * - Один раз на перехід: повторне `ready` (перемикання компанії, «Спробувати ще») фокус не забирає;
 *   StrictMode, що запускає ефект двічі, — теж.
 * - Не забирає фокус у людини, яка, поки дані вантажились, пішла деінде («До списку»): лише коли
 *   фокус на тому ж, що й у мить переходу, чи загубився на body.
 */
export function useFocusHeadingOnNavigation(
  heading: RefObject<HTMLHeadingElement | null>,
  ready = true,
) {
  const { pathname } = useLocation()
  const handled = useRef<string | null>(null)
  const activeAtNavigation = useRef<Element | null>(null)

  useEffect(() => {
    activeAtNavigation.current = document.activeElement
  }, [pathname])

  useEffect(() => {
    if (!ready || handled.current === pathname) return
    handled.current = pathname
    if (!started) {
      started = true
      return
    }
    const active = document.activeElement
    if (
      active &&
      active !== document.body &&
      active !== activeAtNavigation.current
    )
      return
    heading.current?.focus()
  }, [heading, pathname, ready])
}
