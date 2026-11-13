import { createModuleT } from "@/lib/i18n-namespaces"

import type { ImportExportMessages } from "./extension"
import uk from "./i18n/uk.json"
import { useImportExportModule } from "./module-context"

/**
 * Переклад рядків модуля для сторінок (простір імен `A4-import-export`): перевизначення — з `strings`
 * розширення проекту. В англійській немає форм `_few` і `_many` — тип рядків з української.
 */
export const useImportExportT = createModuleT<ImportExportMessages>(
  "A4-import-export",
  uk,
  () =>
    import("./i18n/en.json").then(
      (m) => m.default as unknown as ImportExportMessages,
    ),
  useImportExportModule,
)

export type ImportExportT = ReturnType<typeof useImportExportT>
