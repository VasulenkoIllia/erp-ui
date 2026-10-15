import { setupServer } from "msw/node"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from "vitest"
import { z } from "zod"

import { ApiError, createApiClient, recordBaseSchema } from "@/registry/lib/api"
import { setCompanyId } from "@/registry/lib/company-scope"
import { createDataProvider } from "@/registry/lib/data-provider"
import { isJobActive, retryableCount, type Job } from "@/registry/lib/jobs"
import {
  createBulkHandlers,
  createJobHandlers,
  resetMockJobs,
} from "@/registry/lib/mock-jobs"
import { resetScenarios, setScenario } from "@/registry/lib/mock-scenarios"
import { setMockWebhookSeeds } from "@/registry/lib/mock-webhooks"
import {
  createPlatformHandlers,
  createResourceHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"
import {
  EMPTY_SELECTION,
  isRowSelected,
  selectAllRows,
  selectedCount,
  setRows,
  toBulkSelection,
  toggleRow,
} from "@/registry/lib/row-selection"

const BASE = "http://erp.test/api/v1"
/** Записів за секунду в тестах: 10 на секунду — прогрес видно кроками годинника. */
const RATE = 10
/** Черга мок-задачі перед першими записами. */
const QUEUE_MS = 300

const invoiceSchema = recordBaseSchema.extend({
  number: z.string(),
  amount: z.number().int(),
  status: z.enum(["draft", "approved", "paid"]),
  companyId: z.string().nullable(),
})
type Invoice = z.infer<typeof invoiceSchema>

const INVOICES: Invoice[] = Array.from({ length: 30 }, (_, i) => ({
  id: `inv-${String(i + 1)}`,
  version: 1,
  number: `2026-${String(i + 1).padStart(4, "0")}`,
  amount: (i + 1) * 1000,
  status: i % 3 === 2 ? "paid" : "draft",
  companyId: i < 20 ? "zoriana" : "kovalenko",
}))

const USERS: MockUser[] = [
  {
    id: "u1",
    name: "Олена Коваль",
    email: "olena@zoriana.example",
    password: "demo",
    totpCode: "123456",
    roles: ["accountant"],
    permissions: ["invoices:*"],
    companies: [{ id: "zoriana", name: "ТОВ «Зоряна логістика»" }],
    companyId: "zoriana",
    factors: [],
  },
  {
    id: "u2",
    name: "Іван Петренко",
    email: "ivan@zoriana.example",
    password: "demo",
    totpCode: "000000",
    roles: ["sales"],
    permissions: ["invoices:read", "invoices:update"],
    companies: [{ id: "zoriana", name: "ТОВ «Зоряна логістика»" }],
    companyId: "zoriana",
    factors: [],
  },
]

let clock = 0
const now = () => clock
const tick = (ms: number) => {
  clock += ms
}

/** Зайнятий один раз: перша спроба відмовляє з можливістю повтору. */
const lockedOnce = new Set<string>()
const LOCKED = new Set(["inv-4", "inv-7"])

const invoices = createResourceHandlers({
  resource: "invoices",
  schema: invoiceSchema,
  data: INVOICES,
  searchFields: ["number"],
  baseUrl: BASE,
})
const server = setupServer(
  ...createPlatformHandlers({ users: USERS, baseUrl: BASE }),
  ...createJobHandlers({ baseUrl: BASE, now }),
  ...createBulkHandlers<Invoice>({
    resource: "invoices",
    db: invoices.db,
    titleField: "number",
    perSecond: RATE,
    baseUrl: BASE,
    now,
    actions: {
      approve: {
        apply: (invoice) => {
          if (invoice.status !== "draft")
            return { code: "invalid_status", message: "Only drafts" }
          if (LOCKED.has(invoice.id) && !lockedOnce.has(invoice.id)) {
            lockedOnce.add(invoice.id)
            return { code: "locked", message: "Busy", retryable: true }
          }
          return { changes: { status: "approved" } }
        },
      },
      // Дія, що падає на записі: невдача цього запису, а не всієї задачі.
      archive: {
        apply: () => {
          throw new Error("Storage unavailable")
        },
      },
    },
  }),
  ...invoices.handlers,
)

const client = createApiClient({ baseUrl: BASE })
const dataProvider = createDataProvider(client)

/** Опитувати задачу кроками годинника, доки не завершиться. */
async function finish(jobId: string): Promise<Job> {
  for (let i = 0; i < 100; i++) {
    const job = await dataProvider.getJob(jobId)
    if (!isJobActive(job)) return job
    tick(1000)
  }
  throw new Error("Job did not finish")
}

async function statusOf(id: string) {
  const { data } = await dataProvider.getOne<Invoice>("invoices", { id })
  return data.status
}

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" })
})
afterAll(() => {
  server.close()
})
beforeEach(() => {
  clock = 0
  lockedOnce.clear()
  resetScenarios()
  resetMockJobs()
  invoices.db.reset()
  setCompanyId(null)
  signInMock("u1")
})
afterEach(() => {
  server.resetHandlers()
})

describe("вибір рядків (lib/row-selection)", () => {
  it("рядки й сторінки: вибір переживає зміну сторінки", () => {
    let state = setRows(EMPTY_SELECTION, ["a", "b", "c"], true)
    state = setRows(state, ["d", "e"], true)
    state = toggleRow(state, "b")
    expect(selectedCount(state, 100)).toBe(4)
    expect(isRowSelected(state, "b")).toBe(false)
    expect(toBulkSelection(state, { status: "draft" })).toEqual({
      ids: ["a", "c", "d", "e"],
    })
  })

  it("усі за фільтром: зняті рядки стають винятками", () => {
    let state = selectAllRows()
    expect(selectedCount(state, 10_000)).toBe(10_000)
    expect(toBulkSelection(state, { status: "draft" })).toEqual({
      filter: { status: "draft" },
    })
    state = toggleRow(state, "x")
    state = setRows(state, ["y", "z"], false)
    state = setRows(state, ["z"], true)
    expect(isRowSelected(state, "x")).toBe(false)
    expect(isRowSelected(state, "z")).toBe(true)
    expect(selectedCount(state, 10_000)).toBe(9_998)
    expect(toBulkSelection(state, { status: "draft" })).toEqual({
      filter: { status: "draft" },
      exclude: ["x", "y"],
    })
  })
})

describe("масова дія фоновою задачею (lib/mock-jobs)", () => {
  it("черга, прогрес за часом, підсумок із групами невдач", async () => {
    const ids = ["inv-1", "inv-2", "inv-3", "inv-4", "inv-5"]
    const { jobId } = await dataProvider.startBulk("invoices", "approve", {
      ids: [...ids, "inv-1"],
    })

    const queued = await dataProvider.getJob(jobId)
    expect(queued).toMatchObject({ status: "queued", total: 5, processed: 0 })

    tick(QUEUE_MS + 200)
    const running = await dataProvider.getJob(jobId)
    expect(running).toMatchObject({ status: "running", processed: 2 })
    // Зміни видно в списку ще до кінця задачі.
    expect(await statusOf("inv-1")).toBe("approved")

    const done = await finish(jobId)
    expect(done).toMatchObject({
      status: "done",
      total: 5,
      processed: 5,
      succeeded: 3,
      failed: 2,
    })
    expect(done.failures).toEqual([
      {
        code: "invalid_status",
        message: "Only drafts",
        count: 1,
        retryable: false,
        items: [{ id: "inv-3", title: "2026-0003" }],
      },
      {
        code: "locked",
        message: "Busy",
        count: 1,
        retryable: true,
        items: [{ id: "inv-4", title: "2026-0004" }],
      },
    ])
    expect(retryableCount(done)).toBe(1)
    const { data } = await dataProvider.getOne<Invoice>("invoices", {
      id: "inv-2",
    })
    expect(data).toMatchObject({ status: "approved", version: 2 })
  })

  it("за фільтром: компанія з заголовка, без знятих рядків", async () => {
    setCompanyId("zoriana")
    const { jobId } = await dataProvider.startBulk("invoices", "approve", {
      filter: { status: "draft" },
      exclude: ["inv-1"],
    })
    const done = await finish(jobId)
    // Чернетки «Зоряної» — 14 із 20, без inv-1 — 13; inv-4 і inv-7 зайняті.
    expect(done).toMatchObject({ total: 13, succeeded: 11, failed: 2 })
    expect(await statusOf("inv-1")).toBe("draft")
    setCompanyId(null)
    expect(await statusOf("inv-22")).toBe("draft")
  })

  it("партія — одна пачка змін: журнал аудиту й доставки вебхуків пишуться в сховище раз", async () => {
    const AUDIT_KEY = "erp-ui:mock-audit"
    const WEBHOOKS_KEY = "erp-ui:mock-webhooks"
    const forget = () => {
      localStorage.removeItem(AUDIT_KEY)
      localStorage.removeItem(WEBHOOKS_KEY)
    }
    forget()
    setMockWebhookSeeds([
      {
        id: "wh-1c",
        url: "https://1c.example/hooks",
        events: ["invoices.updated"],
        active: true,
        createdAt: "2026-10-01T09:00:00.000Z",
      },
    ])
    onTestFinished(() => {
      setMockWebhookSeeds([])
      forget()
    })
    const ids = ["inv-1", "inv-2", "inv-5", "inv-8", "inv-10", "inv-11"]
    const { jobId } = await dataProvider.startBulk("invoices", "approve", {
      ids,
    })
    // Перший запис — окремо: стан вебхуків засівається в сховище до заміру.
    const perRecordMs = 1000 / RATE
    tick(QUEUE_MS + perRecordMs)
    expect(await dataProvider.getJob(jobId)).toMatchObject({ processed: 1 })

    const writes = vi.spyOn(Storage.prototype, "setItem")
    onTestFinished(() => {
      writes.mockRestore()
    })
    // Решті записів настав час — вони йдуть однією партією.
    tick(ids.length * perRecordMs)
    expect(await dataProvider.getJob(jobId)).toMatchObject({
      status: "done",
      succeeded: 6,
    })
    // Решта п'ять записів — одним записом у сховище, а не п'ятьма: інакше 1 200 записів —
    // 1 200 разів розібрати й записати по пів мегабайта JSON у головному потоці сторінки.
    const keys = writes.mock.calls.map(([key]) => key)
    expect(keys.filter((key) => key === AUDIT_KEY)).toHaveLength(1)
    expect(keys.filter((key) => key === WEBHOOKS_KEY)).toHaveLength(1)

    // Вміст той самий, що й при записі по одному: найновіші — першими.
    const newestFirst = [...ids].reverse()
    const audit = JSON.parse(localStorage.getItem(AUDIT_KEY) ?? "[]") as {
      action: string
      target?: { id: string }
    }[]
    expect(
      audit
        .filter((event) => event.action === "invoices.updated")
        .map((event) => event.target?.id),
    ).toEqual(newestFirst)
    const webhooks = JSON.parse(localStorage.getItem(WEBHOOKS_KEY) ?? "{}") as {
      deliveries: { request: { body: string } }[]
    }
    expect(
      webhooks.deliveries.map(
        (delivery) =>
          (JSON.parse(delivery.request.body) as { data: { id: string } }).data
            .id,
      ),
    ).toEqual(newestFirst)
  })

  it("повтор бере лише невдачі, які можна повторити", async () => {
    const { jobId } = await dataProvider.startBulk("invoices", "approve", {
      ids: ["inv-3", "inv-4", "inv-7", "inv-8"],
    })
    await expect(dataProvider.retryJob(jobId)).rejects.toMatchObject({
      status: 422,
      fieldErrors: { job: "running" },
    })
    const first = await finish(jobId)
    expect(first).toMatchObject({ succeeded: 1, failed: 3 })

    const { jobId: retryId } = await dataProvider.retryJob(jobId)
    // Повторний запит (друга вкладка, загублена відповідь) — та сама задача повтору.
    expect(await dataProvider.retryJob(jobId)).toEqual({ jobId: retryId })
    const retried = await finish(retryId)
    expect(retried).toMatchObject({ total: 2, succeeded: 2, failed: 0 })
    expect(await statusOf("inv-7")).toBe("approved")
    await expect(dataProvider.retryJob(retryId)).rejects.toMatchObject({
      status: 422,
      fieldErrors: { job: "nothing_to_retry" },
    })
  })

  it("права, невідома дія, порожній вибір, тіло не JSON, чужа задача", async () => {
    await expect(
      dataProvider.startBulk("invoices", "delete", { ids: ["inv-1"] }),
    ).rejects.toMatchObject({ status: 404 })
    const broken = await fetch(`${BASE}/invoices/bulk/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    })
    expect(broken.status).toBe(422)
    await expect(
      dataProvider.startBulk("invoices", "approve", {
        filter: { status: "approved" },
      }),
    ).rejects.toMatchObject({
      status: 422,
      fieldErrors: { selection: "empty" },
    })
    const { jobId } = await dataProvider.startBulk("invoices", "approve", {
      ids: ["inv-1"],
    })

    signInMock("u2")
    await expect(
      dataProvider.startBulk("invoices", "approve", { ids: ["inv-2"] }),
    ).rejects.toMatchObject({ status: 403, code: "forbidden" })
    await expect(dataProvider.getJob(jobId)).rejects.toMatchObject({
      status: 404,
    })
  })

  it("збій дії над записом — невдача запису з можливістю повтору", async () => {
    const { jobId } = await dataProvider.startBulk("invoices", "archive", {
      ids: ["inv-1", "inv-2"],
    })
    const done = await finish(jobId)
    expect(done).toMatchObject({ status: "done", succeeded: 0, failed: 2 })
    expect(done.failures).toMatchObject([
      { code: "server", count: 2, retryable: true },
    ])
    expect(await statusOf("inv-1")).toBe("draft")
  })

  it("збій опитування — сценарій ресурсу jobs; задача йде далі", async () => {
    const { jobId } = await dataProvider.startBulk("invoices", "approve", {
      ids: ["inv-1", "inv-2"],
    })
    setScenario("error", "jobs")
    const error = await dataProvider.getJob(jobId).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    setScenario("success", "jobs")
    expect(await finish(jobId)).toMatchObject({ succeeded: 2 })
  })
})
