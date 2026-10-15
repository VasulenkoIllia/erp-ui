"use client"

import { useEffect, useRef, type RefObject } from "react"

/** Перший екран сесії вже показано: на першому відкритті застосунку фокус не чіпаємо. */
let started = false

/**
 * Після переходу між сторінками — фокус на h1 (скрінрідер чує, куди прийшов, WCAG 2.4.3): шапка
 * `ListReportHeader` чи `RecordHeader`, прихований h1 `ObjectPage`, поки запису немає.
 *
 *   const heading = useRef<HTMLHeadingElement>(null)
 *   useFocusHeadingOnNavigation(heading, useLocation().pathname, !isPending)
 *
 * - `location` — адреса сторінки від роутера застосунку (кіт роутера не вибирає): нова адреса —
 *   новий перехід. `ready` — заголовок уже є (картка показує його після даних).
 * - Перший екран — сторінка, змонтована першою в сесії: на ній фокус не чіпаємо, навіть якщо людина
 *   пішла з неї раніше, ніж вона завантажилась. Тому хук ставлять усі сторінки з h1, вхід теж:
 *   сторінка без хука перший екран не позначає.
 * - Один раз на перехід: повторне `ready` (перемикання компанії, «Спробувати ще») фокус не забирає;
 *   StrictMode, що запускає ефект двічі, — теж.
 * - Не забирає фокус у людини, яка, поки дані вантажились, пішла деінде («До списку»): лише коли
 *   фокус на тому ж, що й у мить переходу (ефект після відмальовки — фокус, який бачила людина), чи
 *   загубився на body.
 */
export function useFocusHeadingOnNavigation(
  heading: RefObject<HTMLElement | null>,
  location: string,
  ready = true,
): void {
  // Перший екран — уже «оброблений» перехід.
  const handled = useRef<string | null>(started ? null : location)
  const activeAtNavigation = useRef<Element | null>(null)

  useEffect(() => {
    started = true
  }, [])

  useEffect(() => {
    activeAtNavigation.current = document.activeElement
  }, [location])

  useEffect(() => {
    if (!ready || handled.current === location) return
    handled.current = location
    const active = document.activeElement
    if (
      active &&
      active !== document.body &&
      active !== activeAtNavigation.current
    )
      return
    heading.current?.focus()
  }, [heading, location, ready])
}
