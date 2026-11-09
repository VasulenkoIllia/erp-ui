import { useMemo } from "react"

import { isDocumentAction } from "@/lib/document-lifecycle"
import { useErpUiT } from "@/lib/i18n"
import {
  useResolvedStatuses,
  useResolvedTransitions,
  type ModuleTransition,
  type ResolvedStatuses,
} from "@/lib/statuses"

import type { SalesDocument } from "../contract"
import { useSalesModule } from "../module-context"
import type { SalesDocumentKind } from "../sales-kinds"
import { useSalesT } from "../use-sales-t"

/** Статуси документа мовою інтерфейсу зі статусами розширення проекту. */
export function useSalesStatuses<D extends SalesDocument, Due extends string>(
  kind: SalesDocumentKind<D, Due>,
): ResolvedStatuses {
  const t = useSalesT()
  const { extension } = useSalesModule()
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
 * Граф дій зі змінами розширення: дії модуля зі своїм підписом і підтвердженням («Надіслати
 * пропозицію?», «Позначити виконаним»), «Скасувати» й «Виправити» — підписи кіта.
 */
export function useSalesTransitions<
  D extends SalesDocument,
  Due extends string,
>(kind: SalesDocumentKind<D, Due>): readonly ModuleTransition[] {
  const t = useSalesT()
  const kitT = useErpUiT()
  const { extension } = useSalesModule()
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
