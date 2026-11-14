import {
  useDocumentStatuses as useKindStatuses,
  useDocumentTransitions as useKindTransitions,
} from "@/lib/document-kind"
import type { ModuleTransition, ResolvedStatuses } from "@/lib/statuses"

import type { K2DocumentKind } from "../document-kind"
import { useInvoicesModule } from "../module-context"
import { useInvoicesT } from "../use-invoices-t"

/** Статуси документа модуля мовою інтерфейсу зі статусами розширення проекту. */
export function useDocumentStatuses(kind: K2DocumentKind): ResolvedStatuses {
  const t = useInvoicesT()
  const { extension } = useInvoicesModule()
  return useKindStatuses(
    kind.statuses,
    t,
    kind.extensionOf(extension)?.statuses,
  )
}

/**
 * Граф дій зі змінами розширення: «Виставити» зі своїм підписом і підтвердженням, «Кредит-нота» рахунку —
 * своїм підписом, «Скасувати», «Сторнувати» й «Виправити» — підписи кіта.
 */
export function useDocumentTransitions(
  kind: K2DocumentKind,
): readonly ModuleTransition[] {
  const t = useInvoicesT()
  const { extension } = useInvoicesModule()
  return useKindTransitions(
    kind.transitions,
    kind,
    t,
    kind.extensionOf(extension)?.transitions,
  )
}
