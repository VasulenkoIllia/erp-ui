/**
 * Мок імпорту (lib/imports, ADR-0049): `POST /<ресурс>/import/check` і `POST /<ресурс>/import`.
 *
 * - Перевірка нічого не пише: новий рядок проходить ті самі схему й унікальність, що й `POST`, рядок
 *   із наявним значенням `matchField` — `skip` чи `update`. Другий рядок із тим самим значенням
 *   бачить перший.
 * - Застосування — фонова задача `lib/mock-jobs`, `items[].id` — номер рядка файла. Той самий
 *   `requestId` повертає ту саму задачу.
 * - Сценарії — ресурсу, як і масові дії; опитування — ресурсу `jobs`.
 * - Права: `<ресурс>:create`, для `onDuplicate: "update"` ще й `<ресурс>:update`. Запис, якого людина
 *   не бачить (`read:own`), не знаходиться: рядок стає новим записом.
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

export interface MockImportOptions<T extends MockRecord> {
  resource: string
  db: MockResourceDb<T>
  perSecond?: number
  baseUrl?: string
  /** Годинник (тести). */
  now?: () => number
}

interface Scope<T extends MockRecord> {
  user: MockUser
  companyId: string | null
  permissions: string[]
  rules: MockRecordAccess<T>
}

const textOf = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : ""

const keyOf = (value: unknown) => textOf(value).trim().toLowerCase()

/** Схема дає текст zod, а контракт — код: для людини це просто «значення не підходить». */
const errorCode = (text: string) => (/^[a-z_]+$/.test(text) ? text : "invalid")

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

export function createImportHandlers<T extends MockRecord>({
  resource,
  db,
  perSecond = MOCK_JOB_RATE,
  baseUrl = API_PREFIX,
  now = Date.now,
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
    const needed =
      body.data.onDuplicate === "update" ? ["create", "update"] : ["create"]
    const denied = needed.find((action) => !mockGrantsRecords(rules, action))
    if (denied)
      return errorResponse(403, {
        code: "forbidden",
        message: `Missing permission ${resource}:${denied}`,
      })
    const { companyId, permissions } = access
    return {
      scope: { user, companyId, permissions, rules },
      body: body.data,
    }
  }

  const check = (
    { rows, matchField, onDuplicate }: ImportRequest,
    scope: Scope<T>,
  ) => {
    const existing = existingBy(db, scope, matchField)
    const seen = new Set<string>()
    return rows.map(({ row, values }) => {
      const key = matchField ? keyOf(values[matchField]) : ""
      if (key && (existing.has(key) || seen.has(key)))
        return { row, action: onDuplicate === "update" ? "update" : "skip" }
      if (key) seen.add(key)
      const prepared = db.prepare(values, scope.companyId, scope.user)
      return "record" in prepared
        ? { row, action: "create" }
        : {
            row,
            action: "invalid",
            errors: Object.entries(prepared.fieldErrors).map(
              ([field, text]) => ({ field, code: errorCode(text) }),
            ),
          }
    })
  }

  const start = (body: ImportRequest, scope: Scope<T>) => {
    const { rows, matchField, onDuplicate } = body
    const outcomes = { created: 0, updated: 0, skipped: 0 }
    const byRow = new Map(rows.map((item) => [String(item.row), item]))
    const failure = (fieldErrors: Record<string, string>, title: string) => ({
      code: errorCode(Object.values(fieldErrors)[0] ?? "invalid"),
      message: `Invalid: ${JSON.stringify(fieldErrors)}`,
      retryable: false,
      title,
    })
    const apply = (id: string) => {
      const values = byRow.get(id)?.values ?? {}
      const title = (matchField && textOf(values[matchField])) || id
      const key = matchField ? keyOf(values[matchField]) : ""
      const found = key ? existingBy(db, scope, matchField).get(key) : undefined
      if (found && onDuplicate !== "update") {
        outcomes.skipped += 1
        return null
      }
      if (found) {
        const result = db.patch(found.id, values)
        if (result && "record" in result) {
          outcomes.updated += 1
          return null
        }
        return failure(result?.fieldErrors ?? { row: "not_found" }, title)
      }
      const inserted = db.insert(values, scope.companyId, scope.user)
      if ("fieldErrors" in inserted) return failure(inserted.fieldErrors, title)
      outcomes.created += 1
      return null
    }
    const spec: MockJobSpec = {
      userId: scope.user.id,
      companyId: scope.companyId,
      resource,
      action: "import",
      ids: [...byRow.keys()],
      perSecond,
      process: (batch) => batch.map(apply),
      grants: (permissions) =>
        mockGrantsRecords(db.accessOf(scope.user, permissions), "create"),
      retry: (ids) => registerMockJob({ ...spec, ids }, now()),
      outcomes: () => outcomes,
    }
    return registerMockJob(spec, now()).id
  }

  const url = `${baseUrl}/${resource}/import`
  return [
    http.post(`${url}/check`, async ({ request }) => {
      const opened = await open(request)
      if (opened instanceof Response) return opened
      return json({ rows: check(opened.body, opened.scope) })
    }),
    http.post(url, async ({ request }) => {
      const opened = await open(request)
      if (opened instanceof Response) return opened
      const { body, scope } = opened
      const key = `${scope.user.id}:${scope.companyId}:${body.requestId}`
      const jobId = started.get(key) ?? start(body, scope)
      started.set(key, jobId)
      return json({ jobId }, { status: 202 })
    }),
  ]
}
