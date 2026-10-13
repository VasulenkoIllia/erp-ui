/**
 * Профіль поточної компанії (ADR-0014): реквізити, логотип, печатка, філії, палітра компанії.
 *
 * - Спільний кеш під `COMPANY_QUERY_KEYS.profile` + компанія для сторінки налаштувань і кореня
 *   застосунку: після перемикання компанії профіль попередньої не показується.
 * - У корені застосунку дає палітру компанії за замовчуванням (SPEC §6.2):
 *   `useBrandAppearance(useCompanyProfile(Boolean(me)).data?.palette)`.
 * - Потребує `CoreAdminContext` (authProvider із lib/auth і QueryClient).
 */
import { useQuery } from "@tanstack/react-query"
import { useAuthProvider } from "ra-core"

import { useCompanyId } from "@/registry/hooks/use-company"
import type { ErpAuthProvider } from "@/registry/lib/auth"
import { COMPANY_QUERY_KEYS } from "@/registry/lib/company"
import { companyScope } from "@/registry/lib/company-scope"

export function useCompanyProfile(enabled = true) {
  const authProvider = useAuthProvider<ErpAuthProvider>()
  const companyId = useCompanyId()
  return useQuery({
    queryKey: [...COMPANY_QUERY_KEYS.profile, companyScope(companyId)],
    queryFn: () => {
      if (!authProvider) throw new Error("authProvider is required")
      return authProvider.company.get()
    },
    enabled: enabled && Boolean(authProvider),
  })
}
