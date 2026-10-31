import { setupServer } from "msw/node"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest"
import { z } from "zod"

import { ApiError, createApiClient, recordBaseSchema } from "@/registry/lib/api"
import { createDataProvider } from "@/registry/lib/data-provider"
import type { ImportRequest } from "@/registry/lib/imports"
import type { Job } from "@/registry/lib/jobs"
import { createImportHandlers } from "@/registry/lib/mock-imports"
import { createJobHandlers, resetMockJobs } from "@/registry/lib/mock-jobs"
import { resetScenarios, setScenario } from "@/registry/lib/mock-scenarios"
import {
  createPlatformHandlers,
  createResourceHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"

const BASE = "http://erp.test/api/v1"
const RATE = 1000

const productSchema = recordBaseSchema.extend({
  sku: z.string().min(1),
  name: z.string().min(1),
})
type Product = z.infer<typeof productSchema>

const seed = (): Product[] => [
  { id: "p1", version: 1, sku: "A-1", name: "Кава" },
  { id: "p2", version: 1, sku: "A-2", name: "Чай" },
]

const user = (id: string, permissions: string[]): MockUser => ({
  id,
  name: id,
  email: `${id}@zoriana.example`,
  password: "demo",
  totpCode: "111111",
  roles: [],
  permissions,
  companies: [],
  companyId: null,
  factors: [],
})

const products = createResourceHandlers<Product>({
  baseUrl: BASE,
  resource: "products",
  schema: productSchema,
  data: seed,
  label: { uk: "Товари", en: "Products" },
  unique: ["sku"],
})

let clock = 1_000_000
const server = setupServer(
  ...createPlatformHandlers({
    baseUrl: BASE,
    users: [
      user("full", ["products:*"]),
      user("creator", ["products:read", "products:create"]),
      user("reader", ["products:read"]),
    ],
  }),
  ...createJobHandlers({ baseUrl: BASE, now: () => clock }),
  ...createImportHandlers<Product>({
    baseUrl: BASE,
    resource: "products",
    db: products.db,
    perSecond: RATE,
    now: () => clock,
  }),
  ...products.handlers,
)

const client = createApiClient({ baseUrl: BASE })
const dataProvider = createDataProvider(client)

let runs = 0
const request = (overrides: Partial<ImportRequest> = {}): ImportRequest => ({
  requestId: `run-${String((runs += 1))}`,
  matchField: "sku",
  onDuplicate: "skip",
  rows: [
    { row: 2, values: { sku: "A-1", name: "Кава нова" } },
    { row: 3, values: { sku: "B-1", name: "Какао" } },
    { row: 4, values: { sku: "B-1", name: "Какао ще раз" } },
    { row: 5, values: { sku: "B-2" } },
  ],
  ...overrides,
})

async function finished(jobId: string): Promise<Job> {
  clock += 10_000
  return dataProvider.getJob(jobId)
}

beforeAll(() => {
  server.listen()
})
beforeEach(() => {
  products.db.reset()
  resetMockJobs()
  resetScenarios()
  signInMock("full")
})
afterEach(() => {
  server.resetHandlers()
})
afterAll(() => {
  server.close()
})

describe("перевірка", () => {
  it("каже про кожен рядок і нічого не пише", async () => {
    const { rows } = await dataProvider.checkImport("products", request())
    expect(rows).toEqual([
      { row: 2, action: "skip" },
      { row: 3, action: "create" },
      { row: 4, action: "skip" },
      {
        row: 5,
        action: "invalid",
        errors: [{ field: "name", code: "invalid" }],
      },
    ])
    expect(products.db.all()).toHaveLength(2)
  })

  it("оновлення вимагає права update", async () => {
    signInMock("creator")
    await expect(
      dataProvider.checkImport("products", request({ onDuplicate: "update" })),
    ).rejects.toMatchObject({ status: 403 })
    const { rows } = await dataProvider.checkImport("products", request())
    expect(rows[0]?.action).toBe("skip")
  })

  it("без права create — 403", async () => {
    signInMock("reader")
    await expect(
      dataProvider.checkImport("products", request()),
    ).rejects.toBeInstanceOf(ApiError)
  })

  it("сценарій ресурсу діє", async () => {
    setScenario("error", "products")
    await expect(
      dataProvider.checkImport("products", request()),
    ).rejects.toBeInstanceOf(ApiError)
  })
})

describe("застосування", () => {
  it("створює, оновлює й рахує результат", async () => {
    const { jobId } = await dataProvider.startImport(
      "products",
      request({
        onDuplicate: "update",
        rows: [
          { row: 2, values: { sku: "A-1", name: "Кава нова" } },
          { row: 3, values: { sku: "B-1", name: "Какао" } },
        ],
      }),
    )
    const job = await finished(jobId)
    expect(job).toMatchObject({
      status: "done",
      action: "import",
      succeeded: 2,
      failed: 0,
      outcomes: { created: 1, updated: 1, skipped: 0 },
    })
    const stored = products.db.all()
    expect(stored.find((item) => item.sku === "A-1")?.name).toBe("Кава нова")
    expect(stored.some((item) => item.sku === "B-1")).toBe(true)
  })

  it("пропускає наявні, а другий рядок бачить перший", async () => {
    const { jobId } = await dataProvider.startImport(
      "products",
      request({ rows: request().rows.slice(0, 3) }),
    )
    const job = await finished(jobId)
    expect(job.outcomes).toEqual({ created: 1, updated: 0, skipped: 2 })
    expect(products.db.all()).toHaveLength(3)
  })

  it("рядок, що не пройшов під час запису, — невдача з номером рядка", async () => {
    const { jobId } = await dataProvider.startImport(
      "products",
      request({
        matchField: undefined,
        onDuplicate: undefined,
        rows: [{ row: 7, values: { sku: "C-1" } }],
      }),
    )
    const job = await finished(jobId)
    expect(job.failed).toBe(1)
    expect(job.failures[0]?.items[0]?.id).toBe("7")
  })

  it("той самий requestId не запускає імпорт двічі", async () => {
    const body = request({ rows: request().rows.slice(1, 2) })
    const first = await dataProvider.startImport("products", body)
    const second = await dataProvider.startImport("products", body)
    expect(second.jobId).toBe(first.jobId)
    await finished(first.jobId)
    expect(products.db.all()).toHaveLength(3)
  })

  it("тіло не за контрактом — 422", async () => {
    await expect(
      client.post("/products/import", { rows: [] }),
    ).rejects.toMatchObject({ status: 422 })
  })
})
