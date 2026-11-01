/**
 * Мок імпорту (lib/imports, ADR-0049): `POST /<ресурс>/import/check` і `POST /<ресурс>/import`.
 *
 * - Перевірка нічого не пише: новий рядок проходить ті самі схему й унікальність, що й `POST`, рядок
 *   із наявним значенням `matchField` — `skip` чи `update`. Другий рядок із тим самим значенням
 *   бачить перший: `skip`, а при оновленні — `duplicate`, бо перезаписав би його мовчки.
 * - Застосування — фонова задача `lib/mock-jobs`, `items[].id` — номер рядка файла. Той самий
 *   `requestId` повертає ту саму задачу. Повтор бере права на момент повтору.
 * - Сценарії — ресурсу, як і масові дії; опитування — ресурсу `jobs`.
 * - Права: `<ресурс>:create`, для `onDuplicate: "update"` ще й `<ресурс>:update`. Запис, якого людина
 *   не бачить (`read:own`), не знаходиться: рядок стає новим записом. Запис, який вона не може
 *   змінити, — помилка рядка `forbidden`.
 */
import { http, type HttpHandler } from "msw/http"

import { API_PREFIX } from "@/registry/lib/api"
import { importRequestSchema, type ImportRequest } from "@/registry/lib/imports"
import { mockRequestPermissions } from "@/registry/lib/mock-company-roles"
import {
  MOCK_JOB_RATE,
  registerMockJob,
  type MockJobSpec,
} from "@/registry/lib/mock-jobs"
import { scenarioFor } from "@/registry/lib/mock-scenarios"
import {
  mockDeniedAction,
  mockGrantsRecords,
  type MockRecordAccess,
} from "@/registry/lib/mock-scope"
import {
  applyScenario,
  currentMockUser,
  errorResponse,
  json,
  unauthenticated,
  type MockUser,
} from "@/registry/lib/mock-server"
import type { MockRecord, MockResourceDb } from "@/registry/lib/mocks"

/** Запуск, який щойно почався: повтор того самого `requestId` запуском не є. */
export interface MockImportStart {
  readonly jobId: string
  readonly resource: string
  readonly request: ImportRequest
  readonly user: MockUser
  readonly companyId: string | null
  readonly at: number
}

export interface MockImportOptions<T extends MockRecord> {
  resource: string
  db: MockResourceDb<T>
  /** Значення полів, яких немає в рядку: новий запис дістає їх, як сервер без цих полів у тілі. */
  defaults?: Record<string, unknown>
  perSecond?: number
  baseUrl?: string
  /** Годинник (тести). */
  now?: () => number
  /** Новий запуск: для історії імпорту (модуль A4). */
  onStarted?: (start: MockImportStart) => void
}

interface Scope<T extends MockRecord> {
  user: MockUser
  companyId: string | null
  rules: MockRecordAccess<T>
}

interface Outcomes {
  created: number
  updated: number
  skipped: number
}

const textOf = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : ""

const keyOf = (value: unknown) => textOf(value).trim().toLowerCase()

/** Схема дає текст zod, а контракт — код: для людини це просто «значення не підходить». */
const errorCode = (text: string) => (/^[a-z_]+$/.test(text) ? text : "invalid")

const neededActions = ({ onDuplicate }: ImportRequest) =>
  onDuplicate === "update" ? ["create", "update"] : ["create"]

/** Наявні записи за полем збігу: лише видимі людині. */
function existingBy<T extends MockRecord>(
  db: MockResourceDb<T>,
  { companyId, rules }: Scope<T>,
  field: string | undefined,
): Map<string, T> {
  if (!field) return new Map()
  return new Map(
    db
      .select({}, companyId, rules)
      .map((record) => [
        keyOf((record as Record<string, unknown>)[field]),
        record,
      ]),
  )
}

function checkRows<T extends MockRecord>(
  db: MockResourceDb<T>,
  scope: Scope<T>,
  { rows, matchField, onDuplicate }: ImportRequest,
  defaults: Record<string, unknown>,
) {
  const existing = existingBy(db, scope, matchField)
  const seen = new Set<string>()
  const isUpdate = onDuplicate === "update"
  return rows.map(({ row, values }) => {
    const key = matchField ? keyOf(values[matchField]) : ""
    if (seen.has(key))
      return isUpdate
        ? {
            row,
            action: "invalid",
            errors: [{ field: matchField, code: "duplicate" }],
          }
        : { row, action: "skip" }
    if (key) seen.add(key)
    const found = key ? existing.get(key) : undefined
    if (found && !isUpdate) return { row, action: "skip" }
    if (found)
      return mockDeniedAction(scope.rules, found, "update")
        ? { row, action: "invalid", errors: [{ code: "forbidden" }] }
        : { row, action: "update" }
    const prepared = db.prepare(
      { ...defaults, ...values },
      scope.companyId,
      scope.user,
    )
    return "record" in prepared
      ? { row, action: "create" }
      : {
          row,
          action: "invalid",
          errors: Object.entries(prepared.fieldErrors).map(([field, text]) => ({
            field,
            code: errorCode(text),
          })),
        }
  })
}

function startImportJob<T extends MockRecord>(
  {
    resource,
    db,
    defaults,
    perSecond,
    now,
  }: Required<Omit<MockImportOptions<T>, "baseUrl" | "onStarted">>,
  body: ImportRequest,
  scope: Scope<T>,
): string {
  const { rows, matchField, onDuplicate } = body
  const byRow = new Map(rows.map((item) => [String(item.row), item]))
  const written = new Set<string>()
  const failure = (fieldErrors: Record<string, string>, title: string) => ({
    code: errorCode(Object.values(fieldErrors)[0] ?? "invalid"),
    message: `Invalid: ${JSON.stringify(fieldErrors)}`,
    retryable: false,
    title,
  })
  const apply = (
    id: string,
    existing: Map<string, T>,
    current: Scope<T>,
    outcomes: Outcomes,
  ) => {
    const values = byRow.get(id)?.values ?? {}
    const title = (matchField && textOf(values[matchField])) || id
    const key = matchField ? keyOf(values[matchField]) : ""
    if (onDuplicate === "update" && written.has(key))
      return failure({ [matchField ?? "row"]: "duplicate" }, title)
    const found = key ? existing.get(key) : undefined
    if (found && onDuplicate !== "update") {
      outcomes.skipped += 1
      return null
    }
    if (found) {
      const denial = mockDeniedAction(current.rules, found, "update")
      if (denial)
        return {
          code: "forbidden",
          message: `Denied: ${denial}`,
          retryable: false,
          title,
        }
      const result = db.patch(found.id, values)
      if (!result || !("record" in result))
        return failure(result?.fieldErrors ?? { row: "not_found" }, title)
      written.add(key)
      outcomes.updated += 1
      return null
    }
    const inserted = db.insert(
      { ...defaults, ...values },
      current.companyId,
      current.user,
    )
    if ("fieldErrors" in inserted) return failure(inserted.fieldErrors, title)
    if (key) {
      written.add(key)
      existing.set(key, inserted.record)
    }
    outcomes.created += 1
    return null
  }
  const accessFor = (permissions: readonly string[]) =>
    db.accessOf(scope.user, permissions)
  const specFor = (current: Scope<T>, ids: string[]): MockJobSpec => {
    // Свої лічильники кожній задачі: звіт сам додає результат попередньої до повтору.
    const outcomes: Outcomes = { created: 0, updated: 0, skipped: 0 }
    return {
      userId: current.user.id,
      companyId: current.companyId,
      resource,
      action: "import",
      ids,
      perSecond,
      process: (batch) => {
        // Один прохід по записах на партію; записане в партії видно наступним рядкам.
        const existing = existingBy(db, current, matchField)
        return batch.map((id) => apply(id, existing, current, outcomes))
      },
      grants: (permissions) =>
        neededActions(body).every((action) =>
          mockGrantsRecords(accessFor(permissions), action),
        ),
      retry: (failed, permissions) =>
        registerMockJob(
          specFor({ ...current, rules: accessFor(permissions) }, failed),
          now(),
        ),
      outcomes: () => outcomes,
    }
  }
  return registerMockJob(specFor(scope, [...byRow.keys()]), now()).id
}

export function createImportHandlers<T extends MockRecord>({
  resource,
  db,
  defaults = {},
  perSecond = MOCK_JOB_RATE,
  baseUrl = API_PREFIX,
  now = Date.now,
  onStarted,
}: MockImportOptions<T>): HttpHandler[] {
  const started = new Map<string, string>()

  async function open(
    request: Request,
  ): Promise<Response | { scope: Scope<T>; body: ImportRequest }> {
    const early = await applyScenario(scenarioFor(resource))
    if (early) return early
    const user = currentMockUser()
    if (!user) return unauthenticated()
    const access = mockRequestPermissions(request, user)
    if (access instanceof Response) return access
    const rules = db.accessOf(user, access.permissions)
    const body = importRequestSchema.safeParse(
      await request.json().catch(() => undefined),
    )
    if (!body.success)
      return errorResponse(422, {
        code: "validation",
        message: "Validation failed",
        fieldErrors: { rows: "invalid" },
      })
    const denied = neededActions(body.data).find(
      (action) => !mockGrantsRecords(rules, action),
    )
    if (denied)
      return errorResponse(403, {
        code: "forbidden",
        message: `Missing permission ${resource}:${denied}`,
      })
    return {
      scope: { user, companyId: access.companyId, rules },
      body: body.data,
    }
  }

  const url = `${baseUrl}/${resource}/import`
  return [
    http.post(`${url}/check`, async ({ request }) => {
      const opened = await open(request)
      if (opened instanceof Response) return opened
      return json({ rows: checkRows(db, opened.scope, opened.body, defaults) })
    }),
    http.post(url, async ({ request }) => {
      const opened = await open(request)
      if (opened instanceof Response) return opened
      const { body, scope } = opened
      const key = `${scope.user.id}:${scope.companyId}:${body.requestId}`
      const repeated = started.get(key)
      if (repeated) return json({ jobId: repeated }, { status: 202 })
      const jobId = startImportJob(
        { resource, db, defaults, perSecond, now },
        body,
        scope,
      )
      started.set(key, jobId)
      onStarted?.({
        jobId,
        resource,
        request: body,
        user: scope.user,
        companyId: scope.companyId,
        at: now(),
      })
      return json({ jobId }, { status: 202 })
    }),
  ]
}
