import type { MessageKey } from "@/lib/i18n"
import { createModuleT } from "@/lib/i18n-namespaces"

import type { PaymentsMessages } from "./extension"
import uk from "./i18n/uk.json"
import { usePaymentsModule } from "./module-context"

/** Ключ рядка модуля: `payment.title`, `paymentForm.invoices.auto` (без суфіксів множини). */
export type PaymentsKey = MessageKey<PaymentsMessages>

/**
 * Переклад рядків модуля для сторінок (простір імен `K4-payments`): перевизначення — з `strings`
 * розширення проекту. В англійській немає форм `_few` і `_many` — тип рядків з української.
 */
export const usePaymentsT = createModuleT<PaymentsMessages>(
  "K4-payments",
  uk,
  () =>
    import("./i18n/en.json").then(
      (m) => m.default as unknown as PaymentsMessages,
    ),
  usePaymentsModule,
)
