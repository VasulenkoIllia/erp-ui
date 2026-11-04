/**
 * Потік документа з сервера (UI13, ADR-0061): `getDocumentFlow` провайдера, ключ від ресурсу, тож дія над
 * документом і подія каналу про нього перечитують потік. Показує його `DocumentFlow` з erp/document-flow;
 * модуль зі своїм виглядом бере хук і `DocumentFlowView`.
 *
 *   const flow = useDocumentFlow("orders", String(record.id))
 */
import { useQuery } from "@tanstack/react-query"
import { useDataProvider } from "ra-core"

import { useCompanyId } from "@/registry/hooks/use-company"
import type { ErpDataProvider } from "@/registry/lib/data-provider"
import { documentFlowQueryKey } from "@/registry/lib/document-links"

export function useDocumentFlow(resource: string, id: string) {
  const dataProvider = useDataProvider<ErpDataProvider>()
  const companyId = useCompanyId()
  return useQuery({
    queryKey: documentFlowQueryKey(resource, id, companyId),
    queryFn: ({ signal }) =>
      dataProvider.getDocumentFlow(resource, id, { signal }),
  })
}
