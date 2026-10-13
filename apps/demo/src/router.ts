import { useMemo } from "react"
import { useLocation as useRouterLocation } from "react-router"

import { MODULE_IDS, type ModuleId } from "@/registry/lib/icons"

/** Сторінки демо в оболонці (React Router; ra-core створює HashRouter, тож адреси — `/#/primitives`). */
export const ROUTES = {
  appearance: "/",
  primitives: "/primitives",
  formats: "/formats",
  icons: "/icons",
  states: "/states",
  data: "/data",
  security: "/settings/security",
  users: "/settings/users",
} as const
export type Route = keyof typeof ROUTES

/** Екрани входу поза оболонкою (erp/login-screen, erp/account-recovery, erp/sign-up-screen). */
export const AUTH_ROUTES = {
  login: "/login",
  forgot: "/login/forgot",
  reset: "/login/reset",
  invite: "/login/invite",
  link: "/login/link",
  signUp: "/signup",
  callback: "/auth/callback",
  /** Демо-сторінка провайдера SSO (справжній провайдер — Google, Apple). */
  mockSso: "/mock-sso",
} as const
export type AuthRoute = keyof typeof AUTH_ROUTES

export const LOGIN_PATH = AUTH_ROUTES.login

/** Сторінка демо, екран входу або заглушка модуля прикладу ERP (/m/K2). */
export type Location =
  | { route: Route }
  | { route: "auth"; screen: AuthRoute }
  | { route: "module"; moduleId: ModuleId }

export const moduleHref = (id: ModuleId) => `/m/${id}`

export function parsePath(pathname: string): Location {
  const auth = (Object.keys(AUTH_ROUTES) as AuthRoute[]).find(
    (r) => AUTH_ROUTES[r] === pathname,
  )
  if (auth) return { route: "auth", screen: auth }
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

/** Параметр рядка запиту (`?token=…`) поточної адреси. */
export function useSearchParam(name: string): string | null {
  const { search } = useRouterLocation()
  return useMemo(() => new URLSearchParams(search).get(name), [search, name])
}
