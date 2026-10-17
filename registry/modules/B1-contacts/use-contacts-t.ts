import {
  mergeMessages,
  useNamespaceResources,
  useNamespaceT,
  type NamespaceResources,
} from "@/lib/i18n-namespaces"

import type { ContactsExtension, ContactsMessages } from "./extension"
import uk from "./i18n/uk.json"
import { useContactsModule } from "./module-context"

/** Простір імен рядків модуля в i18next. */
const CONTACTS_NAMESPACE = "B1-contacts"

const NO_STRINGS: NonNullable<ContactsExtension["strings"]> = {}
/** Рядки з перевизначеннями — одні на розширення: i18next отримує їх раз. */
const resourcesCache = new WeakMap<object, NamespaceResources>()

function resourcesFor(
  strings: NonNullable<ContactsExtension["strings"]>,
): NamespaceResources {
  let resources = resourcesCache.get(strings)
  if (!resources) {
    resources = {
      uk: mergeMessages(uk, strings.uk),
      // Англійські — окремим чанком: у пам'яті лише мова інтерфейсу (ADR-0009).
      en: () =>
        import("./i18n/en.json").then((m) =>
          // В англійській немає форм `_few` і `_many` — тип рядків береться з української.
          mergeMessages(m.default as unknown as ContactsMessages, strings.en),
        ),
    }
    resourcesCache.set(strings, resources)
  }
  return resources
}

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
