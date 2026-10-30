import {
  moduleResources,
  useNamespaceResources,
  useNamespaceT,
} from "@/lib/i18n-namespaces"

import type { CompanyExtension, CompanyMessages } from "./extension"
import uk from "./i18n/uk.json"
import { useCompanyModule } from "./module-context"

/** Простір імен рядків модуля в i18next. */
const COMPANY_NAMESPACE = "A1-company"

const NO_STRINGS: NonNullable<CompanyExtension["strings"]> = {}

// В англійській немає форм `_few` і `_many` — тип рядків береться з української.
const resourcesFor = moduleResources<CompanyMessages>(uk, () =>
  import("./i18n/en.json").then((m) => m.default as unknown as CompanyMessages),
)

/**
 * Переклад рядків модуля для сторінок: рядки приходять разом зі сторінками модуля (ADR-0025),
 * перевизначення — з `strings` розширення проекту.
 */
export function useCompanyT() {
  const { extension } = useCompanyModule()
  useNamespaceResources(
    COMPANY_NAMESPACE,
    resourcesFor(extension.strings ?? NO_STRINGS),
  )
  return useNamespaceT<CompanyMessages>(COMPANY_NAMESPACE)
}
