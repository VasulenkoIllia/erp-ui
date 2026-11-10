import { useMemo } from "react"

import type { ResolvedStatuses } from "@/lib/statuses"

import type { K2DocumentKind } from "../document-kind"
import { useInvoicesModule } from "../module-context"
import { useInvoicesT } from "../use-invoices-t"

/**
 * Фільтри й вкладки списку документа модуля: «Клієнт» (ресурс клієнтів проекту), «Дата» й вкладки «Усі» та
 * статуси (зі статусами розширення). Однакові в рахунку й кредит-ноті.
 */
export function useDocumentListFilters(
  kind: K2DocumentKind,
  statuses: ResolvedStatuses,
) {
  const t = useInvoicesT()
  const { clients } = useInvoicesModule()
  const list = `${kind.key}s` as const
  const filters = useMemo(
    () => [
      {
        kind: "record" as const,
        id: "clientId" as const,
        field: "clientId",
        label: t(`${list}.filters.clientId`),
        resource: clients.resource,
        labelField: clients.labelField,
        ...(clients.descriptionField
          ? { descriptionField: clients.descriptionField }
          : {}),
      },
      {
        kind: "date-range" as const,
        id: "date" as const,
        field: "date",
        label: t(`${list}.filters.date`),
      },
    ],
    [t, clients, list],
  )
  const tabs = useMemo(
    () => [
      { id: "all", label: t(`${list}.tabs.all`), filter: {} },
      ...statuses.options.map((status) => ({
        id: status.id,
        label: status.label,
        filter: { status: status.id },
      })),
    ],
    [t, statuses.options, list],
  )
  return { filters, tabs }
}
