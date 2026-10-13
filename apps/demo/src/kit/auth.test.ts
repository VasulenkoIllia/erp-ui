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

import { ApiError, createApiClient, isApiError } from "@/registry/lib/api"
import {
  createAuthProvider,
  hasPermission,
  isCaptchaRequired,
  isChallengeRequired,
  isPasswordChangeRequired,
  isReauthRequired,
  type Challenge,
} from "@/registry/lib/auth"
import {
  createPlatformHandlers,
  signInMock,
  subscribeMockMessages,
  type MockMessage,
  type MockUser,
} from "@/registry/lib/mocks"
import { passwordStrength } from "@/registry/lib/password"
import {
  getSessionExpiresAt,
  setSessionExpiresAt,
} from "@/registry/lib/session"

const BASE = "http://erp.test/api/v1"

const users = (): MockUser[] => [
  {
    id: "u1",
    name: "Олена Коваль",
    email: "olena@zoriana.example",
    phone: "+380671234545",
    password: "demo",
    totpCode: "123456",
    backupCodes: ["ab12cd34"],
    roles: ["accountant"],
    permissions: ["invoices:*"],
    companies: [{ id: "zoriana", name: "ТОВ «Зоряна логістика»" }],
    companyId: "zoriana",
    factors: ["totp", "backup_code", "sms", "passkey"],
  },
  {
    id: "u2",
    name: "Іван Петренко",
    email: "ivan@zoriana.example",
    password: "demo",
    totpCode: "000000",
    roles: ["sales"],
    permissions: ["invoices:read"],
    companies: [],
    companyId: null,
    factors: [],
  },
  {
    id: "u3",
    name: "Тимчасовий Пароль",
    email: "temp@zoriana.example",
    password: "temp-password",
    totpCode: "000000",
    roles: ["sales"],
    permissions: ["invoices:read"],
    companies: [],
    companyId: null,
    factors: [],
    mustChangePassword: true,
  },
]

const server = setupServer(
  ...createPlatformHandlers({
    users: users(),
    baseUrl: BASE,
    sentCode: "654321",
    linkUrl: (kind, token) => `https://app.test/#/login/${kind}?token=${token}`,
    invites: [
      {
        token: "inv-1",
        email: "new@zoriana.example",
        companyName: "ТОВ «Зоряна логістика»",
        user: {
          roles: ["sales"],
          permissions: ["invoices:read"],
          companies: [],
          companyId: null,
        },
      },
    ],
  }),
)
const client = createApiClient({ baseUrl: BASE })
let auth = createAuthProvider(client, { baseUrl: BASE })
const messages: MockMessage[] = []
subscribeMockMessages((message) => messages.push(message))

/** Очікуємо виклик підтвердження й повертаємо його. */
async function challengeOf(promise: Promise<unknown>): Promise<Challenge> {
  const error = await promise.catch((e: unknown) => e)
  if (!isChallengeRequired(error))
    throw new Error(`No challenge: ${String(error)}`)
  return error.challenge
}

const lastLink = () => {
  const link = messages.at(-1)?.link ?? ""
  return new URL(link.replace("#/", "")).searchParams.get("token") ?? ""
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
  messages.length = 0
  auth = createAuthProvider(client, { baseUrl: BASE })
})
afterEach(() => {
  server.resetHandlers()
})

describe("способи входу (ADR-0010)", () => {
  it("налаштування проекту: пароль, без пароля, SSO, реєстрація", async () => {
    const methods = await auth.getMethods()
    expect(methods.password).toBe(true)
    expect(methods.passwordless).toEqual(["email", "sms", "passkey"])
    expect(methods.providers.map((p) => p.type)).toEqual(["google", "apple"])
    expect(methods.trustedDeviceDays).toBe(30)
  })

  it("пароль → код застосунку; хибний код — 422; профіль і права", async () => {
    const challenge = await challengeOf(
      auth.login({ email: "olena@zoriana.example", password: "demo" }),
    )
    expect(challenge).toMatchObject({
      method: "totp",
      secondFactor: true,
      methods: ["totp", "backup_code", "sms", "passkey"],
    })
    await expect(
      auth.login({ method: "totp", code: "111111" }),
    ).rejects.toMatchObject({ status: 422, fieldErrors: { code: "invalid" } })
    await auth.login({ method: "totp", code: "123456" })
    const me = await auth.getMe()
    expect(me.name).toBe("Олена Коваль")
    expect(me.factors).toContain("totp")
    expect(
      await auth.canAccess?.({ resource: "invoices", action: "approve" }),
    ).toBe(true)
    await auth.logout({})
    await expect(auth.checkAuth({})).rejects.toMatchObject({ status: 401 })
  })

  it("резервний код спрацьовує один раз", async () => {
    await challengeOf(
      auth.login({ email: "olena@zoriana.example", password: "demo" }),
    )
    await auth.login({ method: "backup_code", code: "ab12-cd34" })
    await auth.logout({})
    await challengeOf(
      auth.login({ email: "olena@zoriana.example", password: "demo" }),
    )
    await expect(
      auth.login({ method: "backup_code", code: "ab12cd34" }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it("SMS: інший метод надсилає код; повтор раніше 30 с — 429", async () => {
    await challengeOf(
      auth.login({ email: "olena@zoriana.example", password: "demo" }),
    )
    const sms = await auth.sendCode("sms")
    expect(sms).toMatchObject({
      method: "sms",
      destination: "+380 •• ••• •• 45",
      resendIn: 30,
    })
    expect(messages.at(-1)).toMatchObject({
      channel: "sms",
      to: "+380671234545",
      code: "654321",
    })
    await expect(auth.sendCode("sms")).rejects.toMatchObject({
      status: 429,
      code: "rate_limited",
    })
    await auth.login({ method: "sms", code: "654321" })
    expect((await auth.getMe()).id).toBe("u1")
  })

  it("довірений пристрій: наступний вхід без другого кроку", async () => {
    await challengeOf(
      auth.login({ email: "olena@zoriana.example", password: "demo" }),
    )
    await auth.login({ method: "totp", code: "123456", trustDevice: true })
    await auth.logout({})
    await auth.login({ email: "olena@zoriana.example", password: "demo" })
    expect((await auth.getMe()).id).toBe("u1")
  })

  it("без пароля: код на email або посилання з листа", async () => {
    const challenge = await challengeOf(
      auth.login({ method: "email", identifier: "Olena@Zoriana.example" }),
    )
    expect(challenge).toMatchObject({
      method: "email",
      secondFactor: false,
      destination: "o•••@zoriana.example",
    })
    expect(messages.at(-1)).toMatchObject({ channel: "email", kind: "login" })
    await auth.login({ method: "email", code: "654321" })
    expect((await auth.getMe()).id).toBe("u1")

    await auth.logout({})
    await challengeOf(
      auth.login({ method: "email", identifier: "olena@zoriana.example" }),
    )
    await auth.login({ link: lastLink() })
    expect((await auth.getMe()).id).toBe("u1")
    // Посилання одноразове.
    await auth.logout({})
    await expect(auth.login({ link: lastLink() })).rejects.toMatchObject({
      status: 410,
      code: "token_expired",
    })
  })

  it("невідомий акаунт отримує ту саму відповідь, але код не підходить", async () => {
    const challenge = await challengeOf(
      auth.login({ method: "sms", identifier: "+380 50 000 00 00" }),
    )
    expect(challenge.destination).toBe("+380 •• ••• •• 00")
    expect(messages).toHaveLength(0)
    await expect(
      auth.login({ method: "sms", code: "654321" }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it("ключ доступу: користувача визначає userHandle", async () => {
    const userHandle = btoa("u1").replace(/=+$/, "")
    await client.post("/auth/passkey/verify", {
      credential: { response: { userHandle } },
    })
    expect((await auth.getMe()).id).toBe("u1")
  })

  it("після 3 невдалих спроб — перевірка «не бот», з токеном проходить", async () => {
    for (let i = 0; i < 3; i++)
      await expect(
        auth.login({ email: "ivan@zoriana.example", password: "x" }),
      ).rejects.toMatchObject({ status: 401 })
    const error = await auth
      .login({ email: "ivan@zoriana.example", password: "demo" })
      .catch((e: unknown) => e)
    expect(isCaptchaRequired(error)).toBe(true)
    await auth.login({
      email: "ivan@zoriana.example",
      password: "demo",
      captchaToken: "token",
    })
    expect((await auth.getMe()).id).toBe("u2")
  })
})

describe("відновлення, запрошення, реєстрація", () => {
  it("забули пароль: лист лише існуючому акаунту; новий пароль і вхід", async () => {
    await auth.forgotPassword("nobody@zoriana.example")
    expect(messages).toHaveLength(0)
    await auth.forgotPassword("ivan@zoriana.example")
    expect(messages.at(-1)).toMatchObject({ channel: "email", kind: "reset" })
    const token = lastLink()
    await expect(auth.resetPassword(token, "short")).rejects.toMatchObject({
      status: 422,
      fieldErrors: { password: "weak" },
    })
    await auth.resetPassword(token, "новий-надійний-пароль")
    expect((await auth.getMe()).id).toBe("u2")
    await auth.logout({})
    await auth.login({
      email: "ivan@zoriana.example",
      password: "новий-надійний-пароль",
    })
    await expect(
      auth.resetPassword(token, "ще-один-пароль"),
    ).rejects.toMatchObject({ code: "token_expired" })
  })

  it("запрошення: дані й прийняття", async () => {
    await expect(auth.getInvite("inv-1")).resolves.toMatchObject({
      email: "new@zoriana.example",
    })
    await auth.acceptInvite("inv-1", {
      name: "Нова Людина",
      password: "дуже-надійний-пароль",
    })
    expect((await auth.getMe()).name).toBe("Нова Людина")
    await expect(auth.getInvite("inv-1")).rejects.toMatchObject({
      code: "token_expired",
    })
  })

  it("реєстрація: код з листа активує акаунт власника компанії", async () => {
    await expect(
      auth.signUp({
        name: "Тарас",
        email: "olena@zoriana.example",
        password: "дуже-надійний-пароль",
        company: { name: "ФОП Тарас" },
      }),
    ).rejects.toMatchObject({ fieldErrors: { email: "taken" } })
    const challenge = await challengeOf(
      auth.signUp({
        name: "Тарас",
        email: "taras@example.com",
        password: "дуже-надійний-пароль",
        company: { name: "ФОП Тарас", code: "1759013776" },
      }),
    )
    expect(challenge.method).toBe("email")
    await auth.login({ method: "email", code: "654321" })
    const me = await auth.getMe()
    expect(me.permissions).toEqual(["*"])
    expect(me.companies[0]?.name).toBe("ФОП Тарас")
  })

  it("зміна пароля перевіряє поточний", async () => {
    signInMock("u1")
    await expect(
      auth.changePassword("x", "новий-надійний-пароль"),
    ).rejects.toMatchObject({ fieldErrors: { currentPassword: "invalid" } })
    await auth.changePassword("demo", "новий-надійний-пароль")
  })
})

describe("акаунт: тимчасовий пароль, повторне підтвердження, email, GDPR", () => {
  it("тимчасовий пароль: спершу новий, потім вхід", async () => {
    const error = await auth
      .login({ email: "temp@zoriana.example", password: "temp-password" })
      .catch((e: unknown) => e)
    expect(isPasswordChangeRequired(error)).toBe(true)
    await expect(auth.checkAuth({})).rejects.toMatchObject({ status: 401 })
    await expect(auth.setNewPassword("temp-password")).rejects.toMatchObject({
      fieldErrors: { password: "same" },
    })
    await auth.setNewPassword("новий-постійний-пароль")
    expect((await auth.getMe()).id).toBe("u3")
  })

  it("зміна email: спершу повторне підтвердження, потім код з нової адреси", async () => {
    signInMock("u1")
    const error = await auth
      .changeEmail("olena.new@zoriana.example")
      .catch((e: unknown) => e)
    expect(isReauthRequired(error)).toBe(true)
    await expect(
      auth.reauthenticate({ password: "wrong" }),
    ).rejects.toMatchObject({ fieldErrors: { password: "invalid" } })
    // Пароль Олени змінено в тесті вище — підтверджуємо кодом застосунку.
    await auth.reauthenticate({ method: "totp", code: "123456" })
    const challenge = await auth.changeEmail("olena.new@zoriana.example")
    expect(challenge.destination).toBe("o•••@zoriana.example")
    expect(messages.at(-1)).toMatchObject({
      to: "olena.new@zoriana.example",
      kind: "verify",
    })
    await auth.confirmEmail("654321")
    expect((await auth.getMe()).email).toBe("olena.new@zoriana.example")
    expect(messages.at(-1)).toMatchObject({
      to: "olena@zoriana.example",
      kind: "notice",
    })
  })

  it("експорт даних листом; видалення акаунта лише після підтвердження", async () => {
    signInMock("u1")
    await auth.exportData()
    expect(messages.at(-1)).toMatchObject({ kind: "export" })
    const error = await auth.deleteAccount().catch((e: unknown) => e)
    expect(isReauthRequired(error)).toBe(true)
    await auth.reauthenticate({ method: "totp", code: "123456" })
    await auth.deleteAccount()
    await expect(auth.checkAuth({})).rejects.toMatchObject({ status: 401 })
  })
})

describe("сесія", () => {
  it("термін сесії приходить заголовком і продовжується", async () => {
    setSessionExpiresAt(null)
    signInMock("u2")
    await auth.getMe()
    const first = getSessionExpiresAt()
    expect(first).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    await auth.extendSession()
    expect(Date.parse(getSessionExpiresAt() ?? "")).toBeGreaterThanOrEqual(
      Date.parse(first ?? ""),
    )
  })

  it("checkError розлогінює лише на 401", async () => {
    await expect(
      auth.checkError(new ApiError(403, { code: "forbidden", message: "" })),
    ).resolves.toBeUndefined()
    const error = await auth
      .checkError(new ApiError(401, { code: "unauthenticated", message: "" }))
      .catch((e: unknown) => e)
    expect(isApiError(error)).toBe(true)
  })

  it("SSO-повернення з помилкою провайдера", async () => {
    window.history.replaceState(
      null,
      "",
      "/#/auth/callback?error=access_denied",
    )
    await expect(auth.handleCallback?.()).rejects.toMatchObject({ status: 401 })
    window.history.replaceState(null, "", "/#/auth/callback?next=%2Fdata")
    signInMock("u2")
    await expect(auth.handleCallback?.()).resolves.toEqual({
      redirectTo: "/data",
    })
  })
})

describe("права", () => {
  it("точний збіг, ресурс:*, *", () => {
    expect(hasPermission(["invoices:read"], "invoices", "read")).toBe(true)
    expect(hasPermission(["invoices:read"], "invoices", "update")).toBe(false)
    expect(hasPermission(["invoices:*"], "invoices", "delete")).toBe(true)
    expect(hasPermission(["*"], "anything", "any")).toBe(true)
  })

  it("дії ra-core зводяться до read і update", () => {
    expect(hasPermission(["invoices:read"], "invoices", "list")).toBe(true)
    expect(hasPermission(["invoices:read"], "invoices", "show")).toBe(true)
    expect(hasPermission(["invoices:read"], "invoices", "edit")).toBe(false)
    expect(hasPermission(["invoices:update"], "invoices", "edit")).toBe(true)
  })
})

describe("надійність пароля", () => {
  it("коротко, загальновідомо, з email — слабко; довга фраза — надійно", () => {
    expect(passwordStrength("abc")).toBe(0)
    expect(passwordStrength("password123456")).toBe(1)
    expect(
      passwordStrength("olena-2026-zoriana", ["olena@zoriana.example"]),
    ).toBe(1)
    expect(passwordStrength("Abcd1234!!")).toBeLessThan(3)
    expect(passwordStrength("кава з молоком о сьомій ранку")).toBe(3)
    expect(passwordStrength("T7#kq9!Lm2$vX")).toBe(3)
  })
})
