import { useGetOne, type RaRecord } from "ra-core"
import { useCallback } from "react"

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
   * Запис прийшов із сервера після того, як картку відкрили, а не лише зі збереженого в браузері (кеш картки чи
   * списку): за ним друкують суми до сплати й QR-код оплати.
   */
  readonly isFresh: boolean
  /** Помилка сторінки: запису немає (404, збій без кешу) — стан сторінки, а не секції. */
  readonly pageError: unknown
  /** Збій запиту картки, коли запис уже є з кешу: його показує секція з повтором. */
  readonly failure: unknown
  readonly retry: () => void
}

/** Запис картки модуля (`GET /<ресурс>/:id`) у компанії користувача. */
export function useCardRecord<T extends RaRecord>(
  resource: string,
  id: string,
): CardRecord<T> {
  const companyId = useCompanyId()
  const {
    data,
    isPending,
    isFetching,
    isFetchedAfterMount,
    fetchStatus,
    error,
    refetch,
  } = useGetOne<T>(
    resource,
    { id, meta: companyScope(companyId) },
    { refetchOnMount: "always" },
  )
  const retry = useCallback(() => {
    void refetch()
  }, [refetch])
  const failure: unknown =
    error ?? (fetchStatus === "paused" ? OFFLINE : undefined)
  // Запису немає (видалили, інша компанія) — «не знайдено», навіть якщо шапка була в кеші списку.
  const notFound = isApiError(error) && error.status === 404
  return {
    record: notFound ? undefined : data,
    isPending,
    isFetching,
    isFresh: isFetchedAfterMount && data !== undefined && !error,
    pageError: notFound || !data ? failure : undefined,
    failure,
    retry,
  }
}
