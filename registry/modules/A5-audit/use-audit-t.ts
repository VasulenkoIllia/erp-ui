import { createModuleT } from "@/lib/i18n-namespaces"

import type { AuditMessages } from "./extension"
import uk from "./i18n/uk.json"
import { useAuditModule } from "./module-context"

/**
 * Переклад рядків модуля для сторінок (простір імен `A5-audit`): перевизначення — з `strings`
 * розширення проекту.
 */
export const useAuditT = createModuleT<AuditMessages>(
  "A5-audit",
  uk,
  () => import("./i18n/en.json").then((m) => m.default),
  useAuditModule,
)
