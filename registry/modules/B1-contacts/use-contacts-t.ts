import { createModuleT } from "@/lib/i18n-namespaces"

import type { ContactsMessages } from "./extension"
import uk from "./i18n/uk.json"
import { useContactsModule } from "./module-context"

/**
 * Переклад рядків модуля для сторінок і секцій (простір імен `B1-contacts`): перевизначення — з
 * `strings` розширення проекту. В англійській немає форм `_few` і `_many` — тип рядків з української.
 */
export const useContactsT = createModuleT<ContactsMessages>(
  "B1-contacts",
  uk,
  () =>
    import("./i18n/en.json").then(
      (m) => m.default as unknown as ContactsMessages,
    ),
  useContactsModule,
)
