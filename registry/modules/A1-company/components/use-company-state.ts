import { useCallback } from "react"

import { OFFLINE } from "@/hooks/use-card-record"
import { useCompanyProfile } from "@/hooks/use-company-profile"
import { DEFAULT_BASE_CURRENCY } from "@/lib/company"

/**
 * Профіль компанії для сторінок модуля. Збій запиту — окремо від даних: профіль із кешу лишається на
 * екрані разом із незбереженими правками. Запит на паузі без мережі — збій `offline`, а не вічний
 * скелетон (як `useCardRecord`). Базової валюти немає, поки профіль не прийшов: типова видала б себе
 * за справжню.
 */
export function useCompanyState(enabled = true) {
  const query = useCompanyProfile(enabled)
  const { data: profile, error, fetchStatus, refetch } = query
  const retry = useCallback(() => {
    void refetch()
  }, [refetch])
  const failure: unknown =
    error ?? (fetchStatus === "paused" ? OFFLINE : undefined)
  return {
    profile,
    base: profile && (profile.baseCurrency ?? DEFAULT_BASE_CURRENCY),
    isPending: query.isPending,
    failure,
    retry,
    updatedAt: query.dataUpdatedAt,
  }
}

export type CompanyState = ReturnType<typeof useCompanyState>
