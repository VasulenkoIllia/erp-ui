/**
 * Мок-сервер на MSW за контрактами erp-ui (ADR-0002, ADR-0003): поводиться як бекенд, щоб UI
 * будувався й тестувався без нього. Підключається лише в розробці, демо й тестах.
 *
 * - `createPlatformHandlers` — вхід із 2FA, `/me`, вподобання PF11.
 * - `createResourceHandlers` — CRUD ресурсу з фільтрами, сортуванням, пагінацією, правами,
 *   версіями (409) і прив'язкою до компанії (`X-Company-Id`).
 * - Кожен обробник поважає сценарій із lib/mock-scenarios.
 * - Мок сам перевіряє права, як справжній сервер (SPEC: приховування в UI — лише косметика).
 */
import { http, HttpResponse, type HttpHandler } from "msw/http"
import { delay } from "msw/utils/delay"
import type { z } from "zod"

import {
  API_PREFIX,
  COMPANY_HEADER,
  fromSearchParams,
  parseFilterKey,
  type ApiErrorBody,
  type FilterValue,
  type SortField,
} from "@/registry/lib/api"
import { hasPermission, meSchema, type Me } from "@/registry/lib/auth"
import {
  scenarioFor,
  SLOW_DELAY_MS,
  type Scenario,
} from "@/registry/lib/mock-scenarios"
import type { Preferences } from "@/registry/lib/preferences"

export function errorResponse(status: number, body: ApiErrorBody) {
  return HttpResponse.json(body, { status })
}

/** Сценарій перед обробкою: відповідь одразу (помилка, офлайн) або null — продовжувати. */
async function applyScenario(scenario: Scenario): Promise<Response | null> {
  switch (scenario) {
    case "offline":
      return HttpResponse.error()
    case "error":
      return errorResponse(500, {
        code: "server",
        message: "Mock: server error",
      })
    case "forbidden":
      return errorResponse(403, {
        code: "forbidden",
        message: "Mock: forbidden",
      })
    case "slow":
      await delay(SLOW_DELAY_MS)
      return null
    default:
      return null
  }
}

/* ------------------------------ Сесія й платформа ------------------------------ */

export interface MockUser extends Me {
  password: string
  /** Код 2FA, який мок приймає (у справжньому сервері — TOTP). */
  totpCode: string
}

const SESSION_KEY = "erp-ui:mock-session"
type Session = { userId: string; stage: "two_factor" | "authenticated" }

function readSession(): Session | null {
  try {
    const raw = globalThis.localStorage?.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

let memorySession: Session | null = readSession()

function writeSession(session: Session | null) {
  memorySession = session
  try {
    if (session)
      globalThis.localStorage?.setItem(SESSION_KEY, JSON.stringify(session))
    else globalThis.localStorage?.removeItem(SESSION_KEY)
  } catch {
    // Без сховища сесія живе до перезавантаження.
  }
}

let mockUsers: MockUser[] = []

/** Користувач поточної мок-сесії (після 2FA). */
export function currentMockUser(): MockUser | null {
  const session = memorySession
  if (session?.stage !== "authenticated") return null
  return mockUsers.find((u) => u.id === session.userId) ?? null
}

/** Увійти в мок без форми — для тестів і демо. */
export function signInMock(userId: string | null) {
  writeSession(userId ? { userId, stage: "authenticated" } : null)
}

/** Профіль без пароля й коду: схема відкидає зайві поля. */
const toMe = (user: MockUser): Me => meSchema.parse(user)

const PREFS_KEY = (userId: string) => `erp-ui:mock-preferences:${userId}`

export function createPlatformHandlers({
  users,
  baseUrl = API_PREFIX,
  defaultPreferences,
}: {
  users: MockUser[]
  baseUrl?: string
  defaultPreferences?: Partial<Preferences>
}): HttpHandler[] {
  mockUsers = users
  const unauthenticated = () =>
    errorResponse(401, { code: "unauthenticated", message: "Not signed in" })

  return [
    http.post(`${baseUrl}/auth/login`, async ({ request }) => {
      const body = (await request.json()) as {
        email?: string
        password?: string
      }
      const user = users.find(
        (u) =>
          u.email.toLowerCase() === body.email?.toLowerCase() &&
          u.password === body.password,
      )
      if (!user) {
        return errorResponse(401, {
          code: "unauthenticated",
          message: "Invalid email or password",
        })
      }
      if (user.twoFactorEnabled) {
        writeSession({ userId: user.id, stage: "two_factor" })
        return HttpResponse.json({ status: "two_factor_required" })
      }
      writeSession({ userId: user.id, stage: "authenticated" })
      return HttpResponse.json({ status: "authenticated" })
    }),

    http.post(`${baseUrl}/auth/2fa`, async ({ request }) => {
      const { code } = (await request.json()) as { code?: string }
      const session = memorySession
      const user = users.find((u) => u.id === session?.userId)
      if (session?.stage !== "two_factor" || !user) return unauthenticated()
      if (code !== user.totpCode) {
        return errorResponse(422, {
          code: "validation",
          message: "Invalid code",
          fieldErrors: { code: "invalid" },
        })
      }
      writeSession({ userId: user.id, stage: "authenticated" })
      return HttpResponse.json({ status: "authenticated" })
    }),

    http.post(`${baseUrl}/auth/logout`, () => {
      writeSession(null)
      return new HttpResponse(null, { status: 204 })
    }),

    http.get(`${baseUrl}/me`, () => {
      const user = currentMockUser()
      return user ? HttpResponse.json(toMe(user)) : unauthenticated()
    }),

    http.get(`${baseUrl}/me/preferences`, () => {
      const user = currentMockUser()
      if (!user) return unauthenticated()
      try {
        const raw = globalThis.localStorage?.getItem(PREFS_KEY(user.id))
        return HttpResponse.json(
          raw ? (JSON.parse(raw) as Preferences) : (defaultPreferences ?? {}),
        )
      } catch {
        return HttpResponse.json(defaultPreferences ?? {})
      }
    }),

    http.put(`${baseUrl}/me/preferences`, async ({ request }) => {
      const user = currentMockUser()
      if (!user) return unauthenticated()
      const prefs = (await request.json()) as Preferences
      try {
        globalThis.localStorage?.setItem(
          PREFS_KEY(user.id),
          JSON.stringify(prefs),
        )
      } catch {
        // Не збереглося — мок однаково відповідає успіхом.
      }
      return HttpResponse.json(prefs)
    }),
  ]
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
      if (scenarioFor(resource) === "empty")
        return HttpResponse.json({ data: [], total: 0 })
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
      return HttpResponse.json({
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
      return record ? HttpResponse.json(record) : notFound()
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
      return HttpResponse.json(parsed.data, { status: 201 })
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
      return HttpResponse.json(parsed.data)
    }),

    http.delete(`${url}/:id`, async ({ params }) => {
      const denied = await guard("delete")
      if (denied) return denied
      const before = records.length
      records = records.filter((r) => r.id !== params.id)
      return records.length < before
        ? new HttpResponse(null, { status: 204 })
        : notFound()
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
