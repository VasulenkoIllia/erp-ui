/**
 * Мови інтерфейсу erp-ui (SPEC §11): i18next + react-i18next, українська — основна, англійська — друга.
 *
 * - `createI18n()` створює екземпляр i18next із рядками кіта (простір імен `erp-ui`) і рядками проекту;
 *   викликається один раз у main.tsx до рендеру.
 * - Мова за замовчуванням — завжди українська; мову браузера не враховуємо (рішення власника 13.10.2026).
 * - Англійська показує британські формати (en-GB): день перед місяцем, 24-годинний час.
 * - `<html lang>` синхронізується з мовою інтерфейсу.
 */
import i18next, { type i18n } from "i18next"
import { useMemo } from "react"
import { initReactI18next, useTranslation } from "react-i18next"

import { en } from "@/registry/lib/i18n-en"
import { uk, type ErpUiMessages } from "@/registry/lib/i18n-uk"

export const LANGUAGES = ["uk", "en"] as const
export type Language = (typeof LANGUAGES)[number]
export const DEFAULT_LANGUAGE: Language = "uk"

/** Мова інтерфейсу → локаль Intl для чисел, сум і дат. */
export const LOCALES: Record<Language, string> = { uk: "uk-UA", en: "en-GB" }

export const ERP_UI_NAMESPACE = "erp-ui"

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language)
}

/** Мова з рядка i18next ("uk", "en-GB" тощо) → підтримувана мова інтерфейсу. */
export function toLanguage(value: string | undefined): Language {
  const base = value?.split("-")[0]
  return isLanguage(base) ? base : DEFAULT_LANGUAGE
}

/** Рядки проекту: мова → простір імен → дерево рядків. */
export type AppResources = Partial<Record<Language, Record<string, object>>>

export interface CreateI18nOptions {
  /** Початкова мова, наприклад збережена у вподобаннях користувача. */
  language?: Language
  /** Рядки проекту й модулів. */
  resources?: AppResources
  /** Простір імен за замовчуванням для `t()` проекту. */
  defaultNamespace?: string
}

export function createI18n({
  language = DEFAULT_LANGUAGE,
  resources = {},
  defaultNamespace = ERP_UI_NAMESPACE,
}: CreateI18nOptions = {}): i18n {
  const kit: Record<Language, object> = { uk, en }
  const merged = Object.fromEntries(
    LANGUAGES.map((lng) => [
      lng,
      { [ERP_UI_NAMESPACE]: kit[lng], ...resources[lng] },
    ]),
  )
  const namespaces = [
    ...new Set([
      ERP_UI_NAMESPACE,
      ...LANGUAGES.flatMap((lng) => Object.keys(resources[lng] ?? {})),
    ]),
  ]

  const instance = i18next.createInstance()
  instance.on("languageChanged", (lng) => {
    if (typeof document !== "undefined")
      document.documentElement.lang = toLanguage(lng)
  })
  // Рядки вже в пам'яті, тож ініціалізація синхронна: перший рендер одразу з перекладами.
  void instance.use(initReactI18next).init({
    lng: language,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: [...LANGUAGES],
    resources: merged,
    ns: namespaces,
    defaultNS: defaultNamespace,
    initAsync: false,
    // React сам екранує текст.
    interpolation: { escapeValue: false },
  })
  return instance
}

/** Поточна мова інтерфейсу й локаль Intl для неї. Перемальовує компонент при зміні мови. */
export function useLanguage(): { language: Language; locale: string } {
  const { i18n } = useTranslation()
  const language = toLanguage(i18n.resolvedLanguage ?? i18n.language)
  return { language, locale: LOCALES[language] }
}

type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : Leaves<T[K], `${Prefix}${K}.`>
}[keyof T & string]
type PluralSuffix = "zero" | "one" | "two" | "few" | "many" | "other"
type WithoutPlural<K> = K extends `${infer Base}_${PluralSuffix}` ? Base : K

/** Ключ рядка кіта, напр. "common.close" або "validation.iban.checksum". */
export type ErpUiKey = WithoutPlural<Leaves<ErpUiMessages>>
export type ErpUiTranslate = (
  key: ErpUiKey,
  options?: Record<string, unknown>,
) => string

/** Переклад рядків кіта — для компонентів реєстру. */
export function useErpUiT(): ErpUiTranslate {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  return useMemo(() => {
    // Власні типи ключів: не залежимо від CustomTypeOptions проекту, де простору erp-ui може не бути.
    const fixed = i18n.getFixedT(language, ERP_UI_NAMESPACE as never)
    // Без проектних типів приведення зайве (так бачить лінтер), з ними — потрібне.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- див. коментар вище
    return fixed as unknown as ErpUiTranslate
  }, [i18n, language])
}
