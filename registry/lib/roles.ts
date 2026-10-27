/**
 * Ролі й права (ADR-0014, основа модуля A2): ролі з набором прав `<ресурс>:<дія>` (ADR-0003) і
 * призначення ролей користувачам. Права користувача — об'єднання прав його ролей.
 *
 * Контракт (під `/api/v1`, право `roles:read` / `roles:update`):
 * - `GET /roles` → { roles, resources }:
 *   - роль — id, назва, опис, `system` (вбудована: не змінюється й не видаляється), права, скільки
 *     користувачів її мають;
 *   - `resources` — каталог прав проекту: ресурс із назвою, розділом і своїми діями (`read`,
 *     `create`, `update`, `delete`, `impersonate`, `export`…) мовою `Accept-Language`.
 * - `POST /roles` { name, description, permissions } → роль; `PATCH /roles/:id` → роль;
 *   `DELETE /roles/:id` → 204. Помилки — 422 `fieldErrors` (`name`: `required` / `taken`,
 *   `permissions`: `invalid`); вбудована роль — 403; роль із користувачами не видаляється — 409.
 * - `PUT /users/:id/roles` { roles } → 204: ролі користувача (право `users:update`, повторне
 *   підтвердження; хоча б одна роль; свої ролі — ні, щоб не втратити доступ).
 * - «Стеля» (ADR-0032): дати, змінити, скопіювати чи видалити можна лише права, які людина має сама
 *   в компанії запиту (`canGrant`, `canChangePermissions`, `canChangeRoles`); сильнішу роль не
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
  actions: z.array(z.object({ id: z.string(), label: z.string() })).min(1),
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

/** Чи дає набір прав дію над ресурсом (`*`, `<ресурс>:*`, `<ресурс>:<дія>`). */
export function grants(
  permissions: readonly string[],
  resource: string,
  action: string,
): boolean {
  return permissions.some(
    (p) => p === "*" || p === `${resource}:*` || p === `${resource}:${action}`,
  )
}

/**
 * Увімкнути чи вимкнути дію ресурсу в наборі прав. Усі дії ресурсу разом стискаються до
 * `<ресурс>:*`; вимкнення однієї з `*` розгортає решту явно.
 */
export function togglePermission(
  permissions: readonly string[],
  resource: PermissionResource,
  action: string,
  on: boolean,
): string[] {
  const own = (p: string) => p.startsWith(`${resource.id}:`)
  const current = resource.actions
    .map((a) => a.id)
    .filter((id) => grants(permissions, resource.id, id))
  const next = on
    ? [...new Set([...current, action])]
    : current.filter((id) => id !== action)
  const rest = permissions.filter((p) => !own(p))
  if (next.length === resource.actions.length)
    return [...rest, `${resource.id}:*`]
  return [...rest, ...next.map((id) => `${resource.id}:${id}`)]
}

/* ---------------------------------- Стеля ---------------------------------- */

/**
 * Чи покриває набір прав `own` одне право («стеля», ADR-0032): `*` — лише `*`; `<ресурс>:*` — `*`
 * або `<ресурс>:*`; `<ресурс>:<дія>` — будь-що з трьох.
 */
export function coversPermission(
  own: readonly string[],
  permission: string,
): boolean {
  if (permission === "*") return own.includes("*")
  const [resource = "", action = ""] = permission.split(":")
  if (action === "*") return own.includes("*") || own.includes(`${resource}:*`)
  return grants(own, resource, action)
}

/** Чи може людина з правами `own` дати набір прав: кожне право — в межах її власних. */
export function canGrant(
  own: readonly string[],
  permissions: readonly string[],
): boolean {
  return permissions.every((permission) => coversPermission(own, permission))
}

/** Право описує ресурс і дію каталогу (`<ресурс>:*` — будь-який ресурс каталогу). */
function inCatalog(
  permission: string,
  resources: readonly PermissionResource[],
): boolean {
  const [resource = "", action = "", ...rest] = permission.split(":")
  const known = resources.find((item) => item.id === resource)
  return (
    known !== undefined &&
    !rest.length &&
    (action === "*" || known.actions.some(({ id }) => id === action))
  )
}

/**
 * Чи може людина з правами `own` змінити права ролі з `before` на `next`: кожна дія каталогу, яку
 * зміна вмикає чи вимикає, — у межах `own`; право поза каталогом — так само рядком; `*` додає чи
 * прибирає лише той, хто має `*`.
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
  ].filter((p) => p !== "*" && !inCatalog(p, resources))
  if (!canGrant(own, changedOutside)) return false
  return resources.every((resource) =>
    resource.actions.every(
      ({ id }) =>
        grants(before, resource.id, id) === grants(next, resource.id, id) ||
        grants(own, resource.id, id),
    ),
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
