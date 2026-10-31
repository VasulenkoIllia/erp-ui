import {
  moduleResources,
  useNamespaceResources,
  useNamespaceT,
} from "@/lib/i18n-namespaces"

import type { AuditExtension, AuditMessages } from "./extension"
import uk from "./i18n/uk.json"
import { useAuditModule } from "./module-context"

/** Простір імен рядків модуля в i18next. */
const AUDIT_NAMESPACE = "A5-audit"

const NO_STRINGS: NonNullable<AuditExtension["strings"]> = {}

const resourcesFor = moduleResources<AuditMessages>(uk, () =>
  import("./i18n/en.json").then((m) => m.default),
)

/**
 * Переклад рядків модуля для сторінок: рядки приходять разом зі сторінками модуля (ADR-0025),
 * перевизначення — з `strings` розширення проекту.
 */
export function useAuditT() {
  const { extension } = useAuditModule()
  useNamespaceResources(
    AUDIT_NAMESPACE,
    resourcesFor(extension.strings ?? NO_STRINGS),
  )
  return useNamespaceT<AuditMessages>(AUDIT_NAMESPACE)
}
