import { http, HttpResponse } from "msw"
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
import type { AuditEvent } from "@/registry/lib/audit"
import { createDataProvider } from "@/registry/lib/data-provider"
import { resetScenarios, setScenario } from "@/registry/lib/mock-scenarios"
import {
  createTrashMocks,
  mockLinkSlot,
  trashLinks,
} from "@/registry/lib/mock-trash"
import {
  createPlatformHandlers,
  createResourceHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"
import {
  createTrashApi,
  isTrashUnsupported,
  keepsInTrash,
  RESTORE_CONFLICT,
  trashRecordPath,
} from "@/registry/lib/trash"

/**
 * Крок PF16 (ADR-0095): контракт кошика, клієнт API й мок — перенесення під час видалення, права
 * `<ресурс>:delete` і `:own`, строк зберігання, відновлення з новою версією, 409, коли місце зайняв
 * інший (унікальне поле, зв'язок), засів кошика й сценарії.
 */
const BASE = "http://erp.test/api/v1"
const DAY_MS = 86_400_000

const noteSchema = recordBaseSchema.extend({
  name: z.string(),
  sku: z.string(),
  ownerId: z.string().optional(),
})
type Note = z.infer<typeof noteSchema>

const parentSchema = recordBaseSchema.extend({
  childId: z.string().nullable().optional(),
})
type Parent = z.infer<typeof parentSchema>
const childSchema = recordBaseSchema.extend({ parentId: z.string() })
type Child = z.infer<typeof childSchema>

const trash = createTrashMocks({ baseUrl: BASE })

const notes = createResourceHandlers<Note>({
  baseUrl: BASE,
  resource: "notes",
  schema: noteSchema,
  data: () => [
    { id: "n1", version: 1, name: "Перша", sku: "A-1", ownerId: "admin" },
    { id: "n2", version: 1, name: "Друга", sku: "A-2", ownerId: "own" },
    { id: "n3", version: 1, name: "Стара", sku: "A-3" },
    { id: "n4", version: 1, name: "Прострочена", sku: "A-4" },
  ],
  unique: ["sku"],
  responsibleField: "ownerId",
  trash: {
    bin: trash.bin,
    deleted: [
      { id: "n3", daysAgo: 10 },
      { id: "n4", daysAgo: 31 },
    ],
  },
})

const parents = createResourceHandlers<Parent>({
  baseUrl: BASE,
  resource: "parents",
  schema: parentSchema,
  data: () => [{ id: "p1", version: 1, childId: "c1" }],
})

const children = createResourceHandlers<Child>({
  baseUrl: BASE,
  resource: "children",
  schema: childSchema,
  data: () => [{ id: "c1", version: 1, parentId: "p1" }],
  afterDelete: (child) => {
    parents.db.patch(child.parentId, { childId: null })
  },
  trash: {
    bin: trash.bin,
    ...trashLinks<Child>(() => [
      mockLinkSlot<Child, Parent>(parents.db, "parentId", "childId"),
    ]),
  },
})

const user = (id: string, permissions: string[]): MockUser => ({
  id,
  name: `Людина ${id}`,
  email: `${id}@test.example`,
  password: "demo",
  totpCode: "111111",
  roles: [],
  permissions,
  companies: [],
  companyId: null,
  factors: [],
})

const server = setupServer(
  ...createPlatformHandlers({
    baseUrl: BASE,
    users: [
      user("admin", ["notes:*", "parents:*", "children:*"]),
      user("own", ["notes:read", "notes:create", "notes:delete:own"]),
      user("reader", ["notes:read"]),
    ],
  }),
  ...trash.handlers,
  ...notes.handlers,
  ...parents.handlers,
  ...children.handlers,
)
const client = createApiClient({ baseUrl: BASE })
const api = createTrashApi(client)
const data = createDataProvider(client)

const audit = (): AuditEvent[] =>
  JSON.parse(localStorage.getItem("erp-ui:mock-audit") ?? "[]") as AuditEvent[]

const failure = async (promise: Promise<unknown>) => {
  try {
    await promise
  } catch (error: unknown) {
    if (error instanceof ApiError) return error
    throw error
  }
  throw new Error("expected ApiError")
}

const remove = async (resource: string, id: string) => {
  const { data: previousData } = await data.getOne<Note | Child>(resource, {
    id,
  })
  await data.delete(resource, { id, previousData })
}

beforeAll(() => {
  server.listen()
})
beforeEach(() => {
  localStorage.clear()
  trash.reset()
  notes.db.reset()
  parents.db.reset()
  children.db.reset()
  resetScenarios()
  signInMock("admin")
})
afterEach(() => {
  server.resetHandlers()
})
afterAll(() => {
  server.close()
})

describe("контракт (lib/trash)", () => {
  it("без кошика — 404, 405 і 501; інші збої — не відсутність кошика", () => {
    const error = (status: number) =>
      new ApiError(status, { code: "x", message: "x" })
    expect(isTrashUnsupported(error(404))).toBe(true)
    expect(isTrashUnsupported(error(405))).toBe(true)
    expect(isTrashUnsupported(error(501))).toBe(true)
    expect(isTrashUnsupported(error(500))).toBe(false)
    expect(isTrashUnsupported(new Error("x"))).toBe(false)
  })

  it("ресурс у кошику: невідомо, поки налаштувань немає; бекенд без кошика — ні", () => {
    const settings = { retentionDays: 30, resources: ["notes"] }
    expect(keepsInTrash(undefined, "notes")).toBeUndefined()
    expect(keepsInTrash(null, "notes")).toBe(false)
    expect(keepsInTrash(settings, "notes")).toBe(true)
    expect(keepsInTrash(settings, "tags")).toBe(false)
  })

  it("шлях запису кошика кодує ресурс і id", () => {
    expect(trashRecordPath("notes", "a/b c")).toBe("/trash/notes/a%2Fb%20c")
  })
})

describe("клієнт API і мок кошика", () => {
  it("налаштування: строк і ресурси, що реєстрували обробники", async () => {
    expect(await api.getSettings()).toEqual({
      retentionDays: 30,
      resources: ["notes", "children"],
    })
  })

  it("бекенд без кошика (404) — null, збій сервера — помилка", async () => {
    server.use(
      http.get(`${BASE}/trash/settings`, () =>
        HttpResponse.json({ code: "not_found", message: "x" }, { status: 404 }),
      ),
    )
    expect(await api.getSettings()).toBeNull()
    server.use(
      http.get(`${BASE}/trash/settings`, () =>
        HttpResponse.json({ code: "boom", message: "x" }, { status: 500 }),
      ),
    )
    expect((await failure(api.getSettings())).status).toBe(500)
  })

  it("видалене — у кошику з автором і строком, засів — без автора, прострочене зникає", async () => {
    await remove("notes", "n1")
    const page = await api.list("notes", 1, 20)
    expect(page.total).toBe(2)
    const [fresh, seeded] = page.data
    expect(fresh).toMatchObject({
      resource: "notes",
      id: "n1",
      deletedBy: { id: "admin", name: "Людина admin" },
      record: { id: "n1", name: "Перша", sku: "A-1" },
    })
    expect(
      Date.parse(fresh?.purgeAt ?? "") - Date.parse(fresh?.deletedAt ?? ""),
    ).toBe(30 * DAY_MS)
    expect(seeded).toMatchObject({ id: "n3", deletedBy: null })
    expect(
      Date.now() - Date.parse(seeded?.deletedAt ?? ""),
    ).toBeGreaterThanOrEqual(10 * DAY_MS)
    const { data: list } = await data.getList<Note>("notes", {
      pagination: { page: 1, perPage: 20 },
      sort: { field: "id", order: "ASC" },
      filter: {},
    })
    expect(list.map((note) => note.id)).toEqual(["n2"])
  })

  it("сторінки: новіші першими, загальна кількість", async () => {
    await remove("notes", "n1")
    await remove("notes", "n2")
    const first = await api.list("notes", 1, 2)
    expect(first.total).toBe(3)
    expect(first.data.map((entry) => entry.id)).toEqual(["n2", "n1"])
    const second = await api.list("notes", 2, 2)
    expect(second.data.map((entry) => entry.id)).toEqual(["n3"])
  })

  it("без права видаляти — 403; з :own — лише свої", async () => {
    await remove("notes", "n1")
    await remove("notes", "n2")
    signInMock("reader")
    expect((await failure(api.list("notes", 1, 20))).status).toBe(403)
    signInMock("own")
    const own = await api.list("notes", 1, 20)
    expect(own.data.map((entry) => entry.id)).toEqual(["n2"])
    expect((await failure(api.restore("notes", "n1"))).status).toBe(404)
    expect(await api.restore("notes", "n2")).toMatchObject({ id: "n2" })
  })

  it("відновлення: нова версія, запис у списку, журнал restored; удруге — 404", async () => {
    await remove("notes", "n1")
    const restored = await api.restore("notes", "n1")
    expect(restored).toMatchObject({ id: "n1", version: 2, name: "Перша" })
    expect((await data.getOne<Note>("notes", { id: "n1" })).data.version).toBe(
      2,
    )
    expect(audit()[0]).toMatchObject({ action: "notes.restored" })
    expect((await api.list("notes", 1, 20)).data.map((e) => e.id)).toEqual([
      "n3",
    ])
    const again = await failure(api.restore("notes", "n1"))
    expect(again.status).toBe(404)
  })

  it("унікальне поле вже має інший запис — 409 restore_conflict, запис лишається в кошику", async () => {
    await remove("notes", "n1")
    await data.create("notes", { data: { name: "Нова", sku: "A-1" } })
    const conflict = await failure(api.restore("notes", "n1"))
    expect(conflict.status).toBe(409)
    expect(conflict.code).toBe(RESTORE_CONFLICT)
    expect((await api.list("notes", 1, 20)).data.map((e) => e.id)).toContain(
      "n1",
    )
  })

  it("зв'язок, який звільнило видалення: зайнятий — 409, вільний — відновлення займає знову", async () => {
    await remove("children", "c1")
    expect(parents.db.all()[0]?.childId).toBeNull()
    parents.db.patch("p1", { childId: "c2" })
    expect((await failure(api.restore("children", "c1"))).code).toBe(
      RESTORE_CONFLICT,
    )
    parents.db.patch("p1", { childId: null })
    await api.restore("children", "c1")
    expect(parents.db.all()[0]?.childId).toBe("c1")
  })

  it("сценарії ресурсу trash: порожньо й конфлікт", async () => {
    await remove("notes", "n1")
    setScenario("empty", "trash")
    expect(await api.list("notes", 1, 20)).toEqual({ data: [], total: 0 })
    setScenario("conflict", "trash")
    expect((await failure(api.restore("notes", "n1"))).code).toBe(
      RESTORE_CONFLICT,
    )
  })
})
