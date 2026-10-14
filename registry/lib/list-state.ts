/**
 * Стан списку без React (SPEC §7 List Report, ADR-0017): вкладка-статус, фільтри й сортування.
 *
 * - В адресі сторінки — тим самим синтаксисом, що й запит до API (ADR-0002):
 *   `?view=<id>&tab=overdue&client=A&client=B&amount_gte=1000000&q=агро&sort=-date`.
 *   Вкладка й сортування за замовчуванням в адресу не пишуться.
 * - `view` — збережений вид (lib/saved-views), з якого почали; стан може від нього відрізнятись
 *   («змінено»).
 * - Збережений вид зберігає той самий рядок параметрів без `view` (`listParamsOf`).
 * - Порівняння станів не залежить від порядку ключів і значень і від того, рядок чи число:
 *   після адреси всі значення — рядки.
 */
import type { SortPayload } from "ra-core"

import { formatSort, parseSort, type FilterValue } from "@/registry/lib/api"

export type ListFilter = Record<string, FilterValue>

export interface ListState {
  /** Вкладка-статус (`ListTab.id`). */
  tab: string
  /** Фільтри панелі й пошук `q`, без фільтра вкладки. */
  filter: ListFilter
  sort: SortPayload
}

/** Те, що відновлюється, коли параметрів в адресі немає. */
export interface ListDefaults extends Pick<ListState, "tab" | "sort"> {
  /** Поля, за якими сервер сортує; `sort` з адреси за іншим полем — сортування за замовчуванням. */
  sortFields?: readonly string[]
}

/** Вкладка-статус: підпис і фільтр, який вона додає до запиту («Прострочені» → status=overdue). */
export interface ListTab {
  id: string
  label: string
  filter: ListFilter
}

export const VIEW_PARAM = "view"
export const TAB_PARAM = "tab"
const SORT_PARAM = "sort"
/** Ці ключі — не фільтри: їх не можна назвати полем фільтра. */
const RESERVED = new Set([VIEW_PARAM, TAB_PARAM, SORT_PARAM, "page", "perPage"])
/** Ключі з адреси, які не стають полями об'єкта фільтра. */
const UNSAFE_KEYS = new Set(["", "__proto__", "constructor", "prototype"])

const sameSort = (a: SortPayload, b: SortPayload) =>
  a.field === b.field && a.order === b.order

function sortToParam(sort: SortPayload): string {
  return formatSort([
    { field: sort.field, order: sort.order === "DESC" ? "desc" : "asc" },
  ])
}

function sortFromParam(
  value: string | null,
  fields: readonly string[] | undefined,
): SortPayload | null {
  const [first] = parseSort(value)
  if (!first?.field || (fields && !fields.includes(first.field))) return null
  return { field: first.field, order: first.order === "desc" ? "DESC" : "ASC" }
}

/** Значення фільтра як відсортований список рядків; порожні — без них. */
function filterStrings(value: FilterValue): string[] {
  const values = Array.isArray(value) ? value : [value]
  return values
    .filter((item) => item !== undefined && item !== null && item !== "")
    .map(String)
    .sort()
}

/** Фільтр без порожніх значень, ключі й значення за порядком: однакові фільтри — однаковий рядок. */
function canonicalFilter(filter: ListFilter): string {
  return JSON.stringify(
    Object.keys(filter)
      .sort()
      .map((key) => [key, filterStrings(filter[key])] as const)
      .filter(([, values]) => values.length > 0),
  )
}

export function sameListState(a: ListState, b: ListState): boolean {
  return (
    a.tab === b.tab &&
    sameSort(a.sort, b.sort) &&
    canonicalFilter(a.filter) === canonicalFilter(b.filter)
  )
}

/** Стан → параметри адреси: фільтри, вкладка й сортування, якщо не за замовчуванням, і вид. */
export function listStateToParams(
  state: ListState,
  defaults: ListDefaults,
  view?: string | null,
): URLSearchParams {
  const params = new URLSearchParams()
  if (view) params.set(VIEW_PARAM, view)
  if (state.tab !== defaults.tab) params.set(TAB_PARAM, state.tab)
  for (const key of Object.keys(state.filter).sort()) {
    if (RESERVED.has(key)) continue
    for (const value of filterStrings(state.filter[key]))
      params.append(key, value)
  }
  if (!sameSort(state.sort, defaults.sort))
    params.set(SORT_PARAM, sortToParam(state.sort))
  return params
}

/** Параметри адреси → стан; чого немає — за замовчуванням. Вкладку, якої немає в `tabs`, теж. */
export function listStateFromParams(
  params: URLSearchParams,
  defaults: ListDefaults,
  tabs?: readonly ListTab[],
): ListState {
  const filter: ListFilter = {}
  for (const key of new Set(params.keys())) {
    if (RESERVED.has(key) || UNSAFE_KEYS.has(key)) continue
    const values = params.getAll(key).filter(Boolean)
    if (values.length) filter[key] = values.length > 1 ? values : values[0]
  }
  const tab = params.get(TAB_PARAM)
  const known = tab !== null && (!tabs || tabs.some((t) => t.id === tab))
  return {
    tab: known ? tab : defaults.tab,
    filter,
    sort:
      sortFromParam(params.get(SORT_PARAM), defaults.sortFields) ??
      defaults.sort,
  }
}

/** Чи є в адресі параметри списку: ні — сторінку відкрили «начисто», діє вид за замовчуванням. */
export function hasListParams(params: URLSearchParams): boolean {
  for (const key of params.keys()) {
    if (key !== "page" && key !== "perPage") return true
  }
  return false
}

/** Рядок параметрів для збереженого виду: стан без `view`. */
export function listParamsOf(state: ListState, defaults: ListDefaults): string {
  return listStateToParams(state, defaults).toString()
}

/** Стан збереженого виду з його рядка параметрів. */
export function listStateOf(
  params: string,
  defaults: ListDefaults,
  tabs?: readonly ListTab[],
): ListState {
  return listStateFromParams(new URLSearchParams(params), defaults, tabs)
}

/** Фільтр запиту до API: фільтр вкладки поверх фільтрів панелі. */
export function listQueryFilter(
  state: Pick<ListState, "tab" | "filter">,
  tabs: readonly ListTab[],
): ListFilter {
  const tab = tabs.find((t) => t.id === state.tab)
  return { ...state.filter, ...tab?.filter }
}
