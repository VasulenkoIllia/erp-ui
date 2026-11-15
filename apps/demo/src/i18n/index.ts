/**
 * Рядки демо (простір імен `demo`) поверх рядків кіта (`erp-ui`).
 * Мова й інші вподобання зберігаються разом із виглядом (src/appearance).
 * Англійські рядки — окремим чанком (ADR-0009): у пам'яті лише потрібна мова.
 * Українські на старті — лише шапка (`uk.json`); рядки сторінки приходять із її чанком (`pages.ts`, ADR-0094).
 */
import type { KeyPrefix } from "i18next"
import {
  useTranslation,
  type UseTranslationOptions,
  type UseTranslationResponse,
} from "react-i18next"

import {
  createI18n,
  useStrings,
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

/**
 * `useTranslation` простору `demo` з рядками сторінки (`pages.ts`): частини додаються до першого `t()`, тож
 * сторінка й її діалоги показують свої тексти, хоч у першому екрані їх немає (ADR-0094).
 *
 *   const { t } = useDemoTranslation([ukDataPage], { keyPrefix: "dataPage" })
 */
export function useDemoTranslation<
  const KPrefix extends KeyPrefix<typeof DEMO_NAMESPACE> = undefined,
>(
  parts: readonly object[],
  options?: UseTranslationOptions<KPrefix>,
): UseTranslationResponse<typeof DEMO_NAMESPACE, KPrefix> {
  useStrings(DEMO_NAMESPACE, ...parts)
  return useTranslation(DEMO_NAMESPACE, options)
}
