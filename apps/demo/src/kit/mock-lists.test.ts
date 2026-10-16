import { setupServer } from "msw/node"
import { http, HttpResponse } from "msw"
import { z } from "zod"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest"

import {
  COMPANY_HEADER,
  createApiClient,
  isApiError,
  recordBaseSchema,
} from "@/registry/lib/api"
import { setCompanyId } from "@/registry/lib/company-scope"
import { createDataProvider } from "@/registry/lib/data-provider"
import { pickPerPage } from "@/registry/lib/list-settings"
import { createListSettingsHandlers } from "@/registry/lib/mock-lists"
import { resetScenarios, setScenario } from "@/registry/lib/mock-scenarios"
import {
  createPlatformHandlers,
  createResourceHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"
import {
  isPinned,
  PIN_LIMIT,
  PIN_LIMIT_CODE,
  pinnedFirst,
} from "@/registry/lib/pins"

/** Крок 1.3b (ADR-0024): закріплення записів і налаштування списків — контракт, мок, dataProvider. */

const BASE = "http://erp.test/api/v1"
const user = (id: string, name: string): MockUser => ({
  id,
  name,
  email: `${id}@test.example`,
  password: "demo-password",
  totpCode: "111111",
  roles: ["admin"],
  permissions: ["*"],
  companies: [{ id: "c1", name: "ТОВ «Тест»" }],
  companyId: "c1",
  factors: [],
})

const recordSchema = recordBaseSchema.extend({
  name: z.string(),
  kind: z.enum(["a", "b"]),
  companyId: z.string().nullable(),
})
type Row = z.infer<typeof recordSchema> & { pinned?: boolean }

const COUNT = PIN_LIMIT + 10
const records = createResourceHandlers({
  resource: "records",
  schema: recordSchema,
  data: () =>
    Array.from({ length: COUNT }, (_, i) => ({
      id: `r-${String(i + 1).padStart(2, "0")}`,
      version: 1,
      name: `Запис ${String(i + 1).padStart(2, "0")}`,
      kind: i % 2 === 0 ? ("a" as const) : ("b" as const),
      companyId: i === COUNT - 1 ? "c2" : "c1",
    })),
  searchFields: ["name"],
  baseUrl: BASE,
  pins: true,
})

const server = setupServer(
  ...createPlatformHandlers({
    users: [user("u1", "Олена"), user("u2", "Іван")],
    baseUrl: BASE,
  }),
  ...createListSettingsHandlers({ baseUrl: BASE }),
  ...records.handlers,
)
const provider = createDataProvider(createApiClient({ baseUrl: BASE }))
const page = async (filter: Record<string, unknown> = {}, perPage = 5) =>
  provider.getList<Row>("records", {
    filter,
    pagination: { page: 1, perPage },
    sort: { field: "name", order: "DESC" },
  })
const ids = (rows: Row[]) => rows.map((row) => row.id)

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" })
})
afterAll(() => {
  server.close()
  setCompanyId(null)
})
beforeEach(() => {
  localStorage.clear()
  resetScenarios()
  records.db.reset()
  signInMock("u1")
  setCompanyId("c1")
})
afterEach(() => {
  server.resetHandlers()
})

describe("lib/pins", () => {
  it("pinnedFirst: закріплені спершу в порядку закріплення, без них — той самий масив", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }]
    expect(pinnedFirst(rows, ["d", "b", "x"]).map((row) => row.id)).toEqual([
      "d",
      "b",
      "a",
      "c",
    ])
    expect(pinnedFirst(rows, [])).toBe(rows)
    expect(isPinned({ pinned: true })).toBe(true)
    expect(isPinned({ pinned: "true" })).toBe(false)
    expect(isPinned({})).toBe(false)
  })

  it("pickPerPage: збережений розмір — лише з запропонованих", () => {
    expect(pickPerPage(50, [10, 20, 50], 20)).toBe(50)
    expect(pickPerPage(30, [10, 20, 50], 20)).toBe(20)
    expect(pickPerPage(null, [10, 20, 50], 20)).toBe(20)
  })
})

describe("закріплення: мок і dataProvider", () => {
  it("закріплені — першим блоком у порядку закріплення поверх сортування, total той самий", async () => {
    const before = await page()
    await provider.setPinned("records", "r-03", true)
    await provider.setPinned("records", "r-10", true)
    const after = await page()
    expect(ids(after.data).slice(0, 2)).toEqual(["r-03", "r-10"])
    expect(after.data.slice(0, 2).every(isPinned)).toBe(true)
    expect(after.data.slice(2).some(isPinned)).toBe(false)
    expect(after.total).toBe(before.total)
    expect(after.total).toBe(COUNT - 1)
    // Повтор ідемпотентний: порядок не змінюється.
    await provider.setPinned("records", "r-03", true)
    expect(ids((await page()).data).slice(0, 2)).toEqual(["r-03", "r-10"])
  })

  it("фільтр діє й на закріплені; картка знає pinned; відкріплення повертає на місце", async () => {
    await provider.setPinned("records", "r-02", true)
    const filtered = await page({ kind: "a" })
    expect(filtered.data.some((row) => row.id === "r-02")).toBe(false)
    const one = await provider.getOne<Row>("records", { id: "r-02" })
    expect(one.data.pinned).toBe(true)
    await provider.setPinned("records", "r-02", false)
    expect((await page()).data.some(isPinned)).toBe(false)
  })

  it("закріплення особисте: інший користувач його не бачить", async () => {
    await provider.setPinned("records", "r-05", true)
    signInMock("u2")
    expect((await page()).data.some(isPinned)).toBe(false)
    signInMock("u1")
    expect(ids((await page()).data)[0]).toBe("r-05")
  })

  it("межа PIN_LIMIT — 422 pin_limit; запис іншої компанії — 404", async () => {
    for (let i = 1; i <= PIN_LIMIT; i += 1)
      await provider.setPinned(
        "records",
        `r-${String(i).padStart(2, "0")}`,
        true,
      )
    const over = await provider
      .setPinned("records", `r-${String(PIN_LIMIT + 1)}`, true)
      .catch((error: unknown) => error)
    expect(isApiError(over) && [over.status, over.code]).toEqual([
      422,
      PIN_LIMIT_CODE,
    ])
    // Уже закріплений — повтор на межі проходить.
    await expect(provider.setPinned("records", "r-01", true)).resolves.toBe(
      undefined,
    )
    const foreign = await fetch(`${BASE}/records/r-${String(COUNT)}/pin`, {
      method: "PUT",
      headers: { [COMPANY_HEADER]: "c1" },
    })
    expect(foreign.status).toBe(404)
  })

  it("видалений запис відкріплюється", async () => {
    await provider.setPinned("records", "r-07", true)
    await provider.delete("records", { id: "r-07" })
    expect(localStorage.getItem("erp-ui:mock-pins:u1")).toBe(
      JSON.stringify({ records: [] }),
    )
  })

  it("dataProvider: PUT і DELETE на /<ресурс>/:id/pin", async () => {
    const calls: string[] = []
    server.use(
      http.all(`${BASE}/records/:id/pin`, ({ request, params }) => {
        calls.push(`${request.method} ${String(params.id)}`)
        return new HttpResponse(null, { status: 204 })
      }),
    )
    await provider.setPinned("records", "r 1", true)
    await provider.setPinned("records", "r 1", false)
    expect(calls).toEqual(["PUT r 1", "DELETE r 1"])
  })
})

describe("налаштування списків: мок і dataProvider", () => {
  it("нічого не збережено — perPage null; PATCH зберігає лише своє й лише для власника", async () => {
    expect(await provider.getListSettings("records")).toEqual({ perPage: null })
    expect(await provider.saveListSettings("records", { perPage: 50 })).toEqual(
      { perPage: 50 },
    )
    expect(await provider.getListSettings("records")).toEqual({ perPage: 50 })
    expect(await provider.getListSettings("me/views")).toEqual({
      perPage: null,
    })
    signInMock("u2")
    expect(await provider.getListSettings("records")).toEqual({ perPage: null })
  })

  it("неправильний розмір — 422 validation; сценарій list-settings", async () => {
    const invalid = await provider
      .saveListSettings("records", { perPage: 0 })
      .catch((error: unknown) => error)
    expect(isApiError(invalid) && invalid.code).toBe("validation")
    setScenario("error", "list-settings")
    const failed = await provider
      .getListSettings("records")
      .catch((error: unknown) => error)
    expect(isApiError(failed) && failed.status).toBe(500)
  })

  it("зіпсований запис у сховищі не стирає інших налаштувань", async () => {
    await provider.saveListSettings("records", { perPage: 50 })
    const key = "erp-ui:mock-list-settings:u1"
    const stored = JSON.parse(localStorage.getItem(key) ?? "{}") as object
    localStorage.setItem(
      key,
      JSON.stringify({ ...stored, broken: { perPage: "many" } }),
    )
    expect(await provider.getListSettings("records")).toEqual({ perPage: 50 })
    expect(await provider.getListSettings("broken")).toEqual({ perPage: null })
  })
})
