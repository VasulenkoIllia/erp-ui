import { useSyncExternalStore } from "react"

import {
  applyAppearance,
  readStoredAppearance,
  storeAppearance,
  type Appearance,
} from "./appearance"

const DARK_QUERY = "(prefers-color-scheme: dark)"

let current: Appearance = readStoredAppearance()
const listeners = new Set<() => void>()

function prefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches
}

function apply(): void {
  applyAppearance(document.documentElement, current, prefersDark())
}

export function getAppearance(): Appearance {
  return current
}

export function setAppearance(patch: Partial<Appearance>): void {
  current = { ...current, ...patch }
  storeAppearance(current)
  apply()
  listeners.forEach((listener) => {
    listener()
  })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Застосовує збережений вигляд і стежить за системною темою. Повертає функцію відписки. */
export function initAppearance(): () => void {
  current = readStoredAppearance()
  apply()
  const media = window.matchMedia(DARK_QUERY)
  const onChange = () => {
    if (current.theme === "system") apply()
  }
  media.addEventListener("change", onChange)
  return () => {
    media.removeEventListener("change", onChange)
  }
}

export function useAppearance(): [
  Appearance,
  (patch: Partial<Appearance>) => void,
] {
  const appearance = useSyncExternalStore(subscribe, getAppearance)
  return [appearance, setAppearance]
}
