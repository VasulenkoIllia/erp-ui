/**
 * Мок-сервер на MSW за контрактами erp-ui (ADR-0002, ADR-0003, ADR-0010): поводиться як бекенд,
 * щоб UI будувався й тестувався без нього. Підключається лише в розробці, демо й тестах.
 *
 * - `createPlatformHandlers` (lib/mock-auth) — усі способи входу, `/me`, вподобання PF11, а також
 *   фактори, сесії, журнал входів і «Увійти як…» (lib/mock-account), політика й доступ
 *   користувачів (lib/mock-admin), журнал аудиту, вебхуки й сповіщення (ADR-0013).
 * - `createResourceHandlers` — CRUD ресурсу з фільтрами, сортуванням, пагінацією, правами,
 *   версіями (409) і прив'язкою до компанії (`X-Company-Id`); кожна зміна — у журнал аудиту
 *   (lib/mock-audit) і на шину подій (вебхуки, lib/mock-webhooks). `db.select` і `db.patch` —
 *   для масових дій фоновою задачею (lib/mock-jobs, ADR-0018). `pins` — закріплення записів
 *   (lib/mock-lists, ADR-0024).
 * - Основа (lib/mock-server) — сесія з ковзним терміном, «надіслані» SMS і листи, сценарії.
 * - Кожен обробник ресурсу поважає сценарій із lib/mock-scenarios.
 * - Мок сам перевіряє права, як справжній сервер (SPEC: приховування в UI — лише косметика).
 */
import { http, type HttpHandler } from "msw/http"
import type { z } from "zod"

import {
  API_PREFIX,
  COMPANY_HEADER,
  fromSearchParams,
  parseFilterKey,
  type FilterValue,
  type SortField,
} from "@/registry/lib/api"
import type { AuditValue } from "@/registry/lib/audit"
import { hasPermission, type LocalizedText } from "@/registry/lib/auth"
import type { MockAccountSeed } from "@/registry/lib/mock-account"
import {
  auditChanges,
  recordAudit,
  type MockAuditEvent,
} from "@/registry/lib/mock-audit"
import { createPinHandlers, mockPinStore } from "@/registry/lib/mock-lists"
import { scenarioFor } from "@/registry/lib/mock-scenarios"
import {
  createPlatformHandlers,
  DEFAULT_MOCK_METHODS,
  type MockInvite,
  type PlatformMockOptions,
} from "@/registry/lib/mock-auth"
import {
  applyScenario,
  currentMockUser,
  emitMockEvent,
  errorResponse,
  json,
  noContent,
  signInMock,
  subscribeMockEvents,
  subscribeMockMessages,
  type MockMessage,
  type MockUser,
} from "@/registry/lib/mock-server"
import { pinnedFirst } from "@/registry/lib/pins"

// erp-ui: окремі import + export, бо shadcn CLI хибно переписує шляхи в `export … from`.
export {
  createPlatformHandlers,
  currentMockUser,
  DEFAULT_MOCK_METHODS,
  errorResponse,
  signInMock,
  subscribeMockEvents,
  subscribeMockMessages,
}
export type {
  MockAccountSeed,
  MockAuditEvent,
  MockInvite,
  MockMessage,
  MockUser,
  PlatformMockOptions,
}

/* ---------------------------------- Ресурси ---------------------------------- */

export interface MockRecord {
  id: string
  version: number
  companyId?: string | null
  [key: string]: unknown
}

export interface MockResourceOptions<T extends MockRecord> {
  /** Сегмент шляху й назва для сценаріїв і прав: "invoices". */
  resource: string
  /** Схема повного запису: перевіряє створення й зміни (422 з fieldErrors). */
  schema: z.ZodType<T>
  /** Початкові дані (fixtures) або функція, що їх створює: тоді — при першому запиті, без копії. */
  data: T[] | (() => T[])
  /** Поля для `q`. */
  searchFields?: (keyof T & string)[]
  baseUrl?: string
  /** Генератор id нових записів. */
  newId?: () => string
  /** Назва ресурсу для журналу аудиту: { uk: "Рахунки", en: "Invoices" }. */
  label?: LocalizedText
  /** Поле з назвою запису для журналу (за замовчуванням — перше з `searchFields`). */
  titleField?: keyof T & string
  /** Назви полів для «було → стало» в журналі. */
  fieldLabels?: Partial<Record<keyof T & string, LocalizedText>>
  /**
   * Поля картки понад рядок списку (рядки документа): `GET /<ресурс>/:id`, POST, PATCH і `current`
   * конфлікту 409 віддають запис із ними, список — ні (ADR-0019).
   */
  detail?: (record: T) => Record<string, unknown>
  /**
   * Вкладені колекції, що зберігаються разом із записом (адреси й рахунки організації, ADR-0028):
   * картка, POST, PATCH і `current` 409 віддають їх, список — ні. `PATCH` з колекцією замінює її
   * цілком; перевіряє її `schema`.
   */
  detailFields?: readonly (keyof T & string)[]
  /**
   * Значення поля в «було → стало» журналу: вкладена колекція — рядками, а не JSON. Поля, якого в
   * записі немає (`undefined`, `null`), функція не отримує: у журналі — порожнє.
   */
  // `never`: функція бере значення свого поля (`Address[]`), а не `unknown` з індексу записів моків.
  auditValue?: Partial<Record<keyof T & string, (value: never) => AuditValue>>
  /**
   * Закріплення записів (ADR-0024): `PUT`/`DELETE /<ресурс>/:id/pin`, `pinned: true` у списку й
   * картці, закріплені — першим блоком списку.
   */
  pins?: boolean
  /**
   * Поля, значення яких не повторюються в компанії (назва сегмента): створення й зміна з тим самим
   * значенням, без урахування регістру й пробілів на краях, — 422 з кодом `duplicate` (ADR-0027).
   */
  unique?: readonly (keyof T & string)[]
}

const uniqueKey = (value: unknown) =>
  typeof value === "string" ? value.trim().toLocaleLowerCase("uk") : value

/** Поля `unique`, значення яких уже має інший запис тієї самої компанії; порожні не перевіряються. */
function duplicateFields<T extends MockRecord>(
  records: readonly T[],
  candidate: T,
  unique: readonly (keyof T & string)[],
): Record<string, string> | null {
  const companyId = candidate.companyId ?? null
  const fields = unique.filter((field) => {
    const value = uniqueKey(candidate[field])
    if (value === "" || value === null || value === undefined) return false
    return records.some(
      (record) =>
        record.id !== candidate.id &&
        (!companyId ||
          record.companyId == null ||
          record.companyId === companyId) &&
        uniqueKey(record[field]) === value,
    )
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

const collator = new Intl.Collator("uk", { numeric: true, sensitivity: "base" })

function compare(a: unknown, b: unknown): number {
  if (a == null) return b == null ? 0 : 1
  if (b == null) return -1
  if (typeof a === "number" && typeof b === "number") return a - b
  const text = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v))
  return collator.compare(text(a), text(b))
}

function sortRecords<T extends MockRecord>(records: T[], sort: SortField[]) {
  if (!sort.length) return records
  return [...records].sort((a, b) => {
    for (const { field, order } of sort) {
      const diff = compare(a[field], b[field])
      if (diff) return order === "desc" ? -diff : diff
    }
    return 0
  })
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  return Object.fromEntries(
    error.issues.map((issue) => [issue.path.join(".") || "_", issue.message]),
  )
}

/** «Було → стало» для журналу: що змінилось — за самими значеннями, показ — через `auditValue`. */
function readableChanges<T extends MockRecord>(
  previous: T,
  record: T,
  labels: Record<string, LocalizedText>,
  auditValue: MockResourceOptions<T>["auditValue"],
) {
  return auditChanges(previous, record, labels).map((change) => {
    // Лише свої ключі: `constructor` з прототипу — не показ поля.
    const show =
      auditValue && Object.hasOwn(auditValue, change.field)
        ? (auditValue[change.field] as (value: unknown) => AuditValue)
        : undefined
    if (!show) return change
    // Поля може не бути в записі (додали чи прибрали): порожнє значення функція не отримує.
    const shown = (value: unknown) =>
      value === undefined || value === null ? null : show(value)
    return {
      ...change,
      from: shown(previous[change.field]),
      to: shown(record[change.field]),
    }
  })
}

const validationError = (errors: Record<string, string>) =>
  errorResponse(422, {
    code: "validation",
    message: "Validation failed",
    fieldErrors: errors,
  })

const DATA_VERBS = {
  created: { uk: "створення", en: "created" },
  updated: { uk: "зміна", en: "updated" },
  deleted: { uk: "видалення", en: "deleted" },
} as const

export function createResourceHandlers<T extends MockRecord>({
  resource,
  schema,
  data,
  searchFields = [],
  baseUrl = API_PREFIX,
  newId = () => crypto.randomUUID(),
  label,
  titleField = searchFields[0],
  fieldLabels = {},
  detail,
  detailFields = [],
  auditValue,
  pins = false,
  unique = [],
}: MockResourceOptions<T>) {
  const seed = () =>
    typeof data === "function" ? data() : structuredClone(data)
  let stored: T[] | null = null
  const all = () => (stored ??= seed())
  const replace = (next: T[]) => {
    stored = next
    sorted.clear()
  }
  /**
   * Відсортовані копії за сортуванням, доки дані не змінились: на 10 000 записів сортування —
   * найдорожче в запиті, а таблиця просить те саме сортування вікнами по 100 (ADR-0016).
   */
  const sorted = new Map<string, T[]>()
  const sortedBy = (sort: SortField[]) => {
    const key = JSON.stringify(sort)
    let result = sorted.get(key)
    if (!result) {
      result = sortRecords(all(), sort)
      sorted.set(key, result)
    }
    return result
  }
  const update = (index: number, record: T) => {
    all()[index] = record
    sorted.clear()
  }
  /** Записи, для яких сценарій conflict уже імітував чуже збереження. */
  const bumped = new Set<string>()
  const url = `${baseUrl}/${resource}`

  /** Сценарій, сесія, права. Повертає відповідь-відмову або null. */
  async function guard(action: string): Promise<Response | null> {
    const early = await applyScenario(scenarioFor(resource))
    if (early) return early
    const user = currentMockUser()
    if (!user) {
      return errorResponse(401, {
        code: "unauthenticated",
        message: "Not signed in",
      })
    }
    if (!hasPermission(user.permissions, resource, action)) {
      return errorResponse(403, {
        code: "forbidden",
        message: `Missing permission ${resource}:${action}`,
      })
    }
    return null
  }

  const inCompany = (companyId: string | null) => (record: T) =>
    !companyId || record.companyId == null || record.companyId === companyId

  /** Записи списку: компанія, пошук `q` і плоскі фільтри ADR-0002, у порядку `sort`. */
  const select = (
    filter: Record<string, FilterValue>,
    companyId: string | null,
    sort: SortField[] = [],
  ): T[] => {
    const { q, ...rest } = filter
    const query = typeof q === "string" ? q.trim().toLocaleLowerCase("uk") : ""
    return sortedBy(sort)
      .filter(inCompany(companyId))
      .filter((record) => {
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

  const notFound = () =>
    errorResponse(404, { code: "not_found", message: `${resource}: not found` })

  const pinStore = pins ? mockPinStore(resource) : null
  /** Закріплені поточним користувачем, у порядку закріплення. */
  const pinnedIds = () => {
    const userId = currentMockUser()?.id
    return pinStore && userId ? pinStore.ids(userId) : []
  }
  const withPin = (record: T, pinned: readonly string[]) =>
    pinned.includes(record.id) ? { ...record, pinned: true } : record
  /** Рядок списку: без вкладених колекцій (ADR-0019). */
  const listRow = (record: T): T => {
    if (!detailFields.length) return record
    const row = { ...record }
    for (const field of detailFields) delete row[field]
    return row
  }

  /** Запис, яким його бачить картка. */
  // Поля самого запису (id, version) — головніші: деталі лише додають вкладене.
  const full = (record: T) =>
    detail ? { ...detail(record), ...record } : record

  /** Зміна запису → журнал аудиту й шина подій (вебхуки, далі реальний час). */
  const changed = (
    verb: "created" | "updated" | "deleted",
    record: T,
    previous?: T,
  ) => {
    const title = titleField ? record[titleField] : undefined
    recordAudit({
      action: `${resource}.${verb}`,
      category: "data",
      ...(label
        ? {
            actionLabel: Object.fromEntries(
              Object.entries(label).map(([language, text]) => [
                language,
                `${text}: ${DATA_VERBS[verb][language === "en" ? "en" : "uk"]}`,
              ]),
            ),
          }
        : {}),
      target: {
        type: resource,
        id: record.id,
        ...(title !== undefined && title !== null
          ? { name: String(title) }
          : {}),
      },
      ...(previous
        ? {
            changes: readableChanges(
              previous,
              record,
              fieldLabels as Record<string, LocalizedText>,
              auditValue,
            ),
          }
        : {}),
    })
    emitMockEvent(`${resource}.${verb}`, { ...record })
  }

  /** Зміна запису без перевірки версії: схема, нова версія, журнал і подія; null — запису немає. */
  const patch = (
    id: string,
    changes: Record<string, unknown>,
  ): { record: T } | { fieldErrors: Record<string, string> } | null => {
    const index = all().findIndex((r) => r.id === id)
    const latest = all()[index]
    if (!latest) return null
    const parsed = schema.safeParse({
      ...latest,
      ...changes,
      id: latest.id,
      version: latest.version + 1,
    })
    if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) }
    // Лише змінені поля: повтор, що вже є в даних, не блокує зміну інших полів запису.
    const duplicates = duplicateFields(
      all(),
      parsed.data,
      unique.filter((field) => field in changes),
    )
    if (duplicates) return { fieldErrors: duplicates }
    update(index, parsed.data)
    changed("updated", parsed.data, latest)
    return { record: parsed.data }
  }

  const handlers: HttpHandler[] = [
    http.get(url, async ({ request }) => {
      const denied = await guard("read")
      if (denied) return denied
      if (scenarioFor(resource) === "empty") return json({ data: [], total: 0 })
      const { page, perPage, sort, filter } = fromSearchParams(
        new URL(request.url).searchParams,
      )
      const pinned = pinnedIds()
      const filtered = pinnedFirst(
        select(filter, request.headers.get(COMPANY_HEADER), sort),
        pinned,
      )
      const start = (page - 1) * perPage
      return json({
        data: filtered
          .slice(start, start + perPage)
          .map((record) => withPin(listRow(record), pinned)),
        total: filtered.length,
      })
    }),

    http.get(`${url}/:id`, async ({ params, request }) => {
      const denied = await guard("read")
      if (denied) return denied
      const record = all()
        .filter(inCompany(request.headers.get(COMPANY_HEADER)))
        .find((r) => r.id === params.id)
      return record ? json(full(withPin(record, pinnedIds()))) : notFound()
    }),

    http.post(url, async ({ request }) => {
      const denied = await guard("create")
      if (denied) return denied
      const body = (await request.json()) as Record<string, unknown>
      const parsed = schema.safeParse({
        ...body,
        id: newId(),
        version: 1,
        companyId: body.companyId ?? request.headers.get(COMPANY_HEADER),
      })
      if (!parsed.success) return validationError(fieldErrors(parsed.error))
      const duplicates = duplicateFields(all(), parsed.data, unique)
      if (duplicates) return validationError(duplicates)
      replace([parsed.data, ...all()])
      changed("created", parsed.data)
      return json(full(parsed.data), { status: 201 })
    }),

    http.patch(`${url}/:id`, async ({ params, request }) => {
      const denied = await guard("update")
      if (denied) return denied
      const index = all().findIndex((r) => r.id === params.id)
      const current = all()[index]
      if (!current) return notFound()
      const { version, ...changes } = (await request.json()) as Record<
        string,
        unknown
      >
      // Сценарій conflict імітує, що інший користувач зберіг запис перед нами — один раз
      // на запис, тож «Зберегти мої зміни» з новою версією після цього проходить.
      if (scenarioFor(resource) === "conflict" && !bumped.delete(current.id)) {
        bumped.add(current.id)
        update(index, { ...current, version: current.version + 1 })
      }
      const latest = all()[index] ?? current
      if (version !== latest.version) {
        return errorResponse(409, {
          code: "conflict",
          message: "Record was changed by someone else",
          current: full(latest),
        })
      }
      const result = patch(latest.id, changes)
      if (!result) return notFound()
      if ("fieldErrors" in result) return validationError(result.fieldErrors)
      return json(full(result.record))
    }),

    http.delete(`${url}/:id`, async ({ params }) => {
      const denied = await guard("delete")
      if (denied) return denied
      const removed = all().find((r) => r.id === params.id)
      if (!removed) return notFound()
      replace(all().filter((r) => r.id !== params.id))
      pinStore?.forget(removed.id)
      changed("deleted", removed)
      return noContent()
    }),
    ...(pinStore
      ? createPinHandlers({
          url,
          store: pinStore,
          guard: () => guard("read"),
          exists: (id, request) =>
            all()
              .filter(inCompany(request.headers.get(COMPANY_HEADER)))
              .some((record) => record.id === id),
        })
      : []),
  ]

  return {
    handlers,
    db: {
      /** Записи для прямих змін (події моку): кеш сортування скидається, зміна видна в списках. */
      all: () => {
        sorted.clear()
        return all()
      },
      /** Записи за фільтром списку в компанії — для масових дій (lib/mock-jobs). */
      select: (filter: Record<string, FilterValue>, companyId: string | null) =>
        select(filter, companyId),
      /** Зміна запису з новою версією, журналом і подією — як PATCH, але без перевірки версії. */
      patch,
      reset: () => {
        stored = null
        sorted.clear()
        bumped.clear()
      },
    },
  }
}

/** Доступ до записів мок-ресурсу (`createResourceHandlers(...).db`). */
export type MockResourceDb<T extends MockRecord> = ReturnType<
  typeof createResourceHandlers<T>
>["db"]
