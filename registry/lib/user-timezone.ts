/**
 * Часовий пояс користувача для показу міток часу (SPEC §11, ADR-0015).
 *
 * - Пояс задає профіль: `useMe` викликає `setUserTimeZone` після завантаження `/me`.
 * - Без нього (гість, невідомий Intl пояс) — пояс пристрою.
 * - `useFormat()` з `lib/format` і «сьогодні» в `lib/dates` беруть його звідси; календарні дати
 *   пояс не зсуває.
 */
import { useSyncExternalStore } from "react"

import { isTimeZone } from "@/registry/lib/time-zone"

let userTimeZone: string | undefined
const listeners = new Set<() => void>()

export { isTimeZone }

/** Пояс користувача з профілю; невідомий пояс ігнорується (лишається пояс пристрою). */
export function setUserTimeZone(zone: string | null | undefined): void {
  const next = zone && isTimeZone(zone) ? zone : undefined
  if (next === userTimeZone) return
  userTimeZone = next
  listeners.forEach((listener) => {
    listener()
  })
}

/** Пояс користувача або undefined, якщо діє пояс пристрою. */
export function getUserTimeZone(): string | undefined {
  return userTimeZone
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Пояс користувача з підпискою: компонент оновиться, коли профіль змінить пояс. */
export function useUserTimeZone(): string | undefined {
  return useSyncExternalStore(subscribe, getUserTimeZone, getUserTimeZone)
}
