import { useMemo } from "react"

import {
  useDocumentStatuses,
  useDocumentTransitions,
} from "@/lib/document-kind"
import type { ModuleTransition, ResolvedStatuses } from "@/lib/statuses"

import type { SalesDocument } from "../contract"
import { useSalesModule } from "../module-context"
import { transitionsOf, type SalesDocumentKind } from "../sales-kinds"
import { useSalesT } from "../use-sales-t"

/** Статуси документа мовою інтерфейсу зі статусами розширення проекту. */
export function useSalesStatuses<D extends SalesDocument, Due extends string>(
  kind: SalesDocumentKind<D, Due>,
): ResolvedStatuses {
  const t = useSalesT()
  const { extension } = useSalesModule()
  return useDocumentStatuses(
    kind.statuses,
    t,
    kind.extensionOf(extension)?.statuses,
  )
}

/**
 * Граф дій зі змінами розширення: дії модуля зі своїм підписом і підтвердженням («Надіслати
 * пропозицію?», «Позначити виконаним»), «Скасувати» й «Виправити» — підписи кіта. Дії, що створюють
 * документ модуля, якого в проекті немає, — без них (`transitionsOf`).
 */
export function useSalesTransitions<
  D extends SalesDocument,
  Due extends string,
>(kind: SalesDocumentKind<D, Due>): readonly ModuleTransition[] {
  const t = useSalesT()
  const { extension, paths } = useSalesModule()
  const transitions = useMemo(() => transitionsOf(kind, paths), [kind, paths])
  return useDocumentTransitions(
    transitions,
    kind,
    t,
    kind.extensionOf(extension)?.transitions,
  )
}
