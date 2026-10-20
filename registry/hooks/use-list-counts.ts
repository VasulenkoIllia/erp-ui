import { keepPreviousData, useQueries } from "@tanstack/react-query"
import { useDataProvider } from "ra-core"

import { useCompanyId } from "@/registry/hooks/use-company"
import { companyScope } from "@/registry/lib/company-scope"
import {
  listQueryFilter,
  type ListFilter,
  type ListTab,
} from "@/registry/lib/list-state"

/**
 * Лічильники вкладок-статусів (ADR-0017): скільки записів у кожній вкладці з поточними фільтрами.
 *
 * - По запиту на вкладку: `getList` з одним рядком — потрібен лише `total` (ADR-0002), без
 *   окремого ендпоінта.
 * - Ключі — як у `useGetList` ra-core (`[resource, "getList", …]`): після збереження запису
 *   (`useUpdate`) лічильники оновлюються разом зі списком; компанія — у `meta`.
 * - Поки летять нові лічильники, видно попередні; помилка чи ще немає — `undefined`, вкладка
 *   працює без числа.
 */
export function useListCounts(
  resource: string,
  filter: ListFilter,
  tabs: readonly ListTab[],
  { enabled = true }: { enabled?: boolean } = {},
): Record<string, number | undefined> {
  const dataProvider = useDataProvider()
  const meta = companyScope(useCompanyId())
  const results = useQueries({
    queries: tabs.map((tab) => {
      const params = {
        pagination: { page: 1, perPage: 1 },
        filter: listQueryFilter({ tab: tab.id, filter }, tabs),
        meta,
      }
      return {
        queryKey: [resource, "getList", params],
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          dataProvider.getList(resource, { ...params, signal }),
        placeholderData: keepPreviousData,
        enabled,
      }
    }),
  })
  return Object.fromEntries(
    tabs.map((tab, index) => [tab.id, results[index]?.data?.total]),
  )
}
