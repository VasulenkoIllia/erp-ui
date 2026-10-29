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
import { createAuthProvider } from "@/registry/lib/auth"
import { setCompanyId } from "@/registry/lib/company-scope"
import { setMockBlocked } from "@/registry/lib/mock-account"
import { resetScenarios, setScenario } from "@/registry/lib/mock-scenarios"
import { findMockInvitation as storeFind } from "@/registry/lib/mock-invitation-store"
import {
  applyMockRoles,
  findMockInvitation as teamFind,
} from "@/registry/lib/mock-team"
import {
  getMockSession,
  mockUsersList,
  writeMockSession,
} from "@/registry/lib/mock-server"
import {
  createPlatformHandlers,
  signInMock,
  subscribeMockMessages,
  type MockMessage,
  type MockUser,
} from "@/registry/lib/mocks"

/**
 * Крок A2b2b2b: права того, хто запросив, у момент прийняття (410, як прострочене), повтор — від
 * імені того, хто повторив, «стеля» на повтор і відкликання (403), сценарії ресурсу `invitations`.
 */
const BASE = "http://erp.test/api/v1"
const USER_ROLES_KEY = "erp-ui:mock-user-roles"
const COMPANY_ROLES_KEY = "erp-ui:mock-company-roles"

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
  password: "demo-password",
  totpCode: "111111",
  roles,
  permissions: [],
  companies,
  companyId: companies[0]?.id ?? null,
  factors: [],
})

const users: MockUser[] = [
  person("a1", ["admin"], COMPANIES),
  // Рівний адміністратор першої компанії.
  person("a6", ["admin"], COMPANIES.slice(0, 1)),
  // Адміністратор із правами на нотатки — сильніший за a1 і a6.
  person("o3", ["admin", "finance"], COMPANIES.slice(0, 1)),
  // Платформа: усі права, але в жодній компанії не працює.
  person("p0", ["platform"], []),
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
  {
    id: "platform",
    name: { uk: "Платформа", en: "Platform" },
    permissions: ["*"],
  },
]

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

/** Запросити від імені `by` і повернути запрошення й токен з листа. */
async function invite(by: string, email: string, roles: string[]) {
  const messages: MockMessage[] = []
  const stop = subscribeMockMessages((m) => messages.push(m))
  signInMock(by)
  const invitation = await auth.invitations.create({ email, roles })
  stop()
  const link = (messages.at(-1)?.link ?? "").replace("#/", "")
  return {
    invitation,
    token: new URL(link).searchParams.get("token") ?? "",
  }
}

/** Ролі людей за компаніями, як після змін адміністраторів (ADR-0033). */
function seedRoles(value: Record<string, Record<string, string[]>>) {
  localStorage.setItem(USER_ROLES_KEY, JSON.stringify(value))
  applyMockRoles()
}

const expired = { status: 410, code: "token_expired" }
const INVITES_KEY = "erp-ui:mock-invitations"
const AUDIT_KEY = "erp-ui:mock-audit"

/** Змінити запрошення в сховищі моку, як сервер між запитами. */
function patchStored(change: (item: Record<string, unknown>) => object) {
  const stored = JSON.parse(
    localStorage.getItem(INVITES_KEY) ?? "[]",
  ) as Record<string, unknown>[]
  localStorage.setItem(INVITES_KEY, JSON.stringify(stored.map(change)))
}

/** Надіслано «дві хвилини тому»: повтор уже не впирається в 429. */
const sentEarlier = () => {
  const lastSentAt = new Date(Date.now() - 120_000).toISOString()
  patchStored((item) => ({ ...item, lastSentAt }))
}

const auditActions = () =>
  (
    JSON.parse(localStorage.getItem(AUDIT_KEY) ?? "[]") as {
      action: string
      details?: Record<string, unknown>
    }[]
  ).filter((event) => event.action === "users.invitation_resent")

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
  applyMockRoles()
  setCompanyId(null)
  auth = createAuthProvider(client, { baseUrl: BASE })
})
afterEach(() => {
  server.resetHandlers()
})

describe("права того, хто запросив, у момент прийняття", () => {
  it("права є — перевірка й прийняття проходять", async () => {
    const { token } = await invite("a1", "ok@zoriana.example", ["sales"])
    signInMock(null)
    await expect(auth.getInvite(token)).resolves.toMatchObject({
      email: "ok@zoriana.example",
      invitedBy: "a1",
    })
    await auth.acceptInvite(token, {
      name: "Нова",
      password: "довгий-пароль-2026",
    })
    expect((await auth.getMe()).roles).toEqual(["sales"])
  })

  it("того, хто запросив, понизили в компанії запрошення — 410 і на перевірку, і на прийняття", async () => {
    const { token } = await invite("a1", "demoted@zoriana.example", ["sales"])
    seedRoles({ a1: { c1: ["sales"], c2: ["admin"] } })
    signInMock(null)
    expect(await errorOf(auth.getInvite(token))).toMatchObject(expired)
    // Застарілий `GET /auth/invite` (до 2.0) відповідає так само.
    expect(
      await errorOf(client.get(`/auth/invite?token=${token}`)),
    ).toMatchObject(expired)
    expect(
      await errorOf(
        auth.acceptInvite(token, {
          name: "Нова",
          password: "довгий-пароль-2026",
        }),
      ),
    ).toMatchObject(expired)
  })

  it("того, хто запросив, заблокували — 410", async () => {
    const { token } = await invite("a6", "blocked@zoriana.example", ["sales"])
    setMockBlocked(userById("a6"), { by: "a1", reason: "Звільнення" })
    signInMock(null)
    expect(await errorOf(auth.getInvite(token))).toMatchObject(expired)
  })

  it("роль запрошення стала сильнішою за права того, хто запросив, — 410", async () => {
    const { token } = await invite("a1", "stronger@zoriana.example", ["sales"])
    localStorage.setItem(
      COMPANY_ROLES_KEY,
      JSON.stringify({
        c1: {
          roles: [{ ...ROLES[1], permissions: ["notes:*"] }],
          removed: [],
        },
      }),
    )
    signInMock(null)
    expect(await errorOf(auth.getInvite(token))).toMatchObject(expired)
  })

  it("роль запрошення видалили в компанії — 410; відкликати можна, повтор — 422", async () => {
    signInMock("a1")
    setCompanyId("c1")
    const extra = await auth.roles.create({
      name: "Тимчасова",
      permissions: ["notes:read"],
    })
    const { invitation, token } = await invite(
      "a1",
      "vanished@zoriana.example",
      [extra.id],
    )
    await auth.roles.remove(extra.id)
    expect(await errorOf(auth.invitations.resend(invitation.id))).toMatchObject(
      { status: 422, fieldErrors: { roles: "invalid" } },
    )
    await auth.invitations.revoke(invitation.id)
    signInMock(null)
    expect(await errorOf(auth.getInvite(token))).toMatchObject(expired)
  })

  it("після повтору запрошення — того, хто повторив: його права при прийнятті", async () => {
    const { invitation, token } = await invite("a1", "again@zoriana.example", [
      "sales",
    ])
    // Повтор частіше ніж раз на хвилину — 429: запрошення надіслано «дві хвилини тому».
    sentEarlier()
    signInMock("a6")
    setCompanyId("c1")
    expect(await auth.invitations.resend(invitation.id)).toMatchObject({
      invitedBy: "a6",
    })
    // У журналі видно, чиїми правами запрошення діяло раніше.
    expect(auditActions()).toMatchObject([
      { details: { previousInviter: "a1" } },
    ])
    expect((await auth.invitations.list())[0]).toMatchObject({
      invitedBy: "a6",
    })
    // Того, хто запросив першим, понизили — запрошення живе правами a6.
    seedRoles({ a1: { c1: ["sales"], c2: ["admin"] } })
    signInMock(null)
    await expect(auth.getInvite(token)).resolves.toMatchObject({
      invitedBy: "a6",
    })
    // Понизили й a6 — тепер 410.
    seedRoles({ a1: { c1: ["sales"] }, a6: { c1: ["sales"] } })
    expect(await errorOf(auth.getInvite(token))).toMatchObject(expired)
  })
})

describe("той, хто запросив, зник чи не працює в компанії запрошення", () => {
  it("облікового запису автора немає — 410", async () => {
    const { token } = await invite("a1", "ghost@zoriana.example", ["sales"])
    patchStored((item) => ({ ...item, invitedById: "ghost" }))
    signInMock(null)
    expect(await errorOf(auth.getInvite(token))).toMatchObject(expired)
  })

  it("автор не працює в компанії запрошення — 410", async () => {
    const { token } = await invite("a6", "moved@zoriana.example", ["sales"])
    // a6 працює лише в c1; роль «Продажі» є і в c2 — відмова саме через членство.
    patchStored((item) => ({
      ...item,
      companyId: "c2",
      companies: [COMPANIES[1]],
    }))
    signInMock(null)
    expect(await errorOf(auth.getInvite(token))).toMatchObject(expired)
  })

  it("старий імпорт з lib/mock-team — та сама функція сховища", () => {
    expect(teamFind).toBe(storeFind)
  })
})

describe("«стеля» на повтор і відкликання", () => {
  it("запрошення з роллю понад свої права — 403, раніше за частоту повтору", async () => {
    const { invitation } = await invite("o3", "finance@zoriana.example", [
      "finance",
    ])
    signInMock("a1")
    setCompanyId("c1")
    for (const action of [
      () => auth.invitations.resend(invitation.id),
      () => auth.invitations.revoke(invitation.id),
    ])
      expect(await errorOf(action())).toMatchObject({
        status: 403,
        code: "forbidden",
      })
    // Відмова нічого не змінила: автор той самий, у журналі повтору немає.
    expect((await auth.invitations.list())[0]).toMatchObject({
      invitedBy: "o3",
    })
    expect(auditActions()).toEqual([])
    // Той, хто має ці права, — як раніше: повтор лише раз на хвилину, відкликання проходить.
    signInMock("o3")
    expect(await errorOf(auth.invitations.resend(invitation.id))).toMatchObject(
      { status: 429 },
    )
    await auth.invitations.revoke(invitation.id)
    expect(await auth.invitations.list()).toEqual([])
  })
})

describe("компанія запиту й «Увійти як…»", () => {
  it("запрошення іншої компанії — 404 раніше за «стелю»; невідоме — 404", async () => {
    const { invitation } = await invite("o3", "other@zoriana.example", [
      "finance",
    ])
    // a1 працює в обох компаніях; у c2 запрошення з c1 для нього не існує.
    signInMock("a1")
    setCompanyId("c2")
    for (const action of [
      () => auth.invitations.resend(invitation.id),
      () => auth.invitations.revoke(invitation.id),
    ])
      expect(await errorOf(action())).toMatchObject({ status: 404 })
    setCompanyId("c1")
    expect(await errorOf(auth.invitations.revoke("inv-unknown"))).toMatchObject(
      { status: 404 },
    )
  })

  it("платформа з `*` не повторює й не відкликає запрошення компанії, де не працює, — 403", async () => {
    const { invitation } = await invite("a1", "foreign@zoriana.example", [
      "sales",
    ])
    sentEarlier()
    signInMock("p0")
    setCompanyId("c1")
    for (const action of [
      () => auth.invitations.list(),
      () => auth.invitations.resend(invitation.id),
      () => auth.invitations.revoke(invitation.id),
    ])
      expect(await errorOf(action())).toMatchObject({ status: 403 })
    signInMock("a1")
    expect(await auth.invitations.list()).toHaveLength(1)
  })

  it("під «Увійти як…» — лише перегляд: надіслати, повторити й відкликати — 403", async () => {
    const { invitation } = await invite("a1", "imp@zoriana.example", ["sales"])
    sentEarlier()
    signInMock("a6")
    const session = getMockSession()
    if (!session) throw new Error("no mock session")
    writeMockSession({
      ...session,
      impersonatorId: "a1",
      impersonationCompanyId: "c1",
    })
    setCompanyId("c1")
    expect(await auth.invitations.list()).toHaveLength(1)
    for (const action of [
      () =>
        auth.invitations.create({
          email: "next@zoriana.example",
          roles: ["sales"],
        }),
      () => auth.invitations.resend(invitation.id),
      () => auth.invitations.revoke(invitation.id),
    ])
      expect(await errorOf(action())).toMatchObject({
        status: 403,
        code: "impersonation_forbidden",
      })
  })
})

describe("тіло запиту й порядок відповідей", () => {
  it("поля не тих типів — 422 біля полів, а не 500", async () => {
    signInMock("a1")
    setCompanyId("c1")
    expect(
      await errorOf(
        client.post("/invitations", { email: 5, roles: "sales", name: {} }),
      ),
    ).toMatchObject({
      status: 422,
      fieldErrors: { email: "required", roles: "required" },
    })
    expect(
      await errorOf(
        client.post("/invitations", {
          email: "typed@zoriana.example",
          roles: ["sales", 7],
        }),
      ),
    ).toMatchObject({ status: 422, fieldErrors: { roles: "invalid" } })
    // Зіпсований JSON — теж 422, а не 500.
    const broken = await fetch(`${BASE}/invitations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Company-Id": "c1" },
      body: "{",
    })
    expect(broken.status).toBe(422)
  })

  it("нове запрошення замінює прострочене лише в своїй компанії", async () => {
    signInMock("a1")
    setCompanyId("c2")
    await auth.invitations.create({
      email: "twice@zoriana.example",
      roles: ["sales"],
    })
    patchStored((item) => ({
      ...item,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    }))
    setCompanyId("c1")
    await auth.invitations.create({
      email: "twice@zoriana.example",
      roles: ["sales"],
    })
    const stored = JSON.parse(localStorage.getItem(INVITES_KEY) ?? "[]") as {
      companyId: string
    }[]
    expect(stored.map((item) => item.companyId).sort()).toEqual(["c1", "c2"])
  })

  it("зникла роль — 422 раніше за conflict; conflict — раніше за частоту повтору", async () => {
    signInMock("a1")
    setCompanyId("c1")
    const extra = await auth.roles.create({
      name: "Тимчасова",
      permissions: ["notes:read"],
    })
    const gone = await auth.invitations.create({
      email: "gone@zoriana.example",
      roles: [extra.id],
    })
    const fresh = await auth.invitations.create({
      email: "fresh@zoriana.example",
      roles: ["sales"],
    })
    await auth.roles.remove(extra.id)
    setScenario("conflict", "invitations")
    expect(await errorOf(auth.invitations.resend(gone.id))).toMatchObject({
      status: 422,
    })
    // Щойно надіслане: спершу 409 сценарію, потім 429 частоти.
    expect(await errorOf(auth.invitations.resend(fresh.id))).toMatchObject({
      status: 409,
    })
    expect(await errorOf(auth.invitations.resend(fresh.id))).toMatchObject({
      status: 429,
    })
  })

  it("повтор тим самим автором — подія журналу без «Надсилав раніше»", async () => {
    const { invitation } = await invite("a1", "same@zoriana.example", ["sales"])
    sentEarlier()
    setCompanyId("c1")
    await auth.invitations.resend(invitation.id)
    expect(auditActions()).toHaveLength(1)
    expect(auditActions()[0]?.details).toBeUndefined()
  })
})

describe("сценарії ресурсу invitations", () => {
  it("empty, error, forbidden, offline — для списку", async () => {
    await invite("a1", "listed@zoriana.example", ["sales"])
    setCompanyId("c1")
    setScenario("empty", "invitations")
    expect(await auth.invitations.list()).toEqual([])
    setScenario("error", "invitations")
    expect(await errorOf(auth.invitations.list())).toMatchObject({
      status: 500,
    })
    setScenario("forbidden", "invitations")
    expect(await errorOf(auth.invitations.list())).toMatchObject({
      status: 403,
    })
    setScenario("offline", "invitations")
    expect(await errorOf(auth.invitations.list())).toMatchObject({
      status: 0,
    })
    setScenario("success", "invitations")
    expect(await auth.invitations.list()).toHaveLength(1)
  })

  it("error і forbidden — і для надсилання, повтору й відкликання", async () => {
    const { invitation } = await invite("a1", "acts@zoriana.example", ["sales"])
    sentEarlier()
    setCompanyId("c1")
    const actions = [
      () =>
        auth.invitations.create({
          email: "more@zoriana.example",
          roles: ["sales"],
        }),
      () => auth.invitations.resend(invitation.id),
      () => auth.invitations.revoke(invitation.id),
    ]
    for (const [scenario, status] of [
      ["error", 500],
      ["forbidden", 403],
    ] as const) {
      setScenario(scenario, "invitations")
      for (const action of actions)
        expect(await errorOf(action())).toMatchObject({ status })
    }
    setScenario("success", "invitations")
    expect(await auth.invitations.list()).toHaveLength(1)
  })

  it("conflict — перший повтор чи відкликання кожного запрошення — 409, далі як звичайно", async () => {
    const { invitation } = await invite("a1", "conflict@zoriana.example", [
      "sales",
    ])
    setCompanyId("c1")
    setScenario("conflict", "invitations")
    expect(await errorOf(auth.invitations.revoke(invitation.id))).toMatchObject(
      { status: 409, code: "conflict" },
    )
    // Те саме запрошення вже «змінилось»: далі — частота повтору й відкликання як звичайно.
    expect(await errorOf(auth.invitations.resend(invitation.id))).toMatchObject(
      { status: 429 },
    )
    // Інший сценарій — і наступний `conflict` знову починає з 409.
    setScenario("success", "invitations")
    await auth.invitations.list()
    setScenario("conflict", "invitations")
    expect(await errorOf(auth.invitations.revoke(invitation.id))).toMatchObject(
      { status: 409 },
    )
    await auth.invitations.revoke(invitation.id)
    expect(await auth.invitations.list()).toEqual([])
  })
})
