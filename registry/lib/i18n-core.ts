/**
 * Мови інтерфейсу без i18next і React (ADR-0093): перелік мов, локалі Intl і розбір рядка мови. Їх беруть
 * чисті файли — схеми й правила для сервера на TypeScript; `lib/i18n` реекспортує все звідси.
 */
export const LANGUAGES = ["uk", "en"] as const
export type Language = (typeof LANGUAGES)[number]
export const DEFAULT_LANGUAGE = "uk" satisfies Language

/** Мова інтерфейсу → локаль Intl для чисел, сум і дат. */
export const LOCALES: Record<Language, string> = { uk: "uk-UA", en: "en-GB" }

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language)
}

/** Мова з рядка i18next ("uk", "en-GB" тощо) → підтримувана мова інтерфейсу. */
export function toLanguage(value: string | undefined): Language {
  const base = value?.split("-")[0]
  return isLanguage(base) ? base : DEFAULT_LANGUAGE
}
