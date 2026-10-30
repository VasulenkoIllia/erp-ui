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
import { createAuthProvider, isReauthRequired } from "@/registry/lib/auth"
import { getCompanyId, setCompanyId } from "@/registry/lib/company-scope"
import { loadState, update } from "@/registry/lib/mock-account-state"
import { resetScenarios, setScenario } from "@/registry/lib/mock-scenarios"
import {
  mockUsersList,
  setMockUsers,
  writeMockSession,
} from "@/registry/lib/mock-server"
import { applyMockRoles } from "@/registry/lib/mock-team"
import {
  createPlatformHandlers,
  signInMock,
  subscribeMockMessages,
  type MockMessage,
  type MockUser,
} from "@/registry/lib/mocks"

/**
 * Крок A2c3b (ADR-0041): вилучити людину лише з компанії запиту. Інші компанії, обліковий запис і
 * другий крок лишаються; «стеля» лише в цій компанії; поле `canRemove`; остання компанія людини —
 * запис без компаній.
 */
const BASE = "http://erp.test/api/v1"
const USER_ROLES_KEY = "erp-ui:mock-user-roles"
const LEFT_KEY = "erp-ui:mock-left-companies:v1"
const PASSWORD = "demo-password"

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
  password: PASSWORD,
  totpCode: "111111",
  roles,
  permissions: [],
  companies,
  companyId: companies[0]?.id ?? null,
  factors,
})

const seed = (): MockUser[] => [
  person("a1", ["admin"], COMPANIES),
  // Адміністратор лише першої компанії: другою людини він не керує.
  person("a6", ["admin"], COMPANIES.slice(0, 1)),
  person("u2", ["sales"], COMPANIES.slice(0, 1)),
  person("u9", ["sales"], COMPANIES, ["totp"]),
  // Права на нотатки ширші, ніж в адміністратора.
  person("f5", ["finance"], COMPANIES.slice(0, 1)),
  // Лише в другій компанії.
  person("m3", ["sales"], COMPANIES.slice(1)),
  // Керує людьми, а «Увійти як…» у неї можна: прав входити від імені інших вона не має.
  person("h7", ["hr"], COMPANIES.slice(0, 1)),
  // Адміністратор платформи поза компаніями й той, що працює в першій.
  { ...person("p0", ["platform"], []), isPlatformAdmin: true },
  {
    ...person("p1", ["sales"], COMPANIES.slice(0, 1)),
    isPlatformAdmin: true,
  },
]

const ROLES = [
  {
    id: "admin",
    name: { uk: "Адміністратор", en: "Administrator" },
    permissions: ["users:*", "roles:read", "audit:read", "notes:read"],
  },
  {
    id: "sales",
    name: { uk: "Продажі", en: "Sales" },
    permissions: ["notes:read"],
  },
  {
    id: "hr",
    name: { uk: "Кадри", en: "HR" },
    permissions: ["users:read", "users:update", "notes:read"],
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

const server = setupServer(
  ...createPlatformHandlers({
    users: seed(),
    baseUrl: BASE,
    roles: ROLES,
    permissionResources: {
      notes: { label: { uk: "Нотатки", en: "Notes" } },
      users: {
        label: { uk: "Користувачі", en: "Users" },
        actions: ["read", "create", "update", "impersonate"],
      },
      audit: { label: { uk: "Журнал", en: "Audit" }, actions: ["read"] },
      roles: { label: { uk: "Ролі", en: "Roles" }, actions: ["read"] },
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

const userById = (id: string) => {
  const user = mockUsersList().find((item) => item.id === id)
  if (!user) throw new Error(`no mock user ${id}`)
  return user
}

const companyIdsOf = (id: string) => userById(id).companies.map((c) => c.id)

function seedRoles(value: Record<string, unknown>) {
  localStorage.setItem(USER_ROLES_KEY, JSON.stringify(value))
  applyMockRoles()
}

/** Той, хто діє, у компанії `companyId`, пароль щойно підтверджено. */
async function actAs(id: string, companyId = "c1") {
  signInMock(id)
  setCompanyId(companyId)
  await auth.reauthenticate({ password: PASSWORD })
}

/** Запросити в компанію й повернути токен із листа. */
async function inviteToken(by: string, email: string, companyId: string) {
  const messages: MockMessage[] = []
  const stop = subscribeMockMessages((m) => messages.push(m))
  await actAs(by, companyId)
  await auth.invitations.create({ email, roles: ["sales"] })
  stop()
  const link = (messages.at(-1)?.link ?? "").replace("#/", "")
  return new URL(link).searchParams.get("token") ?? ""
}

const auditOf = async (companyId: string) => {
  signInMock("a1")
  setCompanyId(companyId)
  return (await auth.audit.getEvents({}, 1, 50)).data
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
  setMockUsers(seed())
  applyMockRoles()
  setCompanyId(null)
  auth = createAuthProvider(client, { baseUrl: BASE })
})
afterEach(() => {
  resetScenarios()
  server.resetHandlers()
})

describe("поле canRemove у GET /users/:id/access", () => {
  it("людина ще в іншій компанії: керувати не можна, вилучити можна", async () => {
    signInMock("a6")
    setCompanyId("c1")
    expect(await auth.admin.getUserAccess("u9")).toMatchObject({
      canManage: false,
      canRemove: true,
    })
  })

  it("сильніша, сам, адміністратор платформи: не можна", async () => {
    signInMock("a1")
    setCompanyId("c1")
    expect((await auth.admin.getUserAccess("f5")).canRemove).toBe(false)
    expect((await auth.admin.getUserAccess("a1")).canRemove).toBe(false)
    expect((await auth.admin.getUserAccess("p1")).canRemove).toBe(false)
  })

  it("адміністратор платформи в чужій компанії: не можна, як із ролями", async () => {
    signInMock("p0")
    setCompanyId("c1")
    expect(await auth.admin.getUserAccess("u2")).toMatchObject({
      canManage: true,
      canRemove: false,
    })
  })

  it("застосунок без компаній: поля немає, вилучати нема звідки", async () => {
    setMockUsers([person("a1", ["admin"], []), person("u2", ["sales"], [])])
    applyMockRoles()
    signInMock("a1")
    expect((await auth.admin.getUserAccess("u2")).canRemove).toBeUndefined()
    await auth.reauthenticate({ password: PASSWORD })
    expect(await errorOf(auth.admin.removeFromCompany("u2"))).toMatchObject({
      status: 404,
    })
  })
})

describe("вилучення з компанії запиту", () => {
  it("людина лишається в іншій компанії: її ролі й другий крок як були", async () => {
    seedRoles({ u9: { c1: ["sales"], c2: ["finance"] } })
    await actAs("a6")
    await auth.admin.removeFromCompany("u9")

    expect(companyIdsOf("u9")).toEqual(["c2"])
    expect(userById("u9").companyId).toBe("c2")
    expect(await errorOf(auth.admin.getUserAccess("u9"))).toMatchObject({
      status: 404,
    })

    signInMock("a1")
    setCompanyId("c2")
    expect(await auth.admin.getUserAccess("u9")).toMatchObject({
      roles: ["finance"],
      factors: ["totp"],
      status: "active",
    })
  })

  it("ролі в цій компанії зникають, повторний запит — 404", async () => {
    seedRoles({ u9: { c1: ["sales"], c2: ["sales"] } })
    await actAs("a1")
    await auth.admin.removeFromCompany("u9")
    expect(
      JSON.parse(localStorage.getItem(USER_ROLES_KEY) ?? "{}"),
    ).toMatchObject({ u9: { c2: ["sales"] } })
    expect(
      Object.keys(
        (
          JSON.parse(localStorage.getItem(USER_ROLES_KEY) ?? "{}") as {
            u9: object
          }
        ).u9,
      ),
    ).toEqual(["c2"])
    expect(await errorOf(auth.admin.removeFromCompany("u9"))).toMatchObject({
      status: 404,
    })
  })

  it("ролі списком діють і далі в решті компаній", async () => {
    seedRoles({ u9: ["sales"] })
    await actAs("a1")
    await auth.admin.removeFromCompany("u9")
    signInMock("a1")
    setCompanyId("c2")
    expect((await auth.admin.getUserAccess("u9")).roles).toEqual(["sales"])
  })

  it("збережена компанія людини переходить на іншу", async () => {
    await actAs("a1")
    await auth.admin.removeFromCompany("u9")

    signInMock("u9")
    setCompanyId("c1")
    auth = createAuthProvider(client, { baseUrl: BASE })
    const me = await auth.getMe()
    expect(me.companies.map((c) => c.id)).toEqual(["c2"])
    expect(getCompanyId()).toBe("c2")
  })

  it("токени API людини зникають лише в цій компанії", async () => {
    const token = (id: string, companyId: string) => ({
      id,
      name: id,
      scopes: [],
      prefix: "erp_",
      createdAt: "2026-10-20T09:00:00.000Z",
      lastUsedAt: null,
      expiresAt: null,
      secret: "secret",
      companyId,
    })
    update(userById("u9"), (state) => {
      state.apiTokens = [token("t1", "c1"), token("t2", "c2")]
    })
    await actAs("a1")
    await auth.admin.removeFromCompany("u9")
    expect(loadState(userById("u9")).apiTokens.map((item) => item.id)).toEqual([
      "t2",
    ])
  })

  it("подія лише в журналі цієї компанії", async () => {
    await actAs("a1")
    await auth.admin.removeFromCompany("u9")
    const action = "users.removed_from_company"
    expect(
      (await auditOf("c1")).filter((event) => event.action === action),
    ).toMatchObject([{ target: { type: "users", id: "u9", name: "u9" } }])
    expect((await auditOf("c2")).map((event) => event.action)).not.toContain(
      action,
    )
  })

  it("вилучення лишається після перезавантаження сторінки", async () => {
    await actAs("a1")
    await auth.admin.removeFromCompany("u9")
    setMockUsers(seed())
    expect(companyIdsOf("u9")).toEqual(["c2"])
    expect(userById("u9").companyId).toBe("c2")
  })

  it("зіпсоване сховище вилучених компаній не ламає моки", () => {
    localStorage.setItem(
      LEFT_KEY,
      JSON.stringify({ u2: "x", u9: [1], m3: ["c2"] }),
    )
    setMockUsers(seed())
    expect(companyIdsOf("u2")).toEqual(["c1"])
    expect(companyIdsOf("u9")).toEqual(["c1", "c2"])
    expect(companyIdsOf("m3")).toEqual([])
    localStorage.setItem(LEFT_KEY, "{зіпсовано")
    expect(() => {
      setMockUsers(seed())
    }).not.toThrow()
  })
})

describe("остання компанія людини: запис лишається без компаній", () => {
  it("вхід працює, компаній, ролей і прав немає", async () => {
    await actAs("a1")
    await auth.admin.removeFromCompany("u2")

    signInMock("u2")
    setCompanyId("c1")
    auth = createAuthProvider(client, { baseUrl: BASE })
    expect(await auth.getMe()).toMatchObject({
      companies: [],
      companyId: null,
      roles: [],
      permissions: [],
    })
    expect(getCompanyId()).toBeNull()
    expect(userById("u2")).toMatchObject({ password: PASSWORD })
  })

  it("друге запрошення приймає той самий запис", async () => {
    await actAs("a1")
    await auth.admin.removeFromCompany("u2")
    const before = mockUsersList().length

    const token = await inviteToken("a1", "u2@zoriana.example", "c1")
    signInMock("u2")
    await auth.joinInvite(token)

    expect(mockUsersList()).toHaveLength(before)
    expect(companyIdsOf("u2")).toEqual(["c1"])
    expect(userById("u2").companyId).toBe("c1")
    expect(await auth.getMe()).toMatchObject({
      roles: ["sales"],
      permissions: ["notes:read"],
    })
    // Після перезавантаження повернення до компанії теж лишається.
    setMockUsers(seed())
    expect(companyIdsOf("u2")).toEqual(["c1"])
    expect(userById("u2").companyId).toBe("c1")
  })

  it("людина, що прийшла запрошенням: після вилучення компанія не вертається", async () => {
    const token = await inviteToken("a1", "new@zoriana.example", "c2")
    signInMock(null)
    await auth.acceptInvite(token, { name: "Нова", password: PASSWORD })
    const added = mockUsersList().find((u) => u.name === "Нова")
    expect(added?.companies.map((c) => c.id)).toEqual(["c2"])

    await actAs("a1", "c2")
    await auth.admin.removeFromCompany(added?.id ?? "")
    setMockUsers(seed())
    expect(mockUsersList().find((u) => u.name === "Нова")?.companies).toEqual(
      [],
    )
  })
})

describe("хто й коли може вилучити", () => {
  it("«стеля» лише в цій компанії: сильніша в іншій не заважає", async () => {
    seedRoles({ u9: { c1: ["sales"], c2: ["platform"] } })
    await actAs("a6")
    await auth.admin.removeFromCompany("u9")
    expect(companyIdsOf("u9")).toEqual(["c2"])
  })

  it("сильніша в цій компанії: 403 до пароля, відмова в журналі", async () => {
    signInMock("a1")
    setCompanyId("c1")
    expect(await errorOf(auth.admin.removeFromCompany("f5"))).toMatchObject({
      status: 403,
      code: "forbidden",
    })
    expect(await auditOf("c1")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "users.removed_from_company",
          result: "failure",
          details: { code: "beyond_ceiling" },
        }),
      ]),
    )
    expect(companyIdsOf("f5")).toEqual(["c1"])
  })

  it("себе — 422, адміністратора платформи — 403, без пароля", async () => {
    signInMock("a1")
    setCompanyId("c1")
    expect(await errorOf(auth.admin.removeFromCompany("a1"))).toMatchObject({
      status: 422,
      fieldErrors: { userId: "invalid" },
    })
    expect(await errorOf(auth.admin.removeFromCompany("p1"))).toMatchObject({
      status: 403,
      code: "forbidden",
    })
  })

  it("людина іншої компанії — 404, без права — 403", async () => {
    signInMock("a6")
    setCompanyId("c1")
    expect(await errorOf(auth.admin.removeFromCompany("m3"))).toMatchObject({
      status: 404,
    })
    signInMock("u2")
    expect(await errorOf(auth.admin.removeFromCompany("u9"))).toMatchObject({
      status: 403,
    })
  })

  it("адміністратор платформи в чужій компанії — 403", async () => {
    await actAs("p0")
    expect(await errorOf(auth.admin.removeFromCompany("u2"))).toMatchObject({
      status: 403,
      code: "forbidden",
    })
    expect(companyIdsOf("u2")).toEqual(["c1"])
  })

  it("пароль просять останнім, після підтвердження дія проходить", async () => {
    signInMock("a1")
    setCompanyId("c1")
    expect(
      isReauthRequired(await errorOf(auth.admin.removeFromCompany("u2"))),
    ).toBe(true)
    expect(companyIdsOf("u2")).toEqual(["c1"])
    await auth.reauthenticate({ password: PASSWORD })
    await auth.admin.removeFromCompany("u2")
    expect(companyIdsOf("u2")).toEqual([])
  })

  it("того, хто ввійшов як людина, вилучили: «Увійти як…» закінчується", async () => {
    await actAs("a1")
    await auth.admin.removeFromCompany("h7")
    writeMockSession({
      id: "s-impersonation",
      userId: "u2",
      stage: "authenticated",
      impersonatorId: "h7",
      impersonationCompanyId: "c1",
      expiresAt: Date.now() + 60_000,
    })
    expect(await errorOf(client.get("/me"))).toMatchObject({ status: 401 })
  })

  it("під «Увійти як…» не можна", async () => {
    await actAs("a1")
    await auth.impersonate("h7", "Перевірка")
    expect(await errorOf(auth.admin.removeFromCompany("u2"))).toMatchObject({
      status: 403,
      code: "impersonation_forbidden",
    })
    expect(companyIdsOf("u2")).toEqual(["c1"])
  })
})

describe("сценарії моків ресурсу users", () => {
  it("conflict — 409 раз на людину, до пароля", async () => {
    setScenario("conflict", "users")
    signInMock("a1")
    setCompanyId("c1")
    expect(await errorOf(auth.admin.removeFromCompany("u2"))).toMatchObject({
      status: 409,
      code: "conflict",
    })
    await auth.reauthenticate({ password: PASSWORD })
    await auth.admin.removeFromCompany("u2")
    expect(companyIdsOf("u2")).toEqual([])
  })

  it("forbidden, error, offline: нічого не змінюють", async () => {
    await actAs("a1")
    setScenario("forbidden", "users")
    expect(await errorOf(auth.admin.removeFromCompany("u2"))).toMatchObject({
      status: 403,
    })
    setScenario("error", "users")
    expect(await errorOf(auth.admin.removeFromCompany("u2"))).toMatchObject({
      status: 500,
    })
    setScenario("offline", "users")
    expect(await errorOf(auth.admin.removeFromCompany("u2"))).toMatchObject({
      status: 0,
    })
    expect(companyIdsOf("u2")).toEqual(["c1"])
  })

  it("empty не заважає дії", async () => {
    setScenario("empty", "users")
    await actAs("a1")
    await auth.admin.removeFromCompany("u2")
    expect(companyIdsOf("u2")).toEqual([])
  })
})
