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
import { createAuthProvider, inviteSchema } from "@/registry/lib/auth"
import { getCompanyId, setCompanyId } from "@/registry/lib/company-scope"
import { resetScenarios } from "@/registry/lib/mock-scenarios"
import {
  getMockSession,
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
 * Крок A2c3 (ADR-0040): «зайнята» й «запрошена» адреса лише в компанії запиту, прийняття запрошення
 * обліковим записом, що вже є, пароль ще раз перед запрошенням і зміною прав ролі, останньою
 * перевіркою.
 */
const BASE = "http://erp.test/api/v1"
const INVITES_KEY = "erp-ui:mock-invitations"
const PASSWORD = "demo-password"

const COMPANIES = [
  { id: "c1", name: "ТОВ «Тест»" },
  { id: "c2", name: "ФОП Тестенко" },
]

const person = (
  id: string,
  roles: string[],
  companies: MockUser["companies"],
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
  factors: [],
})

const seed = (): MockUser[] => [
  person("a1", ["admin"], COMPANIES),
  person("a6", ["admin"], COMPANIES.slice(0, 1)),
  person("s1", ["sales"], COMPANIES.slice(0, 1)),
  // Працює лише в другій компанії: для першої це чужа адреса.
  person("o2", ["sales"], COMPANIES.slice(1)),
  person("f5", ["finance"], COMPANIES.slice(0, 1)),
]

const ROLES = [
  {
    id: "admin",
    name: { uk: "Адміністратор", en: "Administrator" },
    permissions: ["users:*", "roles:*", "notes:read"],
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
      roles: {
        label: { uk: "Ролі", en: "Roles" },
        actions: ["read", "update"],
      },
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

async function confirmed(id: string) {
  signInMock(id)
  await auth.reauthenticate({ password: PASSWORD })
}

/** Запросити в компанію `companyId` і повернути запрошення й токен з листа. */
async function invite(by: string, email: string, companyId: string) {
  const messages: MockMessage[] = []
  const stop = subscribeMockMessages((m) => messages.push(m))
  await confirmed(by)
  setCompanyId(companyId)
  const invitation = await auth.invitations.create({ email, roles: ["sales"] })
  stop()
  const link = (messages.at(-1)?.link ?? "").replace("#/", "")
  signInMock(null)
  setCompanyId(null)
  return { invitation, token: new URL(link).searchParams.get("token") ?? "" }
}

const stored = () =>
  JSON.parse(localStorage.getItem(INVITES_KEY) ?? "[]") as {
    id: string
    token: string
    lastSentAt: string
  }[]

const expired = { status: 410, code: "token_expired" }
const reauthRequired = { status: 403, code: "reauth_required" }

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" })
})
afterAll(() => {
  server.close()
})
beforeEach(() => {
  signInMock(null)
  localStorage.clear()
  resetScenarios()
  setMockUsers(seed())
  applyMockRoles()
  setCompanyId(null)
  auth = createAuthProvider(client, { baseUrl: BASE })
})
afterEach(() => {
  server.resetHandlers()
})

describe("адреса в межах компанії запиту", () => {
  it("людина іншої компанії — запрошення, як на нову адресу, без `taken`", async () => {
    await confirmed("a1")
    setCompanyId("c1")
    await expect(
      auth.invitations.create({
        email: "o2@zoriana.example",
        roles: ["sales"],
      }),
    ).resolves.toMatchObject({ email: "o2@zoriana.example", status: "pending" })
  })

  it("людина цієї компанії — `taken`, регістр адреси не важливий", async () => {
    await confirmed("a1")
    setCompanyId("c1")
    expect(
      await errorOf(
        auth.invitations.create({
          email: "S1@Zoriana.example",
          roles: ["sales"],
        }),
      ),
    ).toMatchObject({ fieldErrors: { email: "taken" } })
  })

  it("запрошена в іншій компанії — не `invited`, у цій — `invited`", async () => {
    await invite("a1", "both@zoriana.example", "c1")
    await confirmed("a1")
    setCompanyId("c2")
    await expect(
      auth.invitations.create({
        email: "both@zoriana.example",
        roles: ["sales"],
      }),
    ).resolves.toMatchObject({ status: "pending" })
    expect(
      await errorOf(
        auth.invitations.create({
          email: "both@zoriana.example",
          roles: ["sales"],
        }),
      ),
    ).toMatchObject({ fieldErrors: { email: "invited" } })
    expect(stored()).toHaveLength(2)
  })
})

describe("прийняття обліковим записом, що вже є", () => {
  it("перевірка каже, хто відкрив посилання", async () => {
    const { token } = await invite("a1", "o2@zoriana.example", "c1")
    const fresh = await invite("a1", "new@zoriana.example", "c1")
    await expect(auth.getInvite(fresh.token)).resolves.toMatchObject({
      account: "new",
    })
    await expect(auth.getInvite(token)).resolves.toMatchObject({
      account: "existing",
    })
    signInMock("o2")
    await expect(auth.getInvite(token)).resolves.toMatchObject({
      account: "current",
    })
    signInMock("s1")
    await expect(auth.getInvite(token)).resolves.toMatchObject({
      account: "other",
    })
  })

  it("прийнято: нова компанія поточна, ролі лише в ній, стара компанія як була", async () => {
    const { invitation, token } = await invite("a1", "o2@zoriana.example", "c1")
    signInMock("o2")
    await auth.joinInvite(token)
    expect(getCompanyId()).toBe("c1")
    expect(userById("o2").companies.map((c) => c.id)).toEqual(["c2", "c1"])
    expect(await auth.getMe()).toMatchObject({ roles: ["sales"] })
    expect(stored().map((item) => item.id)).not.toContain(invitation.id)
    expect(await errorOf(auth.getInvite(token))).toMatchObject(expired)
    expect(
      mockUsersList().filter((u) => u.email === userById("o2").email),
    ).toHaveLength(1)
    await confirmed("a1")
    setCompanyId("c1")
    expect(
      (await auth.admin.getUserAccess("o2")).roles,
      "ролі в компанії запрошення",
    ).toEqual(["sales"])
  })

  it("адреса з цифрами чужого телефону — нова адреса, а не той запис", async () => {
    userById("s1").phone = "+380 50 123 45 67"
    const { token } = await invite("a1", "380501234567@x.example", "c1")
    signInMock("s1")
    await expect(auth.getInvite(token)).resolves.toMatchObject({
      account: "other",
    })
    signInMock(null)
    await expect(auth.getInvite(token)).resolves.toMatchObject({
      account: "new",
    })
  })

  it("під «Увійти як…» запрошення нової адреси не приймається", async () => {
    const { token } = await invite("a1", "new@zoriana.example", "c1")
    signInMock("s1")
    const session = getMockSession()
    if (!session) throw new Error("no mock session")
    writeMockSession({ ...session, impersonatorId: "a1" })
    expect(
      await errorOf(
        auth.acceptInvite(token, {
          name: "Нова колега",
          password: "мій-перший-пароль-тут",
        }),
      ),
    ).toMatchObject({ status: 403, code: "impersonation_forbidden" })
  })

  it("сервер новішої версії: невідоме значення account — форма нової людини", () => {
    expect(
      inviteSchema.parse({
        email: "a@b.c",
        companyName: "ТОВ",
        account: "suspended",
      }).account,
    ).toBeUndefined()
  })

  it("зіпсоване сховище приєднаних компаній не ламає моки", () => {
    localStorage.setItem(
      "erp-ui:mock-joined-companies:v1",
      JSON.stringify({
        o2: "x",
        s1: [null],
        a6: [{ id: "c2", name: "ФОП Тестенко" }],
      }),
    )
    setMockUsers(seed())
    expect(userById("o2").companies.map((c) => c.id)).toEqual(["c2"])
    expect(userById("s1").companies.map((c) => c.id)).toEqual(["c1"])
    expect(userById("a6").companies.map((c) => c.id)).toEqual(["c1", "c2"])
    localStorage.setItem("erp-ui:mock-joined-companies:v1", "[1]")
    expect(() => {
      setMockUsers(seed())
    }).not.toThrow()
  })

  it("нова компанія лишається після перезавантаження сторінки", async () => {
    const { token } = await invite("a1", "o2@zoriana.example", "c1")
    signInMock("o2")
    await auth.joinInvite(token)
    setMockUsers(seed())
    expect(userById("o2").companies.map((c) => c.id)).toEqual(["c2", "c1"])
  })

  it("гість із новим паролем — 409: другого запису немає, пароль той самий", async () => {
    const { token } = await invite("a1", "o2@zoriana.example", "c1")
    const before = mockUsersList().length
    expect(
      await errorOf(
        auth.acceptInvite(token, {
          name: "Самозванець",
          password: "довгий-пароль-2026",
        }),
      ),
    ).toMatchObject({ status: 409 })
    expect(mockUsersList()).toHaveLength(before)
    expect(userById("o2").password).toBe(PASSWORD)
    expect(userById("o2").companies.map((c) => c.id)).toEqual(["c2"])
    await expect(auth.getInvite(token)).resolves.toMatchObject({
      account: "existing",
    })
  })

  it("інший обліковий запис — 409, запрошення лишається", async () => {
    const { token } = await invite("a1", "o2@zoriana.example", "c1")
    signInMock("s1")
    expect(await errorOf(auth.joinInvite(token))).toMatchObject({
      status: 409,
    })
    expect(stored()).toHaveLength(1)
  })

  it("під «Увійти як…» не приймається, перевірка — `other`", async () => {
    const { token } = await invite("a1", "o2@zoriana.example", "c1")
    signInMock("o2")
    const session = getMockSession()
    if (!session) throw new Error("no mock session")
    writeMockSession({ ...session, impersonatorId: "a1" })
    await expect(auth.getInvite(token)).resolves.toMatchObject({
      account: "other",
    })
    expect(await errorOf(auth.joinInvite(token))).toMatchObject({
      status: 403,
      code: "impersonation_forbidden",
    })
  })

  it("людина вже в компанії запрошення — 410", async () => {
    const { token } = await invite("a1", "later@zoriana.example", "c1")
    userById("a6").email = "later@zoriana.example"
    expect(await errorOf(auth.getInvite(token))).toMatchObject(expired)
    signInMock("a6")
    expect(await errorOf(auth.joinInvite(token))).toMatchObject(expired)
  })

  it("нова адреса — як було: без імені 422, з іменем новий обліковий запис", async () => {
    const { token } = await invite("a1", "new@zoriana.example", "c1")
    expect(await errorOf(auth.joinInvite(token))).toMatchObject({
      fieldErrors: { name: "required" },
    })
    await auth.acceptInvite(token, {
      name: "Нова",
      password: "довгий-пароль-2026",
    })
    expect(await auth.getMe()).toMatchObject({ email: "new@zoriana.example" })
  })
})

describe("пароль ще раз", () => {
  it("надіслати: без підтвердження — 403, лист не пішов; після — надіслано", async () => {
    const messages: MockMessage[] = []
    const stop = subscribeMockMessages((m) => messages.push(m))
    signInMock("a1")
    setCompanyId("c1")
    const input = { email: "pass@zoriana.example", roles: ["sales"] }
    expect(await errorOf(auth.invitations.create(input))).toMatchObject(
      reauthRequired,
    )
    expect(messages).toEqual([])
    expect(stored()).toEqual([])
    await auth.reauthenticate({ password: PASSWORD })
    await expect(auth.invitations.create(input)).resolves.toMatchObject({
      status: "pending",
    })
    stop()
    expect(messages).toHaveLength(1)
  })

  it("надіслати ще раз: без підтвердження — 403, термін не змінився", async () => {
    const { invitation } = await invite("a1", "again@zoriana.example", "c1")
    const lastSentAt = new Date(Date.now() - 120_000).toISOString()
    localStorage.setItem(
      INVITES_KEY,
      JSON.stringify(stored().map((item) => ({ ...item, lastSentAt }))),
    )
    signInMock("a1")
    setCompanyId("c1")
    expect(await errorOf(auth.invitations.resend(invitation.id))).toMatchObject(
      reauthRequired,
    )
    expect(stored()[0]?.lastSentAt).toBe(lastSentAt)
    await auth.reauthenticate({ password: PASSWORD })
    await expect(auth.invitations.resend(invitation.id)).resolves.toBeDefined()
  })

  it("кому відмовлять, пароль не просять: 422, «стеля», частота повтору", async () => {
    const { invitation } = await invite("a1", "rate@zoriana.example", "c1")
    signInMock("a1")
    setCompanyId("c1")
    expect(
      await errorOf(auth.invitations.create({ email: "", roles: [] })),
    ).toMatchObject({ status: 422 })
    expect(
      await errorOf(
        auth.invitations.create({
          email: "strong@zoriana.example",
          roles: ["finance"],
        }),
      ),
    ).toMatchObject({ status: 403, code: "forbidden" })
    expect(await errorOf(auth.invitations.resend(invitation.id))).toMatchObject(
      { status: 429 },
    )
  })

  it("призначення ролей: «стеля» раніше за пароль, у межах — пароль", async () => {
    signInMock("a1")
    setCompanyId("c1")
    expect(
      await errorOf(auth.roles.setUserRoles("s1", ["finance"])),
    ).toMatchObject({ status: 403, code: "forbidden" })
    expect(
      await errorOf(auth.roles.setUserRoles("s1", ["admin"])),
    ).toMatchObject(reauthRequired)
  })

  it("роль: пароль лише коли змінюються права", async () => {
    signInMock("a1")
    setCompanyId("c1")
    const role = await auth.roles.create({
      name: "Склад",
      permissions: ["notes:read"],
    })
    await expect(
      auth.roles.update(role.id, { name: "Комора" }),
    ).resolves.toMatchObject({ name: "Комора" })
    await expect(
      auth.roles.update(role.id, {
        name: "Комора",
        permissions: ["notes:read"],
      }),
    ).resolves.toBeDefined()
    expect(
      await errorOf(auth.roles.update(role.id, { permissions: [] })),
    ).toMatchObject(reauthRequired)
    await auth.reauthenticate({ password: PASSWORD })
    await expect(
      auth.roles.update(role.id, { permissions: [] }),
    ).resolves.toMatchObject({ permissions: [] })
    await expect(auth.roles.remove(role.id)).resolves.toBeUndefined()
  })
})

describe("токен запрошення", () => {
  it("256 біт випадковості", async () => {
    const { token } = await invite("a1", "bits@zoriana.example", "c1")
    expect(token).toMatch(/^[0-9a-f]{64}$/)
  })
})
