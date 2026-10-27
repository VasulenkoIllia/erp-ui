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
import { applyMockRoles } from "@/registry/lib/mock-team"
import {
  createPlatformHandlers,
  signInMock,
  subscribeMockMessages,
  type MockMessage,
  type MockUser,
} from "@/registry/lib/mocks"
import {
  countGranted,
  grants,
  togglePermission,
  type PermissionResource,
} from "@/registry/lib/roles"

const BASE = "http://erp.test/api/v1"

const COMPANIES = [
  { id: "c1", name: "ТОВ «Тест»" },
  { id: "c2", name: "ФОП Тестенко" },
]

const users: MockUser[] = [
  {
    id: "a1",
    name: "Марта Бойко",
    email: "marta@zoriana.example",
    password: "demo-password",
    totpCode: "111111",
    roles: ["admin"],
    permissions: [],
    companies: COMPANIES,
    companyId: "c1",
    factors: [],
  },
  {
    id: "u2",
    name: "Іван Петренко",
    email: "ivan@zoriana.example",
    password: "demo-password",
    totpCode: "654321",
    roles: ["sales"],
    permissions: [],
    companies: COMPANIES.slice(0, 1),
    companyId: "c1",
    factors: [],
  },
]

const server = setupServer(
  ...createPlatformHandlers({
    users,
    baseUrl: BASE,
    linkUrl: (kind, token) => `http://demo.test/#/login/${kind}?token=${token}`,
    roles: [
      {
        id: "owner",
        name: { uk: "Власник", en: "Owner" },
        system: true,
        permissions: ["*"],
      },
      {
        id: "admin",
        name: { uk: "Адміністратор", en: "Administrator" },
        // «Стеля» (ADR-0032): адміністратор дає ролі з нотатками, тож сам має права на нотатки.
        permissions: [
          "users:*",
          "roles:*",
          "company:*",
          "audit:read",
          "notes:*",
        ],
      },
      {
        id: "sales",
        name: { uk: "Продажі", en: "Sales" },
        description: { uk: "Бачить нотатки", en: "Sees notes" },
        permissions: ["notes:read"],
      },
    ],
    permissionResources: {
      notes: {
        label: { uk: "Нотатки", en: "Notes" },
        group: { uk: "Робота", en: "Work" },
      },
      users: { label: { uk: "Користувачі", en: "Users" } },
      roles: {
        label: { uk: "Ролі", en: "Roles" },
        actions: ["read", "update"],
      },
      company: {
        label: { uk: "Компанія", en: "Company" },
        actions: ["read", "update"],
      },
      audit: { label: { uk: "Аудит", en: "Audit" }, actions: ["read"] },
    },
    inboxSeeds: {
      a1: [
        {
          id: "n-1",
          type: "notes.mentioned",
          title: { uk: "Вас згадали", en: "You were mentioned" },
          body: { uk: "У нотатці «План»", en: "In the note “Plan”" },
          createdAt: "2026-10-13T08:00:00.000Z",
          readAt: null,
          severity: "info",
          link: "/notes/1",
        },
        {
          id: "n-2",
          type: "notes.done",
          title: { uk: "Нотатку виконано", en: "Note done" },
          createdAt: "2026-10-12T08:00:00.000Z",
          readAt: "2026-10-12T09:00:00.000Z",
        },
      ],
    },
    companyProfiles: {
      c1: {
        name: "Тест",
        legalName: "ТОВ «Тест»",
        kind: "legal",
        edrpou: "32855961",
        vatPayer: false,
      },
    },
    notificationEvents: [
      {
        id: "team.invitation_accepted",
        group: { uk: "Команда", en: "Team" },
        label: { uk: "Запрошення прийнято", en: "Invitation accepted" },
        channels: ["in_app", "email"],
        defaults: ["in_app"],
      },
    ],
  }),
)

let language = "uk"
const client = createApiClient({
  baseUrl: BASE,
  getLanguage: () => language,
})
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
  // Ролі й призначення — у сховищі: після очищення права користувачів знову початкові.
  applyMockRoles()
  language = "uk"
  setCompanyId(null)
  auth = createAuthProvider(client, { baseUrl: BASE })
})
afterEach(() => {
  server.resetHandlers()
})

/* ------------------------------ Матриця прав ------------------------------ */

const notes: PermissionResource = {
  id: "notes",
  label: "Нотатки",
  actions: [
    { id: "read", label: "Перегляд" },
    { id: "update", label: "Зміна" },
    { id: "delete", label: "Видалення" },
  ],
}

describe("матриця прав (ADR-0014)", () => {
  it("grants: *, <ресурс>:*, <ресурс>:<дія>", () => {
    expect(grants(["*"], "notes", "delete")).toBe(true)
    expect(grants(["notes:*"], "notes", "delete")).toBe(true)
    expect(grants(["notes:read"], "notes", "read")).toBe(true)
    expect(grants(["notes:read"], "notes", "update")).toBe(false)
    expect(grants(["users:*"], "notes", "read")).toBe(false)
  })

  it("togglePermission стискає всі дії до :* і розгортає назад", () => {
    let perms = togglePermission(["users:read"], notes, "read", true)
    expect(perms).toEqual(["users:read", "notes:read"])
    perms = togglePermission(perms, notes, "update", true)
    perms = togglePermission(perms, notes, "delete", true)
    expect(perms).toEqual(["users:read", "notes:*"])
    perms = togglePermission(perms, notes, "update", false)
    expect(perms).toEqual(["users:read", "notes:read", "notes:delete"])
    expect(countGranted(perms, [notes])).toBe(2)
  })
})

/* ------------------------------ Ролі ------------------------------ */

describe("ролі (ADR-0014)", () => {
  it("список мовою запиту: ролі з кількістю користувачів і каталог прав", async () => {
    signInMock("a1")
    const { roles, resources } = await auth.roles.list()
    expect(roles.map((r) => [r.id, r.name, r.usersCount])).toEqual([
      ["owner", "Власник", 0],
      ["admin", "Адміністратор", 1],
      ["sales", "Продажі", 1],
    ])
    expect(roles[0]).toMatchObject({ system: true, permissions: ["*"] })
    expect(resources[0]).toEqual({
      id: "notes",
      label: "Нотатки",
      group: "Робота",
      actions: [
        { id: "read", label: "Перегляд" },
        { id: "create", label: "Створення" },
        { id: "update", label: "Зміна" },
        { id: "delete", label: "Видалення" },
      ],
    })
    language = "en"
    const en = await auth.roles.list()
    expect(en.roles[2]).toMatchObject({
      name: "Sales",
      description: "Sees notes",
    })

    signInMock("u2")
    await expect(auth.roles.list()).rejects.toMatchObject({ status: 403 })
  })

  it("створення, зміна, видалення; права користувачів — сума прав ролей", async () => {
    signInMock("a1")
    expect(
      await errorOf(auth.roles.create({ name: " ", permissions: [] })),
    ).toMatchObject({ status: 422, fieldErrors: { name: "required" } })
    expect(
      await errorOf(auth.roles.create({ name: "продажі", permissions: [] })),
    ).toMatchObject({ fieldErrors: { name: "taken" } })
    expect(
      await errorOf(
        auth.roles.create({ name: "Склад", permissions: ["stock:read"] }),
      ),
    ).toMatchObject({ fieldErrors: { permissions: "invalid" } })

    const role = await auth.roles.create({
      name: "Склад",
      description: "Комірники",
      permissions: ["notes:read"],
    })
    expect(role).toMatchObject({ name: "Склад", system: false, usersCount: 0 })

    await expect(
      auth.roles.update("owner", { permissions: [] }),
    ).rejects.toMatchObject({ status: 403 })

    // Права ролі змінились — змінились і права Івана.
    await auth.roles.update("sales", { permissions: ["notes:*"] })
    signInMock("u2")
    expect((await auth.getMe()).permissions).toEqual(["notes:*"])

    signInMock("a1")
    await expect(auth.roles.remove("sales")).rejects.toMatchObject({
      status: 409,
    })
    await auth.roles.remove(role.id)
    expect((await auth.roles.list()).roles.map((r) => r.id)).toEqual([
      "owner",
      "admin",
      "sales",
    ])
    const { data } = await auth.audit.getEvents({ category: ["users"] }, 1, 20)
    expect(data.map((e) => e.action)).toEqual([
      "users.role_deleted",
      "users.role_updated",
      "users.role_created",
    ])
    expect(data[1]?.changes).toEqual([
      expect.objectContaining({
        field: "permissions",
        from: ["notes:read"],
        to: ["notes:*"],
      }),
    ])
  })

  it("ролі користувача: повторне підтвердження, не собі, хоча б одна", async () => {
    signInMock("a1")
    await expect(
      auth.roles.setUserRoles("u2", ["admin"]),
    ).rejects.toMatchObject({ status: 403, code: "reauth_required" })
    await auth.reauthenticate({ password: "demo-password" })
    await expect(auth.roles.setUserRoles("u2", [])).rejects.toMatchObject({
      fieldErrors: { roles: "required" },
    })
    await expect(auth.roles.setUserRoles("u2", ["nope"])).rejects.toMatchObject(
      { fieldErrors: { roles: "invalid" } },
    )
    await expect(
      auth.roles.setUserRoles("a1", ["sales"]),
    ).rejects.toMatchObject({ status: 422 })

    await auth.roles.setUserRoles("u2", ["sales", "admin"])
    expect((await auth.admin.getUserAccess("u2")).roles).toEqual([
      "sales",
      "admin",
    ])
    signInMock("u2")
    expect((await auth.getMe()).permissions).toEqual([
      "notes:read",
      "users:*",
      "roles:*",
      "company:*",
      "audit:read",
      "notes:*",
    ])

    signInMock("a1")
    const { data } = await auth.audit.getEvents({ category: ["users"] }, 1, 5)
    expect(data[0]).toMatchObject({
      action: "users.roles_changed",
      target: { id: "u2" },
      changes: [{ field: "roles", from: ["sales"], to: ["sales", "admin"] }],
    })
  })
})

/* ------------------------------ Запрошення ------------------------------ */

describe("запрошення (ADR-0014)", () => {
  it("перевірки, лист із посиланням, повтор не частіше ніж раз на хвилину, відкликання", async () => {
    const messages: MockMessage[] = []
    const stop = subscribeMockMessages((m) => messages.push(m))
    await asAdmin()
    expect(
      await errorOf(auth.invitations.create({ email: "", roles: [] })),
    ).toMatchObject({
      fieldErrors: { email: "required", roles: "required" },
    })
    expect(
      await errorOf(
        auth.invitations.create({ email: "не-email", roles: ["sales"] }),
      ),
    ).toMatchObject({ fieldErrors: { email: "invalid" } })
    expect(
      await errorOf(
        auth.invitations.create({
          email: "IVAN@zoriana.example",
          roles: ["sales"],
        }),
      ),
    ).toMatchObject({ fieldErrors: { email: "taken" } })

    const invitation = await auth.invitations.create({
      email: " New@Zoriana.example ",
      name: "Нова колега",
      roles: ["sales"],
      message: "Вітаємо!",
    })
    expect(invitation).toMatchObject({
      email: "new@zoriana.example",
      name: "Нова колега",
      roles: ["sales"],
      invitedBy: "Марта Бойко",
      status: "pending",
    })
    expect(
      Date.parse(invitation.expiresAt) - Date.parse(invitation.createdAt),
    ).toBe(7 * 24 * 60 * 60 * 1000)
    expect(messages.at(-1)).toMatchObject({
      channel: "email",
      to: "new@zoriana.example",
      kind: "invite",
    })
    expect(messages.at(-1)?.link).toMatch(
      /^http:\/\/demo\.test\/#\/login\/invite\?token=/,
    )
    expect(
      await errorOf(
        auth.invitations.create({
          email: "new@zoriana.example",
          roles: ["sales"],
        }),
      ),
    ).toMatchObject({ fieldErrors: { email: "invited" } })

    await expect(auth.invitations.resend(invitation.id)).rejects.toMatchObject({
      status: 429,
    })
    expect(await auth.invitations.list()).toHaveLength(1)

    await auth.invitations.revoke(invitation.id)
    expect(await auth.invitations.list()).toEqual([])
    const token = new URL(
      (messages.at(-1)?.link ?? "").replace("#/", ""),
    ).searchParams.get("token")
    await expect(auth.getInvite(token ?? "")).rejects.toMatchObject({
      status: 410,
    })

    signInMock("u2")
    await expect(auth.invitations.list()).rejects.toMatchObject({
      status: 403,
    })
    stop()
  })

  it("прийняте запрошення: новий користувач із правами ролей, сповіщення тому, хто запрошував", async () => {
    const messages: MockMessage[] = []
    const stop = subscribeMockMessages((m) => messages.push(m))
    await asAdmin()
    await auth.invitations.create({
      email: "olha@zoriana.example",
      roles: ["sales"],
    })
    const token =
      new URL((messages.at(-1)?.link ?? "").replace("#/", "")).searchParams.get(
        "token",
      ) ?? ""

    signInMock(null)
    expect(await auth.getInvite(token)).toMatchObject({
      email: "olha@zoriana.example",
      companyName: "ТОВ «Тест»",
      invitedBy: "Марта Бойко",
    })
    await auth.acceptInvite(token, {
      name: "Ольга Коваленко",
      password: "довгий-пароль-2026",
    })
    const me = await auth.getMe()
    expect(me).toMatchObject({
      name: "Ольга Коваленко",
      roles: ["sales"],
      permissions: ["notes:read"],
      companyId: "c1",
    })

    signInMock("a1")
    expect(await auth.invitations.list()).toEqual([])
    const inbox = await auth.inbox.list("unread", 1, 20)
    expect(inbox.data[0]).toMatchObject({
      type: "team.invitation_accepted",
      title: "Запрошення прийнято: Ольга Коваленко",
      severity: "success",
      link: "/settings/users",
    })
    stop()
  })
})

/* ------------------------------ Центр сповіщень ------------------------------ */

describe("центр сповіщень (ADR-0014)", () => {
  it("список, непрочитані, позначки, «Прочитати все», мова", async () => {
    await expect(auth.inbox.unreadCount()).rejects.toMatchObject({
      status: 401,
    })
    signInMock("a1")
    expect(await auth.inbox.unreadCount()).toBe(1)
    const all = await auth.inbox.list("all", 1, 20)
    expect(all).toMatchObject({ total: 2, unread: 1 })
    expect(all.data[0]).toEqual({
      id: "n-1",
      type: "notes.mentioned",
      title: "Вас згадали",
      body: "У нотатці «План»",
      createdAt: "2026-10-13T08:00:00.000Z",
      readAt: null,
      severity: "info",
      link: "/notes/1",
    })
    expect((await auth.inbox.list("unread", 1, 20)).data).toHaveLength(1)
    expect((await auth.inbox.list("all", 2, 1)).data[0]?.id).toBe("n-2")

    const read = await auth.inbox.markRead("n-1", true)
    expect(read.readAt).not.toBeNull()
    expect(await auth.inbox.unreadCount()).toBe(0)
    await auth.inbox.markRead("n-2", false)
    expect(await auth.inbox.unreadCount()).toBe(1)
    await auth.inbox.markAllRead()
    expect(await auth.inbox.unreadCount()).toBe(0)

    language = "en"
    expect((await auth.inbox.list("all", 1, 1)).data[0]?.title).toBe(
      "You were mentioned",
    )
    await expect(auth.inbox.markRead("nope", true)).rejects.toMatchObject({
      status: 404,
    })
  })

  it("лічильник — фоновий запит: сесію не продовжує", async () => {
    const expiresAt = Date.now() + 60_000
    localStorage.setItem(
      "erp-ui:mock-session",
      JSON.stringify({ userId: "a1", stage: "authenticated", expiresAt }),
    )
    const session = () =>
      (
        JSON.parse(localStorage.getItem("erp-ui:mock-session") ?? "{}") as {
          expiresAt: number
        }
      ).expiresAt
    expect(await auth.inbox.unreadCount()).toBe(1)
    expect(session()).toBe(expiresAt)
    await auth.inbox.list("all", 1, 20)
    expect(session()).toBeGreaterThan(expiresAt)
  })

  it("канал «У застосунку» вимкнено — сповіщення не приходить", async () => {
    const messages: MockMessage[] = []
    const stop = subscribeMockMessages((m) => messages.push(m))
    await asAdmin()
    await auth.account.updateNotificationSettings({
      settings: { "team.invitation_accepted": ["email"] },
      quietHours: { enabled: false, from: "22:00", to: "08:00" },
    })
    await auth.invitations.create({
      email: "petro@zoriana.example",
      roles: ["sales"],
    })
    const token =
      new URL((messages.at(-1)?.link ?? "").replace("#/", "")).searchParams.get(
        "token",
      ) ?? ""
    signInMock(null)
    await auth.acceptInvite(token, {
      name: "Петро",
      password: "довгий-пароль-2026",
    })
    signInMock("a1")
    expect(await auth.inbox.unreadCount()).toBe(1)
    expect((await auth.inbox.list("unread", 1, 20)).data[0]?.id).toBe("n-1")
    stop()
  })
})

/* ------------------------------ Компанія ------------------------------ */

const png = (bytes: number) =>
  new Blob([new Uint8Array(bytes)], { type: "image/png" })

describe("налаштування компанії (ADR-0014)", () => {
  it("профіль поточної компанії: з опцій, з назви компанії, лише своя", async () => {
    signInMock("u2")
    expect(await auth.company.get()).toMatchObject({
      id: "c1",
      name: "Тест",
      legalName: "ТОВ «Тест»",
      edrpou: "32855961",
      branches: [],
    })
    setCompanyId("c2")
    await expect(auth.company.get()).rejects.toMatchObject({ status: 403 })
    signInMock("a1")
    expect(await auth.company.get()).toMatchObject({
      id: "c2",
      name: "ФОП Тестенко",
      kind: "legal",
    })
  })

  it("зміна реквізитів: перевірки LC12, право company:update, аудит", async () => {
    signInMock("u2")
    await expect(auth.company.update({ name: "Інша" })).rejects.toMatchObject({
      status: 403,
    })

    signInMock("a1")
    expect(
      await errorOf(
        auth.company.update({
          name: " ",
          edrpou: "32855962",
          iban: "PL61109010140000071219812874",
          email: "office@",
        }),
      ),
    ).toMatchObject({
      status: 422,
      fieldErrors: {
        name: "required",
        edrpou: "checksum",
        iban: "country",
        email: "invalid",
      },
    })
    expect(await errorOf(auth.company.update({ kind: "fop" }))).toMatchObject({
      fieldErrors: { rnokpp: "required" },
    })
    expect(
      await errorOf(auth.company.update({ vatPayer: true })),
    ).toMatchObject({ fieldErrors: { vatIpn: "required" } })

    const next = await auth.company.update({
      vatPayer: true,
      vatIpn: "143605704021",
      iban: "UA21 3223 1300 0002 6007 2335 6600 1",
      director: { name: "Марта Бойко", position: "Директор" },
      palette: "teal",
    })
    expect(next).toMatchObject({
      palette: "teal",
      vatPayer: true,
      iban: "UA213223130000026007233566001",
      director: { name: "Марта Бойко", position: "Директор" },
    })
    expect(await auth.company.get()).toMatchObject({ vatIpn: "143605704021" })

    const { data } = await auth.audit.getEvents({ category: ["company"] }, 1, 5)
    expect(data[0]).toMatchObject({
      action: "company.updated",
      target: { type: "company", id: "c1", name: "Тест" },
    })
    expect(data[0]?.changes?.map((c) => c.field)).toEqual(
      expect.arrayContaining([
        "vatPayer",
        "vatIpn",
        "iban",
        "director.name",
        "director.position",
        "palette",
      ]),
    )
    expect(await auth.company.update({ palette: null })).toMatchObject({
      palette: null,
    })
  })

  it("логотип і печатка: тип, розмір, завантаження й видалення", async () => {
    signInMock("a1")
    await expect(
      auth.company.uploadImage(
        "logo",
        new Blob(["GIF89a"], { type: "image/gif" }),
      ),
    ).rejects.toMatchObject({ fieldErrors: { file: "type" } })
    await expect(
      auth.company.uploadImage("logo", png(1024 * 1024 + 1)),
    ).rejects.toMatchObject({ fieldErrors: { file: "tooLarge" } })

    const url = await auth.company.uploadImage("stamp", png(16))
    expect(url).toMatch(/^data:image\/png;base64,/)
    expect(await auth.company.get()).toMatchObject({
      stampUrl: url,
      logoUrl: null,
    })
    await auth.company.removeImage("stamp")
    expect((await auth.company.get()).stampUrl).toBeNull()
  })

  it("філії: додати, змінити, видалити", async () => {
    signInMock("a1")
    await expect(
      auth.company.createBranch({ name: " " }),
    ).rejects.toMatchObject({ fieldErrors: { name: "required" } })
    const branch = await auth.company.createBranch({
      name: "Львівська філія",
      code: "001",
      address: "м. Львів",
    })
    expect(branch).toMatchObject({ name: "Львівська філія", code: "001" })
    const changed = await auth.company.updateBranch(branch.id, {
      code: "",
      phone: "+380322123456",
    })
    expect(changed).toEqual({
      id: branch.id,
      name: "Львівська філія",
      address: "м. Львів",
      phone: "+380322123456",
    })
    expect((await auth.company.get()).branches).toEqual([changed])
    await auth.company.removeBranch(branch.id)
    expect((await auth.company.get()).branches).toEqual([])
    await expect(auth.company.removeBranch(branch.id)).rejects.toMatchObject({
      status: 404,
    })
  })
})
