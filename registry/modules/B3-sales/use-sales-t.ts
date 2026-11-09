import type { MessageKey } from "@/lib/i18n"
import {
  moduleResources,
  useNamespaceResources,
  useNamespaceT,
} from "@/lib/i18n-namespaces"

import type { SalesExtension, SalesMessages } from "./extension"
import uk from "./i18n/uk.json"
import { useSalesModule } from "./module-context"

/** Ключ рядка модуля: `quote.title`, `orders.bulk.cancel` (без суфіксів множини). */
export type SalesKey = MessageKey<SalesMessages>

/** Простір імен рядків модуля в i18next. */
const SALES_NAMESPACE = "B3-sales"

const NO_STRINGS: NonNullable<SalesExtension["strings"]> = {}

// В англійській немає форм `_few` і `_many` — тип рядків береться з української.
const resourcesFor = moduleResources<SalesMessages>(uk, () =>
  import("./i18n/en.json").then((m) => m.default as unknown as SalesMessages),
)

/**
 * Переклад рядків модуля для сторінок і секцій: рядки приходять разом зі сторінками модуля
 * (ADR-0025), перевизначення — з `strings` розширення проекту.
 */
export function useSalesT() {
  const { extension } = useSalesModule()
  useNamespaceResources(
    SALES_NAMESPACE,
    resourcesFor(extension.strings ?? NO_STRINGS),
  )
  return useNamespaceT<SalesMessages>(SALES_NAMESPACE)
}
