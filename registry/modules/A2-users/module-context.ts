import { createModuleContext, type ModuleContextValue } from "@/lib/module"

import type { UsersExtension } from "./extension"

/** Адреси сторінок модуля від `basePath` фабрики. */
export interface UsersPaths {
  readonly users: string
  readonly user: (id: string) => string
  /** «Ролі й права»; вибрана роль — `?role=` (`ROLE_PARAM`). */
  readonly roles: string
  /** «Запрошення» (ADR-0035). */
  readonly invitations: string
}

/** Параметр адреси сторінки ролей з вибраною роллю. */
export const ROLE_PARAM = "role"

export function usersPaths(basePath: string): UsersPaths {
  const base = basePath.replace(/\/+$/, "")
  return {
    users: `${base}/users`,
    user: (id) => `${base}/users/${encodeURIComponent(id)}`,
    roles: `${base}/roles`,
    invitations: `${base}/invitations`,
  }
}

export interface UsersModuleContextValue extends ModuleContextValue<
  UsersExtension,
  UsersPaths
> {
  /** Куди перейти після «Увійти як…»: сторінка модуля може бути недоступна тому, за кого увійшли. */
  readonly homePath: string
}

/** Розширення й адреси для сторінок модуля: їх дає фабрика в маршрутах. */
export const [UsersModuleContext, useUsersModule] =
  createModuleContext<UsersModuleContextValue>("A2-users", "createUsersModule")
