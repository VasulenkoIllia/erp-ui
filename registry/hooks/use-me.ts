/**
 * Профіль поточного користувача (ADR-0003): ім'я, ролі, права, компанії.
 *
 * - `data` — профіль, `null` — гість (сервер відповів 401), `undefined` — ще вантажиться.
 * - Кеш живе під `ME_QUERY_KEY`; щоб він оновлювався після входу й виходу, передайте в
 *   `createAuthProvider` `onMe: (me) => queryClient.setQueryData(ME_QUERY_KEY, me)`.
 * - Потребує `CoreAdminContext` (authProvider із lib/auth і QueryClient).
 */
import { useQuery } from "@tanstack/react-query"
import { useAuthProvider } from "ra-core"

import { isApiError } from "@/registry/lib/api"
import {
  hasPermission,
  ME_QUERY_KEY,
  type ErpAuthProvider,
  type Me,
} from "@/registry/lib/auth"

export function useMe() {
  const authProvider = useAuthProvider<ErpAuthProvider>()
  return useQuery<Me | null>({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => {
      if (!authProvider) return null
      try {
        return await authProvider.getMe()
      } catch (error) {
        if (isApiError(error) && error.status === 401) return null
        throw error
      }
    },
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  })
}

/** Чи має поточний користувач право; поки профіль вантажиться — ні. */
export function useHasPermission(resource: string, action: string): boolean {
  const { data } = useMe()
  return data ? hasPermission(data.permissions, resource, action) : false
}
