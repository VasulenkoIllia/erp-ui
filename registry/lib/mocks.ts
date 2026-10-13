/**
 * Мок-сервер на MSW за контрактами erp-ui (ADR-0002, ADR-0003, ADR-0010): поводиться як бекенд,
 * щоб UI будувався й тестувався без нього. Підключається лише в розробці, демо й тестах.
 *
 * - `createPlatformHandlers` (lib/mock-auth) — усі способи входу, `/me`, вподобання PF11, а також
 *   фактори, сесії, журнал входів і «Увійти як…» (lib/mock-account).
 * - `createResourceHandlers` — CRUD ресурсу з фільтрами, сортуванням, пагінацією, правами,
 *   версіями (409) і прив'язкою до компанії (`X-Company-Id`).
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
import { hasPermission } from "@/registry/lib/auth"
import type { MockAccountSeed } from "@/registry/lib/mock-account"
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
  errorResponse,
  json,
  noContent,
  signInMock,
  subscribeMockMessages,
  type MockMessage,
  type MockUser,
} from "@/registry/lib/mock-server"

// erp-ui: окремі import + export, бо shadcn CLI хибно переписує шляхи в `export … from`.
export {
  createPlatformHandlers,
  currentMockUser,
  DEFAULT_MOCK_METHODS,
  errorResponse,
  signInMock,
  subscribeMockMessages,
}
export type {
  MockAccountSeed,
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
  /** Початкові дані (fixtures). */
  data: T[]
  /** Поля для `q`. */
  searchFields?: (keyof T & string)[]
  baseUrl?: string
  /** Генератор id нових записів. */
  newId?: () => string
}

function matches(value: unknown, op: string, raw: FilterValue): boolean {
  const wanted = Array.isArray(raw) ? raw : [raw]
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

export function createResourceHandlers<T extends MockRecord>({
  resource,
  schema,
  data,
  searchFields = [],
  baseUrl = API_PREFIX,
  newId = () => crypto.randomUUID(),
}: MockResourceOptions<T>) {
  let records: T[] = structuredClone(data)
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

  const inCompany = (request: Request) => {
    const companyId = request.headers.get(COMPANY_HEADER)
    return (record: T) =>
      !companyId || record.companyId == null || record.companyId === companyId
  }

  const notFound = () =>
    errorResponse(404, { code: "not_found", message: `${resource}: not found` })

  const handlers: HttpHandler[] = [
    http.get(url, async ({ request }) => {
      const denied = await guard("read")
      if (denied) return denied
      if (scenarioFor(resource) === "empty") return json({ data: [], total: 0 })
      const { page, perPage, sort, filter } = fromSearchParams(
        new URL(request.url).searchParams,
      )
      const { q, ...rest } = filter
      const query =
        typeof q === "string" ? q.trim().toLocaleLowerCase("uk") : ""
      const filtered = records.filter(inCompany(request)).filter((record) => {
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
      const sorted = sortRecords(filtered, sort)
      const start = (page - 1) * perPage
      return json({
        data: sorted.slice(start, start + perPage),
        total: sorted.length,
      })
    }),

    http.get(`${url}/:id`, async ({ params, request }) => {
      const denied = await guard("read")
      if (denied) return denied
      const record = records
        .filter(inCompany(request))
        .find((r) => r.id === params.id)
      return record ? json(record) : notFound()
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
      if (!parsed.success) {
        return errorResponse(422, {
          code: "validation",
          message: "Validation failed",
          fieldErrors: fieldErrors(parsed.error),
        })
      }
      records = [parsed.data, ...records]
      return json(parsed.data, { status: 201 })
    }),

    http.patch(`${url}/:id`, async ({ params, request }) => {
      const denied = await guard("update")
      if (denied) return denied
      const index = records.findIndex((r) => r.id === params.id)
      const current = records[index]
      if (!current) return notFound()
      const { version, ...changes } = (await request.json()) as Record<
        string,
        unknown
      >
      // Сценарій conflict імітує, що інший користувач зберіг запис перед нами — один раз
      // на запис, тож «Зберегти мої зміни» з новою версією після цього проходить.
      if (scenarioFor(resource) === "conflict" && !bumped.delete(current.id)) {
        bumped.add(current.id)
        records[index] = { ...current, version: current.version + 1 }
      }
      const latest = records[index] ?? current
      if (version !== latest.version) {
        return errorResponse(409, {
          code: "conflict",
          message: "Record was changed by someone else",
          current: latest,
        })
      }
      const parsed = schema.safeParse({
        ...latest,
        ...changes,
        id: latest.id,
        version: latest.version + 1,
      })
      if (!parsed.success) {
        return errorResponse(422, {
          code: "validation",
          message: "Validation failed",
          fieldErrors: fieldErrors(parsed.error),
        })
      }
      records[index] = parsed.data
      return json(parsed.data)
    }),

    http.delete(`${url}/:id`, async ({ params }) => {
      const denied = await guard("delete")
      if (denied) return denied
      const before = records.length
      records = records.filter((r) => r.id !== params.id)
      return records.length < before ? noContent() : notFound()
    }),
  ]

  return {
    handlers,
    db: {
      all: () => records,
      reset: () => {
        records = structuredClone(data)
        bumped.clear()
      },
    },
  }
}
