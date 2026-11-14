import type { MessageKey } from "@/lib/i18n"
import {
  createModuleSheetT,
  createModuleT,
  type ModuleSheetT,
} from "@/lib/i18n-namespaces"

import type { InvoicesMessages } from "./extension"
import uk from "./i18n/uk.json"
import { useInvoicesModule } from "./module-context"

/** Ключ рядка модуля: `invoice.title`, `invoices.bulk.cancel` (без суфіксів множини). */
export type InvoicesKey = MessageKey<InvoicesMessages>

/**
 * Переклад рядків модуля для сторінок (простір імен `K2-invoices`): перевизначення — з `strings`
 * розширення проекту. В англійській немає форм `_few` і `_many` — тип рядків з української.
 */
const loadEn = () =>
  import("./i18n/en.json").then((m) => m.default as unknown as InvoicesMessages)

export const useInvoicesT = createModuleT<InvoicesMessages>(
  "K2-invoices",
  uk,
  loadEn,
  useInvoicesModule,
)

/** Переклад рядків модуля мовою аркуша друку (`<документ>.sheet.*`, ADR-0086). */
export type InvoicesSheetT = ModuleSheetT<InvoicesMessages>["t"]

/** Рядки модуля мовою документа: назва й тексти аркуша друку з перевизначеннями `strings`. */
export const useInvoicesSheetT = createModuleSheetT<InvoicesMessages>(
  "K2-invoices",
  uk,
  loadEn,
  useInvoicesModule,
)
