/**
 * Великий список із сервера вікнами (ADR-0016): для erp/data-table на тисячі рядків.
 *
 *   const list = useWindowedList<Invoice>("invoices", { sort, filter })
 *   <DataTable list={list} … />
 *
 * - Вікно — сторінка ADR-0002 на `windowSize` рядків (100). Вантажаться лише вікна, які видно
 *   (`setRange` викликає таблиця), плюс запас; Ctrl+End одразу просить останнє вікно, а не всі
 *   проміжні. Вікна, які зникли з екрана, скасовуються й згодом прибираються з кешу (gcTime
 *   QueryClient застосунку).
 * - Ключ вікна такий самий, як у `useGetList` ra-core: `[resource, "getList", { pagination, sort,
 *   filter, meta }]`. Тож `useUpdate` ra-core оновлює рядки у вікнах після збереження.
 * - Компанія — у `meta` (`companyScope`): дані іншої компанії не потрапляють у цей ключ.
 * - Як і `useGetList`, вікно кладе свої рядки в кеш `getOne` (`[resource, "getOne", { id, meta }]`),
 *   якщо там ще нічого немає: картка запису показує шапку одразу, поки вантажить деталі (ADR-0019).
 * - Новий фільтр чи сортування: поки перше вікно летить, показуються попередні рядки
 *   (`isRefreshing`), а не скелетон (SPEC §8.1, стан 3). Після перемикання компанії — лише скелетон.
 *   «Оновити» (`refetch`) теж показує `isRefreshing`; тихе фонове оновлення вікон — ні, щоб
 *   скрінрідер не чув «Оновлюємо…» під час прокрутки.
 * - Вікно, що не завантажилось, не валить список: `windowAt` дає його стан і `retry` (SPEC §8.1, стан 8).
 *   Помилка всього списку (`error`) — коли ще немає кількості рядків або жодне з видимих вікон не
 *   оновилось (сервер почав відмовляти після успіху). Поки йде повтор, помилки немає: видно
 *   скелетон чи попередні рядки.
 * - Сервер без `total` (лише `pageInfo`) — помилка: прокрутки на весь список без кількості немає.
 */
import {
  hashKey,
  useQueries,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query"
import {
  useDataProvider,
  type GetListResult,
  type RaRecord,
  type SortPayload,
} from "ra-core"
import { useCallback, useMemo, useState } from "react"

import { useCompanyId } from "@/registry/hooks/use-company"
import { companyScope } from "@/registry/lib/company-scope"
import {
  clampWindows,
  WINDOW_SIZE,
  windowOf,
  windowsForRange,
  type RowWindowState,
} from "@/registry/lib/data-table-core"

export interface WindowedListParams {
  sort: SortPayload
  filter?: Record<string, unknown>
  /** Рядків в одному запиті (ADR-0002: `perPage` до 500). */
  windowSize?: number
}

/** Джерело рядків для erp/data-table. */
export interface WindowedList<T> {
  rowCount: number
  rowAt: (index: number) => T | undefined
  windowAt: (index: number) => RowWindowState | undefined
  /** Які рядки зараз видно (з 0, включно). */
  setRange: (start: number, end: number) => void
  /** Ще нічого показати: первинне завантаження. */
  isPending: boolean
  /** Видно попередні дані, нові летять (новий фільтр, «Оновити»). */
  isRefreshing: boolean
  /** Дозавантажуються вікна, яких бракує на екрані. */
  isLoadingRows: boolean
  error: unknown
  refetch: () => void
  /** Коли отримано найстаріші з показаних даних, мс; 0 — ще нічого. */
  updatedAt: number
  /** Змінюється з фільтром, сортуванням чи компанією: таблиця повертається на початок. */
  listKey: string
}

type ListBase = {
  sort: SortPayload
  filter: Record<string, unknown>
  meta: { companyId: string | null }
}
type WindowData<T extends RaRecord> = Pick<GetListResult<T>, "data" | "total">
type WindowResult<T extends RaRecord> = UseQueryResult<WindowData<T>>

const EMPTY_FILTER: Record<string, unknown> = {}

const windowKey = (
  resource: string,
  base: ListBase,
  page: number,
  windowSize: number,
) =>
  [
    resource,
    "getList",
    { pagination: { page, perPage: windowSize }, ...base },
  ] as const

/** Загальна кількість — з найсвіжішого вікна (записи могли додати між запитами). */
function latestTotal<T extends RaRecord>(results: WindowResult<T>[]) {
  let latest: { total: number; at: number } | undefined
  for (const result of results) {
    const total = result.data?.total
    if (total === undefined) continue
    if (!latest || result.dataUpdatedAt > latest.at)
      latest = { total, at: result.dataUpdatedAt }
  }
  return latest?.total
}

/** Помилка всього списку (див. шапку); вікна, що зараз повторюються, її не дають. */
function listError<T extends RaRecord>(
  results: WindowResult<T>[],
  total: number | undefined,
): unknown {
  if (total === undefined)
    return results.find((r) => r.isError && !r.isFetching)?.error
  const allFailed =
    results.length > 0 &&
    results.every((r) => r.isRefetchError && !r.isFetching)
  return allFailed ? results[0]?.error : undefined
}

/** Рядок і стан вікна за номером рядка; дані кожного вікна шукаються раз на рендер. */
function windowReader<T extends RaRecord>({
  byPage,
  cached,
  windowSize,
  rowCount,
}: {
  byPage: Map<number, WindowResult<T> | undefined>
  cached: (page: number) => WindowData<T> | undefined
  windowSize: number
  rowCount: number
}) {
  const seen = new Map<number, WindowData<T> | undefined>()
  const dataOf = (page: number) => {
    if (!seen.has(page)) seen.set(page, byPage.get(page)?.data ?? cached(page))
    return seen.get(page)
  }
  const rowAt = (index: number): T | undefined => {
    const page = windowOf(index, windowSize)
    return dataOf(page)?.data[index - (page - 1) * windowSize]
  }
  const windowAt = (index: number): RowWindowState | undefined => {
    if (rowAt(index) !== undefined) return undefined
    const page = windowOf(index, windowSize)
    const result = byPage.get(page)
    const first = (page - 1) * windowSize
    const last = Math.min(first + windowSize, Math.max(rowCount, 1)) - 1
    if (!result?.isError || result.isFetching)
      return { status: "loading", first, last }
    return {
      status: "error",
      first,
      last,
      error: result.error,
      retry: () => {
        void result.refetch()
      },
    }
  }
  return { rowAt, windowAt }
}

function useWindowQueries<T extends RaRecord>(
  resource: string,
  base: ListBase,
  pages: number[],
  windowSize: number,
): WindowResult<T>[] {
  const dataProvider = useDataProvider()
  const queryClient = useQueryClient()
  return useQueries({
    queries: pages.map((page) => ({
      queryKey: windowKey(resource, base, page, windowSize),
      // `signal` обов'язковий: після перемикання компанії запит зі старим ключем скасовується, і
      // відповідь для іншої компанії не потрапляє в цей ключ (hooks/use-company).
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const { data, total } = await dataProvider.getList<T>(resource, {
          pagination: { page, perPage: windowSize },
          sort: base.sort,
          filter: base.filter,
          meta: base.meta,
          signal,
        })
        if (typeof total !== "number")
          throw new Error(
            `useWindowedList: getList("${resource}") must return total`,
          )
        for (const record of data)
          queryClient.setQueryData<T>(
            [resource, "getOne", { id: String(record.id), meta: base.meta }],
            (cached) => cached ?? record,
          )
        return { data, total }
      },
    })),
  })
}

/**
 * Ключ вікна належить цьому списку (сортування, фільтр, компанія), а не іншому фільтру. Як і
 * TanStack Query, без огляду на порядок полів: `{ status, q }` і `{ q, status }` — той самий список.
 */
function sameList(key: readonly unknown[], base: ListBase): boolean {
  const params = key[2] as Partial<ListBase> | undefined
  return (
    hashKey([params?.sort, params?.filter, params?.meta]) ===
    hashKey([base.sort, base.filter, base.meta])
  )
}

export function useWindowedList<T extends RaRecord>(
  resource: string,
  { sort, filter = EMPTY_FILTER, windowSize = WINDOW_SIZE }: WindowedListParams,
): WindowedList<T> {
  const queryClient = useQueryClient()
  const companyId = useCompanyId()
  const base = useMemo<ListBase>(
    () => ({ sort, filter, meta: companyScope(companyId) }),
    [sort, filter, companyId],
  )
  const listKey = hashKey([resource, windowSize, base])

  // Видимі вікна, а не рядки: прокрутка в межах тих самих вікон не перерендерює таблицю.
  const [range, setRangeState] = useState({ listKey, first: 1, last: 1 })
  const visible = range.listKey === listKey ? range : { first: 1, last: 1 }
  // Останній список із відомою кількістю: межа для запитів і «попередні дані» під час оновлення.
  const [settled, setSettled] = useState<{
    listKey: string
    base: ListBase
    count: number
  } | null>(null)
  const settledCount = settled?.listKey === listKey ? settled.count : undefined

  const pages = clampWindows(
    visible.first,
    visible.last,
    settledCount,
    windowSize,
  )
  const results = useWindowQueries<T>(resource, base, pages, windowSize)

  const fresh = latestTotal(results)
  if (fresh !== undefined && settledCount !== fresh) {
    // Дозволений патерн «стан із попереднього рендеру»: React перерендерить одразу, до коміту.
    setSettled({ listKey, base, count: fresh })
  }
  // Стрибок у кінець списку (Ctrl+End) просить лише останнє вікно: кількість — з попередніх вікон
  // цього ж списку, інакше таблиця на мить вернулась би до первинного завантаження.
  const total = fresh ?? settledCount
  const error = listError(results, total)
  // Попередні рядки — лише тієї самої компанії (SPEC PF02: чужі дані не показуються як свої).
  const previous =
    total === undefined &&
    !error &&
    settled &&
    settled.listKey !== listKey &&
    settled.base.meta.companyId === companyId
      ? settled
      : null
  const shownBase = previous ? previous.base : base
  const rowCount = total ?? previous?.count ?? 0

  const { rowAt, windowAt } = windowReader<T>({
    byPage: new Map(previous ? [] : pages.map((page, i) => [page, results[i]])),
    cached: (page) =>
      queryClient.getQueryData<WindowData<T>>(
        windowKey(resource, shownBase, page, windowSize),
      ),
    windowSize,
    rowCount,
  })

  const setRange = useCallback(
    (start: number, end: number) => {
      const windows = windowsForRange(start, end, { windowSize })
      const first = windows[0] ?? 1
      const last = windows.at(-1) ?? first
      setRangeState((current) =>
        current.listKey === listKey &&
        current.first === first &&
        current.last === last
          ? current
          : { listKey, first, last },
      )
    },
    [listKey, windowSize],
  )

  // Лічильник, а не прапорець: новий «Оновити» скасовує попередній, і той завершується раніше.
  const [refetching, setRefetching] = useState(0)
  const refetch = useCallback(() => {
    setRefetching((n) => n + 1)
    void queryClient
      .invalidateQueries({
        queryKey: [resource, "getList"],
        predicate: (query) => sameList(query.queryKey, base),
      })
      .finally(() => {
        setRefetching((n) => n - 1)
      })
  }, [queryClient, resource, base])

  const loaded = results.filter((r) => r.data !== undefined)
  return {
    rowCount,
    rowAt,
    windowAt,
    setRange,
    isPending: total === undefined && !previous && !error,
    isRefreshing: previous !== null || (refetching > 0 && total !== undefined),
    isLoadingRows: total !== undefined && results.some((r) => r.isPending),
    error,
    refetch,
    updatedAt: loaded.length
      ? Math.min(...loaded.map((r) => r.dataUpdatedAt))
      : 0,
    listKey,
  }
}
