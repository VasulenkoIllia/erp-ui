/**
 * Ресурси модуля A6 без схем: їх бере точка входу (`index.ts`) для прав, журналу аудиту й панелі
 * розробника, не тягнучи zod і схеми контракту в перший екран застосунку.
 */
import type { ModuleResourceWithActions } from "@/lib/module"

export const TAXES = "taxes"
export const UNITS = "units"
export const PAYMENT_TERMS = "payment-terms"
export const TAGS = "tags"
export const REASONS = "reasons"
export const DICTIONARY_DEFAULTS = "dictionary-defaults"

export type DictionaryResource = ModuleResourceWithActions

const DICTIONARY_ACTIONS = ["read", "create", "update"] as const

export const DICTIONARY_RESOURCES: readonly DictionaryResource[] = [
  {
    name: TAXES,
    label: { uk: "Податки", en: "Taxes" },
    actions: DICTIONARY_ACTIONS,
  },
  {
    name: UNITS,
    label: { uk: "Одиниці виміру", en: "Units" },
    actions: DICTIONARY_ACTIONS,
  },
  {
    name: PAYMENT_TERMS,
    label: { uk: "Умови оплати", en: "Payment terms" },
    actions: DICTIONARY_ACTIONS,
  },
  {
    name: TAGS,
    label: { uk: "Теги", en: "Tags" },
    actions: DICTIONARY_ACTIONS,
  },
  {
    name: REASONS,
    label: { uk: "Причини", en: "Reasons" },
    actions: DICTIONARY_ACTIONS,
  },
  {
    name: DICTIONARY_DEFAULTS,
    label: { uk: "Типові значення", en: "Default values" },
    actions: ["read", "update"],
  },
]
