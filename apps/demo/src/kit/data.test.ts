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

import {
  ApiError,
  createApiClient,
  fromSearchParams,
  parseFilterKey,
  recordBaseSchema,
  toSearchParams,
} from "@/registry/lib/api"
import {
  createAuthProvider,
  hasPermission,
  isTwoFactorRequired,
} from "@/registry/lib/auth"
import { createDataProvider } from "@/registry/lib/data-provider"
import { resetScenarios, setScenario } from "@/registry/lib/mock-scenarios"
import {
  createPlatformHandlers,
  createResourceHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"

const BASE = "http://erp.test/api/v1"

const invoiceSchema = recordBaseSchema.extend({
  number: z.string(),
  client: z.string(),
  amount: z.number().int(),
  status: z.enum(["draft", "sent", "paid"]),
  companyId: z.string().nullable(),
})
type Invoice = z.infer<typeof invoiceSchema>

const INVOICES: Invoice[] = Array.from({ length: 30 }, (_, i) => ({
  id: `inv-${String(i + 1)}`,
  version: 1,
  number: `2026-${String(i + 1).padStart(4, "0")}`,
  client: i % 3 === 0 ? "ТОВ «Зоряна логістика»" : "ФОП Коваленко",
  amount: (i + 1) * 1000,
  status: (["draft", "sent", "paid"] as const)[i % 3] ?? "draft",
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
    twoFactorEnabled: true,
  },
  {
    id: "u2",
    name: "Гість",
    email: "guest@zoriana.example",
    password: "demo",
    totpCode: "000000",
    roles: ["viewer"],
    permissions: ["invoices:read"],
    companies: [],
    companyId: null,
    twoFactorEnabled: false,
  },
]

const invoices = createResourceHandlers({
  resource: "invoices",
  schema: invoiceSchema,
  data: INVOICES,
  searchFields: ["number", "client"],
  baseUrl: BASE,
})
const server = setupServer(
  ...createPlatformHandlers({ users: USERS, baseUrl: BASE }),
  ...invoices.handlers,
)

let companyId: string | null = null
const client = createApiClient({ baseUrl: BASE, getCompanyId: () => companyId })
const dataProvider = createDataProvider(client)

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" })
})
afterAll(() => {
  server.close()
})
beforeEach(() => {
  resetScenarios()
  invoices.db.reset()
  companyId = null
  signInMock("u1")
})
afterEach(() => {
  server.resetHandlers()
})

describe("конвенції запиту (ADR-0002)", () => {
  it("плоскі параметри туди й назад", () => {
    const sp = toSearchParams({
      page: 2,
      perPage: 50,
      sort: [
        { field: "date", order: "desc" },
        { field: "number", order: "asc" },
      ],
      filter: {
        status: ["paid", "sent"],
        amount_gte: 10000,
        q: "зоря",
        empty: "",
      },
    })
    expect(sp.toString()).toBe(
      "status=paid&status=sent&amount_gte=10000&q=%D0%B7%D0%BE%D1%80%D1%8F&sort=-date%2Cnumber&page=2&perPage=50",
    )
    expect(fromSearchParams(sp)).toEqual({
      page: 2,
      perPage: 50,
      sort: [
        { field: "date", order: "desc" },
        { field: "number", order: "asc" },
      ],
      filter: { status: ["paid", "sent"], amount_gte: "10000", q: "зоря" },
    })
    expect(parseFilterKey("amount_gte")).toEqual({ field: "amount", op: "gte" })
    expect(parseFilterKey("due_date")).toEqual({ field: "due_date", op: "eq" })
    expect(fromSearchParams(new URLSearchParams("perPage=9999")).perPage).toBe(
      500,
    )
  })
})

describe("dataProvider + мок ресурсу", () => {
  it("фільтри, пошук, сортування, пагінація, total", async () => {
    const { data, total } = await dataProvider.getList<Invoice>("invoices", {
      pagination: { page: 2, perPage: 3 },
      sort: { field: "amount", order: "DESC" },
      filter: { status: ["paid", "sent"], amount_gte: 5000 },
    })
    // amount ≥ 5000 → 26 записів, з них 8 чернеток → 18.
    expect(total).toBe(18)
    expect(data.map((r: Invoice) => r.amount)).toEqual([26000, 24000, 23000])

    const search = await dataProvider.getList<Invoice>("invoices", {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "number", order: "ASC" },
      filter: { q: "зоряна" },
    })
    expect(search.total).toBe(10)
  })

  it("X-Company-Id обмежує записи компанією", async () => {
    companyId = "kovalenko"
    const { total } = await dataProvider.getList<Invoice>("invoices", {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "id", order: "ASC" },
      filter: {},
    })
    expect(total).toBe(10)
  })

  it("getMany і getOne", async () => {
    const many = await dataProvider.getMany<Invoice>("invoices", {
      ids: ["inv-2", "inv-5"],
    })
    expect(many.data.map((r: Invoice) => r.id).sort()).toEqual([
      "inv-2",
      "inv-5",
    ])
    const one = await dataProvider.getOne<Invoice>("invoices", { id: "inv-7" })
    expect(one.data.number).toBe("2026-0007")
  })

  it("update з версією; застаріла версія — 409 з актуальним записом", async () => {
    const { data: before } = await dataProvider.getOne<Invoice>("invoices", {
      id: "inv-1",
    })
    const { data: after } = await dataProvider.update<Invoice>("invoices", {
      id: "inv-1",
      data: { ...before, client: "ТОВ «Нова назва»" },
      previousData: before,
    })
    expect(after.version).toBe(2)
    expect(after.client).toBe("ТОВ «Нова назва»")

    const stale = dataProvider.update<Invoice>("invoices", {
      id: "inv-1",
      data: { ...before, amount: 1 },
      previousData: before,
    })
    await expect(stale).rejects.toMatchObject({
      status: 409,
      code: "conflict",
      current: { version: 2, client: "ТОВ «Нова назва»" },
    })
  })

  it("валідація схемою — 422 з полями", async () => {
    await expect(
      dataProvider.create<Invoice>("invoices", {
        data: { number: "X", client: "Y", amount: 1.5, status: "lost" },
      }),
    ).rejects.toMatchObject({ status: 422, code: "validation" })
  })

  it("права перевіряє сам мок: гість не може змінювати", async () => {
    signInMock("u2")
    await expect(
      dataProvider.delete("invoices", { id: "inv-1" }),
    ).rejects.toMatchObject({ status: 403, code: "forbidden" })
  })

  it("без сесії — 401", async () => {
    signInMock(null)
    await expect(
      dataProvider.getOne<Invoice>("invoices", { id: "inv-1" }),
    ).rejects.toMatchObject({ status: 401, code: "unauthenticated" })
  })
})

describe("сценарії моків", () => {
  it("error, empty, forbidden, conflict, offline", async () => {
    const params = {
      pagination: { page: 1, perPage: 5 },
      sort: { field: "id", order: "ASC" as const },
      filter: {},
    }
    setScenario("error")
    await expect(
      dataProvider.getList<Invoice>("invoices", params),
    ).rejects.toMatchObject({
      status: 500,
      code: "server",
    })
    setScenario("empty", "invoices")
    await expect(
      dataProvider.getList<Invoice>("invoices", params),
    ).resolves.toEqual({
      data: [],
      total: 0,
    })
    setScenario("forbidden", "invoices")
    await expect(
      dataProvider.getList<Invoice>("invoices", params),
    ).rejects.toMatchObject({
      status: 403,
    })
    setScenario("conflict", "invoices")
    const { data } = await createDataProvider(client)
      .getOne<Invoice>("invoices", {
        id: "inv-3",
      })
      .catch(() => ({ data: INVOICES[2] }))
    const conflict = await dataProvider
      .update<Invoice>("invoices", { id: "inv-3", data, previousData: data })
      .catch((e: unknown) => e)
    expect(conflict).toMatchObject({ status: 409, code: "conflict" })
    // «Зберегти мої зміни»: повтор із версією з `current` проходить.
    const current = (conflict as ApiError).current as typeof data
    await expect(
      dataProvider.update<Invoice>("invoices", {
        id: "inv-3",
        data: { ...data, client: "ТОВ «Перезапис»", version: current.version },
        previousData: current,
      }),
    ).resolves.toMatchObject({
      data: { client: "ТОВ «Перезапис»", version: current.version + 1 },
    })
    setScenario("offline", "invoices")
    const offline = await dataProvider
      .getList<Invoice>("invoices", params)
      .catch((e: unknown) => e)
    expect(offline).toBeInstanceOf(ApiError)
    expect(offline).toMatchObject({ status: 0, code: "offline" })
  })
})

describe("вхід (ADR-0003)", () => {
  it("пароль → 2FA → профіль; хибний код — 422", async () => {
    signInMock(null)
    const auth = createAuthProvider(client)
    const first: unknown = await auth
      .login({ email: "olena@zoriana.example", password: "demo" })
      .catch((e: unknown) => e)
    expect(isTwoFactorRequired(first)).toBe(true)
    await expect(auth.login({ code: "111111" })).rejects.toMatchObject({
      status: 422,
      fieldErrors: { code: "invalid" },
    })
    await auth.login({ code: "123456" })
    const me = await auth.getMe()
    expect(me.name).toBe("Олена Коваль")
    expect(
      await auth.canAccess?.({ resource: "invoices", action: "approve" }),
    ).toBe(true)
    await auth.logout({})
    await expect(auth.checkAuth({})).rejects.toMatchObject({ status: 401 })
  })

  it("хибний пароль — 401; checkError розлогінює лише на 401", async () => {
    const auth = createAuthProvider(client)
    await expect(
      auth.login({ email: "olena@zoriana.example", password: "x" }),
    ).rejects.toMatchObject({ status: 401 })
    await expect(
      auth.checkError(new ApiError(403, { code: "forbidden", message: "" })),
    ).resolves.toBeUndefined()
    await expect(
      auth.checkError(
        new ApiError(401, { code: "unauthenticated", message: "" }),
      ),
    ).rejects.toBeInstanceOf(ApiError)
  })

  it("права: точний збіг, ресурс:*, *", () => {
    expect(hasPermission(["invoices:read"], "invoices", "read")).toBe(true)
    expect(hasPermission(["invoices:read"], "invoices", "update")).toBe(false)
    expect(hasPermission(["invoices:*"], "invoices", "delete")).toBe(true)
    expect(hasPermission(["*"], "anything", "any")).toBe(true)
  })

  it("права: дії ra-core зводяться до read і update", () => {
    expect(hasPermission(["invoices:read"], "invoices", "list")).toBe(true)
    expect(hasPermission(["invoices:read"], "invoices", "show")).toBe(true)
    expect(hasPermission(["invoices:read"], "invoices", "edit")).toBe(false)
    expect(hasPermission(["invoices:update"], "invoices", "edit")).toBe(true)
  })
})
