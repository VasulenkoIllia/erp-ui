import { useQuery, useQueryClient } from "@tanstack/react-query"

import { useErpAuthProvider } from "@/registry/erp/auth-layout"
import { useCompanyId } from "@/registry/hooks/use-company"
import { AUDIT_QUERY_KEYS } from "@/registry/lib/audit"
import { companyScope } from "@/registry/lib/company-scope"
import { ADMIN_QUERY_KEYS } from "@/registry/lib/security-policy"

/**
 * Дані доступу користувача для адміністратора (ADR-0013): запит `GET /users/:id/access` і
 * оновлення після змін. Спільні для панелі доступу (`erp/user-access`), дій, сесій і ролей людини.
 */

export interface AccessTarget {
  id: string
  name: string
  email: string
}

/** Стан доступу користувача (право `users:update`). */
export function useUserAccess(userId: string, enabled = true) {
  const provider = useErpAuthProvider()
  const companyId = useCompanyId()
  return useQuery({
    queryKey: [...ADMIN_QUERY_KEYS.userAccess(userId), companyScope(companyId)],
    queryFn: () => provider.admin.getUserAccess(userId),
    enabled,
    // Сесії й стан змінюються будь-коли: панель відкривається зі свіжими даними.
    refetchOnMount: "always",
  })
}

/**
 * Після зміни доступу — оновити панель, список сесій, бейджі й журнал: вихід, завершена сесія чи
 * скинутий другий крок пишуть подію в «Історію» картки, а версії запису не змінюють.
 */
export function useRefreshAccess() {
  const queryClient = useQueryClient()
  return (userId: string) => {
    // Журнал — не чекаючи: кнопка дії не тримає спінер до відповіді журналу.
    void queryClient.invalidateQueries({ queryKey: AUDIT_QUERY_KEYS.events })
    return Promise.all([
      queryClient.invalidateQueries({
        queryKey: ADMIN_QUERY_KEYS.userAccess(userId),
      }),
      queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEYS.sessions }),
    ])
  }
}
