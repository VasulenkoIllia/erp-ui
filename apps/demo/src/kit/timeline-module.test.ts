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
  createApiClient,
  isApiError,
  recordBaseSchema,
} from "@/registry/lib/api"
import { setCompanyId } from "@/registry/lib/company-scope"
import {
  resetMockTimeline,
  timelineTargetMock,
} from "@/registry/lib/mock-timeline-store"
import { resetScenarios, setScenario } from "@/registry/lib/mock-scenarios"
import { setMockUsers } from "@/registry/lib/mock-server"
import {
  createResourceHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"
import { createTimelineApi } from "@/registry/lib/timeline"
import { createTimelineModule } from "@/registry/modules/N1-timeline"
import { myActivityRange } from "@/registry/modules/N1-timeline/components/use-my-activities"
import { TIMELINE } from "@/registry/modules/N1-timeline/contract"
import { createTimelineFixtures } from "@/registry/modules/N1-timeline/fixtures"
import { createTimelineMocks } from "@/registry/modules/N1-timeline/mocks"

/** Модуль N1 (ADR-0054): фабрика, фікстури, «Мої справи» й сім сценаріїв. */
const BASE = "http://erp-timeline.test/api/v1"
const COMPANY = { id: "a", name: "A" }
const makeUser = (id: string, permissions: string[]) =>
  ({
    id,
    name: `Людина ${id}`,
    email: `${id}@test.example`,
    permissions,
    roles: [],
    companies: [COMPANY],
    companyId: COMPANY.id,
  }) as unknown as MockUser
const PERSON = makeUser("u-1", ["deals:read"])
const COLLEAGUE = makeUser("u-2", ["deals:read"])
const STRANGER = makeUser("u-3", [])
const NOW = Date.parse("2026-11-01T12:00:00.000Z")

const dealSchema = recordBaseSchema.extend({
  title: z.string(),
  companyId: z.string().optional(),
})
type Deal = z.infer<typeof dealSchema>

const deals = createResourceHandlers<Deal>({
  resource: "deals",
  schema: dealSchema,
  baseUrl: BASE,
  data: ["d1", "d2", "d3"].map((id) => ({
    id,
    version: 1,
    title: `Угода ${id}`,
    // Угода d3 в іншій компанії: її дії людина не бачить.
    companyId: id === "d3" ? "b" : COMPANY.id,
  })),
  searchFields: ["title"],
  fieldLabels: { title: { uk: "Назва", en: "Title" } },
})

const activity = (id: string, dueDate: string, assigneeId = PERSON.id) => ({
  id,
  version: 1,
  type: "call",
  title: `Дія ${id}`,
  dueDate,
  assignee: { id: assigneeId, name: `Людина ${assigneeId}` },
})

const SEEDS = {
  "deals/d1": {
    activities: [
      activity("later", "2026-11-05"),
      activity("today", "2026-11-01"),
      activity("foreign", "2026-11-01", COLLEAGUE.id),
    ],
  },
  "deals/d2": { activities: [activity("late", "2026-10-30")] },
  "deals/d3": { activities: [activity("hidden", "2026-10-01")] },
  "deals/gone": { activities: [activity("gone", "2026-10-02")] },
}

const server = setupServer(
  ...createTimelineMocks({
    targets: [
      timelineTargetMock({
        resource: "deals",
        db: deals.db,
        title: (deal) => deal.title,
      }),
    ],
    seeds: SEEDS,
    baseUrl: BASE,
  }).handlers,
)
const api = createTimelineApi(createApiClient({ baseUrl: BASE }))
const first = (range = {}, perPage = 20) => api.myActivities(range, 1, perPage)
const titles = async (range = {}) =>
  (await first(range)).data.map((row) => row.id)
const statusOf = async (request: Promise<unknown>) => {
  const failure: unknown = await request.catch((error: unknown) => error)
  return isApiError(failure) ? failure.status : undefined
}

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" })
  setMockUsers([PERSON, COLLEAGUE, STRANGER])
})
beforeEach(() => {
  localStorage.clear()
  resetMockTimeline()
  setCompanyId(COMPANY.id)
  signInMock(PERSON.id)
})
afterEach(() => {
  resetScenarios()
  server.resetHandlers()
})
afterAll(() => {
  server.close()
  setCompanyId(null)
})

describe("модуль N1: фабрика", () => {
  it("адреси від basePath, адреса модуля веде на «Мої справи», прав немає", () => {
    const module = createTimelineModule({ basePath: "/work/" })
    expect(module.id).toBe("N1")
    expect(module.paths).toEqual({ myActivities: "/work/my-activities" })
    expect(module.routes.map((route) => route.path)).toEqual([
      "/work/my-activities",
      "/work/",
    ])
    expect(module.nav.map((item) => item.href)).toEqual(["/work/my-activities"])
    expect(module.nav.every((item) => !("access" in item))).toBe(true)
    expect(module.resources.map((resource) => resource.name)).toEqual([
      TIMELINE,
    ])
  })

  it("без basePath окремої адреси модуля немає", () => {
    expect(createTimelineModule().routes.map((route) => route.path)).toEqual([
      "/my-activities",
    ])
  })

  it("бекенд без `GET /me/activities`: ні сторінки, ні пункту, стрічка лишається", () => {
    const module = createTimelineModule({
      basePath: "/work",
      extension: { myActivities: false },
    })
    expect(module.routes).toEqual([])
    expect(module.nav).toEqual([])
    expect(module.aside.label).toEqual({ uk: "Стрічка", en: "Timeline" })
  })

  it("назву стрічки дає розширення", () => {
    const label = { uk: "Журнал", en: "Log" }
    const { aside } = createTimelineModule({ extension: { card: { label } } })
    expect(aside.label).toBe(label)
  })
})

describe("модуль N1: межі вкладок", () => {
  const TODAY = "2026-11-01"

  it("календарні дати включно: вчора, сьогодні, завтра", () => {
    expect(myActivityRange("all", TODAY)).toEqual({})
    expect(myActivityRange("overdue", TODAY)).toEqual({ dueTo: "2026-10-31" })
    expect(myActivityRange("today", TODAY)).toEqual({
      dueFrom: TODAY,
      dueTo: TODAY,
    })
    expect(myActivityRange("upcoming", TODAY)).toEqual({
      dueFrom: "2026-11-02",
    })
  })
})

describe("модуль N1: фікстури", () => {
  const records = ["a", "b", "c", "d"].map((id) => ({
    resource: "deals",
    id,
  }))

  it("дія, підписник і нотатка на запис, виконавці по черзі, id не повторюються", () => {
    const seeds = createTimelineFixtures({
      records,
      people: [
        { id: "p1", name: "Перша" },
        { id: "p2", name: "Друга" },
      ],
      now: NOW,
    })
    const rows = Object.values(seeds).flatMap((seed) => seed.activities ?? [])
    expect(Object.keys(seeds)).toEqual(records.map(({ id }) => `deals/${id}`))
    expect(new Set(rows.map((row) => row.id)).size).toBe(records.length)
    expect(rows.map((row) => row.assignee.id)).toEqual(["p1", "p2", "p1", "p2"])
    // Приклади є на кожній вкладці: прострочене й сьогоднішнє.
    expect(rows[0]?.dueDate).toBe("2026-10-29")
    expect(rows[2]?.dueDate).toBe("2026-11-01")
    expect(seeds["deals/a"]?.entries).toHaveLength(1)
  })

  it("без людей прикладів немає", () => {
    expect(createTimelineFixtures({ records })).toEqual({})
  })
})

describe("модуль N1: GET /me/activities", () => {
  it("лише дії людини на записах, які вона бачить, найближчий термін першим", async () => {
    const page = await first()
    expect(page.data.map((row) => row.id)).toEqual(["late", "today", "later"])
    expect(page.total).toBe(3)
    expect(page.data[0]?.record).toEqual({
      resource: "deals",
      id: "d2",
      title: "Угода d2",
    })
  })

  it("межі терміну — календарні дати включно", async () => {
    await expect(titles({ dueTo: "2026-10-31" })).resolves.toEqual(["late"])
    await expect(
      titles({ dueFrom: "2026-11-01", dueTo: "2026-11-01" }),
    ).resolves.toEqual(["today"])
    await expect(titles({ dueFrom: "2026-11-02" })).resolves.toEqual(["later"])
  })

  it("сторінки: другий запит продовжує перший, `total` той самий", async () => {
    const one = await api.myActivities({}, 1, 2)
    const two = await api.myActivities({}, 2, 2)
    expect(one.data.map((row) => row.id)).toEqual(["late", "today"])
    expect(two.data.map((row) => row.id)).toEqual(["later"])
    expect(two.total).toBe(3)
  })

  it("інша людина бачить свої дії, без права на ресурс — порожньо", async () => {
    signInMock(COLLEAGUE.id)
    await expect(titles()).resolves.toEqual(["foreign"])
    signInMock(STRANGER.id)
    await expect(first()).resolves.toEqual({ data: [], total: 0 })
  })

  it("закрита дія зникає зі списку: змінюють її адреси запису", async () => {
    await api.updateActivity({ resource: "deals", id: "d2" }, "late", {
      version: 1,
      status: "done",
    })
    await expect(titles()).resolves.toEqual(["today", "later"])
  })

  it("без сесії: 401", async () => {
    signInMock(null)
    await expect(statusOf(first())).resolves.toBe(401)
  })
})

describe("модуль N1: сценарії", () => {
  it("empty: порожній список", async () => {
    setScenario("empty", TIMELINE)
    await expect(first()).resolves.toEqual({ data: [], total: 0 })
  })

  it.each([
    ["error", 500],
    ["forbidden", 403],
    ["offline", 0],
  ] as const)("%s: статус %i", async (scenario, status) => {
    setScenario(scenario, TIMELINE)
    await expect(statusOf(first())).resolves.toBe(status)
  })

  it("conflict: читання працює, запис один раз дає 409, повтор проходить", async () => {
    setScenario("conflict", TIMELINE)
    await expect(titles()).resolves.toHaveLength(3)
    const target = { resource: "deals", id: "d2" }
    const close = (version: number) =>
      api.updateActivity(target, "late", { version, status: "done" })
    await expect(statusOf(close(1))).resolves.toBe(409)
    await expect(close(2)).resolves.toMatchObject({ id: "late" })
  })

  it("чужий ресурс не зачіпає стрічку", async () => {
    setScenario("error", "contacts")
    await expect(titles()).resolves.toHaveLength(3)
  })
})
