/**
 * Ролі й права (ADR-0014, основа модуля A2): ролі з набором прав `<ресурс>:<дія>` (ADR-0003) і
 * призначення ролей користувачам. Права користувача — об'єднання прав його ролей.
 *
 * Контракт (під `/api/v1`, право `roles:read` / `roles:update`):
 * - `GET /roles` → { roles, resources }:
 *   - роль — id, назва, опис, `system` (вбудована: не змінюється й не видаляється), права, скільки
 *     користувачів її мають;
 *   - `resources` — каталог прав проекту: ресурс із назвою, розділом і своїми діями (`read`,
 *     `create`, `update`, `delete`, `impersonate`, `export`…) мовою `Accept-Language`; дія з
 *     `own: true` має вибір «Свої / Усі» (A2c2b1).
 * - «Свої / Усі»: `<ресурс>:<дія>:own` — дія лише над своїми записами (де людина відповідальна),
 *   `<ресурс>:<дія>` — над усіма; `:own` — лише для дії каталогу з `own: true`, інакше 422
 *   `permissions: invalid`. Що з конкретним записом, каже позначка сервера `deniedActions` (ADR-0037).
 * - `POST /roles` { name, description, permissions } → роль; `PATCH /roles/:id` → роль;
 *   `DELETE /roles/:id` → 204. Помилки — 422 `fieldErrors` (`name`: `required` / `taken`,
 *   `permissions`: `invalid`); вбудована роль — 403; роль із користувачами не видаляється — 409.
 * - `PUT /users/:id/roles` { roles } → 204: ролі користувача (право `users:update`, повторне
 *   підтвердження; хоча б одна роль; свої ролі — ні, щоб не втратити доступ).
 * - «Стеля» (ADR-0032): дати, змінити, скопіювати чи видалити можна лише права, які людина має сама
 *   в компанії запиту (`canGrant`, `canChangePermissions`, `canChangeRoles`); «Свої» дає той, хто має
 *   дію хоч на свої, а «Усі» дає, забирає чи звужує до «Свої» лише той, хто має «Усі»; сильнішу роль не
 *   змінити зовсім, зокрема назву; порушення — 403 `forbidden`. Права в `GET /me` і ролях —
 *   стиснені: усі дії ресурсу — `<ресурс>:*` (як `togglePermission`), інакше «стеля» вважатиме
 *   роль із `<ресурс>:*` сильнішою. Людина `PUT /users/:id/roles` — лише з компанії запиту
 *   (іншої — 404).
 * - Зміни — у журнал аудиту (ADR-0013) з «було → стало».
 */
import { z } from "zod"

import type { ApiClient } from "@/registry/lib/api"

export const roleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  /** Вбудована роль (власник, адміністратор): лише перегляд. */
  system: z.boolean(),
  /** `invoices:read`, `invoices:*`, `*`. */
  permissions: z.array(z.string()),
  usersCount: z.number().int().min(0),
})
export type Role = z.infer<typeof roleSchema>

export const permissionResourceSchema = z.object({
  id: z.string(),
  label: z.string(),
  group: z.string().optional(),
  actions: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        /** Дія має вибір «Свої / Усі»: роль може дати її лише над своїми записами. */
        // Не того типу (`null`, рядок) — вибору немає, а не збій усієї відповіді `GET /roles`.
        own: z.boolean().optional().catch(undefined),
      }),
    )
    .min(1),
})
export type PermissionResource = z.infer<typeof permissionResourceSchema>

const rolesSchema = z.object({
  roles: z.array(roleSchema),
  resources: z.array(permissionResourceSchema),
})
export type Roles = z.infer<typeof rolesSchema>

export interface RoleInput {
  name: string
  description?: string
  permissions: string[]
}

export interface RolesApi {
  list: () => Promise<Roles>
  create: (input: RoleInput) => Promise<Role>
  update: (id: string, input: Partial<RoleInput>) => Promise<Role>
  remove: (id: string) => Promise<void>
  /** Призначити ролі користувачу. */
  setUserRoles: (userId: string, roles: string[]) => Promise<void>
}

const encoded = (id: string) => encodeURIComponent(id)

export function createRolesApi(client: ApiClient): RolesApi {
  return {
    list: () => client.get("/roles", { schema: rolesSchema }),
    create: (input) => client.post("/roles", input, { schema: roleSchema }),
    update: (id, input) =>
      client.patch(`/roles/${encoded(id)}`, input, { schema: roleSchema }),
    async remove(id) {
      await client.delete(`/roles/${encoded(id)}`)
    },
    async setUserRoles(userId, roles) {
      await client.put(`/users/${encoded(userId)}/roles`, { roles })
    },
  }
}

export const ROLES_QUERY_KEYS = {
  list: ["erp-ui", "roles"],
} as const

/* ------------------------------ Матриця прав ------------------------------ */

/** Над якими записами дія (A2c2b1): лише свої (де людина відповідальна) чи всі. */
export type PermissionScope = "own" | "all"

/** Суфікс права лише на свої записи: `organizations:update:own`. */
const OWN_SCOPE = "own"

/** Порядок обсягів: немає < свої < усі. */
const scopeRank = (scope: PermissionScope | null) =>
  scope === "all" ? 2 : scope === "own" ? 1 : 0

/**
 * Обсяг дії над ресурсом у наборі прав: `all` — `*`, `<ресурс>:*` чи `<ресурс>:<дія>`; `own` — лише
 * `<ресурс>:<дія>:own`; `null` — дії немає. Ширше перемагає: права людини — об'єднання її ролей.
 * Порожній ресурс чи дія або з `:` — `null`: інакше дія `update:own` збіглася б із рядком «Свої» як «Усі».
 */
export function permissionScope(
  permissions: readonly string[],
  resource: string,
  action: string,
): PermissionScope | null {
  if (!resource || !action || resource.includes(":") || action.includes(":"))
    return null
  const exact = `${resource}:${action}`
  let scope: PermissionScope | null = null
  for (const p of permissions) {
    if (p === "*" || p === `${resource}:*` || p === exact) return "all"
    if (p === `${exact}:${OWN_SCOPE}`) scope = "own"
  }
  return scope
}

/** Чи дає набір прав дію над ресурсом — над усіма записами чи лише своїми. */
export function grants(
  permissions: readonly string[],
  resource: string,
  action: string,
): boolean {
  return permissionScope(permissions, resource, action) !== null
}

/**
 * Обсяг дії ресурсу в наборі прав: `null` — зняти. Усі дії ресурсу над усіма записами разом
 * стискаються до `<ресурс>:*`; зміна однієї з `*` розгортає решту явно, «Свої» — `<ресурс>:<дія>:own`
 * і лише для дії каталогу з `own: true` (інша вибору не має — «Усі», як вимагає сервер).
 */
export function setPermissionScope(
  permissions: readonly string[],
  resource: PermissionResource,
  action: string,
  scope: PermissionScope | null,
): string[] {
  const scopes = resource.actions.map(({ id, own }) => ({
    id,
    scope:
      id !== action
        ? permissionScope(permissions, resource.id, id)
        : scope === "own" && !own
          ? "all"
          : scope,
  }))
  const rest = permissions.filter((p) => !p.startsWith(`${resource.id}:`))
  if (scopes.every((item) => item.scope === "all"))
    return [...rest, `${resource.id}:*`]
  return [
    ...rest,
    ...scopes.flatMap(({ id, scope: itemScope }) =>
      itemScope === null
        ? []
        : [
            itemScope === "all"
              ? `${resource.id}:${id}`
              : `${resource.id}:${id}:${OWN_SCOPE}`,
          ],
    ),
  ]
}

/**
 * Увімкнути чи вимкнути дію ресурсу в наборі прав. Увімкнена вже дія лишає свій обсяг, нова — `scope`
 * (за замовчуванням — над усіма записами). Стискання й розгортання — як у `setPermissionScope`.
 */
export function togglePermission(
  permissions: readonly string[],
  resource: PermissionResource,
  action: string,
  on: boolean,
  scope: PermissionScope = "all",
): string[] {
  const current = permissionScope(permissions, resource.id, action)
  return setPermissionScope(
    permissions,
    resource,
    action,
    on ? (current ?? scope) : null,
  )
}

/**
 * Свої незбережені зміни поверх свіжих прав ролі (одночасна зміна, 409, ADR-0033): дії каталогу, які
 * людина змінила відносно `base` (права, з яких почала), — як у `mine` (з обсягом), решта — як у
 * `theirs` (свіжі з сервера); права поза каталогом — з `theirs`.
 */
export function rebasePermissions(
  base: readonly string[],
  mine: readonly string[],
  theirs: readonly string[],
  resources: readonly PermissionResource[],
): string[] {
  return resources.reduce(
    (result, resource) =>
      resource.actions.reduce((next, { id }) => {
        const scope = permissionScope(mine, resource.id, id)
        return scope === permissionScope(base, resource.id, id)
          ? next
          : setPermissionScope(next, resource, id, scope)
      }, result),
    [...theirs],
  )
}

/* ---------------------------------- Стеля ---------------------------------- */

/**
 * Чи покриває набір прав `own` одне право («стеля», ADR-0032): `*` — лише `*`; `<ресурс>:*` — `*`
 * або `<ресурс>:*`; `<ресурс>:<дія>` — дія над усіма записами; `<ресурс>:<дія>:own` — дія хоч над
 * своїми; інший рядок — лише `*` чи той самий рядок.
 */
export function coversPermission(
  own: readonly string[],
  permission: string,
): boolean {
  // `*` покриває будь-який рядок, і той, якого немає в каталозі: його власник може прибрати з ролі.
  if (own.includes("*")) return true
  if (permission === "*") return false
  const [resource = "", action = "", ...rest] = permission.split(":")
  if (rest.length > 1 || (rest.length === 1 && rest[0] !== OWN_SCOPE))
    return own.includes(permission)
  if (action === "*") return own.includes(`${resource}:*`)
  const needed = rest.length ? "own" : "all"
  return scopeRank(permissionScope(own, resource, action)) >= scopeRank(needed)
}

/** Чи може людина з правами `own` дати набір прав: кожне право — в межах її власних. */
export function canGrant(
  own: readonly string[],
  permissions: readonly string[],
): boolean {
  return permissions.every((permission) => coversPermission(own, permission))
}

/**
 * Право з каталогу: `*`, `<ресурс>:*` ресурсу каталогу, `<ресурс>:<дія>` його дії чи
 * `<ресурс>:<дія>:own` дії з вибором «Свої / Усі» (`own: true`). Інше сервер відхиляє 422.
 */
export function isCatalogPermission(
  permission: string,
  resources: readonly PermissionResource[],
): boolean {
  if (permission === "*") return true
  const [resource = "", action = "", ...rest] = permission.split(":")
  const known = resources.find((item) => item.id === resource)
  if (!known) return false
  if (action === "*") return !rest.length
  const catalogAction = known.actions.find(({ id }) => id === action)
  if (!catalogAction) return false
  return (
    !rest.length ||
    (rest.length === 1 && rest[0] === OWN_SCOPE && catalogAction.own === true)
  )
}

/**
 * Чи може людина з правами `own` змінити права ролі з `before` на `next`: кожна дія каталогу, яку
 * зміна вмикає, вимикає чи переводить між «Свої» й «Усі», — у межах `own` за ширшим з обсягів (до й
 * після); право поза каталогом — так само рядком; `*` додає чи прибирає лише той, хто має `*`.
 */
export function canChangePermissions(
  own: readonly string[],
  before: readonly string[],
  next: readonly string[],
  resources: readonly PermissionResource[],
): boolean {
  if (before.includes("*") !== next.includes("*") && !own.includes("*"))
    return false
  // Право поза каталогом (застаріле, сервер без нього в каталозі) дій не має — порівнюємо рядком.
  const changedOutside = [
    ...next.filter((p) => !before.includes(p)),
    ...before.filter((p) => !next.includes(p)),
  ].filter((p) => !isCatalogPermission(p, resources))
  if (!canGrant(own, changedOutside)) return false
  return resources.every((resource) =>
    resource.actions.every(({ id }) =>
      canChangeScope(
        own,
        resource.id,
        id,
        permissionScope(before, resource.id, id),
        permissionScope(next, resource.id, id),
      ),
    ),
  )
}

/**
 * Чи може людина з правами `own` змінити обсяг дії ролі з `from` на `to`: її власний обсяг цієї дії —
 * не менший за ширший з двох (забрати чи звузити «Усі» може лише той, хто має «Усі»).
 */
export function canChangeScope(
  own: readonly string[],
  resource: string,
  action: string,
  from: PermissionScope | null,
  to: PermissionScope | null,
): boolean {
  return (
    from === to ||
    scopeRank(permissionScope(own, resource, action)) >=
      Math.max(scopeRank(from), scopeRank(to))
  )
}

/**
 * Чи може людина з правами `own` змінити ролі людини з `before` на `next`: кожна роль, яку додають
 * чи знімають, дає лише права в межах `own` (роль, сильнішу за свою, не дати й не забрати).
 * Невідома роль — поза межами.
 */
export function canChangeRoles(
  own: readonly string[],
  before: readonly string[],
  next: readonly string[],
  roles: readonly Pick<Role, "id" | "permissions">[],
): boolean {
  const changed = [
    ...next.filter((id) => !before.includes(id)),
    ...before.filter((id) => !next.includes(id)),
  ]
  return changed.every((id) => {
    const role = roles.find((item) => item.id === id)
    return role !== undefined && canGrant(own, role.permissions)
  })
}

/** Права людини з ролями `roleIds`: об'єднання прав ролей каталогу; невідома роль — без прав. */
export function permissionsOfRoles(
  roleIds: readonly string[],
  roles: readonly Pick<Role, "id" | "permissions">[],
): string[] {
  return [
    ...new Set(
      roleIds.flatMap(
        (id) => roles.find((role) => role.id === id)?.permissions ?? [],
      ),
    ),
  ]
}

/**
 * Чому «Увійти як…» у людину з правами `target` недоступне тому, хто має `own` (ADR-0011,
 * ADR-0032): `"administrator"` — вона сама може входити від імені інших; `"ceiling"` — у неї є
 * права, яких немає в `own`; `null` — можна.
 */
export function impersonationBlock(
  own: readonly string[],
  target: readonly string[],
): "administrator" | "ceiling" | null {
  if (grants(target, "users", "impersonate")) return "administrator"
  return canGrant(own, target) ? null : "ceiling"
}

/** Скільки дій ресурсів дає набір прав — для підсумку «N прав». */
export function countGranted(
  permissions: readonly string[],
  resources: readonly PermissionResource[],
): number {
  return resources.reduce(
    (sum, resource) =>
      sum +
      resource.actions.filter((a) => grants(permissions, resource.id, a.id))
        .length,
    0,
  )
}
