/**
 * Конвенції REST API erp-ui (ADR-0002, SPEC §17) і HTTP-клієнт.
 *
 * - Ресурси: `GET /api/v1/<ресурс>` (список), `GET …/<id>`, `POST`, `PATCH …/<id>`, `DELETE …/<id>`.
 * - Список: плоскі параметри — `status=paid&status=sent&amount_gte=10000&q=…&sort=-date,number&page=2&perPage=50`;
 *   повтор ключа — «одне з»; суфікси `_gte`, `_lte`, `_gt`, `_lt`, `_ne`; `q` — повнотекстовий пошук.
 *   Відповідь — `{ data: T[], total: number }`.
 * - Помилки — `{ code, message, fieldErrors?, providerCode?, providerMessage?, current? }` + HTTP-статус.
 * - Конкурентне редагування: запис має `version`; PATCH надсилає її, розбіжність → 409 `conflict` з `current`.
 * - Сесія — httpOnly cookie (ADR-0003), тож клієнт завжди шле `credentials: "include"`.
 * - Компанія — заголовок `X-Company-Id` (PF02).
 * - Термін сесії — заголовок `X-Session-Expires-At` у відповідях (ADR-0010): клієнт передає його
 *   в lib/session, щоб попередити про завершення сесії. Фонові запити (`background`) позначаються
 *   `X-Background-Request: 1` і сесію не продовжують.
 */
import { z } from "zod"

import { getCompanyId } from "@/registry/lib/company-scope"
import {
  BACKGROUND_HEADER,
  SESSION_EXPIRES_HEADER,
  setSessionExpiresAt,
} from "@/registry/lib/session"

export const API_PREFIX = "/api/v1"
export const COMPANY_HEADER = "X-Company-Id"

export type SortOrder = "asc" | "desc"

export interface SortField {
  field: string
  order: SortOrder
}

export type FilterScalar = string | number | boolean
export type FilterValue = FilterScalar | FilterScalar[] | null | undefined

export interface ListParams {
  /** Сторінка, з 1. */
  page: number
  perPage: number
  sort: SortField[]
  filter: Record<string, FilterValue>
}

export const DEFAULT_PER_PAGE = 25
export const MAX_PER_PAGE = 500

/** Суфікси операторів фільтра: `amount_gte=100`. Без суфікса — рівність (або «одне з» для повторів). */
export const FILTER_OPERATORS = ["gte", "lte", "gt", "lt", "ne"] as const
export type FilterOperator = (typeof FILTER_OPERATORS)[number] | "eq"

const RESERVED = new Set(["page", "perPage", "sort"])

/** Ключ фільтра → поле й оператор: "amount_gte" → { field: "amount", op: "gte" }. */
export function parseFilterKey(key: string): {
  field: string
  op: FilterOperator
} {
  const m = /^(.+)_(gte|lte|gt|lt|ne)$/.exec(key)
  return m?.[1] && m[2]
    ? { field: m[1], op: m[2] as FilterOperator }
    : { field: key, op: "eq" }
}

/** Сортування в параметр: [{date, desc}, {number, asc}] → "-date,number". */
export function formatSort(sort: SortField[]): string {
  return sort
    .map(({ field, order }) => (order === "desc" ? `-${field}` : field))
    .join(",")
}

export function parseSort(value: string | null): SortField[] {
  if (!value) return []
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) =>
      part.startsWith("-")
        ? { field: part.slice(1), order: "desc" as const }
        : { field: part, order: "asc" as const },
    )
}

/** Параметри списку → рядок запиту. Порожні значення пропускаються. */
export function toSearchParams(params: Partial<ListParams>): URLSearchParams {
  const sp = new URLSearchParams()
  for (const [key, value] of Object.entries(params.filter ?? {})) {
    if (value === undefined || value === "") continue
    if (Array.isArray(value)) {
      for (const item of value) sp.append(key, String(item))
    } else {
      sp.append(key, value === null ? "null" : String(value))
    }
  }
  if (params.sort?.length) sp.set("sort", formatSort(params.sort))
  if (params.page) sp.set("page", String(params.page))
  if (params.perPage) sp.set("perPage", String(params.perPage))
  return sp
}

/** Рядок запиту → параметри списку (для моків і TS-бекендів). Значення фільтрів — рядки. */
export function fromSearchParams(sp: URLSearchParams): ListParams {
  const filter: Record<string, FilterValue> = {}
  for (const key of new Set(sp.keys())) {
    if (RESERVED.has(key)) continue
    const values = sp.getAll(key)
    filter[key] = values.length > 1 ? values : values[0]
  }
  const page = Math.max(1, Number(sp.get("page")) || 1)
  const perPage = Math.min(
    MAX_PER_PAGE,
    Math.max(1, Number(sp.get("perPage")) || DEFAULT_PER_PAGE),
  )
  return { page, perPage, sort: parseSort(sp.get("sort")), filter }
}

export const API_ERROR_CODES = [
  "validation",
  "unauthenticated",
  "forbidden",
  "not_found",
  "conflict",
  "rate_limited",
  "server",
  "offline",
  "challenge_required",
  "captcha_required",
  "token_expired",
  "reauth_required",
  "password_change_required",
  "factor_required",
  "impersonation_forbidden",
  "factor_setup_required",
  "ip_not_allowed",
  "account_blocked",
] as const
export type ApiErrorCode = (typeof API_ERROR_CODES)[number] | (string & {})

/** Код, який кіт знає й показує людині своїм текстом (`apiErrors.<код>`). */
export const isKnownApiErrorCode = (
  code: string,
): code is (typeof API_ERROR_CODES)[number] =>
  (API_ERROR_CODES as readonly string[]).includes(code)

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  fieldErrors: z.record(z.string(), z.string()).optional(),
  providerCode: z.string().optional(),
  providerMessage: z.string().optional(),
  /** Для `conflict`: актуальна версія запису на сервері. */
  current: z.unknown().optional(),
})
export type ApiErrorBody = z.infer<typeof apiErrorSchema>

const STATUS_CODES: Record<number, ApiErrorCode> = {
  401: "unauthenticated",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  422: "validation",
  429: "rate_limited",
}

/** Помилка API в єдиному форматі; `status` 0 — мережі немає. */
export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorCode
  readonly fieldErrors?: Record<string, string>
  readonly providerCode?: string
  readonly providerMessage?: string
  readonly current?: unknown

  constructor(status: number, body: ApiErrorBody) {
    super(body.message)
    this.name = "ApiError"
    this.status = status
    this.code = body.code
    this.fieldErrors = body.fieldErrors
    this.providerCode = body.providerCode
    this.providerMessage = body.providerMessage
    this.current = body.current
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

/** Стан сторінки для помилки запиту (erp/page-state): офлайн, немає доступу чи помилка з повтором. */
export function errorStateKind(
  error: unknown,
): "offline" | "forbidden" | "error" {
  if (isApiError(error) && error.code === "offline") return "offline"
  if (isApiError(error) && error.status === 403) return "forbidden"
  return "error"
}

/** Відповідь списку: `{ data, total }`. */
export function listResultSchema<T extends z.ZodType>(item: T) {
  return z.object({ data: z.array(item), total: z.number().int().min(0) })
}

/** Поля, які має кожен запис ресурсу. */
export const recordBaseSchema = z.object({
  id: z.string(),
  /** Версія для конкурентного редагування; зростає з кожним збереженням. */
  version: z.number().int().min(1),
})

export interface RequestOptions<T> {
  query?: URLSearchParams | Record<string, string | undefined>
  body?: unknown
  /** zod-схема відповіді: перевіряє, що сервер дотримується контракту (SPEC §18.4). */
  schema?: z.ZodType<T>
  signal?: AbortSignal
  /** "blob" — файл (експорт CSV тощо) замість JSON; помилки однаково приходять JSON. */
  responseType?: "json" | "blob"
  /** Фоновий запит (опитування): `X-Background-Request: 1`, сесію не продовжує (ADR-0014). */
  background?: boolean
  /**
   * Межа часу до кінця відповіді (з тілом): далі — `ApiError` 0 `offline`, як обрив мережі.
   * Без неї запит чекає, скільки триматиме з'єднання браузер. Для запиту, що змінює дані, тайм-аут
   * не означає «не виконано»: сервер міг зберегти зміни, тож повтор має бути ідемпотентним.
   */
  timeoutMs?: number
}

export interface ApiClientOptions {
  /** Адреса API; за замовчуванням — `/api/v1` того ж походження. */
  baseUrl?: string
  /** Мова інтерфейсу для `Accept-Language`: сервер пише нею листи, місця входу, повідомлення. */
  getLanguage?: () => string | null | undefined
  fetch?: typeof fetch
}

export type ApiClient = ReturnType<typeof createApiClient>

/**
 * Запит із межею часу (`timeoutMs`): сервер чи проксі, що прийняв запит і мовчить, дає `ApiError`
 * 0 `offline`, а не чекання без кінця. Відповідь сервера (`ApiError`) і скасування викликачем
 * (`signal`: зміна ключа запиту, розмонтування) лишаються як є: скасування — не помилка.
 * Таймер свій, а не `AbortSignal.timeout`: знімається з відповіддю, і тест веде його фальшивим
 * годинником. Скасування викликача передається вручну, без `AbortSignal.any`: його немає в Safari
 * до 17.4 і Chrome до 116, і `TypeError` там зупинив би опитування задачі (`isJobStatusLost`).
 * Межа не покладається на `fetch`: обгортка (адаптер бекенду, ADR-0021), що загубила `signal`,
 * не тримає запит без кінця.
 */
async function withTimeout<T>(
  timeoutMs: number,
  signal: AbortSignal | undefined,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController()
  const cancel = () => {
    controller.abort(signal?.reason)
  }
  if (signal?.aborted) cancel()
  else signal?.addEventListener("abort", cancel, { once: true })
  const aborted = new Promise<never>((_, reject) => {
    const fail = () => {
      const reason: unknown = controller.signal.reason
      reject(
        reason instanceof Error
          ? reason
          : new DOMException("The operation was aborted.", "AbortError"),
      )
    }
    if (controller.signal.aborted) fail()
    else controller.signal.addEventListener("abort", fail, { once: true })
  })
  const timeoutId = setTimeout(() => {
    controller.abort()
  }, timeoutMs)
  try {
    return await Promise.race([run(controller.signal), aborted])
  } catch (error) {
    // Перервано, а викликач не скасовував, — отже, минула межа часу.
    if (controller.signal.aborted && !signal?.aborted && !isApiError(error))
      throw new ApiError(0, { code: "offline", message: "Timeout" })
    throw error
  } finally {
    clearTimeout(timeoutId)
    signal?.removeEventListener("abort", cancel)
  }
}

export function createApiClient({
  baseUrl = API_PREFIX,
  getLanguage,
  fetch: fetchImpl,
}: ApiClientOptions = {}) {
  async function request<T = unknown>(
    method: string,
    path: string,
    { timeoutMs, ...options }: RequestOptions<T> = {},
  ): Promise<T> {
    if (timeoutMs === undefined) return send(method, path, options)
    return withTimeout(timeoutMs, options.signal, (signal) =>
      send(method, path, { ...options, signal }),
    )
  }

  /** Запит до відповіді сервера: заголовки кіта, термін сесії, `ApiError` на статус поза 2xx. */
  async function open(
    method: string,
    path: string,
    {
      query,
      body,
      signal,
      accept,
      background,
      lastEventId,
    }: Pick<RequestOptions<unknown>, "query" | "body" | "signal"> & {
      accept: string
      background?: boolean
      lastEventId?: string
    },
  ): Promise<Response> {
    const search =
      query instanceof URLSearchParams
        ? query
        : new URLSearchParams(
            Object.entries(query ?? {}).filter(
              (entry): entry is [string, string] => entry[1] !== undefined,
            ),
          )
    const url = `${baseUrl}${path}${search.size ? `?${search.toString()}` : ""}`
    const headers = new Headers({ Accept: accept })
    // FormData (файли) — браузер сам ставить multipart/form-data з межею.
    const multipart = body instanceof FormData
    if (body !== undefined && !multipart)
      headers.set("Content-Type", "application/json")
    // Компанія — з lib/company-scope: від неї ж залежать ключі кешу компонентів кіта.
    const companyId = getCompanyId()
    if (companyId) headers.set(COMPANY_HEADER, companyId)
    const language = getLanguage?.()
    if (language) headers.set("Accept-Language", language)
    if (background) headers.set(BACKGROUND_HEADER, "1")
    if (lastEventId) headers.set("Last-Event-ID", lastEventId)

    let response: Response
    try {
      response = await (fetchImpl ?? fetch)(url, {
        method,
        headers,
        body:
          body === undefined
            ? undefined
            : multipart
              ? body
              : JSON.stringify(body),
        credentials: "include",
        signal,
      })
    } catch (error) {
      if (signal?.aborted) throw error
      throw new ApiError(0, { code: "offline", message: "Network error" })
    }

    const sessionExpiresAt = response.headers.get(SESSION_EXPIRES_HEADER)
    if (sessionExpiresAt) setSessionExpiresAt(sessionExpiresAt)

    if (!response.ok) {
      let payload: unknown = null
      try {
        payload = await response.json()
      } catch {
        // Тіло не JSON — лишаємо загальну помилку за статусом.
      }
      const parsed = apiErrorSchema.safeParse(payload)
      throw new ApiError(
        response.status,
        parsed.success
          ? parsed.data
          : {
              code: STATUS_CODES[response.status] ?? "server",
              message: response.statusText || `HTTP ${String(response.status)}`,
            },
      )
    }
    return response
  }

  async function send<T>(
    method: string,
    path: string,
    { schema, responseType, ...options }: Omit<RequestOptions<T>, "timeoutMs">,
  ): Promise<T> {
    const response = await open(method, path, {
      ...options,
      accept: responseType === "blob" ? "*/*" : "application/json",
    })
    if (response.status === 204) return undefined as T
    if (responseType === "blob") return (await response.blob()) as T
    const data: unknown = await response.json()
    return schema ? schema.parse(data) : (data as T)
  }

  return {
    request,
    get: <T>(path: string, options?: RequestOptions<T>) =>
      request<T>("GET", path, options),
    post: <T>(path: string, body?: unknown, options?: RequestOptions<T>) =>
      request<T>("POST", path, { ...options, body }),
    put: <T>(path: string, body?: unknown, options?: RequestOptions<T>) =>
      request<T>("PUT", path, { ...options, body }),
    patch: <T>(path: string, body?: unknown, options?: RequestOptions<T>) =>
      request<T>("PATCH", path, { ...options, body }),
    delete: <T>(path: string, options?: RequestOptions<T>) =>
      request<T>("DELETE", path, options),
    /**
     * Потік подій (lib/realtime, ADR-0051): фоновий запит без межі часу, тіло читає викликач. Помилки
     * й заголовки — як у звичайного запиту, тож адаптер із власним `fetch` працює без змін.
     */
    stream: (
      path: string,
      { signal, lastEventId }: { signal: AbortSignal; lastEventId?: string },
    ) =>
      open("GET", path, {
        signal,
        accept: "text/event-stream",
        background: true,
        ...(lastEventId === undefined ? {} : { lastEventId }),
      }),
  }
}
