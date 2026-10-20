import * as React from "react"
import type { SortPayload } from "ra-core"

import { normalizeFilter, type FilterDefinition } from "@/registry/lib/filters"
import {
  hasListParams,
  listParamsOf,
  listQueryFilter,
  listStateOf,
  listStateToParams,
  sameListState,
  VIEW_PARAM,
  type ListDefaults,
  type ListFilter,
  type ListState,
  type ListTab,
} from "@/registry/lib/list-state"
import type { SavedView } from "@/registry/lib/saved-views"

/**
 * Стан списку в адресі сторінки (SPEC §7 List Report, ADR-0017): вкладка, фільтри, сортування й вид.
 *
 * - Роутер кіт не обирає: `params` і `onParamsChange` дає застосунок (React Router — `useSearchParams`).
 * - Сторінку відкрили без параметрів списку — щойно види завантажились, застосовується вид за
 *   замовчуванням, а адреса замінюється (не новий запис в історії). До того `isReady` — false:
 *   дані не вантажимо двічі.
 * - Вкладка, фільтри, сортування чи вид — новий запис в історії («Назад» повертає попередній стан);
 *   пошук під час введення — `{ replace: true }`.
 * - «Стандартний» вид — вкладка й сортування за замовчуванням без фільтрів; явно вибраний, як і
 *   будь-яка дія, після якої адреса лишилась би порожньою, — `view=standard`, щоб вид за
 *   замовчуванням не застосувався замість нього.
 * - З `filters` у стан і запит потрапляють лише описані фільтри й пошук `q` (`normalizeFilter`).
 * - `tabs`, `filters` і `defaults` — стабільні між рендерами (`useMemo`); `onParamsChange` — будь-який.
 */

/** Ідентифікатор «Стандартного» виду в адресі. */
export const STANDARD_VIEW = "standard"

export interface ListStateOptions {
  params: URLSearchParams
  onParamsChange: (
    params: URLSearchParams,
    options: { replace: boolean },
  ) => void
  defaults: ListDefaults
  tabs?: readonly ListTab[]
  /** Фільтри панелі: чужі ключі адреси й значення, яких не розібрати, у запит не йдуть. */
  filters?: readonly FilterDefinition[]
  /** Збережені види ресурсу; undefined — ще вантажаться. */
  views?: readonly SavedView[]
  /** Види не завантажились: працюємо без виду за замовчуванням. */
  viewsFailed?: boolean
}

export interface ListStateApi {
  state: ListState
  /** Фільтр запиту до API: фільтр вкладки поверх фільтрів панелі. */
  queryFilter: ListFilter
  /** Вид, з якого почали; null — «Стандартний» (або вид, якого вже немає). */
  activeView: SavedView | null
  /** Стан відрізняється від виду. */
  isModified: boolean
  /** Вид за замовчуванням уже застосовано — можна вантажити дані. */
  isReady: boolean
  /** Пошук, фільтри чи вкладка не за замовчуванням: порожній результат — «нічого не знайдено». */
  isFiltered: boolean
  /** Поточний стан рядком для збереження у вид. */
  viewParams: string
  setTab: (tab: string) => void
  setFilter: (filter: ListFilter, options?: { replace?: boolean }) => void
  setSort: (sort: SortPayload) => void
  /** Перейти до виду (null — «Стандартний»): його збережений стан. */
  applyView: (view: SavedView | null) => void
  /**
   * Вид `viewId` видалили: лишити стан, який є зараз, без виду. Викликається після відповіді
   * сервера: людина могла змінити фільтри, перейти на інший вид чи піти зі сторінки.
   */
  detachView: (viewId: string) => void
  /** Видалений вид відновили: поточний стан знову від нього («змінено», якщо інший). */
  attachView: (view: SavedView) => void
}

type Navigate = (
  next: ListState,
  view: string | null,
  replace?: boolean,
) => void

export function useListState({
  params,
  onParamsChange,
  defaults,
  tabs,
  filters,
  views,
  viewsFailed = false,
}: ListStateOptions): ListStateApi {
  const search = params.toString()
  const parse = React.useCallback(
    (query: string): ListState => {
      const parsed = listStateOf(query, defaults, tabs)
      return filters
        ? { ...parsed, filter: normalizeFilter(filters, parsed.filter) }
        : parsed
    },
    [defaults, tabs, filters],
  )
  const state = React.useMemo(() => parse(search), [parse, search])
  const viewId = new URLSearchParams(search).get(VIEW_PARAM)
  const fresh = !hasListParams(new URLSearchParams(search))
  const preferred = views?.find((view) => view.isDefault)
  const activeView = views?.find((view) => view.id === viewId) ?? null

  const standard: ListState = React.useMemo(
    () => ({ ...defaults, filter: {} }),
    [defaults],
  )
  const baseline = activeView ? parse(activeView.params) : standard

  const navigate: Navigate = (next, view, replace = false) => {
    const nextParams = listStateToParams(next, defaults, view)
    // Порожня адреса — «відкрили начисто»: вид за замовчуванням перекрив би дію людини.
    if (!hasListParams(nextParams)) nextParams.set(VIEW_PARAM, STANDARD_VIEW)
    onParamsChange(nextParams, { replace })
  }

  // Відкрили начисто — вид за замовчуванням, щойно відомо, який він.
  const applyDefault = React.useEffectEvent((view: SavedView) => {
    onParamsChange(listStateToParams(parse(view.params), defaults, view.id), {
      replace: true,
    })
  })
  React.useEffect(() => {
    if (fresh && preferred) applyDefault(preferred)
  }, [fresh, preferred])

  // Для дій після відповіді сервера: стан і адреса на момент відповіді, а не кліку.
  const latest = React.useRef({ state, viewId, navigate, isMounted: false })
  React.useLayoutEffect(() => {
    latest.current = { state, viewId, navigate, isMounted: true }
  })
  React.useLayoutEffect(
    () => () => {
      latest.current.isMounted = false
    },
    [],
  )

  return {
    state,
    queryFilter: React.useMemo(
      () => listQueryFilter(state, tabs ?? []),
      [state, tabs],
    ),
    activeView,
    isModified: !sameListState(state, baseline),
    isReady: !fresh || viewsFailed || (views !== undefined && !preferred),
    isFiltered: !sameListState({ ...state, sort: defaults.sort }, standard),
    viewParams: listParamsOf(state, defaults),
    setTab: (tab) => {
      navigate({ ...state, tab }, viewId)
    },
    setFilter: (filter, { replace = false } = {}) => {
      navigate({ ...state, filter }, viewId, replace)
    },
    setSort: (sort) => {
      navigate({ ...state, sort }, viewId)
    },
    applyView: (view) => {
      if (!view) {
        navigate(standard, STANDARD_VIEW)
        return
      }
      navigate(parse(view.params), view.id)
    },
    detachView: (deleted) => {
      const now = latest.current
      if (!now.isMounted || now.viewId !== deleted) return
      now.navigate(now.state, STANDARD_VIEW, true)
    },
    attachView: (view) => {
      const now = latest.current
      // Людина вже на іншому виді — його не підміняємо.
      if (!now.isMounted || (now.viewId && now.viewId !== STANDARD_VIEW)) return
      now.navigate(now.state, view.id, true)
    },
  }
}
