/**
 * Ресурси модуля A2 без схем: їх бере точка входу (`index.ts`) для прав, журналу аудиту, токенів API
 * й панелі розробника, не тягнучи zod і схеми контракту в перший екран застосунку.
 */
import type { ModuleResourceWithActions } from "@/lib/module"

export const USERS = "users"
export const ROLES = "roles"

export type UsersResource = ModuleResourceWithActions

export const USERS_RESOURCES: readonly UsersResource[] = [
  {
    name: USERS,
    label: { uk: "Користувачі", en: "Users" },
    // create — запросити колегу; update — ролі й доступ; impersonate — «Увійти як…».
    actions: ["read", "create", "update", "impersonate"],
  },
  {
    name: ROLES,
    label: { uk: "Ролі й права", en: "Roles & permissions" },
    actions: ["read", "update"],
  },
]
