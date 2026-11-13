import { createModuleT } from "@/lib/i18n-namespaces"

import type { UsersMessages } from "./extension"
import uk from "./i18n/uk.json"
import { useUsersModule } from "./module-context"

/**
 * Переклад рядків модуля для сторінок (простір імен `A2-users`): перевизначення — з `strings`
 * розширення проекту. В англійській немає форм `_few` і `_many` — тип рядків з української.
 */
export const useUsersT = createModuleT<UsersMessages>(
  "A2-users",
  uk,
  () =>
    import("./i18n/en.json").then((m) => m.default as unknown as UsersMessages),
  useUsersModule,
)
