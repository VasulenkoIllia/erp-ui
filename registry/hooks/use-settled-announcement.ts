import * as React from "react"

import { announce } from "@/registry/lib/announce"

/** Пауза в наборі, після якої текст звучить для скрінрідера, як у `erp/save-bar`. */
const SETTLED_ANNOUNCE_DELAY_MS = 700

/**
 * Оголосити `message` через постійний регіон (`lib/announce`), коли змінився `key` (те, що змінює людина: шаблон,
 * поля повтору) і людина зробила паузу. Перший показ і зміни, що прийшли не від людини (лічильники з сервера), не
 * оголошуються: `key` їх не містить. Для перегляду, що оновлюється під час набору (`erp/numbering-preview`,
 * `erp/recurrence-editor`), — замість живого регіону, який звучав би на кожну цифру.
 */
export function useSettledAnnouncement(key: string, message: string) {
  const announced = React.useRef(key)
  const latest = React.useRef(message)
  React.useEffect(() => {
    latest.current = message
  })
  React.useEffect(() => {
    if (key === announced.current) return
    announced.current = key
    const timer = setTimeout(() => {
      announce(latest.current)
    }, SETTLED_ANNOUNCE_DELAY_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [key])
}
