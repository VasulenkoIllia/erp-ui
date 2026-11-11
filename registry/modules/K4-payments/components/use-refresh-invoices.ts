import { useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"

import { usePaymentsModule } from "../module-context"

/**
 * Оплата змінює борг і статус своїх рахунків (ADR-0073): після реєстрації, скасування чи сторно запити
 * рахунків у кеші застарілі. Картка рахунку перечитає рахунок, щойно відкриється, а не після 30 с свіжості
 * кешу.
 */
export function useRefreshInvoices() {
  const queryClient = useQueryClient()
  const { invoices } = usePaymentsModule()
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: [invoices.resource] })
  }, [queryClient, invoices.resource])
}
