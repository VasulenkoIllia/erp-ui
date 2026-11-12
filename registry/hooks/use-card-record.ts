import { useGetOne, type RaRecord } from "ra-core"
import { useCallback, useState } from "react"

import { useCompanyId } from "@/registry/hooks/use-company"
import { ApiError, isApiError } from "@/registry/lib/api"
import { companyScope } from "@/registry/lib/company-scope"

/** Мережі немає, і TanStack Query тримає запит на паузі: це «немає з'єднання», а не вічний скелетон. */
export const OFFLINE = new ApiError(0, {
  code: "offline",
  message: "Network is unavailable",
})

export interface CardRecord<T> {
  /** Запис: одразу з кешу списку, далі — з відповіді картки; 404 — немає. */
  readonly record: T | undefined
  readonly isPending: boolean
  readonly isFetching: boolean
  /**
   * Власний запит картки завершився після того, як її відкрили: запис — із сервера, а не лише зі збереженого в
   * браузері (кеш картки чи списку). За ним друкують суми до сплати й QR-код оплати.
   */
  readonly isFresh: boolean
  /** Помилка сторінки: запису немає (404, збій без кешу) — стан сторінки, а не секції. */
  readonly pageError: unknown
  /** Збій запиту картки, коли запис уже є з кешу: його показує секція з повтором. */
  readonly failure: unknown
  readonly retry: () => void
}

type Freshness = "waiting" | "fetching" | "fresh"

/**
 * Етап свіжості запису картки: «чекаємо» → власний запит «летить» (на паузі без мережі теж) → «свіжий», коли
 * він завершився без помилки; помилка повертає до «чекаємо», і свіжим запис зробить лише наступний запит.
 */
function nextFreshness(
  stage: Freshness,
  fetchStatus: "fetching" | "paused" | "idle",
  hasError: boolean,
): Freshness {
  if (stage === "fresh") return stage
  if (fetchStatus === "fetching") return "fetching"
  if (stage === "fetching" && fetchStatus === "idle")
    return hasError ? "waiting" : "fresh"
  return stage
}

/** Запис картки модуля (`GET /<ресурс>/:id`) у компанії користувача. */
export function useCardRecord<T extends RaRecord>(
  resource: string,
  id: string,
): CardRecord<T> {
  const companyId = useCompanyId()
  const { data, isPending, isFetching, fetchStatus, error, refetch } =
    useGetOne<T>(
      resource,
      { id, meta: companyScope(companyId) },
      { refetchOnMount: "always" },
    )
  const retry = useCallback(() => {
    void refetch()
  }, [refetch])
  // Свіжість — перехід власного запиту картки з польоту до кінця без помилки. Ні `isFetchedAfterMount`, ні
  // `dataUpdatedAt` для цього не годяться: ra-core кладе рядки списку того самого ресурсу в кеш карток
  // (`setQueryData`), і це ще й стирає помилку картки. Свіжість тримається й під час фонового перечитування.
  const [freshness, setFreshness] = useState<{
    id: string
    stage: Freshness
  }>({ id, stage: "waiting" })
  const stage = freshness.id === id ? freshness.stage : "waiting"
  const nextStage = nextFreshness(stage, fetchStatus, error !== null)
  if (freshness.id !== id || nextStage !== stage)
    setFreshness({ id, stage: nextStage })
  const failure: unknown =
    error ?? (fetchStatus === "paused" ? OFFLINE : undefined)
  // Запису немає (видалили, інша компанія) — «не знайдено», навіть якщо шапка була в кеші списку.
  const notFound = isApiError(error) && error.status === 404
  return {
    record: notFound ? undefined : data,
    isPending,
    isFetching,
    isFresh: stage === "fresh" && data !== undefined && !error,
    pageError: notFound || !data ? failure : undefined,
    failure,
    retry,
  }
}
