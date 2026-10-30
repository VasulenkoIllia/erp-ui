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
} from "vitest"

import { createApiClient, isApiError } from "@/registry/lib/api"
import { createAuthProvider } from "@/registry/lib/auth"
import { setCompanyId } from "@/registry/lib/company-scope"
import { createDataProvider } from "@/registry/lib/data-provider"
import { resetScenarios, setScenario } from "@/registry/lib/mock-scenarios"
import { mockUsersList, setMockUsers } from "@/registry/lib/mock-server"
import { applyMockRoles } from "@/registry/lib/mock-team"
import {
  createPlatformHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"
import { createUsersModule, type User } from "@/registry/modules/A2-users"
import { userSchemaFor } from "@/registry/modules/A2-users/contract"
import { createUsersFixtures } from "@/registry/modules/A2-users/fixtures"
import { createUsersMocks } from "@/registry/modules/A2-users/mocks"

import { usersMockExtension } from "@/extensions/A2-users-fields"

const BASE = "http://erp.test/api/v1"
const COMPANY = { id: "c1", name: "ТОВ «Тест»" }
const OTHER = { id: "c2", name: "ФОП Тестенко" }

const person = (
  id: string,
  name: string,
  roles: string[],
  companies: MockUser["companies"],
): MockUser => ({
  id,
  name,
  email: `${id}@test.example`,
  password: "demo-password",
  totpCode: "111111",
  roles,
  permissions: [],
  companies,
  companyId: companies[0]?.id ?? null,
  factors: [],
})

const team = createUsersFixtures({
  company: COMPANY,
  roles: ["sales", "auditor"],
  emailDomain: "test.example",
})
const people = [
  person("a1", "Марта Бойко", ["admin"], [COMPANY, OTHER]),
  person("u2", "Іван Петренко", ["sales"], [COMPANY]),
  person("x3", "Сторонній", ["sales"], [OTHER]),
  ...team.users,
]
/** Люди компанії c1: адміністраторка, Іван і колеги з фікстур. */
const MEMBERS = 2 + team.users.length
const BLOCKED = 2

/** Моки з обов'язковим полем розширення — окремою адресою API. */
const REQUIRED_BASE = "http://erp-required.test/api/v1"
const requiredField = {
  users: {
    fields: [
      {
        id: "badge",
        type: "text",
        label: { uk: "Перепустка", en: "Badge" },
        required: true,
        mockValues: ["B-1", "B-2"],
      },
    ],
  },
} as const

const server = setupServer(
  ...createPlatformHandlers({
    users: people,
    baseUrl: BASE,
    accountSeeds: team.accountSeeds,
    roles: [
      {
        id: "admin",
        name: { uk: "Адміністратор", en: "Administrator" },
        // «Стеля» (ADR-0032): знімає й дає ролі з нотатками — сам має права на нотатки.
        permissions: ["users:*", "roles:*", "audit:read", "notes:*"],
      },
      {
        id: "sales",
        name: { uk: "Продажі", en: "Sales" },
        permissions: ["notes:read"],
      },
      {
        id: "auditor",
        name: { uk: "Аудитор", en: "Auditor" },
        permissions: ["audit:read"],
      },
    ],
  }),
  ...createUsersMocks({ baseUrl: BASE, extension: usersMockExtension })
    .handlers,
  ...createUsersMocks({ baseUrl: REQUIRED_BASE, extension: requiredField })
    .handlers,
)

let language = "uk"
const client = createApiClient({ baseUrl: BASE, getLanguage: () => language })
const provider = createDataProvider(client)
const auth = createAuthProvider(client, { baseUrl: BASE })
const schema = userSchemaFor(usersMockExtension.users)

const list = (filter: Record<string, unknown> = {}, perPage = 50) =>
  provider.getList<User>("users", {
    filter,
    pagination: { page: 1, perPage },
    sort: { field: "name", order: "ASC" },
  })
const statusOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 200,
    (error: unknown) => (isApiError(error) ? error.status : -1),
  )

describe("фікстури A2", () => {
  it("16 колег з різними id і email, ролі по черзі, двоє заблоковані", () => {
    expect(team.users).toHaveLength(16)
    expect(new Set(team.users.map((user) => user.id)).size).toBe(16)
    expect(new Set(team.users.map((user) => user.email)).size).toBe(16)
    expect(team.users.map((user) => user.roles[0]).slice(0, 3)).toEqual([
      "sales",
      "auditor",
      "sales",
    ])
    const blocked = Object.values(team.accountSeeds).filter(
      (seed) => seed.blocked,
    )
    expect(blocked).toHaveLength(BLOCKED)
    expect(blocked[0]?.blocked?.reason).not.toBe("")
  })

  it("uk і en — ті самі id і email, різні імена", () => {
    const en = createUsersFixtures({
      locale: "en",
      company: COMPANY,
      roles: ["sales"],
      emailDomain: "test.example",
    })
    expect(en.users.map((user) => [user.id, user.email])).toEqual(
      team.users.map((user) => [user.id, user.email]),
    )
    expect(en.users[0]?.name).toBe("Andrii Bondar")
    expect(team.users[0]?.name).toBe("Андрій Бондар")
  })
})

describe("моки A2: users", () => {
  beforeAll(() => {
    server.listen({ onUnhandledFrame: "error" })
  })
  afterAll(() => {
    server.close()
    setCompanyId(null)
  })
  beforeEach(() => {
    localStorage.clear()
    applyMockRoles()
    resetScenarios()
    language = "uk"
    signInMock("a1")
    setCompanyId("c1")
  })
  afterEach(() => {
    server.resetHandlers()
  })

  it("вилучена людина — лише за id і довідником (ADR-0041)", async () => {
    const seeded = mockUsersList()
    onTestFinished(() => {
      localStorage.clear()
      setMockUsers(seeded)
    })
    setMockUsers(seeded.map((user) => ({ ...user })))
    await auth.reauthenticate({ password: "demo-password" })
    await auth.admin.removeFromCompany("u2")
    expect((await list()).data.map((row) => row.id)).not.toContain("u2")
    const byId = await list({ id: "u2" })
    expect(byId.data).toEqual([
      {
        id: "u2",
        version: expect.any(Number) as number,
        name: "Іван Петренко",
        email: "u2@test.example",
      },
    ])
    expect(await statusOf(provider.getOne("users", { id: "u2" }))).toBe(404)
    // Шукати за станом її облікового запису не можна: рядок сам був би відповіддю.
    expect((await list({ id: "u2", status: "active" })).data).toEqual([])
  })

  it("людина без компаній не бачить інших людей без компаній (ADR-0041)", async () => {
    const seeded = mockUsersList()
    onTestFinished(() => {
      setMockUsers(seeded)
    })
    setMockUsers([
      ...seeded,
      person("o1", "Без компанії", ["sales"], []),
      person("o2", "Теж без компанії", ["sales"], []),
    ])
    applyMockRoles()
    signInMock("o1")
    setCompanyId(null)
    expect(await list()).toMatchObject({ data: [], total: 0 })
  })

  it("з `users:read` — повні записи людей компанії за контрактом, з полем розширення", async () => {
    const { data, total } = await list()
    expect(total).toBe(MEMBERS)
    expect(data.map((user) => user.id)).not.toContain("x3")
    for (const user of data) expect(schema.safeParse(user).success).toBe(true)
    const ivan = data.find((user) => user.id === "u2")
    expect(ivan).toMatchObject({
      status: "active",
      roles: [{ id: "sales", name: "Продажі" }],
      twoFactor: false,
    })
    expect(data.some((user) => user.lastSignInAt === null)).toBe(true)
    expect(data.filter((user) => user.status === "blocked")).toHaveLength(
      BLOCKED,
    )
    expect(new Set(data.map((user) => user.department))).toEqual(
      new Set(["management", "sales", "finance", "logistics"]),
    )
  })

  it("назви ролей — мовою запиту", async () => {
    language = "en"
    const { data } = await provider.getOne<User>("users", { id: "u2" })
    expect(data.roles).toEqual([{ id: "sales", name: "Sales" }])
  })

  it("фільтри: роль за id, статус, другий крок, пошук за email", async () => {
    const auditors = await list({ roles: "auditor" })
    expect(auditors.total).toBe(team.users.length / 2)
    expect(
      auditors.data.every((user) => user.roles[0]?.name === "Аудитор"),
    ).toBe(true)
    expect((await list({ status: "blocked" })).total).toBe(BLOCKED)
    const withTwoFactor = (await list({ twoFactor: "true" })).total ?? 0
    const without = (await list({ twoFactor: "false" })).total ?? 0
    expect(withTwoFactor).toBeGreaterThan(0)
    expect(withTwoFactor + without).toBe(MEMBERS)
    expect((await list({ q: "BONDAR@TEST" })).data.map((u) => u.id)).toEqual([
      "u-fixture-01",
    ])
  })

  it("сторінки й сортування — на сервері", async () => {
    const first = await provider.getList<User>("users", {
      filter: {},
      pagination: { page: 1, perPage: 5 },
      sort: { field: "name", order: "DESC" },
    })
    expect(first.data).toHaveLength(5)
    expect(first.total).toBe(MEMBERS)
    const names = first.data.map((user) => user.name)
    expect(names).toEqual([...names].sort((a, b) => b.localeCompare(a, "uk")))
  })

  it("без `users:read` — довідник: ім'я й email активних; інші фільтри — 403", async () => {
    signInMock("u2")
    const { data, total } = await list()
    expect(total).toBe(MEMBERS - BLOCKED)
    for (const user of data)
      expect(Object.keys(user).sort()).toEqual([
        "email",
        "id",
        "name",
        "version",
      ])
    expect((await list({ q: "bondar" })).total).toBe(1)
    for (const filter of [
      { status: "blocked" },
      { roles: "sales" },
      { twoFactor: "false" },
      { department: "sales" },
    ])
      expect(await statusOf(list(filter))).toBe(403)
  })

  it("без `users:read` за id — і заблокований (підпис уже вибраного), картка — довідником", async () => {
    signInMock("u2")
    const blockedId = Object.entries(team.accountSeeds).find(
      ([, seed]) => seed.blocked,
    )?.[0]
    expect(blockedId).toBeDefined()
    const { data } = await list({ id: [blockedId, "u2"] })
    expect(data.map((user) => user.id).sort()).toEqual([blockedId, "u2"].sort())
    const { data: one } = await provider.getOne<User>("users", { id: "a1" })
    expect(one).toEqual({
      id: "a1",
      version: 1,
      name: "Марта Бойко",
      email: "a1@test.example",
    })
  })

  it("людина іншої компанії — 404, без сесії — 401", async () => {
    expect(await statusOf(provider.getOne("users", { id: "x3" }))).toBe(404)
    signInMock(null)
    expect(await statusOf(list())).toBe(401)
  })

  it("компанія — лише своя: чужий `X-Company-Id` — 403, без заголовка — компанія сесії", async () => {
    signInMock("u2")
    setCompanyId("c2")
    expect(await statusOf(list())).toBe(403)
    expect(await statusOf(provider.getOne("users", { id: "x3" }))).toBe(403)
    setCompanyId(null)
    expect((await list()).total).toBe(MEMBERS - BLOCKED)
    // Адміністраторка двох компаній бачить людей компанії із заголовка.
    signInMock("a1")
    setCompanyId("c2")
    expect((await list()).data.map((user) => user.id).sort()).toEqual([
      "a1",
      "x3",
    ])
  })

  it("без `users:read` сортування — лише за ім'ям, email чи id: порядок входів чи ролей — 403", async () => {
    signInMock("u2")
    const sorted = (field: string) =>
      provider.getList<User>("users", {
        filter: {},
        pagination: { page: 1, perPage: 5 },
        sort: { field, order: "DESC" },
      })
    for (const field of ["name", "email", "id"])
      expect(await statusOf(sorted(field))).toBe(200)
    for (const field of ["lastSignInAt", "twoFactor", "status", "roles"])
      expect(await statusOf(sorted(field))).toBe(403)
    signInMock("a1")
    expect(await statusOf(sorted("lastSignInAt"))).toBe(200)
  })

  it("обов'язкове поле розширення: значення моків стають до перевірки схемою", async () => {
    const required = createDataProvider(
      createApiClient({ baseUrl: REQUIRED_BASE, getLanguage: () => "uk" }),
    )
    const { data } = await required.getList<User>("users", {
      filter: {},
      pagination: { page: 1, perPage: 50 },
      sort: { field: "name", order: "ASC" },
    })
    expect(data).toHaveLength(MEMBERS)
    expect(new Set(data.map((user) => user.badge))).toEqual(
      new Set(["B-1", "B-2"]),
    )
    const { data: one } = await required.getOne<User>("users", { id: "u2" })
    expect(one.badge).toMatch(/^B-/)
  })

  it("версія запису зростає після блокування й зміни ролей", async () => {
    await auth.reauthenticate({ password: "demo-password" })
    const before = (await provider.getOne<User>("users", { id: "u2" })).data
    await auth.admin.blockUser("u2", "Відпустка")
    const blocked = (await provider.getOne<User>("users", { id: "u2" })).data
    expect(blocked).toMatchObject({
      status: "blocked",
      version: before.version + 1,
    })
    await auth.roles.setUserRoles("u2", ["auditor"])
    const changed = (await provider.getOne<User>("users", { id: "u2" })).data
    expect(changed).toMatchObject({
      roles: [{ id: "auditor", name: "Аудитор" }],
      version: before.version + 2,
    })
  })

  it("сценарії ресурсу: empty — порожній список, forbidden — 403", async () => {
    setScenario("empty", "users")
    expect(await list()).toMatchObject({ data: [], total: 0 })
    setScenario("forbidden", "users")
    expect(await statusOf(list())).toBe(403)
  })
})

describe("фабрика A2: сторінка ролей (ADR-0033)", () => {
  it("маршрут і пункт «Ролі й права» з правом roles:read; `roles.page: false` — без них", () => {
    const module = createUsersModule({ basePath: "/team" })
    expect(module.paths.roles).toBe("/team/roles")
    expect(module.routes.map((route) => route.path)).toContain("/team/roles")
    expect(module.nav).toEqual([
      expect.objectContaining({ id: "A2-users", href: "/team/users" }),
      expect.objectContaining({
        id: "A2-roles",
        href: "/team/roles",
        access: { resource: "roles", action: "read" },
      }),
      expect.objectContaining({ id: "A2-invitations" }),
    ])

    const without = createUsersModule({
      basePath: "/team",
      extension: { roles: { page: false } },
    })
    expect(without.routes.map((route) => route.path)).not.toContain(
      "/team/roles",
    )
    expect(without.nav.map((item) => item.id)).toEqual([
      "A2-users",
      "A2-invitations",
    ])
  })
})

describe("фабрика A2: сторінка запрошень (ADR-0035)", () => {
  it("маршрут і пункт «Запрошення» з правом users:create; `invitations.page: false` — без них", () => {
    const module = createUsersModule({ basePath: "/team" })
    expect(module.paths.invitations).toBe("/team/invitations")
    expect(module.routes.map((route) => route.path)).toContain(
      "/team/invitations",
    )
    expect(module.nav.at(-1)).toEqual(
      expect.objectContaining({
        id: "A2-invitations",
        href: "/team/invitations",
        access: { resource: "users", action: "create" },
      }),
    )

    const without = createUsersModule({
      basePath: "/team",
      extension: { invitations: { page: false } },
    })
    expect(without.routes.map((route) => route.path)).not.toContain(
      "/team/invitations",
    )
    expect(without.nav.map((item) => item.id)).toEqual(["A2-users", "A2-roles"])
  })
})
