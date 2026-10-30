/**
 * Записи мок-ресурсу: фільтри й сортування списку, унікальні поля, компанія запису й обгортки
 * доступу до ресурсу (ADR-0037, ADR-0039). Чисті функції без MSW; обробники —
 * `createResourceHandlers` (`lib/mocks`).
 */
import type { z } from "zod"

import {
  parseFilterKey,
  type FilterValue,
  type SortField,
} from "@/registry/lib/api"
import { mockResponsibleErrors } from "@/registry/lib/mock-responsible"
import { errorResponse, type MockUser } from "@/registry/lib/mock-server"
import {
  mockDeniedAction,
  type MockDeniedRule,
  type MockRecordAccess,
} from "@/registry/lib/mock-scope"

export interface MockRecord {
  id: string
  version: number
  companyId?: string | null
  [key: string]: unknown
}

const uniqueKey = (value: unknown) =>
  typeof value === "string" ? value.trim().toLocaleLowerCase("uk") : value

/**
 * Компанія запису після схеми (ADR-0036): схема ресурсу без поля `companyId` його відкидає, і запис
 * компанії став би спільним. `undefined` — компанії немає, запис як є.
 */
export function withCompany<T extends MockRecord>(
  record: T,
  companyId: string | null | undefined,
): T {
  return companyId === undefined ? record : { ...record, companyId }
}

/** Поле, що не повторюється, або кілька полів, що разом не повторюються: `["currency", "date"]`. */
export type MockUniqueKey<T> =
  (keyof T & string) | readonly (keyof T & string)[]

/** Поля ключа списком. */
export const uniqueGroup = <T>(
  key: MockUniqueKey<T>,
): readonly (keyof T & string)[] => (typeof key === "string" ? [key] : key)

/** Поля `unique`, значення яких уже має інший запис тієї самої компанії; порожні не перевіряються. */
export function duplicateFields<T extends MockRecord>(
  records: readonly T[],
  candidate: T,
  unique: readonly MockUniqueKey<T>[],
): Record<string, string> | null {
  const companyId = candidate.companyId ?? null
  const fields = unique.flatMap((key) => {
    const group = uniqueGroup(key)
    const values = group.map((field) => uniqueKey(candidate[field]))
    if (values.some((value) => value === "" || value == null)) return []
    const taken = records.some(
      (record) =>
        record.id !== candidate.id &&
        (!companyId ||
          record.companyId == null ||
          record.companyId === companyId) &&
        group.every(
          (field, index) => uniqueKey(record[field]) === values[index],
        ),
    )
    // Помилка складеного ключа — біля останнього поля: там людина виправить значення.
    return taken ? group.slice(-1) : []
  })
  return fields.length
    ? Object.fromEntries(fields.map((field) => [field, "duplicate"]))
    : null
}

function matches(value: unknown, op: string, raw: FilterValue): boolean {
  const wanted = Array.isArray(raw) ? raw : [raw]
  // Поле-список (сегменти запису): «рівне» — хоч одне з вибраних є в списку.
  if (Array.isArray(value)) {
    const listed = wanted.map(String)
    const has = value.some((item) => listed.includes(String(item)))
    return op === "eq" ? has : op === "ne" ? !has : true
  }
  const cast = (v: unknown) =>
    typeof value === "number"
      ? Number(v)
      : typeof value === "boolean"
        ? v === "true" || v === true
        : v === "null"
          ? null
          : String(v)
  const first = cast(wanted[0])
  switch (op) {
    case "eq":
      return wanted.some((w) => cast(w) === (value ?? null))
    case "ne":
      return wanted.every((w) => cast(w) !== (value ?? null))
    case "gte":
      return value != null && first != null && value >= first
    case "lte":
      return value != null && first != null && value <= first
    case "gt":
      return value != null && first != null && value > first
    case "lt":
      return value != null && first != null && value < first
    default:
      return true
  }
}

/**
 * Записи за плоскими фільтрами списку (ADR-0002), як їх фільтрує `createResourceHandlers`: `q` —
 * підрядок у `searchFields` без урахування регістру, решта — `<поле>[_<оп>]=значення`; поле-список —
 * «хоч одне з».
 */
export function filterMockRecords<T extends MockRecord>(
  records: readonly T[],
  filter: Record<string, FilterValue>,
  searchFields: readonly (keyof T & string)[],
): T[] {
  const { q, ...rest } = filter
  const query = typeof q === "string" ? q.trim().toLocaleLowerCase("uk") : ""
  return records.filter((record) => {
    if (
      query &&
      !searchFields.some((field) =>
        String(record[field] ?? "")
          .toLocaleLowerCase("uk")
          .includes(query),
      )
    )
      return false
    return Object.entries(rest).every(([key, value]) => {
      const { field, op } = parseFilterKey(key)
      return matches(record[field], op, value)
    })
  })
}

const collator = new Intl.Collator("uk", { numeric: true, sensitivity: "base" })

function compare(a: unknown, b: unknown): number {
  if (a == null) return b == null ? 0 : 1
  if (b == null) return -1
  if (typeof a === "number" && typeof b === "number") return a - b
  const text = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v))
  return collator.compare(text(a), text(b))
}

/** Записи в порядку `sort` списку (ADR-0002): `null` — останніми, рядки — за абеткою `uk`. */
export function sortMockRecords<T extends MockRecord>(
  records: readonly T[],
  sort: readonly SortField[],
): T[] {
  if (!sort.length) return [...records]
  return [...records].sort((a, b) => {
    for (const { field, order } of sort) {
      const diff = compare(a[field], b[field])
      if (diff) return order === "desc" ? -diff : diff
    }
    return 0
  })
}

export function fieldErrors(error: z.ZodError): Record<string, string> {
  return Object.fromEntries(
    error.issues.map((issue) => [issue.path.join(".") || "_", issue.message]),
  )
}

/** Хто питає про записи ресурсу, що запис забороняє й кому його можна передати. */
export function mockResourceAccess<T extends MockRecord>({
  resource,
  responsibleField,
  deniedActions,
  full,
}: {
  resource: string
  responsibleField?: keyof T & string
  deniedActions?: MockDeniedRule<T>
  /** Запис, яким його бачить картка. */
  full: (record: T) => T
}) {
  const accessOf = (
    actor: MockUser,
    permissions: readonly string[],
  ): MockRecordAccess<T> => ({
    actor,
    permissions,
    resource,
    responsibleField,
    // Той самий запис, що в картці: позначка й перевірка дії не розходяться.
    deniedActions:
      deniedActions && ((who, record) => deniedActions(who, full(record))),
  })

  /** Запис забороняє дію (спільний, чужий, правило проекту): 403 або `null` — можна. */
  const deniedBy = (rules: MockRecordAccess<T>, record: T, action: string) => {
    const code = mockDeniedAction(rules, record, action)
    return code
      ? errorResponse(403, {
          code: "forbidden",
          message: `${resource}: ${code}`,
        })
      : null
  }

  const responsibleOf = (record: T) =>
    responsibleField ? record[responsibleField] : undefined

  /** Кому передали запис: колега компанії запису; `previous` — значення, яке не перевіряємо. */
  const responsibleErrors = (record: T, previous: unknown) =>
    mockResponsibleErrors({
      field: responsibleField,
      resource,
      companyId: record.companyId ?? null,
      value: responsibleOf(record),
      previous,
    })

  return { accessOf, deniedBy, responsibleOf, responsibleErrors }
}
