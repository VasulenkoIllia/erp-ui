import {
  moduleResources,
  useNamespaceResources,
  useNamespaceT,
} from "@/lib/i18n-namespaces"

import type { NotificationsExtension, NotificationsMessages } from "./extension"
import uk from "./i18n/uk.json"
import { useNotificationsModule } from "./module-context"

/** Простір імен рядків модуля в i18next. */
const NOTIFICATIONS_NAMESPACE = "N5-notifications"

const NO_STRINGS: NonNullable<NotificationsExtension["strings"]> = {}

const resourcesFor = moduleResources<NotificationsMessages>(uk, () =>
  import("./i18n/en.json").then((m) => m.default),
)

/**
 * Переклад рядків модуля для сторінок: рядки приходять разом зі сторінками модуля (ADR-0025),
 * перевизначення — з `strings` розширення проекту.
 */
export function useNotificationsT() {
  const { extension } = useNotificationsModule()
  useNamespaceResources(
    NOTIFICATIONS_NAMESPACE,
    resourcesFor(extension.strings ?? NO_STRINGS),
  )
  return useNamespaceT<NotificationsMessages>(NOTIFICATIONS_NAMESPACE)
}
