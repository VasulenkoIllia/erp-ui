import { QueryClient } from "@tanstack/react-query"
import { render, renderHook, screen } from "@testing-library/react"
import { setupServer } from "msw/node"
import { CoreAdminContext, type AuthProvider } from "ra-core"
import type { ReactNode } from "react"
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

import { PermissionGate } from "@/registry/erp/permission-gate"
import { useRecordAccess } from "@/registry/hooks/use-record-access"
import { createApiClient, recordBaseSchema } from "@/registry/lib/api"
import {
  createAuthProvider,
  kitAction,
  ME_QUERY_KEY,
  type Me,
} from "@/registry/lib/auth"
import { setCompanyId } from "@/registry/lib/company-scope"
import { createDataProvider } from "@/registry/lib/data-provider"
import { setMockUsers } from "@/registry/lib/mock-server"
import {
  createPlatformHandlers,
  createResourceHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"
import { recordDenial } from "@/registry/lib/record-access"

/**
 * Крок A2c2a (ADR-0037): позначка сервера на записі `deniedActions` — що з цим записом не можна тому,
 * хто питає. Моки ставлять її спільним записам (змінює лише адміністратор платформи), authProvider і
 * PermissionGate її поважають, `useRecordAccess` дає причину текстом для неактивної дії.
 */
const BASE = "http://erp.test/api/v1"
const COMPANY = { id: "c1", name: "ТОВ «Тест»" }
const SHARED = { update: "shared", delete: "shared" }

const person = (id: string, extra: Partial<MockUser> = {}): MockUser => ({
  id,
  name: id,
  email: `${id}@test.example`,
  password: "demo-password",
  totpCode: "111111",
  roles: ["editor"],
  permissions: ["notes:*", "drafts:*"],
  companies: [COMPANY],
  companyId: COMPANY.id,
  factors: [],
  ...extra,
})

const users: MockUser[] = [
  person("a1"),
  // Лише читання: позначка запису однаково є — причину без права пояснює модуль.
  person("r1", { permissions: ["notes:read"] }),
  person("p0", { isPlatformAdmin: true }),
]

const noteSchema = recordBaseSchema.extend({
  title: z.string(),
  companyId: z.string().nullable(),
})
type Note = z.infer<typeof noteSchema>

const notes = createResourceHandlers({
  resource: "notes",
  schema: noteSchema,
  data: [
    { id: "n1", version: 1, title: "Своя", companyId: "c1" },
    { id: "n4", version: 1, title: "Спільна", companyId: null },
  ] satisfies Note[],
  searchFields: ["title"],
  baseUrl: BASE,
})

// Схема без суворих полів (`looseObject`) і засів із позначкою: сервер її не зберігає й не віддає.
const draftSchema = z.looseObject({
  id: z.string(),
  version: z.number(),
  title: z.string(),
  companyId: z.string().nullable(),
})
type Draft = z.infer<typeof draftSchema>
const drafts = createResourceHandlers<Draft>({
  resource: "drafts",
  schema: draftSchema,
  data: [
    {
      id: "d1",
      version: 1,
      title: "Засів своєї",
      companyId: "c1",
      deniedActions: { update: "closed_period" },
    },
    {
      id: "d2",
      version: 1,
      title: "Засів спільної",
      companyId: null,
      deniedActions: { approve: "closed_period" },
    },
  ],
  searchFields: ["title"],
  baseUrl: BASE,
})

const server = setupServer(
  ...createPlatformHandlers({ users, baseUrl: BASE }),
  ...notes.handlers,
  ...drafts.handlers,
)
const client = createApiClient({ baseUrl: BASE, getLanguage: () => "uk" })
const data = createDataProvider(client)

const list = async () =>
  (
    await data.getList<Note>("notes", {
      pagination: { page: 1, perPage: 10 },
      sort: { field: "id", order: "ASC" },
      filter: {},
    })
  ).data
const deniedOf = (records: readonly Note[]) =>
  Object.fromEntries(
    records.map((note) => [note.id, recordDenial(note, "update") ?? null]),
  )

describe("kitAction", () => {
  it("дія ra-core — дія прав; своя й ключ прототипу — як є", () => {
    expect(kitAction("edit")).toBe("update")
    expect(kitAction("show")).toBe("read")
    expect(kitAction("approve")).toBe("approve")
    expect(kitAction("constructor")).toBe("constructor")
  })
})

describe("recordDenial", () => {
  it("код причини з позначки; без поля, з полем не того типу чи порожнім кодом — заборони немає", () => {
    expect(recordDenial({ deniedActions: SHARED }, "update")).toBe("shared")
    expect(recordDenial({ deniedActions: SHARED }, "approve")).toBeUndefined()
    expect(recordDenial({ id: "n1" }, "update")).toBeUndefined()
    expect(recordDenial(undefined, "update")).toBeUndefined()
    expect(recordDenial({ deniedActions: true }, "update")).toBeUndefined()
    expect(
      recordDenial({ deniedActions: { update: "" } }, "update"),
    ).toBeUndefined()
    expect(recordDenial({ deniedActions: { update: 1 } }, "update")).toBe(
      undefined,
    )
    // Ключ із прототипу — не дія.
    expect(recordDenial({ deniedActions: {} }, "constructor")).toBeUndefined()
  })
})

describe("моки: позначка заборон на записі", () => {
  beforeAll(() => {
    server.listen({ onUnhandledFrame: "error" })
  })
  afterAll(() => {
    server.close()
  })
  beforeEach(() => {
    signInMock(null)
    setMockUsers(users)
    notes.db.reset()
    drafts.db.reset()
    setCompanyId(null)
  })
  afterEach(() => {
    server.resetHandlers()
  })

  it("спільний запис у списку й картці — `update` і `delete` заборонені з причиною `shared`", async () => {
    signInMock("a1")
    const records = await list()
    expect(deniedOf(records)).toEqual({ n1: null, n4: "shared" })
    expect(records.find((note) => note.id === "n4")).toMatchObject({
      deniedActions: SHARED,
    })
    expect(records.find((note) => note.id === "n1")).not.toHaveProperty(
      "deniedActions",
    )
    const { data: card } = await data.getOne<Note>("notes", { id: "n4" })
    expect(card).toMatchObject({ deniedActions: SHARED })
  })

  it("позначка — і без права ролі: причину без права пояснює модуль", async () => {
    signInMock("r1")
    expect(deniedOf(await list())).toEqual({ n1: null, n4: "shared" })
  })

  it("адміністратор платформи змінює спільне — позначки немає", async () => {
    signInMock("p0")
    expect(deniedOf(await list())).toEqual({ n1: null, n4: null })
    const { data: saved } = await data.update<Note>("notes", {
      id: "n4",
      data: { title: "Спільна оновлена", version: 1 },
      previousData: { id: "n4", version: 1, title: "Спільна", companyId: null },
    })
    expect(saved).not.toHaveProperty("deniedActions")
  })

  it("позначку з тіла запиту сервер не бере й не віддає", async () => {
    signInMock("a1")
    const { data: created } = await data.create<Note>("notes", {
      data: {
        title: "Нова",
        deniedActions: { update: "own" },
      } as Partial<Note>,
    })
    expect(created).not.toHaveProperty("deniedActions")
    const { data: card } = await data.getOne<Note>("notes", { id: created.id })
    expect(card).not.toHaveProperty("deniedActions")
    const { data: saved } = await data.update<Note>("notes", {
      id: "n1",
      data: { title: "Своя оновлена", deniedActions: SHARED, version: 1 },
      previousData: { id: "n1", version: 1, title: "Своя", companyId: "c1" },
    })
    expect(saved).not.toHaveProperty("deniedActions")
  })

  it("позначка із засіву чи тіла схеми без суворих полів — не зберігається й не віддається", async () => {
    signInMock("a1")
    const { data: rows } = await data.getList<Draft>("drafts", {
      pagination: { page: 1, perPage: 10 },
      sort: { field: "id", order: "ASC" },
      filter: {},
    })
    expect(rows.map((row) => [row.id, row.deniedActions ?? null])).toEqual([
      ["d1", null],
      ["d2", SHARED],
    ])
    const { data: created } = await data.create<Draft>("drafts", {
      data: { title: "Нова", deniedActions: { update: "own" } },
    })
    const { data: saved } = await data.update<Draft>("drafts", {
      id: "d1",
      data: { title: "Своя оновлена", deniedActions: SHARED, version: 1 },
      previousData: {
        id: "d1",
        version: 1,
        title: "Засів своєї",
        companyId: "c1",
      },
    })
    expect(saved).not.toHaveProperty("deniedActions")
    expect(
      drafts.db
        .all()
        .filter((row) => [created.id, "d1"].includes(row.id))
        .map((row) => row.deniedActions ?? null),
    ).toEqual([null, { update: "closed_period" }])
  })

  it("застосунок без компаній — спільних записів немає, позначок теж", async () => {
    setMockUsers([person("solo", { companies: [], companyId: null })])
    signInMock("solo")
    expect(deniedOf(await list())).toEqual({ n1: null, n4: null })
  })

  it("authProvider.canAccess з записом: позначка забороняє і `update`, і `edit` ra-core", async () => {
    signInMock("a1")
    const auth = createAuthProvider(client, { baseUrl: BASE })
    const can = (action: string, record?: Record<string, unknown>) =>
      auth.canAccess?.({ resource: "notes", action, record })
    const shared = { id: "n4", deniedActions: SHARED }
    expect(await can("edit", shared)).toBe(false)
    expect(await can("delete", shared)).toBe(false)
    expect(await can("edit", { id: "n1" })).toBe(true)
    expect(await can("edit")).toBe(true)
  })
})

function wrapper(authProvider?: AuthProvider) {
  const queryClient = new QueryClient()
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <CoreAdminContext queryClient={queryClient} authProvider={authProvider}>
        {children}
      </CoreAdminContext>
    )
  }
}

const allowAll: AuthProvider = {
  login: () => Promise.resolve(),
  logout: () => Promise.resolve(),
  checkAuth: () => Promise.resolve(),
  checkError: () => Promise.resolve(),
  canAccess: () => Promise.resolve(true),
}

describe("useRecordAccess", () => {
  const access = (
    record: unknown,
    action = "update",
    authProvider = allowAll,
  ) =>
    renderHook(() => useRecordAccess({ resource: "notes", action, record }), {
      wrapper: wrapper(authProvider),
    })

  it("право є, а запис забороняє — неактивна з причиною запису; `edit` — як `update`", async () => {
    const { result } = access({ id: "n4", deniedActions: SHARED }, "edit")
    await expect.poll(() => result.current.isPending).toBe(false)
    expect(result.current).toEqual({
      isPending: false,
      canAccess: false,
      recordReason:
        "Спільний запис: змінювати його може лише адміністратор платформи",
    })
  })

  it("невідомий код причини — загальний текст; без позначки — можна", async () => {
    const { result } = access({ deniedActions: { update: "closed_period" } })
    await expect.poll(() => result.current.isPending).toBe(false)
    expect(result.current.recordReason).toBe(
      "Цю дію з цим записом виконати не можна",
    )
    const free = access({ id: "n1" })
    await expect.poll(() => free.result.current.isPending).toBe(false)
    expect(free.result.current).toEqual({
      isPending: false,
      canAccess: true,
      recordReason: undefined,
    })
  })

  it("без права ролі — причини запису немає: її дає модуль своїм текстом", async () => {
    const { result } = access({ deniedActions: SHARED }, "update", {
      ...allowAll,
      canAccess: () => Promise.resolve(false),
    })
    await expect.poll(() => result.current.isPending).toBe(false)
    expect(result.current).toEqual({ isPending: false, canAccess: false })
  })
})

describe("PermissionGate з записом", () => {
  const me: Me = {
    id: "u1",
    name: "Оксана",
    email: "o@example.com",
    roles: [],
    permissions: ["notes:*"],
    companies: [],
    companyId: null,
    factors: [],
  }
  function renderGate(record: unknown) {
    const queryClient = new QueryClient()
    queryClient.setQueryData<Me>(ME_QUERY_KEY, me)
    return render(
      <CoreAdminContext queryClient={queryClient}>
        <PermissionGate resource="notes" action="edit" record={record}>
          <button type="button">Змінити</button>
        </PermissionGate>
      </CoreAdminContext>,
    )
  }

  it("запис забороняє дію — вмісту немає; без позначки — є", () => {
    renderGate({ id: "n4", deniedActions: SHARED })
    expect(screen.queryByRole("button", { name: "Змінити" })).toBeNull()
    renderGate({ id: "n1" })
    expect(screen.getByRole("button", { name: "Змінити" })).toBeVisible()
  })
})
