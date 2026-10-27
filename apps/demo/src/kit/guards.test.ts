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
  vi,
} from "vitest"

import { createApiClient } from "@/registry/lib/api"
import { createAuthProvider, isChallengeRequired } from "@/registry/lib/auth"
import { setCompanyId } from "@/registry/lib/company-scope"
import { applyMockRoles } from "@/registry/lib/mock-team"
import {
  createPlatformHandlers,
  signInMock,
  subscribeMockMessages,
  type MockMessage,
  type MockUser,
} from "@/registry/lib/mocks"
import {
  canChangePermissions,
  canChangeRoles,
  canGrant,
  coversPermission,
  impersonationBlock,
  permissionsOfRoles,
  type PermissionResource,
} from "@/registry/lib/roles"

/**
 * Крок A2b2a (ADR-0032): «стеля» ролей, ціль дії — лише людина компанії запиту, «Увійти як…» не в
 * сильнішого, перевірка запрошення `POST` з токеном у тілі й запасним `GET` для старого сервера.
 */
const BASE = "http://erp.test/api/v1"

const COMPANIES = [
  { id: "c1", name: "ТОВ «Тест»" },
  { id: "c2", name: "ФОП Тестенко" },
]

const person = (
  id: string,
  name: string,
  roles: string[],
  companies: MockUser["companies"],
): MockUser => ({
  id,
  name,
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
  // Адміністратор обох компаній без `*`: людей, ролі й нотатки — лише читати.
  person("a1", "Марта Бойко", ["admin"], COMPANIES),
  person("u2", "Іван Петренко", ["sales"], COMPANIES.slice(0, 1)),
  // Лише друга компанія; з другим кроком — для запиту на відновлення.
  {
    ...person("u3", "Ольга Друга", ["sales"], COMPANIES.slice(1)),
    factors: ["totp"],
  },
  person("o4", "Петро Власник", ["owner"], COMPANIES.slice(0, 1)),
  // Права на нотатки ширші, ніж в адміністратора.
  person("f5", "Ганна Фінанси", ["finance"], COMPANIES.slice(0, 1)),
  // Адміністратор лише першої компанії.
  person("a6", "Остап Перший", ["admin"], COMPANIES.slice(0, 1)),
  // Застосунок без компаній: одна команда людей без компаній.
  person("n7", "Ніна Без Компанії", ["sales"], []),
  person("n8", "Назар Адмін", ["admin"], []),
]

const ADMIN_PERMISSIONS = ["users:*", "roles:*", "audit:read", "notes:read"]

const ROLES = [
  {
    id: "owner",
    name: { uk: "Власник", en: "Owner" },
    system: true,
    permissions: ["*"],
  },
  {
    id: "admin",
    name: { uk: "Адміністратор", en: "Administrator" },
    permissions: ADMIN_PERMISSIONS,
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
    users,
    baseUrl: BASE,
    linkUrl: (kind, token) => `http://demo.test/#/login/${kind}?token=${token}`,
    roles: ROLES,
    permissionResources: {
      notes: { label: { uk: "Нотатки", en: "Notes" } },
      users: {
        label: { uk: "Користувачі", en: "Users" },
        actions: ["read", "create", "update", "delete", "impersonate"],
      },
      roles: {
        label: { uk: "Ролі", en: "Roles" },
        actions: ["read", "update"],
      },
      audit: { label: { uk: "Аудит", en: "Audit" }, actions: ["read"] },
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

async function asAdmin() {
  signInMock("a1")
  await auth.reauthenticate({ password: "demo-password" })
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
  vi.restoreAllMocks()
})

/* --------------------------------- Стеля --------------------------------- */

const notes: PermissionResource = {
  id: "notes",
  label: "Нотатки",
  actions: [
    { id: "read", label: "Перегляд" },
    { id: "update", label: "Зміна" },
  ],
}

describe("«стеля»: чисті правила (ADR-0032)", () => {
  it("coversPermission і canGrant: `*` — лише `*`, `<ресурс>:*` — `*` чи `<ресурс>:*`", () => {
    expect(coversPermission(["notes:*"], "notes:read")).toBe(true)
    expect(coversPermission(["notes:*"], "notes:*")).toBe(true)
    expect(coversPermission(["notes:read", "notes:update"], "notes:*")).toBe(
      false,
    )
    expect(coversPermission(["notes:*"], "*")).toBe(false)
    expect(coversPermission(["*"], "*")).toBe(true)
    expect(canGrant(ADMIN_PERMISSIONS, ["users:read", "notes:read"])).toBe(true)
    expect(canGrant(ADMIN_PERMISSIONS, ["notes:update"])).toBe(false)
    expect(canGrant(ADMIN_PERMISSIONS, [])).toBe(true)
  })

  it("canChangePermissions: лише дії, які має той, хто змінює; `*` — лише з `*`", () => {
    const own = ["notes:read"]
    expect(canChangePermissions(own, [], ["notes:read"], [notes])).toBe(true)
    expect(canChangePermissions(own, [], ["notes:update"], [notes])).toBe(false)
    // Чуже право лишилось як було — змінювати інше можна.
    expect(
      canChangePermissions(own, ["notes:update"], ["notes:*"], [notes]),
    ).toBe(true)
    expect(canChangePermissions(own, ["notes:update"], [], [notes])).toBe(false)
    expect(canChangePermissions(["notes:*"], [], ["*"], [notes])).toBe(false)
    expect(canChangePermissions(["*"], [], ["*"], [notes])).toBe(true)
    // Право поза каталогом — рядком: чуже не дати й не прибрати, своє — можна.
    expect(canChangePermissions(own, [], ["reports:read"], [notes])).toBe(false)
    expect(canChangePermissions(own, ["reports:read"], [], [notes])).toBe(false)
    expect(
      canChangePermissions(["reports:*"], [], ["reports:read"], [notes]),
    ).toBe(true)
  })

  it("canChangeRoles: роль, сильнішу за свою, не дати й не забрати; невідома — поза межами", () => {
    const roles = ROLES.map(({ id, permissions }) => ({ id, permissions }))
    expect(canChangeRoles(ADMIN_PERMISSIONS, ["admin"], ["sales"], roles)).toBe(
      true,
    )
    expect(canChangeRoles(ADMIN_PERMISSIONS, [], ["finance"], roles)).toBe(
      false,
    )
    expect(canChangeRoles(ADMIN_PERMISSIONS, ["owner"], ["sales"], roles)).toBe(
      false,
    )
    expect(
      canChangeRoles(ADMIN_PERMISSIONS, ["owner"], ["owner", "sales"], roles),
    ).toBe(true)
    expect(canChangeRoles(ADMIN_PERMISSIONS, [], ["nope"], roles)).toBe(false)
  })

  it("permissionsOfRoles і impersonationBlock", () => {
    const roles = ROLES.map(({ id, permissions }) => ({ id, permissions }))
    expect(permissionsOfRoles(["sales", "finance", "nope"], roles)).toEqual([
      "notes:read",
      "notes:*",
    ])
    expect(impersonationBlock(ADMIN_PERMISSIONS, ["notes:read"])).toBeNull()
    expect(impersonationBlock(ADMIN_PERMISSIONS, ["notes:*"])).toBe("ceiling")
    expect(impersonationBlock(ADMIN_PERMISSIONS, ["*"])).toBe("administrator")
    expect(impersonationBlock(["*"], ["users:impersonate"])).toBe(
      "administrator",
    )
  })
})

describe("«стеля» в моках (ADR-0032)", () => {
  it("ролі людини: не дати й не забрати сильнішу роль, свою — можна", async () => {
    await asAdmin()
    expect(
      await errorOf(auth.roles.setUserRoles("u2", ["sales", "finance"])),
    ).toMatchObject({ status: 403, code: "forbidden" })
    expect(
      await errorOf(auth.roles.setUserRoles("o4", ["sales"])),
    ).toMatchObject({ status: 403 })
    await auth.roles.setUserRoles("u2", ["admin"])
    expect((await auth.admin.getUserAccess("u2")).roles).toEqual(["admin"])
  })

  it("права ролі: нова й зміна — лише свої права, видалити сильнішу — ні", async () => {
    signInMock("a1")
    expect(
      await errorOf(
        auth.roles.create({ name: "Нотатки+", permissions: ["notes:*"] }),
      ),
    ).toMatchObject({ status: 403 })
    for (const permissions of [["__proto__:read"], ["notes:read:x"]])
      expect(
        await errorOf(auth.roles.create({ name: "Дивні", permissions })),
      ).toMatchObject({ status: 422, fieldErrors: { permissions: "invalid" } })
    const role = await auth.roles.create({
      name: "Читачі",
      permissions: ["notes:read"],
    })
    // Сильнішу роль не змінити зовсім: ні права, ні назву («Переглядач» з усіма правами).
    expect(
      await errorOf(auth.roles.update("finance", { name: "Переглядач" })),
    ).toMatchObject({ status: 403, code: "forbidden" })
    expect(
      await errorOf(
        auth.roles.update("finance", { permissions: ["notes:read"] }),
      ),
    ).toMatchObject({ status: 403 })
    expect(
      await errorOf(auth.roles.update("sales", { permissions: ["*"] })),
    ).toMatchObject({ status: 403 })
    expect(await errorOf(auth.roles.remove("finance"))).toMatchObject({
      status: 403,
    })
    await auth.roles.remove(role.id)
  })

  it("запрошення: лише ролі в межах своїх прав", async () => {
    signInMock("a1")
    expect(
      await errorOf(
        auth.invitations.create({
          email: "new@zoriana.example",
          roles: ["owner"],
        }),
      ),
    ).toMatchObject({ status: 403 })
    await expect(
      auth.invitations.create({
        email: "new@zoriana.example",
        roles: ["sales"],
      }),
    ).resolves.toMatchObject({ roles: ["sales"] })
  })
})

/* ------------------------------ Компанія цілі ------------------------------ */

describe("ціль дії — лише людина компанії запиту (ADR-0032)", () => {
  it("доступ, блокування, вихід, другий крок, ролі людини іншої компанії — 404", async () => {
    await asAdmin()
    const foreign = [
      auth.admin.getUserAccess("u3"),
      auth.admin.blockUser("u3", "Причина"),
      auth.admin.unblockUser("u3"),
      auth.admin.signOutUser("u3"),
      auth.admin.resetFactors("u3", "Причина"),
      auth.roles.setUserRoles("u3", ["admin"]),
    ]
    for (const request of foreign)
      expect(await errorOf(request)).toMatchObject({
        status: 404,
        code: "not_found",
      })
    // У другій компанії — та сама людина доступна, а людина першої — ні.
    setCompanyId("c2")
    await expect(auth.admin.getUserAccess("u3")).resolves.toMatchObject({
      userId: "u3",
    })
    expect(await errorOf(auth.admin.getUserAccess("u2"))).toMatchObject({
      status: 404,
    })
  })

  it("компанія без членства — 403; сесії — лише люди компанії запиту", async () => {
    await asAdmin()
    setCompanyId("c9")
    expect(await errorOf(auth.admin.getUserAccess("u2"))).toMatchObject({
      status: 403,
    })
    expect(await errorOf(auth.admin.getSessions("", 1, 50))).toMatchObject({
      status: 403,
    })
    expect(await errorOf(auth.invitations.list())).toMatchObject({
      status: 403,
    })
    expect(await errorOf(auth.impersonate("u2", "Перевірка"))).toMatchObject({
      status: 403,
    })
    setCompanyId("c2")
    const { data } = await auth.admin.getSessions("", 1, 50)
    expect(
      data.every((session) => ["a1", "u3"].includes(session.user.id)),
    ).toBe(true)
  })

  it("запрошення іншої компанії не видно, не повторити й не відкликати", async () => {
    signInMock("a1")
    const invitation = await auth.invitations.create({
      email: "first@zoriana.example",
      roles: ["sales"],
    })
    setCompanyId("c2")
    expect(await auth.invitations.list()).toEqual([])
    expect(await errorOf(auth.invitations.resend(invitation.id))).toMatchObject(
      {
        status: 404,
      },
    )
    expect(await errorOf(auth.invitations.revoke(invitation.id))).toMatchObject(
      {
        status: 404,
      },
    )
    setCompanyId("c1")
    expect((await auth.invitations.list()).map((i) => i.id)).toEqual([
      invitation.id,
    ])
  })

  it("«Увійти як…»: не в людину іншої компанії, не в адміністратора, не в сильнішого", async () => {
    await asAdmin()
    expect(await errorOf(auth.impersonate("u3", "Перевірка"))).toMatchObject({
      status: 404,
    })
    expect(await errorOf(auth.impersonate("o4", "Перевірка"))).toMatchObject({
      status: 403,
    })
    expect(await errorOf(auth.impersonate("f5", "Перевірка"))).toMatchObject({
      status: 403,
    })
    await auth.impersonate("u2", "Перевірка")
    expect((await auth.getMe()).id).toBe("u2")
  })

  it("запит на відновлення бачать і отримують сповіщенням лише адміністратори компанії людини", async () => {
    expect(
      isChallengeRequired(
        await errorOf(
          auth.login({
            email: "u3@zoriana.example",
            password: "demo-password",
          }),
        ),
      ),
    ).toBe(true)
    await auth.requestRecovery("Новий телефон")

    signInMock("a6")
    expect(await auth.admin.getRecoveryRequests()).toEqual([])
    expect((await auth.inbox.list("all", 1, 50)).data).toEqual([])

    signInMock("a1")
    setCompanyId("c2")
    const [request] = await auth.admin.getRecoveryRequests()
    expect(request).toMatchObject({ userId: "u3" })
    expect(
      (await auth.inbox.list("all", 1, 50)).data.map((n) => n.type),
    ).toContain("security.recovery_requested")
    setCompanyId("c1")
    expect(await auth.admin.getRecoveryRequests()).toEqual([])
    expect(
      await errorOf(auth.admin.declineRecoveryRequest(request?.id ?? "")),
    ).toMatchObject({ status: 404 })
    setCompanyId("c2")
    await auth.admin.declineRecoveryRequest(request?.id ?? "")
    expect(await auth.admin.getRecoveryRequests()).toEqual([])
  })

  it("`*` пускає в будь-яку компанію, але запрошення — лише своєї", async () => {
    signInMock("o4")
    setCompanyId("c2")
    expect(await errorOf(auth.invitations.list())).toMatchObject({
      status: 403,
    })
    expect(
      await errorOf(
        auth.invitations.create({
          email: "foreign@zoriana.example",
          roles: ["sales"],
        }),
      ),
    ).toMatchObject({ status: 403 })
  })

  it("застосунок без компаній — одна команда: людей із компаніями в ній немає", async () => {
    signInMock("n8")
    await auth.reauthenticate({ password: "demo-password" })
    await expect(auth.admin.getUserAccess("n7")).resolves.toMatchObject({
      userId: "n7",
    })
    expect(await errorOf(auth.admin.getUserAccess("u2"))).toMatchObject({
      status: 404,
    })
    await auth.roles.setUserRoles("n7", ["admin"])
    expect(
      await errorOf(auth.roles.setUserRoles("u2", ["admin"])),
    ).toMatchObject({ status: 404 })
  })
})

/* ---------------------------- Перевірка запрошення ---------------------------- */

describe("перевірка запрошення: POST з токеном у тілі (ADR-0032)", () => {
  const listeners: ((event: { request: Request }) => void)[] = []
  afterEach(() => {
    for (const listener of listeners.splice(0))
      server.events.removeListener("request:start", listener)
  })

  async function inviteToken(email: string) {
    const messages: MockMessage[] = []
    const stop = subscribeMockMessages((m) => messages.push(m))
    signInMock("a1")
    await auth.invitations.create({ email, roles: ["sales"] })
    stop()
    signInMock(null)
    const link = (messages.at(-1)?.link ?? "").replace("#/", "")
    return new URL(link).searchParams.get("token") ?? ""
  }

  /** Запити від цієї миті; слухач знімає `afterEach`, навіть коли перевірка впала. */
  function recordRequests() {
    const seen: string[] = []
    const listener = ({ request }: { request: Request }) => {
      const url = new URL(request.url)
      seen.push(`${request.method} ${url.pathname}${url.search}`)
    }
    listeners.push(listener)
    server.events.on("request:start", listener)
    return seen
  }

  const missingPost = (status: 404 | 405) =>
    http.post(`${BASE}/auth/invite/check`, () =>
      status === 404
        ? HttpResponse.json(
            { code: "not_found", message: "Cannot POST" },
            { status },
          )
        : new HttpResponse(null, { status }),
    )

  it("токен — лише в тілі `POST`, адреса без нього", async () => {
    const token = await inviteToken("body@zoriana.example")
    const seen = recordRequests()
    await expect(auth.getInvite(token)).resolves.toMatchObject({
      email: "body@zoriana.example",
      companyName: "ТОВ «Тест»",
    })
    expect(seen).toEqual(["POST /api/v1/auth/invite/check"])
  })

  it("невідомий токен — 410 без запасного шляху", async () => {
    const seen = recordRequests()
    expect(await errorOf(auth.getInvite("nope"))).toMatchObject({
      status: 410,
      code: "token_expired",
    })
    expect(seen).toEqual(["POST /api/v1/auth/invite/check"])
  })

  it("сервер без `POST` (404, 405) — старий `GET`, далі одразу `GET` і одне попередження", async () => {
    const token = await inviteToken("legacy@zoriana.example")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    server.use(missingPost(405))
    const seen = recordRequests()
    await expect(auth.getInvite(token)).resolves.toMatchObject({
      email: "legacy@zoriana.example",
    })
    await expect(auth.getInvite(token)).resolves.toMatchObject({
      email: "legacy@zoriana.example",
    })
    expect(seen.map((request) => request.split("?")[0])).toEqual([
      "POST /api/v1/auth/invite/check",
      "GET /api/v1/auth/invite",
      "GET /api/v1/auth/invite",
    ])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/GET \/auth\/invite/)

    // Новий провайдер (нова вкладка) — знову спершу `POST`: 404 теж «маршруту немає».
    auth = createAuthProvider(client, { baseUrl: BASE })
    server.use(missingPost(404))
    await expect(auth.getInvite(token)).resolves.toMatchObject({
      email: "legacy@zoriana.example",
    })
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it("маршрут уже відповідав (410) — далі 404 не веде токен у `GET`", async () => {
    const token = await inviteToken("route@zoriana.example")
    expect(await errorOf(auth.getInvite("nope"))).toMatchObject({
      status: 410,
    })
    server.use(missingPost(404))
    const seen = recordRequests()
    expect(await errorOf(auth.getInvite(token))).toMatchObject({
      status: 404,
    })
    expect(seen).toEqual(["POST /api/v1/auth/invite/check"])
  })
})
