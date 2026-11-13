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
import { KeySquareIcon, MailPlusIcon } from "lucide-react"

import { MODULE_ICONS } from "@/lib/icons"
import { lazyWithPreload, type PreloadableComponent } from "@/lib/lazy"
import { createModule, type ErpModule, type ModuleNavItem } from "@/lib/module"

import type { UsersExtension } from "./extension"
import {
  UsersModuleContext,
  usersPaths,
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

export type UsersNavItem = ModuleNavItem

export type UsersModule = ErpModule<
  typeof USERS_MODULE_ID,
  UsersPaths,
  UsersNavItem,
  UsersResource
>

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

export function createUsersModule({
  basePath = "",
  extension = NO_EXTENSION,
  homePath = "/",
}: UsersModuleOptions = {}): UsersModule {
  const paths = usersPaths(basePath)
  // Ролі веде інша система — без сторінки й пункту (`roles.page: false`, ADR-0033).
  const rolesPage = extension.roles?.page !== false
  // Людей запрошує інша система — без сторінки й пункту (`invitations.page: false`, ADR-0035).
  const invitationsPage = extension.invitations?.page !== false
  return createModule({
    id: USERS_MODULE_ID,
    basePath,
    paths,
    pages: [
      { path: paths.users, page: PAGES.users },
      { path: `${paths.users}/:id`, page: PAGES.user },
      ...(rolesPage ? [{ path: paths.roles, page: PAGES.roles }] : []),
      ...(invitationsPage
        ? [{ path: paths.invitations, page: PAGES.invitations }]
        : []),
    ],
    // Адреса самого модуля (`/team`) — список людей.
    home: paths.users,
    nav: [
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
    ],
    resources: USERS_RESOURCES,
    context: UsersModuleContext,
    value: { extension, paths, homePath },
  })
}
