import type { MessageKey } from "@/lib/i18n"
import {
  moduleResources,
  useNamespaceResources,
  useNamespaceT,
} from "@/lib/i18n-namespaces"

import type { PaymentsExtension, PaymentsMessages } from "./extension"
import uk from "./i18n/uk.json"
import { usePaymentsModule } from "./module-context"

/** Ключ рядка модуля: `payment.title`, `paymentForm.invoices.auto` (без суфіксів множини). */
export type PaymentsKey = MessageKey<PaymentsMessages>

/** Простір імен рядків модуля в i18next. */
const PAYMENTS_NAMESPACE = "K4-payments"

const NO_STRINGS: NonNullable<PaymentsExtension["strings"]> = {}

// В англійській немає форм `_few` і `_many` — тип рядків береться з української.
const resourcesFor = moduleResources<PaymentsMessages>(uk, () =>
  import("./i18n/en.json").then(
    (m) => m.default as unknown as PaymentsMessages,
  ),
)

/**
 * Переклад рядків модуля для сторінок і секцій: рядки приходять разом зі сторінками модуля (ADR-0025),
 * перевизначення — з `strings` розширення проекту.
 */
export function usePaymentsT() {
  const { extension } = usePaymentsModule()
  useNamespaceResources(
    PAYMENTS_NAMESPACE,
    resourcesFor(extension.strings ?? NO_STRINGS),
  )
  return useNamespaceT<PaymentsMessages>(PAYMENTS_NAMESPACE)
}
