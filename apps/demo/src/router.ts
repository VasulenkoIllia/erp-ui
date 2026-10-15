import { useMemo } from "react"
import { useLocation as useRouterLocation } from "react-router"

import { MODULE_IDS, type ModuleId } from "@/registry/lib/icons"

/** Сторінки демо в оболонці (React Router; ra-core створює HashRouter, тож адреси — `/#/primitives`). */
export const ROUTES = {
  appearance: "/",
  primitives: "/primitives",
  formats: "/formats",
  fields: "/fields",
  forms: "/forms",
  icons: "/icons",
  states: "/states",
  data: "/data",
  inbox: "/notifications",
  security: "/settings/security",
  users: "/settings/users",
  roles: "/settings/roles",
  company: "/settings/company",
  profile: "/settings/profile",
  notifications: "/settings/notifications",
  securityPolicy: "/settings/security-policy",
  audit: "/settings/audit",
  integrations: "/settings/integrations",
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

/** Сторінка демо, екран входу, картка рахунку (/data/inv-00001) або заглушка модуля ERP (/m/K2). */
export type Location =
  | { route: Route }
  | { route: "auth"; screen: AuthRoute }
  | { route: "invoice"; id: string }
  | { route: "module"; moduleId: ModuleId }

export const moduleHref = (id: ModuleId) => `/m/${id}`

/** Картка рахунку стрес-сторінки (шаблон Object Page, ADR-0019): `/data/<id>`. */
const INVOICE_PREFIX = `${ROUTES.data}/`
export const invoiceHref = (id: string) =>
  `${INVOICE_PREFIX}${encodeURIComponent(id)}`

/** Стан переходу зі списку на картку: з ним «До списку рахунків» повертає фільтри, вид і вкладку. */
export const invoiceLinkState = (listSearch: string) => ({ listSearch })

/** Рядок запиту списку зі стану переходу; чужий чи зіпсований стан — список без параметрів. */
export function listSearchOf(state: unknown): string {
  if (typeof state !== "object" || state === null || !("listSearch" in state))
    return ""
  const { listSearch } = state
  return typeof listSearch === "string" && listSearch.startsWith("?")
    ? listSearch
    : ""
}

/** Зіпсований `%` в адресі — id як є: картка покаже «не знайдено», а не впаде. */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

export function parsePath(pathname: string): Location {
  const auth = (Object.keys(AUTH_ROUTES) as AuthRoute[]).find(
    (r) => AUTH_ROUTES[r] === pathname,
  )
  if (auth) return { route: "auth", screen: auth }
  const invoice = pathname.startsWith(INVOICE_PREFIX)
    ? pathname.slice(INVOICE_PREFIX.length)
    : ""
  if (invoice && !invoice.includes("/"))
    return { route: "invoice", id: decodeSegment(invoice) }
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
