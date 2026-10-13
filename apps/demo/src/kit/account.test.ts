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

import { formatBackupCode } from "@/registry/erp/factor-setup"
import { deviceFromUserAgent } from "@/registry/lib/account"
import { createApiClient } from "@/registry/lib/api"
import {
  createAuthProvider,
  isChallengeRequired,
  isImpersonationForbidden,
  isReauthRequired,
  localizedText,
  type Branding,
} from "@/registry/lib/auth"
import {
  createPlatformHandlers,
  signInMock,
  subscribeMockMessages,
  type MockAccountSeed,
  type MockMessage,
  type MockUser,
} from "@/registry/lib/mocks"

const BASE = "http://erp.test/api/v1"

const users = (): MockUser[] => [
  {
    id: "u1",
    name: "Олена Коваль",
    email: "olena@zoriana.example",
    phone: "+380671234545",
    password: "demo-password",
    totpCode: "123456",
    backupCodes: ["ab12cd34"],
    roles: ["accountant", "admin"],
    permissions: ["invoices:*", "users:*"],
    companies: [],
    companyId: null,
    factors: ["totp", "backup_code", "sms", "passkey"],
  },
  {
    id: "u2",
    name: "Іван Петренко",
    email: "ivan@zoriana.example",
    password: "demo-password",
    totpCode: "654321",
    roles: ["sales"],
    permissions: ["invoices:read"],
    companies: [],
    companyId: null,
    factors: [],
  },
]

const SEEDS: Record<string, MockAccountSeed> = {
  u1: {
    factors: { passkey: { name: "MacBook" } },
    sessions: [
      {
        id: "s-phone",
        device: { type: "mobile", browser: "Safari", os: "iOS" },
        location: { uk: "Львів, Україна", en: "Lviv, Ukraine" },
        createdAt: "2026-10-10T08:00:00.000Z",
        lastActiveAt: "2026-10-13T08:00:00.000Z",
      },
      {
        id: "s-office",
        device: { type: "desktop", browser: "Edge", os: "Windows" },
        createdAt: "2026-10-01T08:00:00.000Z",
        lastActiveAt: "2026-10-12T08:00:00.000Z",
      },
    ],
    trustedDevices: [
      {
        id: "t-phone",
        device: { type: "mobile", browser: "Safari", os: "iOS" },
        createdAt: "2026-10-10T08:00:00.000Z",
        expiresAt: "2026-11-09T08:00:00.000Z",
      },
    ],
  },
}

const BRAND: Branding = {
  name: "Бухгалтерія Плюс",
  palette: "teal",
  panel: { title: { uk: "Облік без паніки", en: "Accounting without panic" } },
}

const server = setupServer(
  ...createPlatformHandlers({
    users: users(),
    baseUrl: BASE,
    sentCode: "654321",
    accountSeeds: SEEDS,
    branding: () => BRAND,
    twoFactorRequired: (user) => user.id === "u1",
  }),
)
let language = "uk"
const client = createApiClient({ baseUrl: BASE, getLanguage: () => language })
let auth = createAuthProvider(client, { baseUrl: BASE })
const messages: MockMessage[] = []
subscribeMockMessages((message) => messages.push(message))

const errorOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => error,
  )

/** Увійти й одразу пройти повторне підтвердження (для змін безпеки). */
async function asUser(userId: "u1" | "u2") {
  signInMock(userId)
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
  messages.length = 0
  language = "uk"
  auth = createAuthProvider(client, { baseUrl: BASE })
})
afterEach(() => {
  server.resetHandlers()
})

describe("фактори (ADR-0011)", () => {
  it("огляд: фактори з назвами, резервні коди, вимога компанії", async () => {
    signInMock("u1")
    const security = await auth.account.getSecurity()
    expect(security.factors.map((f) => f.type)).toEqual([
      "totp",
      "sms",
      "passkey",
    ])
    expect(security.factors.find((f) => f.type === "passkey")?.name).toBe(
      "MacBook",
    )
    expect(security.factors.find((f) => f.type === "sms")?.destination).toBe(
      "+380 •• ••• •• 45",
    )
    expect(security.backupCodes).toEqual({ remaining: 1, total: 10 })
    expect(security.twoFactorRequired).toBe(true)
    expect(security.newSignInAlerts).toBe(true)
  })

  it("застосунок: без повторного підтвердження — 403; QR, хибний і правильний код", async () => {
    signInMock("u2")
    expect(isReauthRequired(await errorOf(auth.account.startTotp()))).toBe(true)
    await auth.reauthenticate({ password: "demo-password" })
    const setup = await auth.account.startTotp()
    expect(setup.uri).toMatch(/^otpauth:\/\/totp\/.+secret=[A-Z2-7]{20}/)
    expect(setup.uri).toContain("issuer=%D0%91") // «Бухгалтерія Плюс» — з бренду
    await expect(
      auth.account.verifyTotp(setup.setupId, "000000"),
    ).rejects.toMatchObject({ status: 422, fieldErrors: { code: "invalid" } })
    const result = await auth.account.verifyTotp(setup.setupId, "654321")
    expect(result.factor.type).toBe("totp")
    // Перший фактор — разом із резервними кодами, профіль уже знає про другий крок.
    expect(result.backupCodes).toHaveLength(10)
    expect((await auth.getMe()).factors).toEqual(["totp", "backup_code"])
  })

  it("наступний вхід просить новий фактор; резервні коди з налаштування працюють", async () => {
    await asUser("u2")
    const { backupCodes = [] } = await auth.account.enableEmail()
    await auth.logout({})
    const error = await errorOf(
      auth.login({ email: "ivan@zoriana.example", password: "demo-password" }),
    )
    expect(isChallengeRequired(error)).toBe(true)
    await auth.login({ method: "backup_code", code: backupCodes[0] ?? "" })
    expect((await auth.getMe()).id).toBe("u2")
    expect((await auth.account.getSecurity()).backupCodes?.remaining).toBe(9)
  })

  it("SMS: перевірка номера, код на новий телефон, маскована адреса", async () => {
    await asUser("u2")
    await expect(auth.account.startSms("123")).rejects.toMatchObject({
      status: 422,
      fieldErrors: { phone: "invalid" },
    })
    const setup = await auth.account.startSms("+380501112233")
    expect(setup).toMatchObject({ destination: "+380 •• ••• •• 33" })
    expect(messages.at(-1)).toMatchObject({
      channel: "sms",
      to: "+380501112233",
      code: "654321",
    })
    const { factor } = await auth.account.verifySms(setup.setupId, "654321")
    expect(factor).toMatchObject({
      type: "sms",
      destination: "+380 •• ••• •• 33",
    })
  })

  it("ключ доступу: параметри створення й назва обов'язкова", async () => {
    await asUser("u2")
    const options = await client.post<{ publicKey: Record<string, unknown> }>(
      "/me/factors/passkey/options",
    )
    expect(options.publicKey).toMatchObject({
      rp: { name: "Бухгалтерія Плюс", id: "erp.test" },
      user: { name: "ivan@zoriana.example" },
      authenticatorSelection: { residentKey: "required" },
    })
    await expect(
      client.post("/me/factors/passkey", {
        name: " ",
        credential: { id: "k" },
      }),
    ).rejects.toMatchObject({ fieldErrors: { name: "required" } })
    const result = await client.post<{ factor: { name: string } }>(
      "/me/factors/passkey",
      { name: "YubiKey", credential: { id: "k" } },
    )
    expect(result.factor.name).toBe("YubiKey")
  })

  it("перейменування, вимкнення; останній фактор, коли компанія вимагає, — 409", async () => {
    await asUser("u1")
    const { factors } = await auth.account.getSecurity()
    const passkey = factors.find((f) => f.type === "passkey")
    const renamed = await auth.account.renameFactor(passkey?.id ?? "", "iPad")
    expect(renamed.name).toBe("iPad")
    await expect(
      auth.account.renameFactor(passkey?.id ?? "", ""),
    ).rejects.toMatchObject({ fieldErrors: { name: "required" } })
    for (const factor of factors.slice(0, -1))
      await auth.account.removeFactor(factor.id)
    await expect(
      auth.account.removeFactor(factors.at(-1)?.id ?? ""),
    ).rejects.toMatchObject({ status: 409, code: "factor_required" })
    expect((await auth.getMe()).factors).toEqual(["backup_code", "passkey"])
  })

  it("нові резервні коди: старі більше не діють", async () => {
    await asUser("u1")
    const codes = await auth.account.regenerateBackupCodes()
    expect(codes).toHaveLength(10)
    expect(formatBackupCode(codes[0] ?? "")).toMatch(/^\w{4}-\w{4}$/)
    await auth.logout({})
    await errorOf(
      auth.login({ email: "olena@zoriana.example", password: "demo-password" }),
    )
    await expect(
      auth.login({ method: "backup_code", code: "ab12cd34" }),
    ).rejects.toMatchObject({ status: 422 })
    await auth.login({ method: "backup_code", code: codes[1] ?? "" })
    expect((await auth.getMe()).id).toBe("u1")
  })
})

describe("сесії, пристрої, журнал входів", () => {
  it("сесії: цей пристрій першим; вихід на іншому й на всіх інших", async () => {
    signInMock("u1")
    const sessions = await auth.account.getSessions()
    expect(sessions.map((s) => [s.id === "s-phone", s.current])).toEqual([
      [false, true],
      [true, false],
      [false, false],
    ])
    expect(sessions[1]?.location).toBe("Львів, Україна")
    await auth.account.endSession("s-phone")
    expect(await auth.account.getSessions()).toHaveLength(2)
    await auth.account.endOtherSessions()
    const [current] = await auth.account.getSessions()
    expect(current?.current).toBe(true)
    // Завершити поточну — те саме, що вийти.
    await auth.account.endSession(current?.id ?? "")
    await expect(auth.refreshMe()).rejects.toMatchObject({ status: 401 })
  })

  it("місце входу — мовою з Accept-Language", async () => {
    signInMock("u1")
    language = "en"
    const sessions = await auth.account.getSessions()
    expect(sessions.map((s) => s.location)).toEqual([
      "Kyiv, Ukraine",
      "Lviv, Ukraine",
      undefined,
    ])
  })

  it("довірений пристрій: з'являється після входу, «Забути» знову просить код", async () => {
    await errorOf(
      auth.login({ email: "olena@zoriana.example", password: "demo-password" }),
    )
    await auth.login({ method: "totp", code: "123456", trustDevice: true })
    const devices = await auth.account.getTrustedDevices()
    expect(devices.map((d) => d.id)).toEqual(["this-device", "t-phone"])
    await auth.account.forgetDevice("this-device")
    await auth.logout({})
    expect(
      isChallengeRequired(
        await errorOf(
          auth.login({
            email: "olena@zoriana.example",
            password: "demo-password",
          }),
        ),
      ),
    ).toBe(true)
  })

  it("журнал: невдала спроба й вхід; лист про новий пристрій — один раз", async () => {
    await errorOf(
      auth.login({ email: "ivan@zoriana.example", password: "wrong" }),
    )
    await auth.login({
      email: "ivan@zoriana.example",
      password: "demo-password",
    })
    const { data, total } = await auth.account.getSignIns(1, 10)
    expect(total).toBe(2)
    expect(data.map((e) => [e.result, e.method, e.newDevice])).toEqual([
      ["success", "password", true],
      ["failed", "password", undefined],
    ])
    expect(messages.filter((m) => m.kind === "new_sign_in")).toHaveLength(1)
    await auth.logout({})
    await auth.login({
      email: "ivan@zoriana.example",
      password: "demo-password",
    })
    expect(messages.filter((m) => m.kind === "new_sign_in")).toHaveLength(1)
    expect((await auth.account.getSignIns(2, 2)).data).toHaveLength(1)
  })

  it("листи про новий вхід вимикаються", async () => {
    signInMock("u2")
    await auth.account.setSignInAlerts(false)
    expect((await auth.account.getSecurity()).newSignInAlerts).toBe(false)
    await auth.logout({})
    await auth.login({
      email: "ivan@zoriana.example",
      password: "demo-password",
    })
    expect(messages.filter((m) => m.kind === "new_sign_in")).toHaveLength(0)
  })
})

describe("«Увійти як…» (ADR-0011)", () => {
  it("причина, профіль від імені, заборона змін безпеки, повернення", async () => {
    signInMock("u1")
    expect(isReauthRequired(await errorOf(auth.impersonate("u2", "x")))).toBe(
      true,
    )
    await auth.reauthenticate({ password: "demo-password" })
    await expect(auth.impersonate("u2", " ")).rejects.toMatchObject({
      fieldErrors: { reason: "required" },
    })
    await expect(auth.impersonate("u1", "тест")).rejects.toMatchObject({
      status: 422,
    })
    await auth.impersonate("u2", "Звернення № 4521")
    const me = await auth.getMe()
    expect(me).toMatchObject({
      id: "u2",
      impersonator: { id: "u1", name: "Олена Коваль" },
    })
    const [current] = await auth.account.getSessions()
    expect(current?.impersonatedBy).toBe("Олена Коваль")
    const { data } = await auth.account.getSignIns(1, 5)
    expect(data[0]).toMatchObject({
      method: "impersonation",
      impersonatedBy: "Олена Коваль",
    })
    expect(
      isImpersonationForbidden(
        await errorOf(auth.changePassword("demo-password", "new-password-1")),
      ),
    ).toBe(true)
    expect(
      isImpersonationForbidden(await errorOf(auth.account.startTotp())),
    ).toBe(true)
    await auth.stopImpersonation()
    const back = await auth.getMe()
    expect(back.id).toBe("u1")
    expect(back.impersonator).toBeUndefined()
  })

  it("без права users:impersonate — 403", async () => {
    await asUser("u2")
    await expect(auth.impersonate("u1", "тест")).rejects.toMatchObject({
      status: 403,
      code: "forbidden",
    })
  })
})

describe("бренд і пристрої", () => {
  it("бренд у GET /auth/methods; текст мовою інтерфейсу", async () => {
    const { branding } = await auth.getMethods()
    expect(branding?.name).toBe("Бухгалтерія Плюс")
    expect(localizedText(branding?.panel?.title, "en")).toBe(
      "Accounting without panic",
    )
    expect(localizedText(branding?.panel?.title, "pl")).toBe("Облік без паніки")
    expect(localizedText("Вхід", "en")).toBe("Вхід")
  })

  it("пристрій з User-Agent", () => {
    expect(
      deviceFromUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toEqual({ type: "mobile", browser: "Safari", os: "iOS" })
    expect(
      deviceFromUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
      ),
    ).toEqual({ type: "desktop", browser: "Edge", os: "Windows" })
    expect(
      deviceFromUserAgent(
        "Mozilla/5.0 (Linux; Android 15; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
      ),
    ).toEqual({ type: "tablet", browser: "Chrome", os: "Android" })
    expect(deviceFromUserAgent("")).toEqual({ type: "desktop" })
  })
})
