import { createModuleT } from "@/lib/i18n-namespaces"

import type { CompanyMessages } from "./extension"
import uk from "./i18n/uk.json"
import { useCompanyModule } from "./module-context"

/**
 * Переклад рядків модуля для сторінок (простір імен `A1-company`): перевизначення — з `strings`
 * розширення проекту. В англійській немає форм `_few` і `_many` — тип рядків з української.
 */
export const useCompanyT = createModuleT<CompanyMessages>(
  "A1-company",
  uk,
  () =>
    import("./i18n/en.json").then(
      (m) => m.default as unknown as CompanyMessages,
    ),
  useCompanyModule,
)
