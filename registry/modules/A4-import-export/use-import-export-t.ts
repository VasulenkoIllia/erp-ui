import {
  moduleResources,
  useNamespaceResources,
  useNamespaceT,
} from "@/lib/i18n-namespaces"

import type { ImportExportExtension, ImportExportMessages } from "./extension"
import uk from "./i18n/uk.json"
import { useImportExportModule } from "./module-context"

/** Простір імен рядків модуля в i18next. */
const IMPORT_EXPORT_NAMESPACE = "A4-import-export"

const NO_STRINGS: NonNullable<ImportExportExtension["strings"]> = {}

// В англійській немає форм `_few` і `_many` — тип рядків береться з української.
const resourcesFor = moduleResources<ImportExportMessages>(uk, () =>
  import("./i18n/en.json").then(
    (m) => m.default as unknown as ImportExportMessages,
  ),
)

/**
 * Переклад рядків модуля для сторінок: рядки приходять разом зі сторінками модуля (ADR-0025),
 * перевизначення — з `strings` розширення проекту.
 */
export function useImportExportT() {
  const { extension } = useImportExportModule()
  useNamespaceResources(
    IMPORT_EXPORT_NAMESPACE,
    resourcesFor(extension.strings ?? NO_STRINGS),
  )
  return useNamespaceT<ImportExportMessages>(IMPORT_EXPORT_NAMESPACE)
}

export type ImportExportT = ReturnType<typeof useImportExportT>
