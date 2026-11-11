import { useMemo } from "react"

import { isDocumentAction } from "@/lib/document-lifecycle"
import { useErpUiT } from "@/lib/i18n"
import {
  useResolvedStatuses,
  useResolvedTransitions,
  type ModuleTransition,
  type ResolvedStatuses,
} from "@/lib/statuses"

import type { K2DocumentKind } from "../document-kind"
import { useInvoicesModule } from "../module-context"
import { useInvoicesT } from "../use-invoices-t"

/** Статуси документа модуля мовою інтерфейсу зі статусами розширення проекту. */
export function useDocumentStatuses(kind: K2DocumentKind): ResolvedStatuses {
  const t = useInvoicesT()
  const { extension } = useInvoicesModule()
  const statuses = useMemo(
    () =>
      kind.statuses.map(({ id, tone, label }) => ({
        id,
        label: t(label),
        tone,
      })),
    [t, kind],
  )
  return useResolvedStatuses(statuses, kind.extensionOf(extension)?.statuses)
}

/**
 * Граф дій зі змінами розширення: «Виставити» зі своїм підписом і підтвердженням, «Кредит-нота» рахунку —
 * своїм підписом, «Скасувати», «Сторнувати» й «Виправити» — підписи кіта.
 */
export function useDocumentTransitions(
  kind: K2DocumentKind,
): readonly ModuleTransition[] {
  const t = useInvoicesT()
  const kitT = useErpUiT()
  const { extension } = useInvoicesModule()
  const transitions = useMemo(
    () =>
      kind.transitions.map((transition) => {
        const label = kind.actionLabels[transition.id]
        const confirm = kind.confirms[transition.id]
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
    [t, kitT, kind],
  )
  return useResolvedTransitions(
    transitions,
    kind.extensionOf(extension)?.transitions,
  )
}
