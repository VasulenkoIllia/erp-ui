import {
  moduleResources,
  useNamespaceResources,
  useNamespaceT,
} from "@/lib/i18n-namespaces"

import type { DictionariesExtension, DictionariesMessages } from "./extension"
import uk from "./i18n/uk.json"
import { useDictionariesModule } from "./module-context"

/** Простір імен рядків модуля в i18next. */
const DICTIONARIES_NAMESPACE = "A6-dictionaries"

const NO_STRINGS: NonNullable<DictionariesExtension["strings"]> = {}

// В англійській немає форм `_few` і `_many` — тип рядків береться з української.
const resourcesFor = moduleResources<DictionariesMessages>(uk, () =>
  import("./i18n/en.json").then(
    (m) => m.default as unknown as DictionariesMessages,
  ),
)

/**
 * Переклад рядків модуля для сторінок: рядки приходять разом зі сторінками модуля (ADR-0025),
 * перевизначення — з `strings` розширення проекту.
 */
export function useDictionariesT() {
  const { extension } = useDictionariesModule()
  useNamespaceResources(
    DICTIONARIES_NAMESPACE,
    resourcesFor(extension.strings ?? NO_STRINGS),
  )
  return useNamespaceT<DictionariesMessages>(DICTIONARIES_NAMESPACE)
}

export type DictionariesT = ReturnType<typeof useDictionariesT>
