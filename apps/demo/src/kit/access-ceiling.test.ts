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

import { createApiClient } from "@/registry/lib/api"
import {
  createAuthProvider,
  isChallengeRequired,
  isReauthRequired,
} from "@/registry/lib/auth"
import { getCompanyId, setCompanyId } from "@/registry/lib/company-scope"
import { mockUsersList } from "@/registry/lib/mock-server"
import { applyMockRoles } from "@/registry/lib/mock-team"
import {
  createPlatformHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"

/**
 * Крок A2b2b2a (ADR-0034): права того, хто діє, — у компанії запиту (профіль, дії над доступом,
 * «Увійти як…»); «стеля» доступу — вийти, завершити сесію, заблокувати, розблокувати й скинути
 * другий крок лише людині, усі права якої адміністратор має сам, і до повторного підтвердження.
 */
const BASE = "http://erp.test/api/v1"
const USER_ROLES_KEY = "erp-ui:mock-user-roles"

const COMPANIES = [
  { id: "c1", name: "ТОВ «Тест»" },
  { id: "c2", name: "ФОП Тестенко" },
]

const person = (
  id: string,
  roles: string[],
  companies: MockUser["companies"],
  factors: MockUser["factors"] = [],
): MockUser => ({
  id,
  name: id,
  email: `${id}@zoriana.example`,
  password: "demo-password",
  totpCode: "111111",
  roles,
  permissions: [],
  companies,
  companyId: companies[0]?.id ?? null,
  factors,
})

const users: MockUser[] = [
  person("a1", ["admin"], COMPANIES),
  person("u2", ["sales"], COMPANIES.slice(0, 1)),
  // Права на нотатки ширші, ніж в адміністратора; з другим кроком і сесією на іншому пристрої.
  person("f5", ["finance"], COMPANIES.slice(0, 1), ["totp"]),
  // Інший адміністратор першої компанії — рівний за правами.
  person("a6", ["admin"], COMPANIES.slice(0, 1)),
  // В обох компаніях: ролі засіває тест.
  person("u9", ["sales"], COMPANIES),
  // Лише в другій компанії, з другим кроком і сесією на іншому пристрої.
  person("t7", ["sales"], COMPANIES.slice(1), ["totp"]),
  // Адміністратор платформи без компаній: позначка облікового запису, а не `*` у ролі (ADR-0036).
  { ...person("p0", ["platform"], []), isPlatformAdmin: true },
]

const ROLES = [
  {
    id: "admin",
    name: { uk: "Адміністратор", en: "Administrator" },
    permissions: ["users:*", "roles:read", "security:read", "notes:read"],
  },
  {
    id: "sales",
    name: { uk: "Продажі", en: "Sales" },
    permissions: ["notes:read"],
  },
  {
    id: "finance",
    name: { uk: "Фінанси", en: "Finance" },
    permissions: ["notes:*"],
  },
  {
    id: "platform",
    name: { uk: "Платформа", en: "Platform" },
    permissions: ["*"],
  },
]

const DEVICE = { type: "desktop" as const, browser: "Firefox", os: "Windows" }
const SESSION = {
  device: DEVICE,
  ip: "198.51.100.5",
  createdAt: "2026-10-20T09:00:00.000Z",
  lastActiveAt: "2026-10-27T09:00:00.000Z",
}

const server = setupServer(
  ...createPlatformHandlers({
    users,
    baseUrl: BASE,
    roles: ROLES,
    permissionResources: {
      notes: { label: { uk: "Нотатки", en: "Notes" } },
      users: {
        label: { uk: "Користувачі", en: "Users" },
        actions: ["read", "create", "update", "impersonate"],
      },
    },
    accountSeeds: {
      f5: { sessions: [{ id: "s-f5", ...SESSION }] },
      u2: { sessions: [{ id: "s-u2", ...SESSION }] },
      t7: { sessions: [{ id: "s-t7", ...SESSION }] },
    },
  }),
)

const client = createApiClient({ baseUrl: BASE, getLanguage: () => "uk" })
let auth = createAuthProvider(client, { baseUrl: BASE })

const errorOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => error,
  )

/** Ролі людей за компаніями, як після змін адміністраторів (ADR-0033). */
function seedRoles(value: Record<string, Record<string, string[]>>) {
  localStorage.setItem(USER_ROLES_KEY, JSON.stringify(value))
  applyMockRoles()
}

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" })
})
afterAll(() => {
  server.close()
})
beforeEach(() => {
  signInMock(null)
  localStorage.clear()
  applyMockRoles()
  setCompanyId(null)
  auth = createAuthProvider(client, { baseUrl: BASE })
})
afterEach(() => {
  server.resetHandlers()
})

describe("«стеля» доступу (ADR-0034)", () => {
  it("сильнішій людині — 403 на кожну дію, без запиту пароля", async () => {
    signInMock("a1")
    for (const action of [
      () => auth.admin.signOutUser("f5"),
      () => auth.admin.blockUser("f5", "Звільнення"),
      () => auth.admin.unblockUser("f5"),
      () => auth.admin.resetFactors("f5", "Перевірено дзвінком"),
      () => auth.admin.endSession("s-f5"),
    ])
      expect(await errorOf(action())).toMatchObject({
        status: 403,
        code: "forbidden",
      })
    // Перегляд — без «стелі»: бачити можна, діяти — ні.
    expect((await auth.admin.getUserAccess("f5")).sessions).toHaveLength(1)
  })

  it("слабшій і рівній — як раніше: повторне підтвердження, потім дія", async () => {
    signInMock("a1")
    await auth.admin.endSession("s-u2")
    expect(
      isReauthRequired(await errorOf(auth.admin.blockUser("u2", "Відпустка"))),
    ).toBe(true)
    await auth.reauthenticate({ password: "demo-password" })
    await auth.admin.blockUser("u2", "Відпустка")
    await auth.admin.unblockUser("u2")
    await auth.admin.signOutUser("u2")
    await auth.admin.blockUser("a6", "Перевірка")
    expect((await auth.admin.getUserAccess("a6")).status).toBe("blocked")
  })

  it("людина іншої компанії — 404 до повторного підтвердження", async () => {
    signInMock("a6")
    setCompanyId("c1")
    expect(
      await errorOf(auth.admin.blockUser("missing", "Причина")),
    ).toMatchObject({ status: 404 })
  })

  it("права цілі — в усіх її компаніях: сильніша хоч в одній — 403 у кожній", async () => {
    seedRoles({ u9: { c1: ["sales"], c2: ["finance"] } })
    signInMock("a1")
    await auth.reauthenticate({ password: "demo-password" })
    for (const company of ["c1", "c2"]) {
      setCompanyId(company)
      expect(
        await errorOf(auth.admin.blockUser("u9", "Звільнення")),
      ).toMatchObject({ status: 403, code: "forbidden" })
    }
    seedRoles({ u9: { c1: ["sales"], c2: ["sales"] } })
    setCompanyId("c1")
    await auth.admin.signOutUser("u9")
  })

  it("сесія людини іншої компанії — 404, дії над собою — 422 до повторного підтвердження", async () => {
    signInMock("a6")
    setCompanyId("c1")
    expect(await errorOf(auth.admin.endSession("s-t7"))).toMatchObject({
      status: 404,
    })
    expect(await errorOf(auth.admin.blockUser("a6", "Сам собі"))).toMatchObject(
      { status: 422, fieldErrors: { userId: "invalid" } },
    )
    expect(
      await errorOf(auth.admin.resetFactors("a6", "Сам собі")),
    ).toMatchObject({ status: 422, fieldErrors: { userId: "invalid" } })
  })

  it("дія над собою — без «стелі», хоч в іншій своїй компанії прав більше", async () => {
    seedRoles({ a1: { c1: ["admin"], c2: ["finance"] } })
    signInMock("a1")
    setCompanyId("c1")
    await auth.admin.signOutUser("a1")
  })

  it("поле canManage: те саме правило, що й у дій (ADR-0040)", async () => {
    signInMock("a1")
    setCompanyId("c1")
    expect((await auth.admin.getUserAccess("u2")).canManage).toBe(true)
    expect((await auth.admin.getUserAccess("a6")).canManage).toBe(true)
    expect((await auth.admin.getUserAccess("f5")).canManage).toBe(false)
    expect((await auth.admin.getUserAccess("a1")).canManage).toBe(true)
  })

  it("поле canManage: права людини в іншій її компанії", async () => {
    localStorage.setItem(
      USER_ROLES_KEY,
      JSON.stringify({ u9: { c1: ["sales"], c2: ["finance"] } }),
    )
    applyMockRoles()
    signInMock("a1")
    setCompanyId("c1")
    expect((await auth.admin.getUserAccess("u9")).canManage).toBe(false)
  })

  it("поле canManage: адміністратор платформи в компанії", async () => {
    const platform = mockUsersList().find((user) => user.id === "p0")
    if (!platform) throw new Error("no mock user p0")
    const { companies } = platform
    platform.companies = COMPANIES.slice(0, 1)
    signInMock("a1")
    setCompanyId("c1")
    expect((await auth.admin.getUserAccess("p0")).canManage).toBe(false)
    platform.companies = companies
  })

  it("людина ще в іншій компанії: обліковим записом керує лише той, хто керує обома (ADR-0040)", async () => {
    signInMock("a6")
    setCompanyId("c1")
    expect((await auth.admin.getUserAccess("u9")).canManage).toBe(false)
    for (const action of [
      () => auth.admin.signOutUser("u9"),
      () => auth.admin.blockUser("u9", "Звільнення"),
      () => auth.admin.resetFactors("u9", "Втратив телефон"),
    ])
      expect(await errorOf(action())).toMatchObject({
        status: 403,
        code: "forbidden",
      })

    signInMock("a1")
    setCompanyId("c1")
    expect((await auth.admin.getUserAccess("u9")).canManage).toBe(true)
    signInMock("p0")
    expect((await auth.admin.getUserAccess("u9")).canManage).toBe(true)
  })

  it("«стеля» — у кожній компанії людини, а не лише в компанії запиту (ADR-0040)", async () => {
    seedRoles({
      a1: { c1: ["admin"], c2: ["platform"] },
      u9: { c1: ["finance"], c2: ["sales"] },
    })
    signInMock("a1")
    setCompanyId("c2")
    expect((await auth.admin.getUserAccess("u9")).canManage).toBe(false)
    expect(await errorOf(auth.admin.signOutUser("u9"))).toMatchObject({
      status: 403,
      code: "forbidden",
    })
  })

  it("«Увійти як…»: людина ще в компанії, де адміністратор нею не керує, — 403 (ADR-0040)", async () => {
    signInMock("a6")
    setCompanyId("c1")
    expect(await errorOf(auth.impersonate("u9", "Перевірка"))).toMatchObject({
      status: 403,
      code: "forbidden",
    })
  })

  it("запит на відновлення людини з кількох компаній прибирає лише той, хто керує всіма (ADR-0040)", async () => {
    localStorage.setItem(
      "erp-ui:mock-recovery-requests",
      JSON.stringify([
        {
          id: "r1",
          userId: "u9",
          userName: "u9",
          email: "u9@zoriana.example",
          requestedAt: "2026-10-30T09:00:00.000Z",
        },
      ]),
    )
    signInMock("a6")
    setCompanyId("c1")
    const [entry] = await auth.admin.getRecoveryRequests()
    if (!entry) throw new Error("no recovery request")
    expect(
      await errorOf(auth.admin.declineRecoveryRequest(entry.id)),
    ).toMatchObject({ status: 403, code: "forbidden" })
    signInMock("a1")
    await auth.admin.declineRecoveryRequest(entry.id)
    expect(await auth.admin.getRecoveryRequests()).toEqual([])
  })

  it("ролі людини в панелі доступу — у компанії запиту", async () => {
    seedRoles({ u9: { c1: ["sales"], c2: ["finance"] } })
    signInMock("a1")
    setCompanyId("c2")
    expect((await auth.admin.getUserAccess("u9")).roles).toEqual(["finance"])
    setCompanyId("c1")
    expect((await auth.admin.getUserAccess("u9")).roles).toEqual(["sales"])
  })
})

describe("права в компанії запиту (ADR-0034)", () => {
  it("профіль: ролі й права — у компанії запиту, після перемикання — нової", async () => {
    seedRoles({ a1: { c1: ["admin"], c2: ["sales"] } })
    signInMock("a1")
    setCompanyId("c2")
    expect(await auth.refreshMe()).toMatchObject({
      roles: ["sales"],
      permissions: ["notes:read"],
    })
    setCompanyId("c1")
    expect((await auth.refreshMe()).permissions).toContain("users:*")
  })

  it("дії адміністратора: без права в компанії запиту — 403, хоч в іншій воно є", async () => {
    seedRoles({ a1: { c1: ["admin"], c2: ["sales"] } })
    signInMock("a1")
    setCompanyId("c2")
    expect(await errorOf(auth.admin.getUserAccess("u9"))).toMatchObject({
      status: 403,
    })
    expect(await errorOf(auth.admin.getSessions("", 1, 20))).toMatchObject({
      status: 403,
    })
    setCompanyId("c1")
    expect((await auth.admin.getUserAccess("u9")).status).toBe("active")
  })

  it("«Увійти як…»: право й «стеля» — у компанії запиту, відмова — до пароля", async () => {
    seedRoles({ a1: { c1: ["admin"], c2: ["sales"] } })
    signInMock("a1")
    setCompanyId("c2")
    expect(await errorOf(auth.impersonate("u9", "Перевірка"))).toMatchObject({
      status: 403,
      code: "forbidden",
    })
    setCompanyId("c1")
    expect(await errorOf(auth.impersonate("f5", "Перевірка"))).toMatchObject({
      status: 403,
      code: "forbidden",
    })
    expect(
      isReauthRequired(await errorOf(auth.impersonate("u2", "Перевірка"))),
    ).toBe(true)
  })

  it("«Увійти як…» діє лише в компанії, де його почали", async () => {
    seedRoles({ u9: { c1: ["sales"], c2: ["sales"] } })
    signInMock("a1")
    setCompanyId("c1")
    await auth.reauthenticate({ password: "demo-password" })
    await auth.impersonate("u9", "Перевірка")
    expect(await auth.refreshMe()).toMatchObject({
      id: "u9",
      companyId: "c1",
      companies: [{ id: "c1" }],
      permissions: ["notes:read"],
    })
    // Інша компанія людини — 403; клієнт тоді скидає її й бере компанію старту.
    setCompanyId("c2")
    expect(await errorOf(client.get("/me"))).toMatchObject({ status: 403 })
    expect((await auth.refreshMe()).companyId).toBe("c1")
    expect(getCompanyId()).toBe("c1")
    await auth.stopImpersonation()
    setCompanyId("c2")
    expect((await auth.refreshMe()).id).toBe("a1")
  })

  it("профіль: порожній заголовок компанії — 403, як у діях", async () => {
    signInMock("a1")
    const response = await fetch(`${BASE}/me`, {
      headers: { "X-Company-Id": "" },
    })
    expect(response.status).toBe(403)
  })

  it("«Увійти як…» без компанії старту в застосунку з компаніями — 403", async () => {
    localStorage.setItem(
      "erp-ui:mock-session",
      JSON.stringify({
        userId: "u9",
        impersonatorId: "a1",
        stage: "authenticated",
      }),
    )
    expect(await errorOf(client.get("/me"))).toMatchObject({ status: 403 })
  })

  it("адміністратор платформи в чужій компанії — з усіма правами", async () => {
    signInMock("p0")
    setCompanyId("c2")
    expect((await auth.admin.getUserAccess("t7")).status).toBe("active")
    expect((await auth.refreshMe()).permissions).toEqual(["*"])
  })

  it("запит на відновлення — адміністраторам з правом у компанії людини, а не в їхній активній", async () => {
    seedRoles({ a1: { c1: ["sales"], c2: ["admin"] } })
    const challenge = await errorOf(
      auth.login({ email: "t7@zoriana.example", password: "demo-password" }),
    )
    expect(isChallengeRequired(challenge)).toBe(true)
    await auth.requestRecovery("Загубив телефон")
    const unread = async (id: string) => {
      signInMock(id)
      return (
        await client.get<{ count: number }>("/notifications/unread-count")
      ).count
    }
    expect(await unread("a1")).toBe(1)
    expect(await unread("a6")).toBe(0)
  })
})
