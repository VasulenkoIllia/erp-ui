import { createModuleT } from "@/lib/i18n-namespaces"

import type { DictionariesMessages } from "./extension"
import uk from "./i18n/uk.json"
import { useDictionariesModule } from "./module-context"

/**
 * Переклад рядків модуля для сторінок (простір імен `A6-dictionaries`): перевизначення — з `strings`
 * розширення проекту. В англійській немає форм `_few` і `_many` — тип рядків з української.
 */
export const useDictionariesT = createModuleT<DictionariesMessages>(
  "A6-dictionaries",
  uk,
  () =>
    import("./i18n/en.json").then(
      (m) => m.default as unknown as DictionariesMessages,
    ),
  useDictionariesModule,
)

export type DictionariesT = ReturnType<typeof useDictionariesT>
