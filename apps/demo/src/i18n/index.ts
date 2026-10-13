/**
 * Рядки демо (простір імен `demo`) поверх рядків кіта (`erp-ui`).
 * Мова й інші вподобання зберігаються разом із виглядом (src/appearance).
 */
import { createI18n, type Language } from "@/registry/lib/i18n"

import en from "./en.json"
import uk from "./uk.json"

export const DEMO_NAMESPACE = "demo"

export const demoResources = {
  uk: { [DEMO_NAMESPACE]: uk },
  en: { [DEMO_NAMESPACE]: en },
}

export function createDemoI18n(language?: Language) {
  return createI18n({
    language,
    resources: demoResources,
    defaultNamespace: DEMO_NAMESPACE,
  })
}
