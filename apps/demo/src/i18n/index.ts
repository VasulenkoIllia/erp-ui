/**
 * Рядки демо (простір імен `demo`) поверх рядків кіта (`erp-ui`).
 * Мова й інші вподобання зберігаються разом із виглядом (src/appearance).
 * Англійські рядки — окремим чанком (ADR-0009): у пам'яті лише потрібна мова.
 */
import {
  createI18n,
  type AppResources,
  type Language,
} from "@/registry/lib/i18n"

import uk from "./uk.json"

export const DEMO_NAMESPACE = "demo"

export const demoResources = {
  uk: { [DEMO_NAMESPACE]: uk },
  en: () => import("./en.json").then((m) => ({ [DEMO_NAMESPACE]: m.default })),
} satisfies AppResources

export function createDemoI18n(language?: Language) {
  return createI18n({
    language,
    resources: demoResources,
    defaultNamespace: DEMO_NAMESPACE,
  })
}
