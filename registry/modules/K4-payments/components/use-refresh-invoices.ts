import { useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"

import { PAYMENT_KIND, REFUND_KIND } from "../document-kind"
import { usePaymentsModule } from "../module-context"

/**
 * Оплата й повернення змінюють борг, переплату й статус своїх рахунків (ADR-0073, ADR-0083): після запису,
 * скасування чи сторно запити рахунків у кеші застарілі — і картки, і рахунки форм обох документів. Картка
 * рахунку перечитає рахунок, щойно відкриється, а форма не підставить старий борг чи переплату, а не після
 * 30 с свіжості кешу.
 */
export function useRefreshInvoices() {
  const queryClient = useQueryClient()
  const { invoices } = usePaymentsModule()
  return useCallback(() => {
    for (const resource of [
      invoices.resource,
      PAYMENT_KIND.targets,
      REFUND_KIND.targets,
    ])
      void queryClient.invalidateQueries({ queryKey: [resource] })
  }, [queryClient, invoices.resource])
}
