/**
 * Профіль поточної компанії (ADR-0014): реквізити, логотип, печатка, філії, палітра компанії.
 *
 * - Спільний кеш під `COMPANY_QUERY_KEYS.profile` для сторінки налаштувань і кореня застосунку.
 * - У корені застосунку дає палітру компанії за замовчуванням (SPEC §6.2):
 *   `useBrandAppearance(useCompanyProfile(Boolean(me)).data?.palette)`.
 * - Потребує `CoreAdminContext` (authProvider із lib/auth і QueryClient).
 */
import { useQuery } from "@tanstack/react-query"
import { useAuthProvider } from "ra-core"

import type { ErpAuthProvider } from "@/registry/lib/auth"
import { COMPANY_QUERY_KEYS } from "@/registry/lib/company"

export function useCompanyProfile(enabled = true) {
  const authProvider = useAuthProvider<ErpAuthProvider>()
  return useQuery({
    queryKey: COMPANY_QUERY_KEYS.profile,
    queryFn: () => {
      if (!authProvider) throw new Error("authProvider is required")
      return authProvider.company.get()
    },
    enabled: enabled && Boolean(authProvider),
  })
}
