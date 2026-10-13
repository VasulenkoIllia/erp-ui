/**
 * Провайдери даних демо: клієнт API, ra-core dataProvider/authProvider/i18nProvider і QueryClient
 * (спільний для ra-core й панелі розробника). Компанію для X-Company-Id веде lib/company-scope кіта.
 */
import { QueryClient } from "@tanstack/react-query"
import type { i18n } from "i18next"

import { createApiClient } from "@/registry/lib/api"
import { getAppearance } from "@/registry/lib/appearance"
import { createAuthProvider, ME_QUERY_KEY } from "@/registry/lib/auth"
import { createDataProvider } from "@/registry/lib/data-provider"
import { createRaI18nProvider } from "@/registry/lib/ra-i18n"

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
})
export const apiClient = createApiClient({
  getLanguage: () => getAppearance().language,
})
export const authProvider = createAuthProvider(apiClient, {
  // Демо без справжніх Google і Apple: «провайдер» — сторінка демо з вибором акаунта.
  ssoUrl: (provider, returnTo) =>
    `#/mock-sso?provider=${encodeURIComponent(provider)}&returnTo=${encodeURIComponent(returnTo)}`,
  // Профіль у кеші useMe — з кожним входом і виходом.
  onMe: (me) => {
    queryClient.setQueryData(ME_QUERY_KEY, me)
  },
})
export const dataProvider = createDataProvider(apiClient)

export const createI18nProvider = (instance: i18n) =>
  createRaI18nProvider(instance)
