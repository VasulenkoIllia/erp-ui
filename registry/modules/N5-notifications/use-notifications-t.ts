import { createModuleT } from "@/lib/i18n-namespaces"

import type { NotificationsMessages } from "./extension"
import uk from "./i18n/uk.json"
import { useNotificationsModule } from "./module-context"

/**
 * Переклад рядків модуля для сторінок (простір імен `N5-notifications`): перевизначення — з `strings`
 * розширення проекту.
 */
export const useNotificationsT = createModuleT<NotificationsMessages>(
  "N5-notifications",
  uk,
  () => import("./i18n/en.json").then((m) => m.default),
  useNotificationsModule,
)
