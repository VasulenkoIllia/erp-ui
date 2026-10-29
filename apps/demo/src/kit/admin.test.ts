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

import {
  browserTimezone,
  timezoneOptions,
} from "@/registry/erp/timezone-select"
import { createApiClient } from "@/registry/lib/api"
import {
  createAuthProvider,
  isChallengeRequired,
  isFactorSetupRequired,
  isReauthRequired,
  PasswordChangeRequiredError,
} from "@/registry/lib/auth"
import { DEFAULT_MOCK_POLICY } from "@/registry/lib/mock-admin"
import {
  createPlatformHandlers,
  signInMock,
  subscribeMockMessages,
  type MockMessage,
  type MockUser,
} from "@/registry/lib/mocks"
import {
  ipAllowed,
  ipInCidr,
  isValidCidr,
  parseIpv4,
  policyReadOnlyReason,
  type SecurityPolicy,
} from "@/registry/lib/security-policy"

const BASE = "http://erp.test/api/v1"

const users: MockUser[] = [
  {
    id: "u1",
    name: "Олена Коваль",
    email: "olena@zoriana.example",
    password: "demo-password",
    totpCode: "123456",
    backupCodes: ["ab12cd34"],
    roles: ["accountant"],
    permissions: ["invoices:*"],
    companies: [],
    companyId: null,
    factors: ["totp", "backup_code"],
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
  {
    id: "a1",
    name: "Марта Бойко",
    email: "marta@zoriana.example",
    password: "demo-password",
    totpCode: "111111",
    roles: ["admin"],
    // `invoices:*` — «стеля» доступу (ADR-0034): без нього адміністратор не скине другого кроку
    // бухгалтерці з правами на рахунки.
    permissions: ["users:*", "security:*", "invoices:*"],
    companies: [],
    companyId: null,
    factors: [],
  },
]

const server = setupServer(
  ...createPlatformHandlers({
    users,
    baseUrl: BASE,
    sentCode: "654321",
    // Пароль Івана змінено давно: протермінується, щойно політика задасть термін.
    accountSeeds: { u2: { passwordChangedAt: "2026-01-05T09:00:00.000Z" } },
    roles: [
      { id: "accountant", name: { uk: "Бухгалтер", en: "Accountant" } },
      { id: "sales", name: { uk: "Продажі", en: "Sales" } },
    ],
    apiResources: {
      invoices: { uk: "Рахунки", en: "Invoices" },
      users: { uk: "Користувачі", en: "Users" },
    },
  }),
)
const client = createApiClient({ baseUrl: BASE, getLanguage: () => "uk" })
let auth = createAuthProvider(client, { baseUrl: BASE })
const messages: MockMessage[] = []
subscribeMockMessages((message) => messages.push(message))

const errorOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => error,
  )

async function asUser(userId: string) {
  signInMock(userId)
  await auth.reauthenticate({ password: "demo-password" })
}

/** Зберегти політику від імені адміністратора (з повторним підтвердженням). */
async function savePolicy(patch: Partial<SecurityPolicy>) {
  await asUser("a1")
  const { policy } = await auth.admin.getSecurityPolicy()
  await auth.admin.updateSecurityPolicy({ ...policy, ...patch })
  signInMock(null)
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
  for (const user of users) user.password = "demo-password"
  auth = createAuthProvider(client, { baseUrl: BASE })
})
afterEach(() => {
  server.resetHandlers()
})

describe("політика лише для перегляду (ADR-0036)", () => {
  it.each([
    [true, true, undefined],
    [true, false, undefined],
    [false, true, "platform"],
    [false, false, "permission"],
    [undefined, true, undefined],
    [undefined, false, "permission"],
  ] as const)("canUpdate %s, право %s → %s", (canUpdate, hasRight, reason) => {
    expect(policyReadOnlyReason(canUpdate, hasRight)).toBe(reason)
  })
})

describe("адреси IP (ADR-0012)", () => {
  it("розбирає IPv4 і відкидає зайве", () => {
    expect(parseIpv4("192.0.2.24")).toBe(3221226008)
    expect(parseIpv4("256.0.0.1")).toBeNull()
    expect(parseIpv4("01.2.3.4")).toBeNull()
    expect(parseIpv4("1.2.3")).toBeNull()
  })

  it("мережі CIDR: IPv4, IPv6, хибні префікси", () => {
    expect(isValidCidr("203.0.113.0/24")).toBe(true)
    expect(isValidCidr(" 203.0.113.7 ")).toBe(true)
    expect(isValidCidr("2001:db8::/32")).toBe(true)
    expect(isValidCidr("203.0.113.0/33")).toBe(false)
    expect(isValidCidr("2001:db8::/129")).toBe(false)
    expect(isValidCidr("203.0.113.0/24/1")).toBe(false)
    expect(isValidCidr("localhost")).toBe(false)
  })

  it("належність адреси мережі й порожній список", () => {
    expect(ipInCidr("192.0.2.24", "192.0.2.0/24")).toBe(true)
    expect(ipInCidr("192.0.3.24", "192.0.2.0/24")).toBe(false)
    expect(ipInCidr("192.0.2.24", "0.0.0.0/0")).toBe(true)
    expect(ipInCidr("192.0.2.24", "192.0.2.24")).toBe(true)
    expect(ipInCidr("2001:DB8::1", "2001:db8::1")).toBe(true)
    expect(ipAllowed("192.0.2.24", [])).toBe(true)
    expect(ipAllowed("192.0.2.24", ["198.51.100.0/24"])).toBe(false)
  })
})

describe("часові пояси", () => {
  it("список відсортовано за зсувом, Kyiv замість Kiev, є UTC", () => {
    const options = timezoneOptions(new Date("2026-01-15T12:00:00Z"))
    const values = options.map((o) => o.value)
    expect(values).toContain("UTC")
    expect(values).toContain("Europe/Kyiv")
    expect(values).not.toContain("Europe/Kiev")
    expect(options.find((o) => o.value === "Europe/Kyiv")?.label).toBe(
      "(UTC+02:00) Europe/Kyiv",
    )
    const offsets = options.map((o) => o.offset)
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b))
    expect(browserTimezone()).not.toBe("Europe/Kiev")
  })
})

describe("профіль (ADR-0012)", () => {
  it("зміни потрапляють у /me; порожні поля не перекривають дані", async () => {
    signInMock("u2")
    await auth.account.updateProfile({
      name: "Іван Петренко-Сидоренко",
      position: "Менеджер з продажу",
      timezone: "Europe/Kyiv",
      signature: "З повагою, Іван",
      phone: "",
    })
    const me = await auth.getMe()
    expect(me).toMatchObject({
      name: "Іван Петренко-Сидоренко",
      position: "Менеджер з продажу",
      timezone: "Europe/Kyiv",
      signature: "З повагою, Іван",
    })
  })

  it("перевірка полів: ім'я, телефон, часовий пояс, довжина", async () => {
    signInMock("u2")
    await expect(
      auth.account.updateProfile({
        name: " ",
        phone: "123",
        timezone: "Mars/Olympus",
        position: "х".repeat(101),
      }),
    ).rejects.toMatchObject({
      status: 422,
      fieldErrors: {
        name: "required",
        phone: "invalid",
        timezone: "invalid",
        position: "tooLong",
      },
    })
  })

  it("фото: завантаження, лише зображення, видалення", async () => {
    signInMock("u2")
    const url = await auth.account.uploadAvatar(
      new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }),
    )
    expect(url).toMatch(/^data:image\/png;base64,/)
    expect((await auth.getMe()).avatarUrl).toBe(url)
    await expect(
      auth.account.uploadAvatar(new Blob(["x"], { type: "text/plain" })),
    ).rejects.toMatchObject({ status: 422, fieldErrors: { file: "type" } })
    await auth.account.removeAvatar()
    expect((await auth.getMe()).avatarUrl).toBeUndefined()
  })
})

describe("токени API (ADR-0012)", () => {
  it("права — лише з прав користувача, згруповані за ресурсами", async () => {
    signInMock("u2")
    const { tokens, scopes } = await auth.account.getApiTokens()
    expect(tokens).toEqual([])
    expect(scopes).toEqual([
      { id: "invoices:read", label: "Перегляд", group: "Рахунки" },
    ])
  })

  it("створення після підтвердження: секрет один раз, у списку — лише префікс", async () => {
    signInMock("u1")
    expect(
      isReauthRequired(
        await errorOf(
          auth.account.createApiToken({
            name: "1С",
            scopes: ["invoices:read"],
            expiresInDays: 90,
          }),
        ),
      ),
    ).toBe(true)
    await auth.reauthenticate({ password: "demo-password" })
    await expect(
      auth.account.createApiToken({
        name: " ",
        scopes: ["users:read"],
        expiresInDays: 7,
      }),
    ).rejects.toMatchObject({
      fieldErrors: {
        name: "required",
        scopes: "invalid",
        expiresInDays: "invalid",
      },
    })
    const created = await auth.account.createApiToken({
      name: "Інтеграція з 1С",
      scopes: ["invoices:read", "invoices:create"],
      expiresInDays: 90,
    })
    expect(created.token).toMatch(/^erp_/)
    expect(created.item).toMatchObject({
      name: "Інтеграція з 1С",
      prefix: `${created.token.slice(0, 8)}…`,
      lastUsedAt: null,
    })
    const { tokens } = await auth.account.getApiTokens()
    expect(tokens).toHaveLength(1)
    expect(JSON.stringify(tokens)).not.toContain(created.token)
    await auth.account.revokeApiToken(created.item.id)
    expect((await auth.account.getApiTokens()).tokens).toEqual([])
  })
})

describe("політика безпеки (ADR-0012)", () => {
  it("без права — 403; адміністратор бачить політику, ролі й свою адресу", async () => {
    signInMock("u2")
    await expect(auth.admin.getSecurityPolicy()).rejects.toMatchObject({
      status: 403,
    })
    signInMock("a1")
    const { policy, options } = await auth.admin.getSecurityPolicy()
    expect(policy.twoFactor).toBe("off")
    expect(policy.password).toEqual(DEFAULT_MOCK_POLICY.password)
    expect(options.roles).toEqual([
      { id: "accountant", name: "Бухгалтер" },
      { id: "sales", name: "Продажі" },
    ])
    expect(options.currentIp).toBe("192.0.2.24")
  })

  it("зміна — після підтвердження; помилки полів і захист від самоблокування", async () => {
    signInMock("a1")
    const { policy } = await auth.admin.getSecurityPolicy()
    expect(
      isReauthRequired(await errorOf(auth.admin.updateSecurityPolicy(policy))),
    ).toBe(true)
    await auth.reauthenticate({ password: "demo-password" })
    await expect(
      auth.admin.updateSecurityPolicy({
        ...policy,
        twoFactor: "roles",
        twoFactorRoles: [],
        ipAllowlist: ["10.0.0.0/8", "10.0.0.300"],
      }),
    ).rejects.toMatchObject({
      status: 422,
      fieldErrors: { twoFactorRoles: "required", "ipAllowlist.1": "invalid" },
    })
    await expect(
      auth.admin.updateSecurityPolicy({
        ...policy,
        ipAllowlist: ["198.51.100.0/24"],
      }),
    ).rejects.toMatchObject({ fieldErrors: { ipAllowlist: "excludesCurrent" } })
    const saved = await auth.admin.updateSecurityPolicy({
      ...policy,
      passwordless: ["email"],
      password: { ...policy.password, minLength: 12 },
      ipAllowlist: ["192.0.2.0/24"],
    })
    expect(saved.ipAllowlist).toEqual(["192.0.2.0/24"])
  })

  it("вхід підлаштовується: способи без пароля, мінімальна довжина пароля", async () => {
    await savePolicy({
      passwordless: ["email"],
      password: { minLength: 12, expiryDays: null, preventReuse: 0 },
    })
    const methods = await auth.getMethods()
    expect(methods.passwordless).toEqual(["email"])
    expect(methods.passwordPolicy?.minLength).toBe(12)
    signInMock("u2")
    await expect(
      auth.changePassword("demo-password", "elevenchars"),
    ).rejects.toMatchObject({ fieldErrors: { newPassword: "weak" } })
  })

  it("адреса поза списком — 403 ip_not_allowed і запис у журналі", async () => {
    // Мок не дасть зберегти такий список через API — кладемо, як інший адміністратор з іншої мережі.
    localStorage.setItem(
      "erp-ui:mock-security-policy",
      JSON.stringify({
        ...DEFAULT_MOCK_POLICY,
        ipAllowlist: ["198.51.100.0/24"],
      }),
    )
    await expect(
      auth.login({ email: "ivan@zoriana.example", password: "demo-password" }),
    ).rejects.toMatchObject({ status: 403, code: "ip_not_allowed" })
    localStorage.removeItem("erp-ui:mock-security-policy")
    signInMock("u2")
    const { data } = await auth.account.getSignIns(1, 5)
    expect(data[0]).toMatchObject({ result: "blocked", method: "password" })
  })
})

describe("обов'язковий другий крок (ADR-0012)", () => {
  it("без фактора — налаштування під час входу, потім завершення", async () => {
    await savePolicy({ twoFactor: "roles", twoFactorRoles: ["sales"] })
    const error = await errorOf(
      auth.login({ email: "ivan@zoriana.example", password: "demo-password" }),
    )
    expect(isFactorSetupRequired(error)).toBe(true)
    if (!isFactorSetupRequired(error)) return
    expect(error.factors).toEqual(DEFAULT_MOCK_POLICY.allowedFactors)
    // Ще нічого не налаштовано — завершити не можна.
    await expect(auth.completeFactorSetup()).rejects.toMatchObject({
      status: 409,
      code: "factor_required",
    })
    // На цьому кроці повторне підтвердження не потрібне: пароль щойно введено.
    const { backupCodes } = await auth.account.enableEmail()
    expect(backupCodes).toHaveLength(10)
    await auth.completeFactorSetup()
    expect((await auth.getMe()).factors).toEqual(["backup_code", "email"])
  })

  it("дозволені способи — з політики", async () => {
    await savePolicy({ twoFactor: "all", allowedFactors: ["totp", "passkey"] })
    const error = await errorOf(
      auth.login({ email: "ivan@zoriana.example", password: "demo-password" }),
    )
    expect(isFactorSetupRequired(error) && error.factors).toEqual([
      "totp",
      "passkey",
    ])
  })
})

describe("пароль за політикою (ADR-0012)", () => {
  it("протермінований — новий пароль, не повтор і не коротший за мінімум", async () => {
    await savePolicy({
      password: { minLength: 10, expiryDays: 90, preventReuse: 3 },
    })
    const error = await errorOf(
      auth.login({ email: "ivan@zoriana.example", password: "demo-password" }),
    )
    expect(error).toBeInstanceOf(PasswordChangeRequiredError)
    expect((error as PasswordChangeRequiredError).reason).toBe("expired")
    await expect(auth.setNewPassword("short")).rejects.toMatchObject({
      fieldErrors: { password: "weak" },
    })
    await expect(auth.setNewPassword("demo-password")).rejects.toMatchObject({
      fieldErrors: { password: "same" },
    })
    await auth.setNewPassword("new-password-1")
    expect((await auth.getMe()).id).toBe("u2")
    // Історія: повернутися до попереднього пароля не можна.
    await expect(
      auth.changePassword("new-password-1", "demo-password"),
    ).rejects.toMatchObject({ fieldErrors: { newPassword: "reused" } })
  })
})

describe("втрачений другий крок (ADR-0012)", () => {
  it("запит на кроці коду → адміністратор скидає фактори → вхід без коду", async () => {
    const challenge = await errorOf(
      auth.login({ email: "olena@zoriana.example", password: "demo-password" }),
    )
    expect(isChallengeRequired(challenge)).toBe(true)
    await auth.requestRecovery("Загубила телефон у відрядженні")
    expect(messages.at(-1)).toMatchObject({
      channel: "email",
      to: "olena@zoriana.example",
      kind: "recovery",
    })

    signInMock("u2")
    await expect(auth.admin.getRecoveryRequests()).rejects.toMatchObject({
      status: 403,
    })
    signInMock("a1")
    const [request] = await auth.admin.getRecoveryRequests()
    expect(request).toMatchObject({
      userId: "u1",
      userName: "Олена Коваль",
      comment: "Загубила телефон у відрядженні",
    })
    expect(
      isReauthRequired(
        await errorOf(auth.admin.resetFactors("u1", "Перевірено дзвінком")),
      ),
    ).toBe(true)
    await auth.reauthenticate({ password: "demo-password" })
    await expect(auth.admin.resetFactors("u1", " ")).rejects.toMatchObject({
      fieldErrors: { reason: "required" },
    })
    await expect(
      auth.admin.resetFactors("a1", "Сам собі"),
    ).rejects.toMatchObject({ fieldErrors: { userId: "invalid" } })
    await auth.admin.resetFactors("u1", "Перевірено дзвінком")
    expect(await auth.admin.getRecoveryRequests()).toEqual([])
    expect(messages.at(-1)).toMatchObject({
      to: "olena@zoriana.example",
      kind: "factors_reset",
      detail: "Марта Бойко",
    })

    signInMock(null)
    await auth.login({
      email: "olena@zoriana.example",
      password: "demo-password",
    })
    expect((await auth.getMe()).factors).toEqual([])
  })

  it("запит — лише на кроці коду; відхилений зникає зі списку", async () => {
    await expect(auth.requestRecovery("")).rejects.toMatchObject({
      status: 401,
    })
    await errorOf(
      auth.login({ email: "olena@zoriana.example", password: "demo-password" }),
    )
    await auth.requestRecovery("")
    signInMock("a1")
    const [request] = await auth.admin.getRecoveryRequests()
    expect(request?.comment).toBeUndefined()
    await auth.admin.declineRecoveryRequest(request?.id ?? "")
    expect(await auth.admin.getRecoveryRequests()).toEqual([])
  })
})
