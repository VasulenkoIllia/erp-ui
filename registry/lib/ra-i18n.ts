/**
 * i18nProvider для ra-core поверх i18next кіта: повідомлення ra-core («Запис оновлено»,
 * помилки форм) беруться з рядків кіта (`erp-ui:ra.*`) мовою інтерфейсу.
 * Ключі, яких немає в кіті, показуються англійським текстом за замовчуванням від ra-core (`_`).
 */
import type { i18n } from "i18next"
import type { I18nProvider } from "ra-core"

import { ERP_UI_NAMESPACE, LANGUAGES, toLanguage } from "@/registry/lib/i18n"
import { LANGUAGE_NAMES } from "@/registry/lib/language-names"

export function createRaI18nProvider(instance: i18n): I18nProvider {
  return {
    translate: (key: string, options: Record<string, unknown> = {}) => {
      const { _: fallback, smart_count: count, ...rest } = options
      return instance.t(key, {
        ns: ERP_UI_NAMESPACE,
        defaultValue: typeof fallback === "string" ? fallback : key,
        ...(typeof count === "number" ? { count } : {}),
        ...rest,
      })
    },
    changeLocale: async (locale: string) => {
      await instance.changeLanguage(locale)
    },
    getLocale: () => toLanguage(instance.language),
    getLocales: () =>
      LANGUAGES.map((locale) => ({ locale, name: LANGUAGE_NAMES[locale] })),
  }
}
