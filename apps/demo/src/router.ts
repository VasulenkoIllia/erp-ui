import { useMemo, useSyncExternalStore } from "react"

import { MODULE_IDS, type ModuleId } from "@/registry/lib/icons"

/** Мінімальна hash-навігація демо до появи React Router (разом із ra-core). */
export const ROUTES = {
  appearance: "#/",
  primitives: "#/primitives",
  formats: "#/formats",
  icons: "#/icons",
  states: "#/states",
} as const
export type Route = keyof typeof ROUTES

/** Сторінка демо або заглушка модуля прикладу ERP (#/m/K2). */
export type Location =
  { route: Route } | { route: "module"; moduleId: ModuleId }

export const moduleHref = (id: ModuleId) => `#/m/${id}`

export function parseHash(hash: string): Location {
  const m = /^#\/m\/([A-Z]+\d+)$/.exec(hash)
  if (m && MODULE_IDS.includes(m[1] as ModuleId))
    return { route: "module", moduleId: m[1] as ModuleId }
  const found = (Object.keys(ROUTES) as Route[]).find((r) => ROUTES[r] === hash)
  return { route: found ?? "appearance" }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange)
  return () => {
    window.removeEventListener("hashchange", onChange)
  }
}

export function useHash(): string {
  return useSyncExternalStore(subscribe, () => window.location.hash)
}

export function useLocation(): Location {
  const hash = useHash()
  return useMemo(() => parseHash(hash), [hash])
}
