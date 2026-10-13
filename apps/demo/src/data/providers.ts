/**
 * Провайдери даних демо: клієнт API, ra-core dataProvider/authProvider/i18nProvider,
 * вибрана компанія для X-Company-Id і QueryClient (спільний для ra-core й панелі розробника).
 */
import { QueryClient } from "@tanstack/react-query"
import type { i18n } from "i18next"

import { createApiClient } from "@/registry/lib/api"
import { getAppearance } from "@/registry/lib/appearance"
import { createAuthProvider, ME_QUERY_KEY, type Me } from "@/registry/lib/auth"
import { createDataProvider } from "@/registry/lib/data-provider"
import { createRaI18nProvider } from "@/registry/lib/ra-i18n"

const COMPANY_KEY = "erp-ui:demo-company"

let companyId: string | null = (() => {
  try {
    return localStorage.getItem(COMPANY_KEY)
  } catch {
    return null
  }
})()
const companyListeners = new Set<() => void>()

export function getCompanyId(): string | null {
  return companyId
}

export function setCompanyId(id: string | null) {
  companyId = id
  try {
    if (id) localStorage.setItem(COMPANY_KEY, id)
    else localStorage.removeItem(COMPANY_KEY)
  } catch {
    // Без сховища вибір живе до перезавантаження.
  }
  companyListeners.forEach((listener) => {
    listener()
  })
}

export function subscribeCompany(listener: () => void): () => void {
  companyListeners.add(listener)
  return () => {
    companyListeners.delete(listener)
  }
}

/** Збережена компанія, якщо вона доступна користувачу, інакше — з профілю. */
function ensureCompany(me: Me) {
  if (companyId && me.companies.some((c) => c.id === companyId)) return
  setCompanyId(me.companyId ?? me.companies[0]?.id ?? null)
}

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
})
export const apiClient = createApiClient({
  getCompanyId,
  getLanguage: () => getAppearance().language,
})
export const authProvider = createAuthProvider(apiClient, {
  // Демо без справжніх Google і Apple: «провайдер» — сторінка демо з вибором акаунта.
  ssoUrl: (provider, returnTo) =>
    `#/mock-sso?provider=${encodeURIComponent(provider)}&returnTo=${encodeURIComponent(returnTo)}`,
  // Компанія — до перших запитів даних; профіль у кеші useMe — з кожним входом і виходом.
  onMe: (me) => {
    if (me) ensureCompany(me)
    queryClient.setQueryData(ME_QUERY_KEY, me)
  },
})
export const dataProvider = createDataProvider(apiClient)

export const createI18nProvider = (instance: i18n) =>
  createRaI18nProvider(instance)
