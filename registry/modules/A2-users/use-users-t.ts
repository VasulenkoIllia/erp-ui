import {
  moduleResources,
  useNamespaceResources,
  useNamespaceT,
} from "@/lib/i18n-namespaces"

import type { UsersExtension, UsersMessages } from "./extension"
import uk from "./i18n/uk.json"
import { useUsersModule } from "./module-context"

/** Простір імен рядків модуля в i18next. */
const USERS_NAMESPACE = "A2-users"

const NO_STRINGS: NonNullable<UsersExtension["strings"]> = {}

// В англійській немає форм `_few` і `_many` — тип рядків береться з української.
const resourcesFor = moduleResources<UsersMessages>(uk, () =>
  import("./i18n/en.json").then((m) => m.default as unknown as UsersMessages),
)

/**
 * Переклад рядків модуля для сторінок і вкладок: рядки приходять разом зі сторінками модуля
 * (ADR-0025), перевизначення — з `strings` розширення проекту.
 */
export function useUsersT() {
  const { extension } = useUsersModule()
  useNamespaceResources(
    USERS_NAMESPACE,
    resourcesFor(extension.strings ?? NO_STRINGS),
  )
  return useNamespaceT<UsersMessages>(USERS_NAMESPACE)
}
