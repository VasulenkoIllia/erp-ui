import { useMemo } from "react"
import { useLocation as useRouterLocation } from "react-router"

import { MODULE_IDS, type ModuleId } from "@/registry/lib/icons"

/** Сторінки демо (React Router; ra-core створює HashRouter, тож адреси — `/#/primitives`). */
export const ROUTES = {
  appearance: "/",
  primitives: "/primitives",
  formats: "/formats",
  icons: "/icons",
  states: "/states",
  data: "/data",
} as const
export type Route = keyof typeof ROUTES

export const LOGIN_PATH = "/login"

/** Сторінка демо, вхід або заглушка модуля прикладу ERP (/m/K2). */
export type Location =
  | { route: Route }
  | { route: "login" }
  | { route: "module"; moduleId: ModuleId }

export const moduleHref = (id: ModuleId) => `/m/${id}`

export function parsePath(pathname: string): Location {
  if (pathname === LOGIN_PATH) return { route: "login" }
  const m = /^\/m\/([A-Z]+\d+)$/.exec(pathname)
  if (m && MODULE_IDS.includes(m[1] as ModuleId))
    return { route: "module", moduleId: m[1] as ModuleId }
  const found = (Object.keys(ROUTES) as Route[]).find(
    (r) => ROUTES[r] === pathname,
  )
  return { route: found ?? "appearance" }
}

export function useLocation(): Location {
  const { pathname } = useRouterLocation()
  return useMemo(() => parsePath(pathname), [pathname])
}
