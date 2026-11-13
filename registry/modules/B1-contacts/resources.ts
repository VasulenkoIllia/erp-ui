/**
 * Ресурси модуля B1 без схем: їх бере точка входу (`index.ts`) для прав, журналу аудиту, токенів API
 * й панелі розробника, не тягнучи zod і схеми контракту в перший екран застосунку.
 */
import type { ModuleResourceWithActions } from "@/lib/module"

export const ORGANIZATIONS = "organizations"
export const CONTACTS = "contacts"
export const SEGMENTS = "segments"

export type ContactsResource = ModuleResourceWithActions

const CRUD = ["read", "create", "update", "delete"] as const

export const CONTACTS_RESOURCES: readonly ContactsResource[] = [
  { name: CONTACTS, label: { uk: "Контакти", en: "Contacts" }, actions: CRUD },
  {
    name: ORGANIZATIONS,
    label: { uk: "Організації", en: "Organizations" },
    actions: CRUD,
  },
  { name: SEGMENTS, label: { uk: "Сегменти", en: "Segments" }, actions: CRUD },
]
