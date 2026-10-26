/**
 * Ресурси модуля A2 без схем: їх бере точка входу (`index.ts`) для прав, журналу аудиту, токенів API
 * й панелі розробника, не тягнучи zod і схеми контракту в перший екран застосунку.
 */
import type { LocalizedText } from "@/lib/auth"

export const USERS = "users"
export const ROLES = "roles"

export interface UsersResource {
  readonly name: string
  readonly label: LocalizedText
  readonly actions: readonly string[]
}

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
