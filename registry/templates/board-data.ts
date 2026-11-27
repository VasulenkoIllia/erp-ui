import * as React from "react"
import {
  hashKey,
  replaceEqualDeep,
  useQueries,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query"
import {
  useDataProvider,
  type GetListResult,
  type RaRecord,
  type SortPayload,
} from "@/registry/lib/ra-core"

import { useCompanyId } from "@/registry/hooks/use-company"
import { MAX_PER_PAGE } from "@/registry/lib/api"
import { companyScope } from "@/registry/lib/company-scope"
import { listSums } from "@/registry/lib/data-provider"
import type { ListFilter } from "@/registry/lib/list-state"

/**
 * Частина templates/board: картки колонок дошки з сервера (ADR-0100). Ставиться разом із шаблоном.
 *
 * - Запит на колонку: фільтр списку плюс `<поле>=<колонка>`; кількість — `total` відповіді, сума — `sums`
 *   (`sumOf`, ADR-0100). Ключі — як у `useGetList` ra-core (`[ресурс, "getList", …]`): після збереження
 *   запису колонки оновлюються разом із лічильниками вкладок.
 * - «Показати ще» просить ту саму колонку з більшою сторінкою (до `MAX_PER_PAGE`): сума й кількість
 *   оновлюються тим самим запитом. Інший фільтр, сортування чи компанія — знову перша сторінка.
 * - Згорнута колонка просить одну картку: їй потрібні лише кількість і сума.
 * - Поки вантажиться новий запит колонки («Показати ще», інший фільтр, сортування), вона показує попередні
 *   картки: `useQueries` шукає спостерігача за ключем, тож `keepPreviousData` тут не діє, і колонка
 *   стала б скелетоном, а кнопка «Показати ще» з фокусом зникла б. Розгорнута щойно колонка
 *   (була одна картка) — скелетон.
 * - Незмінена картка нової відповіді — той самий об'єкт, що й у попередній (`shareCardsById`), навіть коли
 *   вона зсунулась: дошка перемальовує лише змінені картки (ADR-0103).
 */

export interface BoardColumnData<T> {
  id: string
  cards: readonly T[] | undefined
  total: number | undefined
  /** Сума від сервера чи завантажених карток (`columnSum`); `undefined` — суми немає. */
  sum: number | undefined
  /** Скільки карток просили: «Показати ще» лише до `MAX_PER_PAGE`. */
  perPage: number
  error: unknown
  isFetching: boolean
  /** Коли колонка отримала дані й коли — помилку, мс (`dataUpdatedAt`, `errorUpdatedAt`). */
  updatedAt: number
  failedAt: number
  refetch: () => void
}

/**
 * Колонки за фільтром: якщо фільтр уже обмежує поле колонок (вкладка «Відкриті»), — лише ті, що в ньому;
 * інакше колонка показала б записи поза вкладкою.
 */
export function boardColumnsFor<C extends { id: string }>(
  columns: readonly C[],
  filter: ListFilter,
  field: string,
): readonly C[] {
  const value = filter[field]
  if (value === undefined || value === null || value === "") return columns
  const allowed = new Set((Array.isArray(value) ? value : [value]).map(String))
  return columns.filter((column) => allowed.has(column.id))
}

/**
 * Сума колонки: від сервера, а без неї — сума поля завантажених карток, але лише коли завантажено всі
 * картки колонки: частина суми виглядала б як уся.
 */
export function columnSum(
  cards: readonly RaRecord[] | undefined,
  total: number | undefined,
  fromServer: number | undefined,
  field: string,
): number | undefined {
  if (fromServer !== undefined) return fromServer
  if (!cards || total === undefined || cards.length < total) return undefined
  return cards.reduce((sum, card) => {
    const value: unknown = card[field]
    return typeof value === "number" ? sum + value : sum
  }, 0)
}

/** Скільки «сторінок» показує кожна колонка; новий набір записів (`scope`) — знову по одній. */
export function useColumnPages(scope: readonly unknown[]) {
  const scopeKey = hashKey(scope)
  const [pages, setPages] = React.useState<{
    scopeKey: string
    byColumn: Readonly<Record<string, number>>
  }>({ scopeKey, byColumn: {} })
  if (pages.scopeKey !== scopeKey) setPages({ scopeKey, byColumn: {} })
  const byColumn = pages.scopeKey === scopeKey ? pages.byColumn : {}
  return {
    of: (column: string) => byColumn[column] ?? 1,
    more: (column: string) => {
      setPages((current) => ({
        scopeKey,
        byColumn: {
          ...current.byColumn,
          [column]: (current.byColumn[column] ?? 1) + 1,
        },
      }))
    },
  }
}

export function useBoardColumns<T extends RaRecord>({
  resource,
  field,
  columns,
  filter,
  sort,
  sumField,
  perPageOf,
  isCollapsed,
  enabled,
}: {
  resource: string
  field: string
  columns: readonly { id: string }[]
  filter: ListFilter
  sort: SortPayload
  sumField: string | undefined
  perPageOf: (column: string) => number
  isCollapsed: (column: string) => boolean
  enabled: boolean
}): BoardColumnData<T>[] {
  const dataProvider = useDataProvider()
  const queryClient = useQueryClient()
  const companyId = useCompanyId()
  // Останній ключ, дані якого колонка показала, і чи була вона тоді згорнута.
  const shown = React.useRef(
    new Map<string, { key: QueryKey; isCollapsed: boolean }>(),
  )
  const placeholderOf = (column: string) => {
    const last = shown.current.get(column)
    if (!last || (last.isCollapsed && !isCollapsed(column))) return undefined
    return queryClient.getQueryData<GetListResult<T>>(last.key)
  }
  const requests = columns.map((column) => ({
    id: column.id,
    isCollapsed: isCollapsed(column.id),
    params: {
      pagination: {
        page: 1,
        perPage: Math.min(perPageOf(column.id), MAX_PER_PAGE),
      },
      sort,
      filter: { ...filter, [field]: column.id },
      meta: {
        ...companyScope(companyId),
        ...(sumField ? { sumOf: [sumField] } : {}),
      },
    },
  }))
  const keyOf = (params: (typeof requests)[number]["params"]): QueryKey => [
    resource,
    "getList",
    params,
  ]
  const results = useQueries({
    queries: requests.map(({ id, params }) => ({
      queryKey: keyOf(params),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        dataProvider.getList<T>(resource, { ...params, signal }),
      placeholderData: (previous: GetListResult<T> | undefined) =>
        previous ?? placeholderOf(id),
      structuralSharing: shareCardsById,
      enabled,
    })),
  })
  React.useEffect(() => {
    requests.forEach(({ id, params, isCollapsed: collapsed }, index) => {
      const result = results[index]
      if (result?.data && !result.isPlaceholderData)
        shown.current.set(id, { key: keyOf(params), isCollapsed: collapsed })
    })
  })
  return requests.map(({ id, params }, index) => {
    const result = results[index]
    const cards = result?.data?.data
    const total = result?.data?.total
    const serverSum = sumField
      ? listSums(result?.data?.meta)?.[sumField]
      : undefined
    return {
      id,
      cards,
      total,
      sum: sumField ? columnSum(cards, total, serverSum, sumField) : undefined,
      perPage: params.pagination.perPage,
      error: result?.error ?? null,
      isFetching: result?.isFetching ?? false,
      updatedAt: result?.dataUpdatedAt ?? 0,
      failedAt: result?.errorUpdatedAt ?? 0,
      refetch: () => {
        void result?.refetch()
      },
    }
  })
}

const isList = (value: unknown): value is { data: readonly RaRecord[] } =>
  typeof value === "object" &&
  value !== null &&
  Array.isArray((value as { data?: unknown }).data)

/**
 * Відповідь колонки з записами попередньої за `id`: React Query зіставляє масив за місцем, і коли картку вище
 * перенесли, кожна нижча стала б новим об'єктом і перемалювалась би (ADR-0103).
 */
export function shareCardsById(previous: unknown, next: unknown): unknown {
  if (!isList(previous) || !isList(next))
    return replaceEqualDeep(previous, next)
  const byId = new Map(previous.data.map((card) => [String(card.id), card]))
  const data = next.data.map((card) => {
    const old = byId.get(String(card.id))
    return old === undefined ? card : replaceEqualDeep(old, card)
  })
  // Масив — не через replaceEqualDeep: той зіставив би картки за місцем і створив би їх копії.
  const isSameData =
    data.length === previous.data.length &&
    data.every((card, index) => card === previous.data[index])
  const previousRest = { ...previous, data: undefined }
  const rest = replaceEqualDeep(previousRest, { ...next, data: undefined })
  if (isSameData && rest === previousRest) return previous
  return { ...rest, data: isSameData ? previous.data : data }
}

/** Картка, яку перенесли, а сервер ще не відповів (ADR-0103). */
export interface PendingMove<T> {
  record: T
  from: string
  to: string
}

/**
 * Колонки з картками, які вже перенесли, а сервер ще не відповів (ADR-0103): картка вгорі нової колонки,
 * кількість і сума обох колонок зсунуті на неї. Кожна колонка зсувається, лише поки її відповідь сервера ще
 * без перенесення (картка ще у старій, ще не в новій): двічі воно не рахується. `record` — уже з новою
 * колонкою в полі, тож картка лишається тим самим об'єктом між рендерами.
 */
export function withPendingMoves<T extends RaRecord>(
  columns: readonly BoardColumnData<T>[],
  pending: ReadonlyMap<string, PendingMove<T>>,
  field: string,
  sumField: string | undefined,
): readonly BoardColumnData<T>[] {
  if (!pending.size) return columns
  const byId = new Map(columns.map((column) => [column.id, column]))
  const shifts = new Map<string, { count: number; sum: number; added: T[] }>()
  const shiftOf = (column: string) => {
    const shift = shifts.get(column) ?? { count: 0, sum: 0, added: [] }
    shifts.set(column, shift)
    return shift
  }
  const has = (column: string, id: string) =>
    byId.get(column)?.cards?.some((card) => String(card.id) === id) ?? false
  for (const [id, move] of pending) {
    const to = shiftOf(move.to)
    to.added.push(
      move.record[field] === move.to
        ? move.record
        : { ...move.record, [field]: move.to },
    )
    const value: unknown = sumField ? move.record[sumField] : undefined
    const amount = typeof value === "number" ? value : 0
    // Кожна колонка — за своєю відповіддю: одна вже може містити перенесення, а друга ще ні.
    if (has(move.from, id)) {
      const from = shiftOf(move.from)
      from.count -= 1
      from.sum -= amount
    }
    if (!has(move.to, id)) {
      to.count += 1
      to.sum += amount
    }
  }
  return columns.map((column) => {
    const shift = shifts.get(column.id)
    const kept = column.cards?.filter((card) => !pending.has(String(card.id)))
    if (!shift)
      return kept?.length === column.cards?.length
        ? column
        : { ...column, cards: kept }
    return {
      ...column,
      cards: kept && [...shift.added, ...kept],
      total:
        column.total === undefined ? undefined : column.total + shift.count,
      sum: column.sum === undefined ? undefined : column.sum + shift.sum,
    }
  })
}
