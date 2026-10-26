/**
 * Модуль A2 «Користувачі й ролі» (SPEC §14, §17; ADR-0020, ADR-0025, ADR-0031) — точка входу.
 *
 *   const usersModule = createUsersModule({ basePath: "/team", extension: usersExtension })
 *   <Routes>{usersModule.routes.map(…)}</Routes>  // чи useRoutes(usersModule.routes)
 *
 * Фабрика повертає маршрути React Router зі сторінками модуля (лінивими чанками, `Suspense` і межа
 * помилок — у застосунку), пункти навігації, ресурси для прав і моків і `preload` за адресою. Без
 * розширення модуль такий, як у демо кіта. Файли модуля в проекті не правляться: зміни під
 * клієнта — у файлі розширення (`src/extensions/A2-users.ts`). Моки — окремо, `./mocks`
 * (`createUsersMocks`), фікстури колег — `./fixtures` (`createUsersFixtures`), щоб MSW не потрапив
 * у застосунок.
 */
import type { LucideIcon } from "lucide-react"
import { createElement, type ComponentType } from "react"
import { Navigate, type RouteObject } from "react-router"

import type { LocalizedText } from "@/lib/auth"
import { MODULE_ICONS } from "@/lib/icons"
import { lazyWithPreload, type PreloadableComponent } from "@/lib/lazy"

import type { UsersExtension } from "./extension"
import {
  UsersModuleContext,
  usersPaths,
  type UsersModuleContextValue,
  type UsersPaths,
} from "./module-context"
import { USERS_RESOURCES, type UsersResource } from "./resources"

export type {
  UserActionId,
  UserColumnId,
  UserFieldId,
  UserFilterId,
  UserIds,
  UserPeopleExtension,
  UsersExtension,
  UserSectionId,
  UsersMessages,
  UsersMockExtension,
  UserTabId,
} from "./extension"
export type { UsersPaths } from "./module-context"
export type { UsersResource } from "./resources"
// Типи для файлу розширення й компонентів слотів проекту: не з внутрішніх файлів модуля.
export type { User, UserDirectoryEntry, UserStatus } from "./contract"
export type { ExtensionField } from "@/lib/extension-fields"

export const USERS_MODULE_ID = "A2"

export interface UsersNavItem {
  readonly id: string
  /** Підпис мовою інтерфейсу — `localizedText(label, language)` з `@/lib/auth`. */
  readonly label: LocalizedText
  readonly href: string
  readonly icon: LucideIcon
}

export interface UsersModule {
  readonly id: typeof USERS_MODULE_ID
  readonly paths: UsersPaths
  readonly routes: RouteObject[]
  readonly nav: readonly UsersNavItem[]
  /** Ресурси модуля: права (`<ресурс>:<дія>`), журнал аудиту, токени API, сценарії моків. */
  readonly resources: readonly UsersResource[]
  /** Завантажити чанк сторінки модуля за адресою заздалегідь (наведення, фокус на посиланні). */
  readonly preload: (pathname: string) => void
}

export interface UsersModuleOptions {
  /** Початок адрес модуля: `""` — `/users`; `"/team"` — `/team/users`. */
  readonly basePath?: string
  /** Розширення проекту (ADR-0020). */
  readonly extension?: UsersExtension
  /** Куди перейти після «Увійти як…»; за замовчуванням — `/`. */
  readonly homePath?: string
}

const PAGES = {
  users: lazyWithPreload(() =>
    import("./pages/users-list-page").then((m) => m.UsersListPage),
  ),
  user: lazyWithPreload(() =>
    import("./pages/user-page").then((m) => m.UserPage),
  ),
} satisfies Record<string, PreloadableComponent<object>>

const NO_EXTENSION: UsersExtension = {}

/** Чанк сторінки за адресою: список людей чи картка людини. */
function preloadFor(paths: UsersPaths) {
  return (pathname: string) => {
    const path = pathname.split(/[?#]/)[0] ?? ""
    const target =
      path === paths.users
        ? PAGES.users
        : path.startsWith(`${paths.users}/`)
          ? PAGES.user
          : null
    void target?.preload()
  }
}

export function createUsersModule({
  basePath = "",
  extension = NO_EXTENSION,
  homePath = "/",
}: UsersModuleOptions = {}): UsersModule {
  const paths = usersPaths(basePath)
  const preload = preloadFor(paths)
  const context: UsersModuleContextValue = {
    extension,
    paths,
    preload,
    homePath,
  }
  const page = (Page: ComponentType) =>
    createElement(
      UsersModuleContext.Provider,
      { value: context },
      createElement(Page),
    )
  const routes: RouteObject[] = [
    { path: paths.users, element: page(PAGES.users) },
    { path: `${paths.users}/:id`, element: page(PAGES.user) },
  ]
  // Адреса самого модуля (`/team`) — список людей.
  if (basePath.replace(/\/+$/, ""))
    routes.push({
      path: basePath,
      element: createElement(Navigate, { to: paths.users, replace: true }),
    })
  const nav: UsersNavItem[] = [
    {
      id: "A2-users",
      label: { uk: "Користувачі й ролі", en: "Users and roles" },
      href: paths.users,
      icon: MODULE_ICONS.A2,
    },
  ]
  return {
    id: USERS_MODULE_ID,
    paths,
    routes,
    nav,
    resources: USERS_RESOURCES,
    preload,
  }
}
