/**
 * Модуль A2 «Користувачі й ролі» (SPEC §14, §17; ADR-0020, ADR-0025, ADR-0031, ADR-0035) — точка
 * входу.
 *
 *   const usersModule = createUsersModule({ basePath: "/team", extension: usersExtension })
 *   <Routes>{usersModule.routes.map(…)}</Routes>  // чи useRoutes(usersModule.routes)
 *
 * Фабрика повертає маршрути React Router зі сторінками модуля (лінивими чанками, `Suspense` і межа
 * помилок — у застосунку): люди, картка людини, «Ролі й права» (ADR-0033), «Запрошення»
 * (ADR-0035); пункти навігації з
 * правом, яке їм потрібне, ресурси для прав і моків і `preload` за адресою. Без
 * розширення модуль такий, як у демо кіта. Файли модуля в проекті не правляться: зміни під
 * клієнта — у файлі розширення (`src/extensions/A2-users.ts`). Моки — окремо, `./mocks`
 * (`createUsersMocks`), фікстури колег — `./fixtures` (`createUsersFixtures`), щоб MSW не потрапив
 * у застосунок.
 */
import { KeySquareIcon, MailPlusIcon, type LucideIcon } from "lucide-react"
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
import { ROLES, USERS, USERS_RESOURCES, type UsersResource } from "./resources"

export type {
  UserActionId,
  UserColumnId,
  UserFieldId,
  UserFilterId,
  UserIds,
  UserInvitationsExtension,
  UserPeopleExtension,
  UserRolesExtension,
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
  /**
   * Право, без якого пункт ховають (`<ресурс>:<дія>`, як `useCanAccess`): сторінка однаково покаже
   * «Немає доступу». Без нього — пункт для всіх.
   */
  readonly access?: { readonly resource: string; readonly action: string }
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
  roles: lazyWithPreload(() =>
    import("./pages/roles-page").then((m) => m.RolesPage),
  ),
  invitations: lazyWithPreload(() =>
    import("./pages/invitations-page").then((m) => m.InvitationsPage),
  ),
} satisfies Record<string, PreloadableComponent<object>>

const NO_EXTENSION: UsersExtension = {}

/** Чанк сторінки за адресою: список людей, картка людини, ролі чи запрошення. */
function preloadFor(paths: UsersPaths) {
  return (pathname: string) => {
    const path = pathname.split(/[?#]/)[0] ?? ""
    const target =
      path === paths.users
        ? PAGES.users
        : path.startsWith(`${paths.users}/`)
          ? PAGES.user
          : path === paths.roles
            ? PAGES.roles
            : path === paths.invitations
              ? PAGES.invitations
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
  // Ролі веде інша система — без сторінки й пункту (`roles.page: false`, ADR-0033).
  const rolesPage = extension.roles?.page !== false
  // Людей запрошує інша система — без сторінки й пункту (`invitations.page: false`, ADR-0035).
  const invitationsPage = extension.invitations?.page !== false
  const routes: RouteObject[] = [
    { path: paths.users, element: page(PAGES.users) },
    { path: `${paths.users}/:id`, element: page(PAGES.user) },
    ...(rolesPage ? [{ path: paths.roles, element: page(PAGES.roles) }] : []),
    ...(invitationsPage
      ? [{ path: paths.invitations, element: page(PAGES.invitations) }]
      : []),
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
      label: { uk: "Користувачі", en: "Users" },
      href: paths.users,
      icon: MODULE_ICONS.A2,
    },
    ...(rolesPage
      ? [
          {
            id: "A2-roles",
            label: { uk: "Ролі й права", en: "Roles & permissions" },
            href: paths.roles,
            icon: KeySquareIcon,
            access: { resource: ROLES, action: "read" },
          },
        ]
      : []),
    ...(invitationsPage
      ? [
          {
            id: "A2-invitations",
            label: { uk: "Запрошення", en: "Invitations" },
            href: paths.invitations,
            icon: MailPlusIcon,
            access: { resource: USERS, action: "create" },
          },
        ]
      : []),
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
