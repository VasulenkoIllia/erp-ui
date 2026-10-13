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
