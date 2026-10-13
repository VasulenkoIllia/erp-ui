/**
 * Брейкпоінт оболонки застосунку (SPEC §7, §9): телефон < 768 px, планшет 768–1279 px, десктоп ≥ 1280 px.
 * Лише для макета сторінки (сайдбар, нижня панель). Компоненти всередині сторінки реагують на ширину
 * свого контейнера (`@container`), а не вікна.
 */
import { useSyncExternalStore } from "react"

export type Breakpoint = "phone" | "tablet" | "desktop"

const TABLET = "(min-width: 48rem)"
const DESKTOP = "(min-width: 80rem)"

function getBreakpoint(): Breakpoint {
  if (typeof window === "undefined") return "desktop"
  if (window.matchMedia(DESKTOP).matches) return "desktop"
  if (window.matchMedia(TABLET).matches) return "tablet"
  return "phone"
}

function subscribe(onChange: () => void): () => void {
  const lists = [TABLET, DESKTOP].map((q) => window.matchMedia(q))
  for (const list of lists) list.addEventListener("change", onChange)
  return () => {
    for (const list of lists) list.removeEventListener("change", onChange)
  }
}

export function useBreakpoint(): Breakpoint {
  return useSyncExternalStore(subscribe, getBreakpoint, () => "desktop")
}
