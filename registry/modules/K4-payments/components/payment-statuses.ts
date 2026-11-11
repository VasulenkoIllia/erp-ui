import { useMemo } from "react"

import {
  applyKeyedChanges,
  mapKeyedChanges,
  type Keyed,
} from "@/lib/extensions"
import { localizedText } from "@/lib/auth"
import { useErpUiT, useLanguage } from "@/lib/i18n"
import {
  useResolvedStatuses,
  useResolvedTransitions,
  type ModuleTransition,
  type ResolvedStatuses,
  type StatusTone,
} from "@/lib/statuses"

import {
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PAYMENT_TRANSITIONS,
  type PaymentStatus,
} from "../contract"
import { usePaymentsModule } from "../module-context"
import { usePaymentsT } from "../use-payments-t"

/** Тони статусів оплати: отримана — успіх, скасована — помилка, сторнована — попередження. */
const PAYMENT_TONES: Readonly<Record<PaymentStatus, StatusTone>> = {
  received: "success",
  cancelled: "destructive",
  reversed: "warning",
  reversal: "neutral",
}

/** Статуси оплати мовою інтерфейсу зі статусами розширення проекту. */
export function usePaymentStatuses(): ResolvedStatuses {
  const t = usePaymentsT()
  const { extension } = usePaymentsModule()
  const statuses = useMemo(
    () =>
      PAYMENT_STATUSES.map((id) => ({
        id,
        label: t(`payment.statuses.${id}`),
        tone: PAYMENT_TONES[id],
      })),
    [t],
  )
  return useResolvedStatuses(statuses, extension.statuses)
}

/** Граф дій оплати зі змінами розширення: «Скасувати» й «Сторнувати» — підписи кіта. */
export function usePaymentTransitions(): readonly ModuleTransition[] {
  const kitT = useErpUiT()
  const { extension } = usePaymentsModule()
  const transitions = useMemo(
    () =>
      PAYMENT_TRANSITIONS.map((transition) => ({
        ...transition,
        label: kitT(`documentActions.${transition.id}`),
      })),
    [kitT],
  )
  return useResolvedTransitions(transitions, extension.transitions)
}

/** Спосіб оплати для вибору й показу: ключ і підпис мовою інтерфейсу. */
export interface PaymentMethodItem extends Keyed {
  readonly label: string
}

/**
 * Способи оплати модуля зі змінами розширення (`methods`): свій спосіб проекту, сховані способи модуля. Спосіб,
 * якого вже немає у виборі, показується своїм ключем (`labelOf`).
 */
export function usePaymentMethods() {
  const t = usePaymentsT()
  const { language } = useLanguage()
  const { extension } = usePaymentsModule()
  return useMemo(() => {
    const items: readonly PaymentMethodItem[] = applyKeyedChanges(
      PAYMENT_METHODS.map((id) => ({ id, label: t(`payment.methods.${id}`) })),
      mapKeyedChanges(extension.methods, (method) => ({
        id: method.id,
        label: localizedText(method.label, language) ?? method.id,
      })),
    )
    const labels = new Map(items.map((item) => [item.id, item.label]))
    // Підпис і схованого способу: оплата, зареєстрована до зміни розширення, показує його назву.
    const known = new Map<string, string>(
      PAYMENT_METHODS.map((id) => [id, t(`payment.methods.${id}`)]),
    )
    return {
      items,
      labelOf: (id: string) => labels.get(id) ?? known.get(id) ?? id,
    }
  }, [t, language, extension.methods])
}
