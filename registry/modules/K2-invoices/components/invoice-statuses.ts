import { useMemo } from "react"

import { isDocumentAction } from "@/lib/document-lifecycle"
import { useErpUiT } from "@/lib/i18n"
import {
  useResolvedStatuses,
  useResolvedTransitions,
  type ModuleTransition,
  type ResolvedStatuses,
} from "@/lib/statuses"

import { INVOICE_TRANSITIONS } from "../contract"
import {
  INVOICE_ACTION_LABELS,
  INVOICE_CONFIRMS,
  INVOICE_STATUS_ITEMS,
} from "../invoice-kind"
import { useInvoicesModule } from "../module-context"
import { useInvoicesT } from "../use-invoices-t"

/** Статуси рахунку мовою інтерфейсу зі статусами розширення проекту. */
export function useInvoiceStatuses(): ResolvedStatuses {
  const t = useInvoicesT()
  const { extension } = useInvoicesModule()
  const statuses = useMemo(
    () =>
      INVOICE_STATUS_ITEMS.map(({ id, tone, label }) => ({
        id,
        label: t(label),
        tone,
      })),
    [t],
  )
  return useResolvedStatuses(statuses, extension.invoices?.statuses)
}

/**
 * Граф дій зі змінами розширення: «Виставити» зі своїм підписом і підтвердженням, «Скасувати»,
 * «Сторнувати» й «Виправити» — підписи кіта.
 */
export function useInvoiceTransitions(): readonly ModuleTransition[] {
  const t = useInvoicesT()
  const kitT = useErpUiT()
  const { extension } = useInvoicesModule()
  const transitions = useMemo(
    () =>
      INVOICE_TRANSITIONS.map((transition) => {
        const label = INVOICE_ACTION_LABELS[transition.id]
        const confirm = INVOICE_CONFIRMS[transition.id]
        return {
          ...transition,
          label: label
            ? t(label)
            : isDocumentAction(transition.id)
              ? kitT(`documentActions.${transition.id}`)
              : transition.id,
          confirm: confirm
            ? {
                title: t(`${confirm}.title`),
                description: t(`${confirm}.description`),
                action: t(`${confirm}.action`),
              }
            : undefined,
        }
      }),
    [t, kitT],
  )
  return useResolvedTransitions(transitions, extension.invoices?.transitions)
}
