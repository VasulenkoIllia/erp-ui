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

import { createApiClient, isApiError } from "@/registry/lib/api"
import { createAuditApi } from "@/registry/lib/audit"
import { setCompanyId } from "@/registry/lib/company-scope"
import { resetScenarios, setScenario } from "@/registry/lib/mock-scenarios"
import {
  createPlatformHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"
import { createAuditModule } from "@/registry/modules/A5-audit"
import { AUDIT } from "@/registry/modules/A5-audit/contract"
import { createAuditFixtures } from "@/registry/modules/A5-audit/fixtures"
import { createAuditMocks } from "@/registry/modules/A5-audit/mocks"

/** Модуль A5 (ADR-0045): фабрика, фікстури й сім сценаріїв журналу. */
const BASE = "http://erp-audit.test/api/v1"
const COMPANY = "c1"
const OTHER = "c2"

const person = (id: string, permissions: string[]): MockUser => ({
  id,
  name: id,
  email: `${id}@test.example`,
  password: "demo-password",
  totpCode: "111111",
  roles: [],
  permissions,
  companies: [
    { id: COMPANY, name: "ТОВ «Тест»" },
    { id: OTHER, name: "ФОП Тестенко" },
  ],
  companyId: COMPANY,
  factors: [],
})
const AUDITOR = person("auditor", ["audit:read"])
const SEEDS_OF_COMPANY = 3

const server = setupServer(
  ...createPlatformHandlers({
    users: [AUDITOR, person("clerk", ["contacts:read"])],
    baseUrl: BASE,
    auditSeeds: createAuditMocks({ companies: [COMPANY, OTHER] }).seeds,
  }),
)
const api = createAuditApi(createApiClient({ baseUrl: BASE }))
const first = () => api.getEvents({}, 1, 20)
const statusOf = async (request: Promise<unknown>) => {
  const failure: unknown = await request.catch((error: unknown) => error)
  return isApiError(failure) ? failure.status : undefined
}

describe("модуль A5: фабрика", () => {
  it("адреса журналу від basePath, пункт навігації з правом", () => {
    const module = createAuditModule({ basePath: "/settings/" })
    expect(module.id).toBe("A5")
    expect(module.paths.journal).toBe("/settings/audit")
    expect(module.routes.map((route) => route.path)).toEqual([
      "/settings/audit",
      "/settings/",
    ])
    expect(module.nav).toEqual([
      expect.objectContaining({
        href: "/settings/audit",
        access: { resource: AUDIT, action: "read" },
      }),
    ])
    expect(module.resources.map((resource) => resource.name)).toEqual([AUDIT])
  })

  it("без basePath: журнал у корені, переадресації немає", () => {
    const module = createAuditModule()
    expect(module.routes.map((route) => route.path)).toEqual(["/audit"])
  })
})

describe("модуль A5: фікстури", () => {
  it("ідентифікатори не повторюються між компаніями, журнал на компанію", () => {
    const events = createAuditFixtures({ companies: [COMPANY, OTHER] })
    expect(new Set(events.map((event) => event.id)).size).toBe(events.length)
    expect(new Set(events.map((event) => event.target?.id)).size).toBe(2)
    expect(events.filter((e) => e.companyId === COMPANY)).toHaveLength(
      SEEDS_OF_COMPANY,
    )
  })

  it("без компаній — спільний набір, без позначки компанії", () => {
    const events = createAuditFixtures()
    expect(events).toHaveLength(SEEDS_OF_COMPANY)
    expect(events.every((event) => !("companyId" in event))).toBe(true)
  })

  it("новіші першими", () => {
    const moments = createAuditFixtures().map((event) => event.at)
    expect(moments).toEqual([...moments].sort().reverse())
  })
})

describe("модуль A5: сценарії журналу", () => {
  beforeAll(() => {
    server.listen({ onUnhandledFrame: "error" })
  })
  beforeEach(() => {
    localStorage.clear()
    setCompanyId(COMPANY)
    signInMock(AUDITOR.id)
  })
  afterEach(() => {
    resetScenarios()
    server.resetHandlers()
  })
  afterAll(() => {
    server.close()
    setCompanyId(null)
  })

  it("success: лише події компанії запиту", async () => {
    const { data, total } = await first()
    expect(total).toBe(SEEDS_OF_COMPANY)
    expect(data[0]?.target?.id).toBe(`${COMPANY}-contract-12`)
  })

  it("історія запису: фільтр за типом і id", async () => {
    const { data } = await api.getEvents(
      { targetType: "contracts", targetId: `${OTHER}-contract-12` },
      1,
      20,
    )
    expect(data).toEqual([])
    setCompanyId(OTHER)
    const own = await api.getEvents(
      { targetType: "contracts", targetId: `${OTHER}-contract-12` },
      1,
      20,
    )
    expect(own.total).toBe(SEEDS_OF_COMPANY)
  })

  it("empty: порожній список і CSV із самою шапкою", async () => {
    setScenario("empty", AUDIT)
    expect(await first()).toEqual({ data: [], total: 0 })
    const csv = await (await api.exportEvents({})).text()
    expect(csv.trim().split("\r\n")).toHaveLength(1)
  })

  it("error: 500", async () => {
    setScenario("error", AUDIT)
    expect(await statusOf(first())).toBe(500)
    expect(await statusOf(api.exportEvents({}))).toBe(500)
  })

  it("forbidden: 403", async () => {
    setScenario("forbidden", AUDIT)
    expect(await statusOf(first())).toBe(403)
  })

  it("offline: мережевий збій", async () => {
    setScenario("offline", AUDIT)
    const failure: unknown = await first().catch((error: unknown) => error)
    expect(isApiError(failure) && failure.code).toBe("offline")
  })

  it("conflict: журнал лише читається, працює як success", async () => {
    setScenario("conflict", AUDIT)
    expect((await first()).total).toBe(SEEDS_OF_COMPANY)
  })

  it("slow: відповідь приходить із затримкою", async () => {
    setScenario("slow", AUDIT)
    const started = performance.now()
    expect((await first()).total).toBe(SEEDS_OF_COMPANY)
    expect(performance.now() - started).toBeGreaterThanOrEqual(2900)
  }, 6000)

  it("без audit:read — 403 і на журналі, і на експорті", async () => {
    signInMock("clerk")
    expect(await statusOf(first())).toBe(403)
    expect(await statusOf(api.exportEvents({}))).toBe(403)
  })
})
