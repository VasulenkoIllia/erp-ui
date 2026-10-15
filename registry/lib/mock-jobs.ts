/**
 * Мок масових дій і фонових задач (lib/jobs, ADR-0018): `POST /<ресурс>/bulk/<дія>`,
 * `GET /jobs/:id`, `POST /jobs/:id/retry`.
 *
 * - Задача обробляє записи з часом (`perSecond`, за замовчуванням 400 на секунду): кожен запит
 *   стану доробляє записи, яким уже настав час, тож зміни видно в списку ще до кінця задачі.
 * - Дія над записом (`apply`) повертає зміни або відмову з кодом; зміни йдуть через `db.patch`
 *   (нова версія, журнал аудиту, подія для вебхуків). Партія — одна пачка змін (`mockBatch`):
 *   журнал і доставки вебхуків пишуться в localStorage раз на партію, а не на кожен запис.
 * - Сценарій запуску — ресурсу (`invoices`), опитування й повтору — ресурсу `jobs` (панель
 *   розробника): так видно і відмову запуску, і збій зв'язку посеред задачі.
 * - Задачі живуть у пам'яті до перезавантаження сторінки; бачить лише той, хто запустив.
 */
import { http, type HttpHandler } from "msw/http"
import { z } from "zod"

import {
  API_PREFIX,
  COMPANY_HEADER,
  type FilterValue,
} from "@/registry/lib/api"
import { hasPermission } from "@/registry/lib/auth"
import {
  JOB_FAILURE_SAMPLE,
  JOBS_PATH,
  type Job,
  type JobFailureGroup,
} from "@/registry/lib/jobs"
import { scenarioFor } from "@/registry/lib/mock-scenarios"
import {
  applyScenario,
  currentMockUser,
  errorResponse,
  json,
  mockBatch,
  randomToken,
  unauthenticated,
} from "@/registry/lib/mock-server"
import type { MockRecord, MockResourceDb } from "@/registry/lib/mocks"

/** Ресурс для сценаріїв опитування задач у панелі розробника. */
export const MOCK_JOBS_RESOURCE = "jobs"
/** Записів за секунду: 1 200 чернеток — 3 с, 10 000 рахунків — 25 с. */
export const MOCK_JOB_RATE = 400
/** Задача спершу коротко стоїть у черзі. */
const QUEUE_MS = 300

export type MockBulkOutcome<T> =
  | { changes: Partial<T> }
  | { code: string; message: string; retryable?: boolean }

export interface MockBulkAction<T extends MockRecord> {
  /** Дія над записом: зміни або відмова з кодом (`retryable` — повтор може пройти). */
  apply: (record: T) => MockBulkOutcome<T>
}

type Failure = JobFailureGroup & { ids: string[] }
type FailureReason = Omit<JobFailureGroup, "count" | "items"> & {
  title?: string
}

interface MockJob {
  id: string
  userId: string
  resource: string
  action: string
  ids: string[]
  startedAt: number
  processed: number
  succeeded: number
  failures: Map<string, Failure>
  perSecond: number
  /** Обробити записи: для кожного null — успіх, інакше відмова з назвою запису. */
  process: (ids: string[]) => (FailureReason | null)[]
  /** Нова задача для невдач, які можна повторити. */
  retry: (ids: string[]) => MockJob
  /** Задача повтору: повторний запит повертає її ж, а не дублює. */
  retriedBy?: string
}

const jobs = new Map<string, MockJob>()

/** Скинути задачі (тести). */
export function resetMockJobs(): void {
  jobs.clear()
}

const filterValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.union([z.string(), z.number(), z.boolean()])),
])
const selectionSchema = z.union([
  z.object({ ids: z.array(z.string()).min(1) }),
  z.object({
    filter: z.record(z.string(), filterValueSchema),
    exclude: z.array(z.string()).optional(),
  }),
])

const validation = (field: string, code: string) =>
  errorResponse(422, {
    code: "validation",
    message: "Validation failed",
    fieldErrors: { [field]: code },
  })

/** Доробити записи, яким настав час. */
function advance(job: MockJob, at: number) {
  const elapsed = Math.max(0, at - job.startedAt - QUEUE_MS)
  const due = Math.min(
    job.ids.length,
    Math.floor((elapsed * job.perSecond) / 1000),
  )
  const batch = job.ids.slice(job.processed, due)
  const outcomes = mockBatch(() => job.process(batch))
  if (outcomes.length !== batch.length)
    throw new Error("Mock job: one outcome per record expected")
  job.processed = Math.max(job.processed, due)
  batch.forEach((id, i) => {
    const failure = outcomes[i]
    if (!failure) {
      job.succeeded += 1
      return
    }
    const { title, ...reason } = failure
    const group = job.failures.get(reason.code) ?? {
      ...reason,
      count: 0,
      items: [],
      ids: [],
    }
    group.count += 1
    group.ids.push(id)
    if (group.items.length < JOB_FAILURE_SAMPLE)
      group.items.push(title === undefined ? { id } : { id, title })
    job.failures.set(reason.code, group)
  })
}

function toJob(job: MockJob, at: number): Job {
  const total = job.ids.length
  const queued = job.processed === 0 && at < job.startedAt + QUEUE_MS
  return {
    id: job.id,
    resource: job.resource,
    action: job.action,
    status: queued ? "queued" : job.processed < total ? "running" : "done",
    total,
    processed: job.processed,
    succeeded: job.succeeded,
    failed: job.processed - job.succeeded,
    failures: [...job.failures.values()].map(
      ({ code, message, count, retryable, items }) => ({
        code,
        message,
        count,
        retryable,
        items,
      }),
    ),
  }
}

export interface MockBulkOptions<T extends MockRecord> {
  resource: string
  db: MockResourceDb<T>
  /** Дії: ключ — сегмент шляху й дія права (`invoices:approve`). */
  actions: Record<string, MockBulkAction<T>>
  /** Поле з назвою запису для списку невдач (номер рахунку). */
  titleField?: keyof T & string
  perSecond?: number
  baseUrl?: string
  /** Годинник (тести). */
  now?: () => number
}

/** `POST /<ресурс>/bulk/<дія>` для дій ресурсу. */
export function createBulkHandlers<T extends MockRecord>({
  resource,
  db,
  actions,
  titleField,
  perSecond = MOCK_JOB_RATE,
  baseUrl = API_PREFIX,
  now = Date.now,
}: MockBulkOptions<T>): HttpHandler[] {
  const start = (
    userId: string,
    companyId: string | null,
    actionName: string,
    action: MockBulkAction<T>,
    ids: string[],
  ): MockJob => {
    const job: MockJob = {
      id: `job-${randomToken().slice(0, 12)}`,
      userId,
      resource,
      action: actionName,
      ids,
      startedAt: now(),
      processed: 0,
      succeeded: 0,
      failures: new Map(),
      perSecond,
      process: (batch) => {
        if (!batch.length) return []
        // Один прохід по записах компанії на партію, а не пошук на кожен запис.
        const byId = new Map(
          db.select({}, companyId).map((record) => [record.id, record]),
        )
        const notFound = { code: "not_found", message: "Not found" }
        return batch.map((id) => {
          const record = byId.get(id)
          if (!record) return { ...notFound, retryable: false }
          const title = titleField ? String(record[titleField]) : undefined
          // Збій дії над одним записом — невдача цього запису, а не всієї партії.
          try {
            const outcome = action.apply(record)
            if (!("changes" in outcome))
              return {
                ...outcome,
                retryable: outcome.retryable ?? false,
                title,
              }
            const result = db.patch(id, outcome.changes)
            if (!result) return { ...notFound, retryable: false, title }
            if ("record" in result) return null
            return {
              code: "validation",
              message: `Invalid: ${JSON.stringify(result.fieldErrors)}`,
              retryable: false,
              title,
            }
          } catch (error) {
            return {
              code: "server",
              message: error instanceof Error ? error.message : String(error),
              retryable: true,
              title,
            }
          }
        })
      },
      retry: (failed) => start(userId, companyId, actionName, action, failed),
    }
    jobs.set(job.id, job)
    return job
  }

  return [
    http.post(
      `${baseUrl}/${resource}/bulk/:action`,
      async ({ params, request }) => {
        const early = await applyScenario(scenarioFor(resource))
        if (early) return early
        const user = currentMockUser()
        if (!user) return unauthenticated()
        const actionName = String(params.action)
        const action = actions[actionName]
        if (!action)
          return errorResponse(404, {
            code: "not_found",
            message: "No such action",
          })
        if (!hasPermission(user.permissions, resource, actionName))
          return errorResponse(403, {
            code: "forbidden",
            message: `Missing permission ${resource}:${actionName}`,
          })
        // Тіло не JSON — та сама 422, що й вибір не за контрактом.
        const body: unknown = await request.json().catch(() => undefined)
        const parsed = selectionSchema.safeParse(body)
        if (!parsed.success) return validation("selection", "invalid")
        const companyId = request.headers.get(COMPANY_HEADER)
        let ids: string[]
        if ("ids" in parsed.data) ids = [...new Set(parsed.data.ids)]
        else {
          const excluded = new Set(parsed.data.exclude ?? [])
          ids = db
            .select(
              parsed.data.filter as Record<string, FilterValue>,
              companyId,
            )
            .map((record) => record.id)
            .filter((id) => !excluded.has(id))
        }
        if (!ids.length) return validation("selection", "empty")
        const job = start(user.id, companyId, actionName, action, ids)
        return json({ jobId: job.id }, { status: 202 })
      },
    ),
  ]
}

/** `GET /jobs/:id` і `POST /jobs/:id/retry`. */
export function createJobHandlers({
  baseUrl = API_PREFIX,
  now = Date.now,
}: { baseUrl?: string; now?: () => number } = {}): HttpHandler[] {
  const url = `${baseUrl}/${JOBS_PATH}/:id`

  /** Сценарій, сесія й власник задачі: відмова або задача. */
  async function own(id: unknown): Promise<Response | MockJob> {
    const early = await applyScenario(scenarioFor(MOCK_JOBS_RESOURCE))
    if (early) return early
    const user = currentMockUser()
    if (!user) return unauthenticated()
    const job = jobs.get(String(id))
    if (!job || job.userId !== user.id)
      return errorResponse(404, { code: "not_found", message: "Job not found" })
    return job
  }

  return [
    http.get(url, async ({ params }) => {
      const job = await own(params.id)
      if (job instanceof Response) return job
      const at = now()
      advance(job, at)
      return json(toJob(job, at))
    }),

    http.post(`${url}/retry`, async ({ params }) => {
      const job = await own(params.id)
      if (job instanceof Response) return job
      const at = now()
      advance(job, at)
      if (job.processed < job.ids.length) return validation("job", "running")
      if (job.retriedBy) return json({ jobId: job.retriedBy }, { status: 202 })
      const failed = [...job.failures.values()]
        .filter((group) => group.retryable)
        .flatMap((group) => group.ids)
      if (!failed.length) return validation("job", "nothing_to_retry")
      job.retriedBy = job.retry(failed).id
      return json({ jobId: job.retriedBy }, { status: 202 })
    }),
  ]
}
