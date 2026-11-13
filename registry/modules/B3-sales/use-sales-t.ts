import type { MessageKey } from "@/lib/i18n"
import { createModuleT } from "@/lib/i18n-namespaces"

import type { SalesMessages } from "./extension"
import uk from "./i18n/uk.json"
import { useSalesModule } from "./module-context"

/** Ключ рядка модуля: `quote.title`, `orders.bulk.cancel` (без суфіксів множини). */
export type SalesKey = MessageKey<SalesMessages>

/**
 * Переклад рядків модуля для сторінок (простір імен `B3-sales`): перевизначення — з `strings`
 * розширення проекту. В англійській немає форм `_few` і `_many` — тип рядків з української.
 */
export const useSalesT = createModuleT<SalesMessages>(
  "B3-sales",
  uk,
  () =>
    import("./i18n/en.json").then((m) => m.default as unknown as SalesMessages),
  useSalesModule,
)
