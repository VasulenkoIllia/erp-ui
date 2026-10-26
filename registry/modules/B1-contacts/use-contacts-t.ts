import {
  moduleResources,
  useNamespaceResources,
  useNamespaceT,
} from "@/lib/i18n-namespaces"

import type { ContactsExtension, ContactsMessages } from "./extension"
import uk from "./i18n/uk.json"
import { useContactsModule } from "./module-context"

/** Простір імен рядків модуля в i18next. */
const CONTACTS_NAMESPACE = "B1-contacts"

const NO_STRINGS: NonNullable<ContactsExtension["strings"]> = {}

// В англійській немає форм `_few` і `_many` — тип рядків береться з української.
const resourcesFor = moduleResources<ContactsMessages>(uk, () =>
  import("./i18n/en.json").then(
    (m) => m.default as unknown as ContactsMessages,
  ),
)

/**
 * Переклад рядків модуля для сторінок і секцій: рядки приходять разом зі сторінками модуля
 * (ADR-0025), перевизначення — з `strings` розширення проекту.
 */
export function useContactsT() {
  const { extension } = useContactsModule()
  useNamespaceResources(
    CONTACTS_NAMESPACE,
    resourcesFor(extension.strings ?? NO_STRINGS),
  )
  return useNamespaceT<ContactsMessages>(CONTACTS_NAMESPACE)
}
