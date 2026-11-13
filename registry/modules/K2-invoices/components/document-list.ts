import { useMemo } from "react"

import type { ResolvedStatuses } from "@/lib/statuses"

import type { K2DocumentKind } from "../document-kind"
import { useInvoicesModule, type InvoiceClients } from "../module-context"
import { useInvoicesT } from "../use-invoices-t"

/** Фільтр «Клієнт»: запис ресурсу клієнтів проекту. Спільний для списків документів і звіту боргів. */
export function clientFilter(clients: InvoiceClients, label: string) {
  return {
    kind: "record" as const,
    id: "clientId" as const,
    field: "clientId",
    label,
    resource: clients.resource,
    labelField: clients.labelField,
    ...(clients.descriptionField
      ? { descriptionField: clients.descriptionField }
      : {}),
  }
}

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
      clientFilter(clients, t(`${list}.filters.clientId`)),
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
