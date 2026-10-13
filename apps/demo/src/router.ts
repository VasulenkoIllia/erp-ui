import { useSyncExternalStore } from "react"

/** Мінімальна hash-навігація демо до появи React Router (разом із ra-core). */
export const ROUTES = {
  appearance: "#/",
  primitives: "#/primitives",
} as const
export type Route = keyof typeof ROUTES

function parse(hash: string): Route {
  const found = (Object.keys(ROUTES) as Route[]).find((r) => ROUTES[r] === hash)
  return found ?? "appearance"
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange)
  return () => {
    window.removeEventListener("hashchange", onChange)
  }
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, () => parse(window.location.hash))
}
