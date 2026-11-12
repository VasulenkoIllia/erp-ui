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
} from "@/lib/statuses"

import { PAYMENT_METHODS } from "../contract"
import type { K4DocumentKind } from "../document-kind"
import { usePaymentsModule } from "../module-context"
import { usePaymentsT } from "../use-payments-t"

/** Статуси оплати чи повернення мовою інтерфейсу зі статусами розширення проекту. */
export function usePaymentStatuses(kind: K4DocumentKind): ResolvedStatuses {
  const t = usePaymentsT()
  const { extension } = usePaymentsModule()
  const statuses = useMemo(
    () =>
      kind.statuses.map((status) => ({
        id: status.id,
        label: t(status.label),
        tone: status.tone,
      })),
    [t, kind],
  )
  return useResolvedStatuses(statuses, kind.extensionOf(extension).statuses)
}

/** Граф дій документа зі змінами розширення: «Скасувати» й «Сторнувати» — підписи кіта. */
export function usePaymentTransitions(
  kind: K4DocumentKind,
): readonly ModuleTransition[] {
  const kitT = useErpUiT()
  const { extension } = usePaymentsModule()
  const transitions = useMemo(
    () =>
      kind.transitions.map((transition) => ({
        ...transition,
        label: kitT(`documentActions.${transition.id}`),
      })),
    [kitT, kind],
  )
  return useResolvedTransitions(
    transitions,
    kind.extensionOf(extension).transitions,
  )
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
