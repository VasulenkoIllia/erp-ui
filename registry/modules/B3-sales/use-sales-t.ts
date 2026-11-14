import type { MessageKey } from "@/lib/i18n"
import {
  createModuleSheetT,
  createModuleT,
  type ModuleSheetT,
} from "@/lib/i18n-namespaces"

import type { SalesMessages } from "./extension"
import uk from "./i18n/uk.json"
import { useSalesModule } from "./module-context"

/** Ключ рядка модуля: `quote.title`, `orders.bulk.cancel` (без суфіксів множини). */
export type SalesKey = MessageKey<SalesMessages>

/**
 * Переклад рядків модуля для сторінок (простір імен `B3-sales`): перевизначення — з `strings`
 * розширення проекту. В англійській немає форм `_few` і `_many` — тип рядків з української.
 */
const loadEn = () =>
  import("./i18n/en.json").then((m) => m.default as unknown as SalesMessages)

export const useSalesT = createModuleT<SalesMessages>(
  "B3-sales",
  uk,
  loadEn,
  useSalesModule,
)

/** Переклад рядків модуля мовою аркуша друку (`<запис>.sheet.*`, ADR-0086). */
export type SalesSheetT = ModuleSheetT<SalesMessages>["t"]

/** Рядки модуля мовою документа: назва й тексти аркуша друку з перевизначеннями `strings`. */
export const useSalesSheetT = createModuleSheetT<SalesMessages>(
  "B3-sales",
  uk,
  loadEn,
  useSalesModule,
)
