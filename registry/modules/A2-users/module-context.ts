import { createContext, useContext } from "react"

import type { UsersExtension } from "./extension"

/** Адреси сторінок модуля від `basePath` фабрики. */
export interface UsersPaths {
  readonly users: string
  readonly user: (id: string) => string
  /** «Ролі й права»; вибрана роль — `?role=` (`ROLE_PARAM`). */
  readonly roles: string
}

/** Параметр адреси сторінки ролей з вибраною роллю. */
export const ROLE_PARAM = "role"

export function usersPaths(basePath: string): UsersPaths {
  const base = basePath.replace(/\/+$/, "")
  return {
    users: `${base}/users`,
    user: (id) => `${base}/users/${encodeURIComponent(id)}`,
    roles: `${base}/roles`,
  }
}

export interface UsersModuleContextValue {
  readonly extension: UsersExtension
  readonly paths: UsersPaths
  /** Прогріти чанк сторінки модуля за адресою (наведення чи фокус на посиланні, ADR-0009). */
  readonly preload: (pathname: string) => void
  /** Куди перейти після «Увійти як…»: сторінка модуля може бути недоступна тому, за кого увійшли. */
  readonly homePath: string
}

/** Розширення й адреси для сторінок модуля: їх дає фабрика в маршрутах. */
export const UsersModuleContext = createContext<UsersModuleContextValue | null>(
  null,
)

export function useUsersModule(): UsersModuleContextValue {
  const value = useContext(UsersModuleContext)
  if (!value)
    throw new Error(
      "A2-users: page rendered outside routes of createUsersModule()",
    )
  return value
}
