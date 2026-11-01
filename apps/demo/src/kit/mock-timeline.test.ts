import { setupServer } from "msw/node"
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
import { z } from "zod"

import { ApiError, createApiClient, recordBaseSchema } from "@/registry/lib/api"
import { setCompanyId } from "@/registry/lib/company-scope"
import { createTimelineHandlers } from "@/registry/lib/mock-timeline"
import {
  addMockTimelineEntry,
  resetMockTimeline,
  timelineTargetMock,
} from "@/registry/lib/mock-timeline-store"
import { setScenario } from "@/registry/lib/mock-scenarios"
import {
  createResourceHandlers,
  signInMock,
  subscribeMockEvents,
  type MockUser,
} from "@/registry/lib/mocks"
import { setMockUsers } from "@/registry/lib/mock-server"
import {
  TIMELINE_SCENARIO_RESOURCE,
  createTimelineApi,
  type TimelineApi,
} from "@/registry/lib/timeline"

/** Мок стрічки запису (ADR-0053): контракт і сценарії, як їх бачить клієнт. */
const BASE = "http://erp.test/api/v1"
const COMPANY = { id: "a", name: "A" }
const makeUser = (id: string, permissions: string[]) =>
  ({
    id,
    name: `Людина ${id}`,
    email: `${id}@test.example`,
    permissions,
    roles: [],
    companies: [COMPANY],
    companyId: "a",
  }) as unknown as MockUser
const AUTHOR = makeUser("u-1", ["deals:read"])
const OTHER = makeUser("u-2", ["deals:read"])
const STRANGER = makeUser("u-3", [])

const dealSchema = recordBaseSchema.extend({
  title: z.string(),
  companyId: z.string().optional(),
})
type Deal = z.infer<typeof dealSchema>

const deals = createResourceHandlers<Deal>({
  resource: "deals",
  schema: dealSchema,
  baseUrl: BASE,
  data: [{ id: "d1", version: 1, title: "Угода", companyId: "a" }],
  searchFields: ["title"],
  fieldLabels: { title: { uk: "Назва", en: "Title" } },
})

const SEEDS = {
  "deals/d1": {
    followers: [{ id: "u-2", name: "Людина u-2" }],
    entries: [
      {
        id: "plain",
        at: "2026-10-30T10:00:00.000Z",
        kind: "note",
        author: { id: "u-2", name: "Людина u-2" },
        version: 1,
        body: "Простий текст",
      },
      {
        id: "doc",
        at: "2026-10-30T11:00:00.000Z",
        kind: "note",
        author: { id: "u-1", name: "Людина u-1" },
        version: 1,
        body: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Документ" }],
            },
          ],
        },
      },
    ],
  },
}

const server = setupServer(
  ...createTimelineHandlers({
    targets: [timelineTargetMock({ resource: "deals", db: deals.db })],
    seeds: SEEDS,
    baseUrl: BASE,
  }),
)
const client = createApiClient({ baseUrl: BASE })
const api: TimelineApi = createTimelineApi(client)
const TARGET = { resource: "deals", id: "d1" }
const BODY = {
  type: "doc" as const,
  content: [
    {
      type: "paragraph" as const,
      content: [{ type: "text" as const, text: "Новий запис" }],
    },
  ],
}

const failure = async (run: Promise<unknown>) => {
  const error: unknown = await run.catch((reason: unknown) => reason)
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" })
})

beforeEach(() => {
  setMockUsers([AUTHOR, OTHER, STRANGER])
  signInMock(AUTHOR.id)
  setCompanyId("a")
  resetMockTimeline()
})

afterEach(() => {
  vi.useRealTimers()
  setScenario("success", TIMELINE_SCENARIO_RESOURCE)
  setCompanyId(null)
  deals.db.reset()
})

afterAll(() => {
  server.close()
})

describe("стрічка", () => {
  it("віддає і документ, і простий рядок, новіші першими", async () => {
    const { data, total } = await api.list(TARGET, "all", 1, 20)
    expect(total).toBe(2)
    expect(data.map((entry) => entry.id)).toEqual(["doc", "plain"])
    const plain = data[1]
    expect(plain?.kind === "note" && plain.body.content).toHaveLength(1)
  })

  it("чужу нотатку позначено, свою ні", async () => {
    const { data } = await api.list(TARGET, "all", 1, 20)
    expect(data[0]).not.toHaveProperty("deniedActions")
    expect(data[1]).toMatchObject({
      deniedActions: { update: "own", delete: "own" },
    })
  })

  it("зміна запису видна як запис стрічки з назвою поля", async () => {
    deals.db.patch("d1", { title: "Нова назва" })
    const { data } = await api.list(TARGET, "change", 1, 20)
    expect(data).toHaveLength(1)
    expect(data[0]).toMatchObject({
      kind: "change",
      changes: [{ field: "title", label: "Назва", to: "Нова назва" }],
    })
  })

  it("фільтр за видом і сторінки", async () => {
    await api.post(TARGET, { requestId: "m", kind: "message", body: BODY })
    const notes = await api.list(TARGET, "note", 1, 20)
    expect(notes.total).toBe(2)
    const first = await api.list(TARGET, "all", 1, 1)
    expect(first.data).toHaveLength(1)
    expect(first.total).toBe(3)
  })

  it("запису без доступу не існує: 404", async () => {
    signInMock(STRANGER.id)
    const error = await failure(api.list(TARGET, "all", 1, 20))
    expect(error.status).toBe(404)
  })

  it("чужого ресурсу не існує: 404", async () => {
    const error = await failure(
      api.list({ resource: "ghosts", id: "1" }, "all", 1, 20),
    )
    expect(error.status).toBe(404)
  })
})

describe("запис у стрічку", () => {
  it("досить права читання: нотатка йде подією", async () => {
    const events: string[] = []
    const stop = subscribeMockEvents((event) => {
      events.push(event.type)
    })
    signInMock(OTHER.id)
    const entry = await api.post(TARGET, {
      requestId: "r",
      kind: "note",
      body: BODY,
    })
    stop()
    expect(entry).toMatchObject({ kind: "note", author: { id: "u-2" } })
    expect(events).toEqual(["deals.timeline"])
  })

  it("той самий `requestId` не створює другого запису", async () => {
    const input = { requestId: "same", kind: "message", body: BODY } as const
    const first = await api.post(TARGET, input)
    const second = await api.post(TARGET, input)
    expect(second.id).toBe(first.id)
    expect((await api.list(TARGET, "message", 1, 20)).total).toBe(1)
  })

  it("порожній текст — помилка поля", async () => {
    const error = await failure(
      api.post(TARGET, {
        requestId: "e",
        kind: "note",
        body: { type: "doc", content: [] },
      }),
    )
    expect(error.status).toBe(422)
    expect(error.fieldErrors).toEqual({ body: "required" })
  })

  it("повідомлення спершу в черзі, далі надіслане й подія", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const entry = await api.post(TARGET, {
      requestId: "q",
      kind: "message",
      body: BODY,
    })
    expect(entry).toMatchObject({ status: "queued" })
    await vi.advanceTimersByTimeAsync(1_000)
    const { data } = await api.list(TARGET, "message", 1, 20)
    expect(data[0]).toMatchObject({ status: "sent" })
  })

  it("чужий запис приходить подією й видно автора", async () => {
    addMockTimelineEntry(
      { resource: "deals", id: "d1", companyId: "a" },
      { kind: "note", version: 1, author: { name: "Марта" }, body: "Текст" },
    )
    const { data } = await api.list(TARGET, "all", 1, 1)
    expect(data[0]).toMatchObject({ author: { name: "Марта" } })
  })
})

describe("нотатка", () => {
  it("зміна піднімає версію й мітить час", async () => {
    const updated = await api.updateNote(TARGET, "doc", {
      version: 1,
      body: BODY,
    })
    expect(updated).toMatchObject({ version: 2 })
    expect(updated).toHaveProperty("editedAt")
  })

  it("чужу не змінити й не видалити", async () => {
    expect(
      (
        await failure(
          api.updateNote(TARGET, "plain", { version: 1, body: BODY }),
        )
      ).status,
    ).toBe(403)
    expect((await failure(api.remove(TARGET, "plain"))).status).toBe(403)
  })

  it("стара версія: 409 із `current`", async () => {
    await api.updateNote(TARGET, "doc", { version: 1, body: BODY })
    const error = await failure(
      api.updateNote(TARGET, "doc", { version: 1, body: BODY }),
    )
    expect(error.status).toBe(409)
    expect(error.current).toMatchObject({ id: "doc", version: 2 })
  })

  it("сценарій `conflict`: один раз, «Зберегти мої зміни» проходить", async () => {
    setScenario("conflict", TIMELINE_SCENARIO_RESOURCE)
    const error = await failure(
      api.updateNote(TARGET, "doc", { version: 1, body: BODY }),
    )
    expect(error.current).toMatchObject({ version: 2 })
    const saved = await api.updateNote(TARGET, "doc", {
      version: 2,
      body: BODY,
    })
    expect(saved).toMatchObject({ version: 3 })
  })

  it("видалення прибирає запис", async () => {
    await api.remove(TARGET, "doc")
    expect((await api.list(TARGET, "note", 1, 20)).total).toBe(1)
  })
})

describe("файл", () => {
  const file = new File(["вміст"], "рахунок.pdf", { type: "application/pdf" })

  it("стає записом із розміром і адресою", async () => {
    const entry = await api.uploadFile(TARGET, file, "f1")
    expect(entry).toMatchObject({
      kind: "file",
      // Назву файла jsdom у формі не передає, її перевіряє e2e.
      file: { size: file.size },
    })
    expect(JSON.stringify(entry)).toContain("files.example")
  })

  it("повтор із тим самим ключем не дає другого файла", async () => {
    await api.uploadFile(TARGET, file, "f2")
    await api.uploadFile(TARGET, file, "f2")
    expect((await api.list(TARGET, "file", 1, 20)).total).toBe(1)
  })
})

describe("підписники", () => {
  it("додати двічі — один підписник, зайвого прибрати", async () => {
    await api.follow(TARGET, "u-1")
    await api.follow(TARGET, "u-1")
    expect((await api.followers(TARGET)).map(({ id }) => id)).toEqual([
      "u-2",
      "u-1",
    ])
    await api.unfollow(TARGET, "u-2")
    expect((await api.followers(TARGET)).map(({ id }) => id)).toEqual(["u-1"])
  })

  it("людина поза компанією: 404", async () => {
    expect((await failure(api.follow(TARGET, "nobody"))).status).toBe(404)
  })
})

describe("заплановані дії", () => {
  const INPUT = {
    requestId: "a1",
    type: "call",
    title: "Подзвонити",
    dueDate: "2026-11-05",
    assigneeId: "u-2",
  }

  it("найближчий термін першим, виконавець із довідника", async () => {
    await api.addActivity(TARGET, { ...INPUT, dueDate: "2026-11-09" })
    await api.addActivity(TARGET, { ...INPUT, requestId: "a2" })
    const activities = await api.activities(TARGET)
    expect(activities.map(({ dueDate }) => dueDate)).toEqual([
      "2026-11-05",
      "2026-11-09",
    ])
    expect(activities[0]?.assignee.name).toBe("Людина u-2")
  })

  it("неіснуюча дата й чужий виконавець — помилка поля", async () => {
    expect(
      (
        await failure(
          api.addActivity(TARGET, { ...INPUT, dueDate: "2026-02-30" }),
        )
      ).fieldErrors,
    ).toEqual({ dueDate: "invalid" })
    expect(
      (await failure(api.addActivity(TARGET, { ...INPUT, assigneeId: "x" })))
        .fieldErrors,
    ).toEqual({ assigneeId: "invalid" })
  })

  it("виконана дія зникає зі списку й лишає запис у стрічці", async () => {
    const activity = await api.addActivity(TARGET, INPUT)
    await api.updateActivity(TARGET, activity.id, {
      version: 1,
      status: "done",
    })
    expect(await api.activities(TARGET)).toEqual([])
    const { data } = await api.list(TARGET, "all", 1, 1)
    expect(data[0]).toMatchObject({
      kind: "activity",
      activity: { title: "Подзвонити", status: "done" },
    })
  })

  it("стара версія: 409", async () => {
    const activity = await api.addActivity(TARGET, INPUT)
    await api.updateActivity(TARGET, activity.id, {
      version: 1,
      title: "Інша назва",
    })
    const error = await failure(
      api.updateActivity(TARGET, activity.id, { version: 1, status: "done" }),
    )
    expect(error.status).toBe(409)
    expect(error.current).toMatchObject({ title: "Інша назва", version: 2 })
  })
})

describe("сценарії", () => {
  it("`empty`: стрічка, підписники й дії порожні", async () => {
    setScenario("empty", TIMELINE_SCENARIO_RESOURCE)
    expect(await api.list(TARGET, "all", 1, 20)).toEqual({ data: [], total: 0 })
    expect(await api.followers(TARGET)).toEqual([])
    expect(await api.activities(TARGET)).toEqual([])
  })

  it.each([
    ["error", 500],
    ["forbidden", 403],
    ["offline", 0],
  ] as const)("`%s` дає статус %i", async (scenario, status) => {
    setScenario(scenario, TIMELINE_SCENARIO_RESOURCE)
    expect((await failure(api.list(TARGET, "all", 1, 20))).status).toBe(status)
  })

  it("`slow` затримує відповідь, дані ті самі", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setScenario("slow", TIMELINE_SCENARIO_RESOURCE)
    const pending = api.list(TARGET, "all", 1, 20)
    await vi.advanceTimersByTimeAsync(3_100)
    expect((await pending).total).toBe(2)
  })
})
