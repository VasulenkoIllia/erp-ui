"use client"

import {
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query"
import { useDataProvider } from "ra-core"
import { useEffect, useRef } from "react"

import { isApiError } from "@/registry/lib/api"
import type { ErpDataProvider } from "@/registry/lib/data-provider"
import {
  isJobActive,
  JOB_POLL_MS,
  JOBS_PATH,
  type Job,
} from "@/registry/lib/jobs"

/**
 * Стан фонової задачі (lib/jobs, ADR-0018) для erp/job-progress.
 *
 * - Опитування раз на секунду, поки задача в черзі чи виконується, зокрема у фоновій вкладці
 *   браузера: завершення видно, щойно повернулись. Запит — фоновий, сесію не продовжує.
 * - Збій опитування (офлайн, 5xx, 429, немає відповіді за `JOB_POLL_TIMEOUT_MS`) не зупиняє його:
 *   `error` — для показу, наступна спроба за секунду. Після 401, 403, 404 чи відповіді не за
 *   контрактом стан не дізнатись — опитування зупиняється (`isJobStatusLost`). Скасування запиту
 *   (інша задача в тому самому компоненті, розмонтування) — не збій.
 * - Задача завершилась (чи стан втрачено, коли ресурс уже відомий) — дані ресурсу перечитуються
 *   один раз (список, лічильники вкладок).
 */
export const jobQueryKey = (id: string) => [JOBS_PATH, id] as const

/** Відповіді, після яких стан задачі не дізнатись: сесія скінчилась, немає права, задачі немає. */
const LOST_STATUSES = new Set([401, 403, 404])

/**
 * Питати далі марно: 401, 403, 404 або відповідь не за контрактом. Офлайн, 5xx, 408 і 429
 * (забагато запитів) — тимчасові, опитування триває.
 */
export function isJobStatusLost(error: unknown): boolean {
  return !isApiError(error) || LOST_STATUSES.has(error.status)
}

/**
 * Опитування не вдалося — «перевіряємо знову». Поки даних задачі ще немає, TanStack Query на
 * початку кожного запиту скидає `error`: без лічильника збоїв сервер, що мовчить із першого
 * запиту, давав би попередження на 1 с з кожних 11.
 */
export function isJobPollFailing({
  data,
  error,
  errorUpdateCount,
}: Pick<UseQueryResult<Job>, "data" | "error" | "errorUpdateCount">): boolean {
  return error !== null || (data === undefined && errorUpdateCount > 0)
}

export function useJob(id: string) {
  const dataProvider = useDataProvider<ErpDataProvider>()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: jobQueryKey(id),
    queryFn: ({ signal }) => dataProvider.getJob(id, { signal }),
    refetchInterval: ({ state }) => {
      if (state.data && !isJobActive(state.data)) return false
      return state.error && isJobStatusLost(state.error) ? false : JOB_POLL_MS
    },
    refetchIntervalInBackground: true,
    retry: false,
  })
  const lost = query.error !== null && isJobStatusLost(query.error)
  // Завершилась або стан уже не дізнатись (могла завершитись): ресурс перечитується один раз.
  const settled =
    query.data && (!isJobActive(query.data) || lost)
      ? query.data.resource
      : null
  // Id, а не прапорець: «Повторити» підставляє нову задачу в той самий компонент.
  const refreshed = useRef<string | null>(null)
  useEffect(() => {
    if (!settled || refreshed.current === id) return
    refreshed.current = id
    void queryClient.invalidateQueries({ queryKey: [settled] })
  }, [settled, id, queryClient])
  return query
}
