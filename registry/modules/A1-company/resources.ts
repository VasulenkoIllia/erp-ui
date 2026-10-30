/**
 * Ресурси модуля A1 без схем: їх бере точка входу (`index.ts`) для прав, журналу аудиту й панелі
 * розробника, не тягнучи zod і схеми контракту в перший екран застосунку.
 */
import type { LocalizedText } from "@/lib/auth"

/** Налаштування компанії (`lib/company`): читає кожен у компанії, змінює `company:update`. */
export const COMPANY = "company"
export const CURRENCIES = "currencies"
export const EXCHANGE_RATES = "exchange-rates"

export interface CompanyResource {
  readonly name: string
  readonly label: LocalizedText
  readonly actions: readonly string[]
}

export const COMPANY_RESOURCES: readonly CompanyResource[] = [
  {
    name: COMPANY,
    label: { uk: "Компанія", en: "Company" },
    actions: ["update"],
  },
  {
    name: CURRENCIES,
    label: { uk: "Валюти", en: "Currencies" },
    actions: ["read", "create", "update"],
  },
  {
    name: EXCHANGE_RATES,
    label: { uk: "Курси валют", en: "Exchange rates" },
    actions: ["read", "create", "update", "delete"],
  },
]
