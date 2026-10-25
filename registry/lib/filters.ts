/**
 * Фільтри панелі FilterBar без React (UI03, SPEC §7, ADR-0017): опис фільтра й перетворення між
 * значенням у формі панелі та плоскими параметрами API (ADR-0002).
 *
 * - `options` — кілька значень зі списку: `client=A&client=B` («одне з»).
 * - `date-range` — період календарних дат: `date_gte=2026-01-01&date_lte=2026-03-31`.
 * - `money-range` — сума в мінорних одиницях: `amount_gte=1000000` (10 000,00 ₴).
 * - `record` — запис із довідника сервера за `id`: `accountant=u-olena` (вибір з пошуком на
 *   сервері, кілька — «одне з», з адреси — не більше `MAX_RECORD_VALUES`); підпис чипа — з сервера
 *   (`RecordLabel`, `lib/record-label`). Панель вибирає один запис; кілька з адреси чи виду чип
 *   показує всі, а новий вибір у панелі їх заміняє.
 * - Значення з адреси, які не розібрати (`amount_gte=abc`, сума поза безпечним цілим), ігноруються:
 *   фільтр неактивний, і в запит до API вони не йдуть (`normalizeFilter`).
 */
import type { FilterValue } from "@/registry/lib/api"
import {
  compareCalendarDates,
  isCalendarDate,
  type CalendarDate,
} from "@/registry/lib/dates"
import type { ListFilter } from "@/registry/lib/list-state"

export interface FilterOption {
  value: string
  label: string
}

interface FilterBase {
  /** Ключ у формі й у чипі; зазвичай — поле. */
  id: string
  label: string
  /** Поле API: `client`, `date`, `amount`. */
  field: string
}

export type FilterDefinition =
  | (FilterBase & { kind: "options"; options: readonly FilterOption[] })
  | (FilterBase & { kind: "date-range" })
  | (FilterBase & {
      kind: "money-range"
      /** Валюта підпису поля й чипа (ISO 4217); суми — у мінорних одиницях. */
      currency: string
    })
  | (FilterBase & {
      kind: "record"
      /** Ресурс API довідника: `users`. */
      resource: string
      /** Поле запису з назвою: `name`. */
      labelField: string
      /** Другий рядок варіанта: `email`. */
      descriptionField?: string
      /** Постійні умови довідника: лише активні. */
      filter?: ListFilter
    })

/** Значення фільтра у формі панелі. */
export type FilterDraft =
  | { kind: "options"; values: string[] }
  | { kind: "record"; values: string[] }
  | { kind: "date-range"; from: CalendarDate | null; to: CalendarDate | null }
  | { kind: "money-range"; from: number | null; to: number | null }

const GTE = "_gte"
const LTE = "_lte"
/** Пошук рядком: `q=агро`. */
const SEARCH = "q"
/** Скільки записів довідника фільтр бере з адреси. */
export const MAX_RECORD_VALUES = 50

/** Ключі параметрів, які займає фільтр. */
export function filterKeys(definition: FilterDefinition): string[] {
  return definition.kind === "options" || definition.kind === "record"
    ? [definition.field]
    : [definition.field + GTE, definition.field + LTE]
}

function first(value: FilterValue): string | null {
  const item = Array.isArray(value) ? value[0] : value
  return item === undefined || item === null || item === ""
    ? null
    : String(item)
}

function integerOrNull(value: FilterValue): number | null {
  const text = first(value)
  if (text === null || !/^-?\d+$/.test(text)) return null
  // 1e20 з адреси зламав би форматування суми: такий фільтр неактивний.
  const amount = Number(text)
  return Number.isSafeInteger(amount) ? amount : null
}

function dateOrNull(value: FilterValue): CalendarDate | null {
  const text = first(value)
  return isCalendarDate(text) ? text : null
}

/** Значення фільтра з параметрів (адреси чи виду). */
export function readFilter(
  definition: FilterDefinition,
  filter: ListFilter,
): FilterDraft {
  const { field } = definition
  switch (definition.kind) {
    case "options":
    case "record": {
      const raw = filter[field]
      const values = [
        ...new Set(
          (Array.isArray(raw) ? raw : [raw])
            .filter(
              (item) => item !== undefined && item !== null && item !== "",
            )
            .map(String),
        ),
      ]
      // Записи — підписи з сервера одним запитом: довга адреса не робить запиту на сотні `id`.
      return definition.kind === "record"
        ? { kind: "record", values: values.slice(0, MAX_RECORD_VALUES) }
        : { kind: "options", values }
    }
    case "date-range":
      return {
        kind: "date-range",
        from: dateOrNull(filter[field + GTE]),
        to: dateOrNull(filter[field + LTE]),
      }
    case "money-range":
      return {
        kind: "money-range",
        from: integerOrNull(filter[field + GTE]),
        to: integerOrNull(filter[field + LTE]),
      }
  }
}

/** Фільтр із новим значенням одного фільтра (порожнє — ключі прибрано). */
export function writeFilter(
  definition: FilterDefinition,
  filter: ListFilter,
  draft: FilterDraft,
): ListFilter {
  if (draft.kind !== definition.kind)
    throw new Error(
      `Filter "${definition.id}" is ${definition.kind}, got ${draft.kind}`,
    )
  const next: ListFilter = { ...filter }
  for (const key of filterKeys(definition)) delete next[key]
  const { field } = definition
  if (draft.kind === "options" || draft.kind === "record") {
    if (draft.values.length) next[field] = [...draft.values]
    return next
  }
  if (draft.from !== null) next[field + GTE] = draft.from
  if (draft.to !== null) next[field + LTE] = draft.to
  return next
}

export function isFilterEmpty(draft: FilterDraft): boolean {
  return draft.kind === "options" || draft.kind === "record"
    ? draft.values.length === 0
    : draft.from === null && draft.to === null
}

/** Помилка значення: початок діапазону більший за кінець. */
export function filterIssue(draft: FilterDraft): "range" | null {
  if (
    draft.kind === "options" ||
    draft.kind === "record" ||
    draft.from === null ||
    draft.to === null
  )
    return null
  const reversed =
    draft.kind === "date-range"
      ? compareCalendarDates(draft.from, draft.to) > 0
      : draft.from > draft.to
  return reversed ? "range" : null
}

/** Фільтри, що мають значення, — для чипів і лічильника на кнопці «Фільтри». */
export function activeFilters(
  definitions: readonly FilterDefinition[],
  filter: ListFilter,
): { definition: FilterDefinition; draft: FilterDraft }[] {
  return definitions
    .map((definition) => ({
      definition,
      draft: readFilter(definition, filter),
    }))
    .filter(({ draft }) => !isFilterEmpty(draft))
}

/**
 * Фільтр лише з того, що описано: пошук `q` одним рядком і значення фільтрів панелі, які вдалося
 * розібрати. Чужі ключі (`utm_source`), `amount_gte=abc` і повтори (`date_gte=…&date_gte=…`) у
 * запит до API не йдуть.
 */
export function normalizeFilter(
  definitions: readonly FilterDefinition[],
  filter: ListFilter,
): ListFilter {
  let next: ListFilter = {}
  const search = first(filter[SEARCH] ?? null)
  if (search !== null) next[SEARCH] = search
  for (const definition of definitions)
    next = writeFilter(definition, next, readFilter(definition, filter))
  return next
}

/** Фільтр без значень панелі (пошук `q` і чужі ключі лишаються). */
export function clearFilters(
  definitions: readonly FilterDefinition[],
  filter: ListFilter,
): ListFilter {
  const next: ListFilter = { ...filter }
  for (const definition of definitions)
    for (const key of filterKeys(definition)) delete next[key]
  return next
}

/** Значення без вибору того самого виду: «Прибрати» в чипі. */
export function emptyFilter(draft: FilterDraft): FilterDraft {
  return draft.kind === "options" || draft.kind === "record"
    ? { kind: draft.kind, values: [] }
    : { ...draft, from: null, to: null }
}

/** Форматери й рядки мови інтерфейсу для тексту чипа. */
export interface FilterTextFormat {
  date: (value: CalendarDate) => string
  dateRange: (from: CalendarDate, to: CalendarDate) => string
  money: (amount: number, currency: string) => string
  from: (value: string) => string
  to: (value: string) => string
  between: (from: string, to: string) => string
}

/**
 * Значення фільтра для чипа: «ТОВ «Агросвіт», ФОП Коваленко», «від 1 січ. до 31 бер. 2026». Запис із
 * довідника — `id` через кому: підпис чип бере з сервера (`RecordLabel`).
 */
export function filterValueText(
  definition: FilterDefinition,
  draft: FilterDraft,
  format: FilterTextFormat,
): string {
  if (draft.kind === "record") return draft.values.join(", ")
  if (draft.kind === "options") {
    const labels = new Map(
      definition.kind === "options"
        ? definition.options.map((o) => [o.value, o.label])
        : [],
    )
    return draft.values.map((v) => labels.get(v) ?? v).join(", ")
  }
  if (draft.kind === "date-range" && draft.from && draft.to)
    return format.dateRange(draft.from, draft.to)
  const currency = definition.kind === "money-range" ? definition.currency : ""
  const text = (end: string | number) =>
    typeof end === "string" ? format.date(end) : format.money(end, currency)
  if (draft.from !== null && draft.to !== null)
    return format.between(text(draft.from), text(draft.to))
  if (draft.from !== null) return format.from(text(draft.from))
  return draft.to === null ? "" : format.to(text(draft.to))
}
