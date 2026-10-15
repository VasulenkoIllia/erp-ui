import { QueryClient } from "@tanstack/react-query"
import { act, renderHook } from "@testing-library/react"
import { delay, http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import { CoreAdminContext } from "ra-core"
import type { ReactNode } from "react"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { ZodError } from "zod"

import { mergeFailures } from "@/registry/erp/job-failures"
import {
  isJobPollFailing,
  isJobStatusLost,
  jobQueryKey,
  useJob,
} from "@/registry/hooks/use-job"
import { useRowSelection } from "@/registry/hooks/use-row-selection"
import { ApiError, createApiClient, isApiError } from "@/registry/lib/api"
import { createDataProvider } from "@/registry/lib/data-provider"
import {
  JOB_FAILURE_SAMPLE,
  JOB_POLL_MS,
  JOB_POLL_TIMEOUT_MS,
  jobSchema,
  type JobStatus,
} from "@/registry/lib/jobs"

const apiError = (status: number, code: string) =>
  new ApiError(status, { code, message: code })

describe("вибір рядків (hooks/use-row-selection)", () => {
  it("інший фільтр скидає вибір, і повернення до попереднього його не оживляє", () => {
    const { result, rerender } = renderHook(
      ({ filter }) => useRowSelection([filter, "zoriana"]),
      { initialProps: { filter: "draft" } },
    )
    act(() => {
      result.current.selectAll()
    })
    expect(result.current.state.mode).toBe("all")

    rerender({ filter: "paid" })
    expect(result.current.state).toMatchObject({ mode: "ids" })
    expect(result.current.isSelected("inv-1")).toBe(false)

    rerender({ filter: "draft" })
    expect(result.current.state).toMatchObject({ mode: "ids" })
    expect(result.current.isSelected("inv-1")).toBe(false)
  })
})

describe("стан задачі (hooks/use-job, lib/jobs)", () => {
  it("опитування зупиняється лише тоді, коли стан не дізнатись", () => {
    expect(isJobStatusLost(apiError(404, "not_found"))).toBe(true)
    expect(isJobStatusLost(apiError(401, "unauthenticated"))).toBe(true)
    expect(isJobStatusLost(apiError(403, "forbidden"))).toBe(true)
    expect(isJobStatusLost(new ZodError([]))).toBe(true)
    expect(isJobStatusLost(apiError(0, "offline"))).toBe(false)
    expect(isJobStatusLost(apiError(503, "server"))).toBe(false)
    expect(isJobStatusLost(apiError(429, "rate_limited"))).toBe(false)
    expect(isJobStatusLost(apiError(408, "server"))).toBe(false)
  })

  it("лічильники задачі мають сходитись", () => {
    const job = {
      id: "job-1",
      resource: "invoices",
      action: "approve",
      status: "running",
      total: 10,
      processed: 4,
      succeeded: 3,
      failed: 1,
      failures: [
        { code: "locked", count: 1, retryable: true, items: [{ id: "a" }] },
      ],
    }
    expect(jobSchema.safeParse(job).success).toBe(true)
    expect(jobSchema.safeParse({ ...job, succeeded: 4 }).success).toBe(false)
    expect(jobSchema.safeParse({ ...job, failures: [] }).success).toBe(false)
    expect(jobSchema.safeParse({ ...job, status: "done" }).success).toBe(false)
  })

  it("невдачі повтору й попередніх задач — одна група на причину", () => {
    const items = (prefix: string, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        id: `${prefix}-${String(i)}`,
      }))
    const merged = mergeFailures([
      { code: "locked", count: 2, retryable: true, items: items("a", 2) },
      {
        code: "invalid_status",
        count: 30,
        retryable: false,
        items: items("b", 20),
      },
      { code: "locked", count: 25, retryable: false, items: items("c", 20) },
    ])
    expect(
      merged.map(({ code, count, retryable }) => ({ code, count, retryable })),
    ).toEqual([
      { code: "locked", count: 27, retryable: false },
      { code: "invalid_status", count: 30, retryable: false },
    ])
    expect(merged[0]?.items).toHaveLength(JOB_FAILURE_SAMPLE)
    expect(merged[0]?.items[0]).toEqual({ id: "a-0" })
  })
})

const BASE = "http://erp.test/api/v1"
const TOTAL = 10

/** Відповіді `GET /jobs/:id` по черзі: стан задачі або `hang` — сервер прийняв запит і мовчить. */
const replies: (JobStatus | "hang")[] = []
let requests = 0
const server = setupServer(
  http.get(`${BASE}/jobs/:id`, async ({ params }) => {
    requests++
    const reply = replies.shift() ?? "done"
    if (reply === "hang") await delay("infinite")
    const processed = reply === "done" ? TOTAL : reply === "running" ? 4 : 0
    return HttpResponse.json({
      id: String(params.id),
      resource: "invoices",
      action: "approve",
      status: reply,
      total: TOTAL,
      processed,
      succeeded: processed,
      failed: 0,
      failures: [],
    })
  }),
)
const dataProvider = createDataProvider(createApiClient({ baseUrl: BASE }))

function renderJob(id: string) {
  const queryClient = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <CoreAdminContext dataProvider={dataProvider} queryClient={queryClient}>
      {children}
    </CoreAdminContext>
  )
  const view = renderHook((props: { id: string }) => useJob(props.id), {
    initialProps: { id },
    wrapper,
  })
  return { ...view, queryClient }
}

/** Фальшивий годинник: таймери опитування й межі часу; проміси й відповіді MSW — справжні. */
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

describe("опитування задачі, коли сервер мовчить (hooks/use-job, lib/api)", () => {
  beforeAll(() => {
    server.listen({ onUnhandledFrame: "error" })
  })
  afterAll(() => {
    server.close()
  })
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"],
    })
    replies.length = 0
    requests = 0
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("без відповіді за JOB_POLL_TIMEOUT_MS — тимчасовий збій, опитування йде далі до підсумку", async () => {
    replies.push("running", "hang", "done")
    const { result } = renderJob("job-1")
    await vi.waitFor(() => {
      expect(result.current.data?.status).toBe("running")
    })

    await advance(JOB_POLL_MS)
    expect(requests).toBe(2)
    // Запит висить: інтервал нових не шле, і без межі часу так тривало б без кінця. Запас у секунду:
    // vi.waitFor під фальшивим годинником просуває його на 50 мс за кожну перевірку.
    await advance(JOB_POLL_TIMEOUT_MS - 1000)
    expect(requests).toBe(2)
    expect(result.current.error).toBeNull()

    await advance(1000)
    expect(result.current.error).toMatchObject({ status: 0, code: "offline" })
    expect(isJobStatusLost(result.current.error)).toBe(false)
    // Попередній прогрес лишається на місці, поки триває перевірка.
    expect(result.current.data?.processed).toBe(4)

    await advance(JOB_POLL_MS)
    await vi.waitFor(() => {
      expect(result.current.data?.status).toBe("done")
    })
    expect(requests).toBe(3)
    expect(result.current.error).toBeNull()
  })

  it("сервер мовчить із першого запиту: попередження не зникає між спробами", async () => {
    replies.push("hang", "hang", "running")
    const { result } = renderJob("job-1")
    await vi.waitFor(() => {
      expect(requests).toBe(1)
    })
    await advance(JOB_POLL_TIMEOUT_MS)
    expect(result.current.error).toMatchObject({ code: "offline" })
    expect(isJobPollFailing(result.current)).toBe(true)

    await advance(JOB_POLL_MS)
    expect(requests).toBe(2)
    // Даних ще немає: TanStack Query скинув `error` на новий запит, а попередження лишається.
    expect(result.current.error).toBeNull()
    expect(isJobPollFailing(result.current)).toBe(true)

    await advance(JOB_POLL_TIMEOUT_MS + JOB_POLL_MS)
    await vi.waitFor(() => {
      expect(result.current.data?.status).toBe("running")
    })
    expect(requests).toBe(3)
    expect(isJobPollFailing(result.current)).toBe(false)
  })

  it("інша задача в компоненті, розмонтування: запит, що висів, скасовано без помилки в стані", async () => {
    replies.push("hang", "running", "hang")
    const { result, rerender, unmount, queryClient } = renderJob("job-1")
    await vi.waitFor(() => {
      expect(requests).toBe(1)
    })

    rerender({ id: "job-2" })
    await vi.waitFor(() => {
      expect(result.current.data?.id).toBe("job-2")
    })
    expect(result.current.error).toBeNull()
    await advance(JOB_POLL_TIMEOUT_MS)
    expect(queryClient.getQueryState(jobQueryKey("job-1"))).toMatchObject({
      error: null,
      fetchStatus: "idle",
    })

    await vi.waitFor(() => {
      expect(requests).toBe(3)
    })
    unmount()
    await advance(JOB_POLL_TIMEOUT_MS)
    expect(queryClient.getQueryState(jobQueryKey("job-2"))).toMatchObject({
      error: null,
      fetchStatus: "idle",
    })
  })

  it("getJob: скасування викликачем лишається скасуванням, а не ApiError", async () => {
    replies.push("hang")
    const controller = new AbortController()
    const pending = dataProvider
      .getJob("job-1", { signal: controller.signal })
      .catch((error: unknown) => error)
    await vi.waitFor(() => {
      expect(requests).toBe(1)
    })
    controller.abort()
    const error = await pending
    expect(isApiError(error)).toBe(false)
    expect(error).toMatchObject({ name: "AbortError" })

    const early = await dataProvider
      .getJob("job-1", { signal: AbortSignal.abort() })
      .catch((reason: unknown) => reason)
    expect(isApiError(early)).toBe(false)
    expect(early).toMatchObject({ name: "AbortError" })
  })

  it("lib/api timeoutMs: межа діє, навіть коли fetch не слухає signal; таймер знімається з відповіддю", async () => {
    // Обгортка fetch (адаптер бекенду), що загубила signal і чекає без кінця.
    const deaf = createApiClient({
      baseUrl: BASE,
      fetch: () => new Promise<Response>(() => undefined),
    })
    const pending = deaf
      .get("/jobs/job-1", { timeoutMs: JOB_POLL_TIMEOUT_MS })
      .catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(JOB_POLL_TIMEOUT_MS)
    expect(await pending).toMatchObject({ status: 0, code: "offline" })

    const timers = vi.getTimerCount()
    const quick = createApiClient({
      baseUrl: BASE,
      fetch: () =>
        Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json" },
          }),
        ),
    })
    await expect(
      quick.get("/ping", { timeoutMs: JOB_POLL_TIMEOUT_MS }),
    ).resolves.toEqual({ ok: true })
    expect(vi.getTimerCount()).toBe(timers)
  })
})
