import type { MessageKey } from "@/lib/i18n"
import {
  moduleResources,
  useNamespaceResources,
  useNamespaceT,
} from "@/lib/i18n-namespaces"

import type { InvoicesExtension, InvoicesMessages } from "./extension"
import uk from "./i18n/uk.json"
import { useInvoicesModule } from "./module-context"

/** Ключ рядка модуля: `invoice.title`, `invoices.bulk.cancel` (без суфіксів множини). */
export type InvoicesKey = MessageKey<InvoicesMessages>

/** Простір імен рядків модуля в i18next. */
const INVOICES_NAMESPACE = "K2-invoices"

const NO_STRINGS: NonNullable<InvoicesExtension["strings"]> = {}

// В англійській немає форм `_few` і `_many` — тип рядків береться з української.
const resourcesFor = moduleResources<InvoicesMessages>(uk, () =>
  import("./i18n/en.json").then(
    (m) => m.default as unknown as InvoicesMessages,
  ),
)

/**
 * Переклад рядків модуля для сторінок і секцій: рядки приходять разом зі сторінками модуля
 * (ADR-0025), перевизначення — з `strings` розширення проекту.
 */
export function useInvoicesT() {
  const { extension } = useInvoicesModule()
  useNamespaceResources(
    INVOICES_NAMESPACE,
    resourcesFor(extension.strings ?? NO_STRINGS),
  )
  return useNamespaceT<InvoicesMessages>(INVOICES_NAMESPACE)
}
