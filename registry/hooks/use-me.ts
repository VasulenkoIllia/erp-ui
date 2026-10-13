/**
 * Профіль поточного користувача (ADR-0003): ім'я, ролі, права, компанії.
 *
 * - `data` — профіль, `null` — гість (сервер відповів 401 чи 403), `undefined` — ще вантажиться
 *   або помилка (`isError`: мережа, 5xx — покажіть повтор, а не «Увійти»).
 * - Кеш живе під `ME_QUERY_KEY`; щоб він оновлювався після входу й виходу, передайте в
 *   `createAuthProvider` `onMe: (me) => queryClient.setQueryData(ME_QUERY_KEY, me)`.
 * - Потребує `CoreAdminContext` (authProvider із lib/auth і QueryClient).
 */
import { hashKey, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuthProvider } from "ra-core"
import { useCallback } from "react"

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
        // 403 на профіль — входу немає взагалі (блокування, IP поза списком), як і в checkAuth.
        if (isApiError(error) && (error.status === 401 || error.status === 403))
          return null
        throw error
      }
    },
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  })
}

/**
 * Перечитати профіль із сервера: після зміни власних ролей, перемикання компанії, «Увійти як…».
 * `invalidateQueries(ME_QUERY_KEY)` для цього не годиться — authProvider віддає закешований профіль.
 */
export function useRefreshMe() {
  const authProvider = useAuthProvider<ErpAuthProvider>()
  const queryClient = useQueryClient()
  return useCallback(async () => {
    if (!authProvider) return null
    await authProvider.refreshMe()
    // Поки летів запит, профіль могли запитати ще раз (швидке перемикання компаній): у кеш — найсвіжіший.
    const me = await authProvider.getMe()
    queryClient.setQueryData(ME_QUERY_KEY, me)
    return me
  }, [authProvider, queryClient])
}

/**
 * Особа змінилася («Увійти як…» тут чи в іншій вкладці, вхід під іншим акаунтом): дані й права
 * попередньої не показуємо навіть до перезапиту — скидаємо все, крім профілю.
 */
export function useResetUserData() {
  const queryClient = useQueryClient()
  return useCallback(() => {
    void queryClient.cancelQueries()
    const meHash = hashKey(ME_QUERY_KEY)
    void queryClient.resetQueries({
      predicate: (query) => query.queryHash !== meHash,
    })
  }, [queryClient])
}

/** Чи має поточний користувач право; поки профіль вантажиться — ні. */
export function useHasPermission(resource: string, action: string): boolean {
  const { data } = useMe()
  return data ? hasPermission(data.permissions, resource, action) : false
}
