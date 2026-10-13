/**
 * Мок входу й профілю (ADR-0003, ADR-0010): усі способи з контракту lib/auth — пароль, коди
 * (застосунок, резервні, SMS/Viber, email), посилання з листа, ключ доступу, SSO, відновлення
 * пароля, запрошення, реєстрація, довірений пристрій, ковзна сесія, перевірка «не бот»; `/me`
 * і вподобання PF11.
 *
 * Коди SMS і email мок не надсилає — він передає їх `subscribeMockMessages` (демо показує як
 * сповіщення). Ключ доступу мок не перевіряє криптографічно: користувача визначає `userHandle`.
 * Фактори, сесії, журнал входів і «Увійти як…» — lib/mock-account (ADR-0011).
 */
import { http, type HttpHandler } from "msw/http"

import {
  SETUP_FACTORS,
  type SetupFactor,
  type SignInMethod,
} from "@/registry/lib/account"
import { API_PREFIX } from "@/registry/lib/api"
import {
  meSchema,
  type AuthFactor,
  type AuthMethods,
  type Branding,
  type LocalizedText,
  type Me,
} from "@/registry/lib/auth"
import {
  consumeBackupCode,
  createAccountHandlers,
  isTrustedHere,
  mockBlocked,
  mockFactorTypes,
  mockProfile,
  passwordChanged,
  passwordChangedAt,
  passwordReused,
  recordSignIn,
  setMockAccountSeeds,
  trustHere,
  type MockAccountSeed,
} from "@/registry/lib/mock-account"
import {
  createAuditHandlers,
  setMockAuditSeeds,
  type MockAuditEvent,
} from "@/registry/lib/mock-audit"
import {
  createNotificationHandlers,
  type MockNotificationEvent,
} from "@/registry/lib/mock-notifications"
import {
  createWebhookHandlers,
  setMockWebhookSeeds,
  type MockWebhookEventType,
  type MockWebhookSeed,
} from "@/registry/lib/mock-webhooks"
import {
  createAdminHandlers,
  DEFAULT_MOCK_POLICY,
  getMockPolicy,
  ipAllowedByPolicy,
  ipNotAllowed,
  policyRequiresFactor,
  setMockPolicyDefaults,
} from "@/registry/lib/mock-admin"
import {
  addMockUser,
  authenticate,
  currentMockUser,
  errorResponse,
  getMockSession,
  impersonationForbidden,
  json,
  maskEmail,
  maskPhone,
  mockUsersList,
  newExpiry,
  noContent,
  randomToken,
  sendMockMessage,
  setMockUsers,
  setSessionMinutes,
  unauthenticated,
  writeMockSession,
  type MockChallenge,
  type MockUser,
} from "@/registry/lib/mock-server"
import type { Preferences } from "@/registry/lib/preferences"
import type { SecurityPolicy } from "@/registry/lib/security-policy"

export const DEFAULT_MOCK_METHODS: AuthMethods = {
  password: true,
  passwordless: ["email", "sms", "passkey"],
  providers: [
    { id: "google", type: "google", name: "Google" },
    { id: "apple", type: "apple", name: "Apple" },
  ],
  passwordReset: true,
  signUp: true,
  trustedDeviceDays: 30,
  idleTimeoutMinutes: null,
}

export interface MockInvite {
  token: string
  email: string
  name?: string
  companyName: string
  invitedBy?: string
  /** Ролі, права й компанії нового користувача. */
  user: Pick<MockUser, "roles" | "permissions" | "companies" | "companyId">
}

export interface PlatformMockOptions {
  users: MockUser[]
  baseUrl?: string
  defaultPreferences?: Partial<Preferences>
  /** Що ввімкнено (`GET /auth/methods`); решта — з DEFAULT_MOCK_METHODS. */
  methods?: Partial<AuthMethods>
  /** Код, який мок «надсилає» в SMS і листах. */
  sentCode?: string
  /** Адреса посилань у листах. */
  linkUrl?: (kind: "login" | "reset" | "invite", token: string) => string
  invites?: MockInvite[]
  /** Сесія без активності, хв. */
  sessionMinutes?: number
  /** Після скількох невдалих спроб просити перевірку «не бот». */
  captchaAfter?: number
  /** Бренд сторінки входу; функція — щоб демо перемикало бренди (white-label). */
  branding?: Branding | (() => Branding | undefined)
  /** Початкові дані акаунтів: інші пристрої, журнал входів, назви факторів (ключ — id). */
  accountSeeds?: Record<string, MockAccountSeed>
  /** Які фактори можна додати в налаштуваннях. */
  availableFactors?: SetupFactor[]
  /** Компанія вимагає другий крок (останній фактор не видалити) — понад політику безпеки. */
  twoFactorRequired?: (user: MockUser) => boolean
  /** Типова політика безпеки (ADR-0012); адміністратор змінює її в `PUT /security-policy`. */
  securityPolicy?: Partial<SecurityPolicy>
  /** Назви ролей для політики безпеки. */
  roles?: { id: string; name: LocalizedText }[]
  /** Назви ресурсів для прав токенів API: { invoices: { uk: "Рахунки", en: "Invoices" } }. */
  apiResources?: Record<string, LocalizedText>
  /** Початкові події журналу аудиту (ADR-0013). */
  auditSeeds?: MockAuditEvent[]
  /** Події для вебхуків: { "invoices.created": { label, group } }. */
  webhookEvents?: Record<string, MockWebhookEventType>
  /** Початкові підписки вебхуків із доставками. */
  webhookSeeds?: MockWebhookSeed[]
  /** Канали й події сповіщень проекту. */
  notificationChannels?: { id: string; label?: LocalizedText }[]
  notificationEvents?: MockNotificationEvent[]
}

const RESEND_SECONDS = 30
const MAX_ATTEMPTS = 5
const PREFS_KEY = (userId: string) => `erp-ui:mock-preferences:${userId}`

function toMe(user: MockUser): Me {
  const session = getMockSession()
  const admin = session?.impersonatorId
    ? mockUsersList().find((u) => u.id === session.impersonatorId)
    : undefined
  return meSchema.parse({
    ...user,
    ...mockProfile(user),
    factors: mockFactorTypes(user),
    sessionExpiresAt: new Date(session?.expiresAt ?? newExpiry()).toISOString(),
    ...(admin ? { impersonator: { id: admin.id, name: admin.name } } : {}),
  })
}

const token = randomToken

const digits = (value: string) => value.replace(/\D/g, "")

function base64UrlDecode(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/")
  return atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="))
}

function base64UrlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

export function createPlatformHandlers({
  users,
  baseUrl = API_PREFIX,
  defaultPreferences,
  methods: methodsOverride,
  sentCode = "123456",
  linkUrl = (kind, value) =>
    `${globalThis.location?.origin ?? ""}${globalThis.location?.pathname ?? "/"}#/login/${kind === "login" ? "link" : kind}?token=${value}`,
  invites = [],
  sessionMinutes = 30,
  captchaAfter = 3,
  branding,
  accountSeeds = {},
  availableFactors,
  twoFactorRequired,
  securityPolicy,
  roles,
  apiResources,
  auditSeeds = [],
  webhookEvents,
  webhookSeeds = [],
  notificationChannels,
  notificationEvents,
}: PlatformMockOptions): HttpHandler[] {
  setMockUsers(users)
  setMockAccountSeeds(accountSeeds)
  setMockAuditSeeds(auditSeeds)
  setMockWebhookSeeds(webhookSeeds)
  const baseMethods = { ...DEFAULT_MOCK_METHODS, ...methodsOverride }
  setMockPolicyDefaults({
    ...DEFAULT_MOCK_POLICY,
    passwordless: [...baseMethods.passwordless],
    ssoProviders: baseMethods.providers.map((p) => p.id),
    sessionMinutes,
    idleTimeoutMinutes: baseMethods.idleTimeoutMinutes,
    trustedDeviceDays: baseMethods.trustedDeviceDays,
    ...securityPolicy,
  })
  setSessionMinutes(getMockPolicy().sessionMinutes)
  /** Налаштування входу з урахуванням політики організації (ADR-0012). */
  const currentMethods = () => {
    const policy = getMockPolicy()
    return {
      ...baseMethods,
      passwordless: baseMethods.passwordless.filter((m) =>
        policy.passwordless.includes(m),
      ),
      providers: baseMethods.providers.filter((p) =>
        policy.ssoProviders.includes(p.id),
      ),
      trustedDeviceDays: policy.trustedDeviceDays,
      idleTimeoutMinutes: policy.idleTimeoutMinutes,
      passwordPolicy: { minLength: policy.password.minLength },
    }
  }
  const methods = baseMethods
  /** Фактори, які можна налаштувати: проект ∩ політика. */
  const setupFactors = () =>
    (availableFactors ?? [...SETUP_FACTORS]).filter((f) =>
      getMockPolicy().allowedFactors.includes(f),
    )
  const factorRequired = (user: MockUser) =>
    policyRequiresFactor(user) || (twoFactorRequired?.(user) ?? false)
  const brandingNow = () =>
    typeof branding === "function" ? branding() : branding
  /** Невдалі спроби за email — після captchaAfter потрібна перевірка «не бот». */
  const failures = new Map<string, number>()
  /** Одноразові токени листів: вхід, відновлення пароля. */
  const tokens = new Map<
    string,
    { userId: string; kind: "login" | "reset"; expires: number }
  >()
  const usedInvites = new Set<string>()

  const findUser = (identifier: string) => {
    const lower = identifier.trim().toLowerCase()
    return mockUsersList().find(
      (u) =>
        u.email.toLowerCase() === lower ||
        (u.phone !== undefined &&
          digits(u.phone) !== "" &&
          digits(u.phone) === digits(identifier)),
    )
  }

  const needsCaptcha = (key: string, captchaToken?: string) => {
    if ((failures.get(key) ?? 0) < captchaAfter) return false
    if (captchaToken) {
      failures.delete(key)
      return false
    }
    return true
  }

  const captchaRequired = () =>
    errorResponse(428, {
      code: "captcha_required",
      message: "Confirm that you are not a bot",
    })

  /** Надіслати код методом (sms/email) і повернути, куди. */
  const deliver = (
    user: MockUser | undefined,
    method: AuthFactor,
    fallback?: string,
  ) => {
    if (method === "sms") {
      const to = user?.phone ?? fallback ?? ""
      if (user)
        sendMockMessage({ channel: "sms", to, kind: "login", code: sentCode })
      return maskPhone(to)
    }
    if (method === "email") {
      const to = user?.email ?? fallback ?? ""
      if (user) {
        const value = token()
        tokens.set(value, {
          userId: user.id,
          kind: "login",
          expires: Date.now() + 15 * 60_000,
        })
        sendMockMessage({
          channel: "email",
          to,
          kind: "login",
          code: sentCode,
          link: linkUrl("login", value),
        })
      }
      return maskEmail(to)
    }
    return undefined
  }

  /** Почати підтвердження: відповідь `challenge` і сесія на кроці коду. */
  const startChallenge = (
    userId: string,
    challenge: Omit<MockChallenge, "attempts" | "sentAt">,
    user: MockUser | undefined,
    fallback?: string,
  ) => {
    const destination =
      deliver(user, challenge.method, fallback) ?? challenge.destination
    const sent = challenge.method === "sms" || challenge.method === "email"
    writeMockSession({
      userId,
      stage: "challenge",
      challenge: {
        ...challenge,
        destination,
        attempts: 0,
        sentAt: sent ? Date.now() : undefined,
      },
      expiresAt: Date.now() + 15 * 60_000,
    })
    return json({
      status: "challenge",
      challenge: {
        methods: challenge.methods,
        method: challenge.method,
        destination,
        resendIn: sent ? RESEND_SECONDS : undefined,
        codeLength: challenge.method === "backup_code" ? 8 : 6,
        secondFactor: challenge.secondFactor,
      },
    })
  }

  const signedIn = (
    userId: string,
    method: SignInMethod,
    trustDevice?: boolean,
    second = false,
  ) => {
    const user = mockUsersList().find((u) => u.id === userId)
    const blocked = user ? accountBlocked(user, method) : null
    if (blocked) return blocked
    if (!ipAllowedByPolicy()) {
      if (user) recordSignIn(user, { result: "blocked", method })
      writeMockSession(null)
      return ipNotAllowed()
    }
    const policy = getMockPolicy()
    if (user && trustDevice && second && policy.trustedDeviceDays > 0)
      trustHere(user, policy.trustedDeviceDays)
    const changedAt = user ? passwordChangedAt(user) : null
    // Термін пароля перевіряємо лише після входу паролем (з кодом чи без).
    const expired =
      policy.password.expiryDays !== null &&
      (method === "password" || second) &&
      changedAt !== null &&
      changedAt + policy.password.expiryDays * 86_400_000 < Date.now()
    if (user?.mustChangePassword || expired) {
      writeMockSession({
        userId,
        stage: "password_change",
        expiresAt: Date.now() + 15 * 60_000,
      })
      return json({
        status: "password_change_required",
        reason: user?.mustChangePassword ? "temporary" : "expired",
      })
    }
    authenticate(userId)
    if (user) recordSignIn(user, { result: "success", method })
    return json({ status: "authenticated" })
  }

  /** Чутлива дія: потрібне свіже повторне підтвердження. */
  const reauthRequired = (): Response | null => {
    const session = getMockSession()
    return !session?.reauthUntil || session.reauthUntil < Date.now()
      ? errorResponse(403, {
          code: "reauth_required",
          message: "Confirm it's you",
        })
      : null
  }

  /** Заблокований адміністратором акаунт не входить (ADR-0013). */
  const accountBlocked = (user: MockUser, method: SignInMethod) => {
    if (!mockBlocked(user)) return null
    recordSignIn(user, { result: "blocked", method })
    writeMockSession(null)
    return errorResponse(403, {
      code: "account_blocked",
      message: "This account is blocked",
    })
  }

  /** Пароль чи токен підтверджено: другий фактор, його налаштування (політика) або вхід. */
  const afterFirstFactor = (user: MockUser, method: SignInMethod) => {
    const blocked = accountBlocked(user, method)
    if (blocked) return blocked
    if (!ipAllowedByPolicy()) {
      recordSignIn(user, { result: "blocked", method })
      return ipNotAllowed()
    }
    const factors = mockFactorTypes(user)
    if (!factors.length && factorRequired(user)) {
      writeMockSession({
        userId: user.id,
        stage: "factor_setup",
        expiresAt: Date.now() + 15 * 60_000,
      })
      return json({ status: "factor_setup_required", factors: setupFactors() })
    }
    if (factors.length && !isTrustedHere(user)) {
      const preferred: AuthFactor = factors.includes("totp")
        ? "totp"
        : (factors.find((f) => f !== "backup_code") ?? "totp")
      return startChallenge(
        user.id,
        { methods: factors, method: preferred, secondFactor: true },
        user,
      )
    }
    return signedIn(user.id, method)
  }

  const weakPassword = (password: unknown) =>
    typeof password !== "string" ||
    password.length < getMockPolicy().password.minLength

  /** Пароль серед останніх N (політика «не повторювати»). */
  const reused = (user: MockUser, password: unknown) =>
    typeof password === "string" &&
    passwordReused(user, password, getMockPolicy().password.preventReuse)

  const validation = (fields: Record<string, string>) =>
    errorResponse(422, {
      code: "validation",
      message: "Validation failed",
      fieldErrors: fields,
    })

  return [
    http.get(`${baseUrl}/auth/methods`, () => {
      const brand = brandingNow()
      const current = currentMethods()
      return json(brand ? { ...current, branding: brand } : current)
    }),

    http.post(`${baseUrl}/auth/login`, async ({ request }) => {
      const body = (await request.json()) as {
        email?: string
        password?: string
        captchaToken?: string
      }
      const key = body.email?.toLowerCase() ?? ""
      if (needsCaptcha(key, body.captchaToken)) return captchaRequired()
      const user = mockUsersList().find(
        (u) => u.email.toLowerCase() === key && u.password === body.password,
      )
      if (!user) {
        failures.set(key, (failures.get(key) ?? 0) + 1)
        const known = findUser(key)
        if (known) recordSignIn(known, { result: "failed", method: "password" })
        return errorResponse(401, {
          code: "unauthenticated",
          message: "Invalid email or password",
        })
      }
      failures.delete(key)
      return afterFirstFactor(user, "password")
    }),

    http.post(`${baseUrl}/auth/start`, async ({ request }) => {
      const body = (await request.json()) as {
        method?: "email" | "sms"
        identifier?: string
        captchaToken?: string
      }
      if (body.method !== "email" && body.method !== "sms")
        return validation({ method: "invalid" })
      if (!currentMethods().passwordless.includes(body.method))
        return errorResponse(403, {
          code: "forbidden",
          message: "Method disabled",
        })
      const identifier = body.identifier?.trim() ?? ""
      if (!identifier) return validation({ identifier: "required" })
      if (needsCaptcha(identifier, body.captchaToken)) return captchaRequired()
      // Невідомий акаунт отримує таку саму відповідь: не розкриваємо, хто зареєстрований.
      const user = findUser(identifier)
      return startChallenge(
        user?.id ?? "",
        { methods: [body.method], method: body.method, secondFactor: false },
        user,
        identifier,
      )
    }),

    http.post(`${baseUrl}/auth/challenge/send`, async ({ request }) => {
      const { method } = (await request.json()) as { method?: AuthFactor }
      const session = getMockSession()
      const challenge = session?.challenge
      if (session?.stage !== "challenge" || !challenge || !method)
        return unauthenticated()
      if (!challenge.methods.includes(method))
        return validation({ method: "invalid" })
      const elapsed = (Date.now() - (challenge.sentAt ?? 0)) / 1000
      const resend = method === "sms" || method === "email"
      if (resend && method === challenge.method && elapsed < RESEND_SECONDS)
        return errorResponse(429, {
          code: "rate_limited",
          message: `Retry in ${String(Math.ceil(RESEND_SECONDS - elapsed))} s`,
        })
      const user = mockUsersList().find((u) => u.id === session.userId)
      const destination =
        deliver(user, method, challenge.destination) ?? undefined
      writeMockSession({
        ...session,
        challenge: {
          ...challenge,
          method,
          destination: destination ?? challenge.destination,
          sentAt: resend ? Date.now() : challenge.sentAt,
        },
      })
      return json({
        methods: challenge.methods,
        method,
        destination,
        resendIn: resend ? RESEND_SECONDS : undefined,
        codeLength: method === "backup_code" ? 8 : 6,
        secondFactor: challenge.secondFactor,
      })
    }),

    http.post(`${baseUrl}/auth/challenge/verify`, async ({ request }) => {
      const body = (await request.json()) as {
        method?: AuthFactor
        code?: string
        trustDevice?: boolean
      }
      const session = getMockSession()
      const challenge = session?.challenge
      if (session?.stage !== "challenge" || !challenge) return unauthenticated()
      if (challenge.attempts >= MAX_ATTEMPTS) {
        const blocked = mockUsersList().find((u) => u.id === session.userId)
        if (blocked)
          recordSignIn(blocked, {
            result: "blocked",
            method: body.method ?? challenge.method,
          })
        writeMockSession(null)
        return errorResponse(429, {
          code: "rate_limited",
          message: "Too many attempts",
        })
      }
      const user = mockUsersList().find((u) => u.id === session.userId)
      const code = body.code?.replace(/\s|-/g, "") ?? ""
      const method = body.method ?? challenge.method
      let ok = false
      if (user && challenge.methods.includes(method)) {
        if (method === "totp") ok = code === user.totpCode
        else if (method === "backup_code") ok = consumeBackupCode(user, code)
        else if (method === "sms" || method === "email") ok = code === sentCode
      }
      if (!ok) {
        writeMockSession({
          ...session,
          challenge: { ...challenge, attempts: challenge.attempts + 1 },
        })
        if (user) recordSignIn(user, { result: "failed", method })
        return validation({ code: "invalid" })
      }
      return signedIn(
        session.userId,
        method,
        body.trustDevice,
        challenge.secondFactor,
      )
    }),

    http.post(`${baseUrl}/auth/link`, async ({ request }) => {
      const { token: value } = (await request.json()) as { token?: string }
      const entry = value ? tokens.get(value) : undefined
      if (!value || entry?.kind !== "login" || entry.expires < Date.now())
        return errorResponse(410, {
          code: "token_expired",
          message: "Link expired",
        })
      tokens.delete(value)
      return signedIn(entry.userId, "link")
    }),

    http.post(`${baseUrl}/auth/passkey/options`, ({ request }) => {
      const session = getMockSession()
      if (
        !currentMethods().passwordless.includes("passkey") &&
        !session?.challenge
      )
        return errorResponse(403, {
          code: "forbidden",
          message: "Method disabled",
        })
      return json({
        publicKey: {
          challenge: base64UrlEncode(
            crypto.getRandomValues(new Uint8Array(32)),
          ),
          rpId: new URL(request.url).hostname,
          timeout: 60_000,
          userVerification: "preferred",
          allowCredentials: [],
        },
      })
    }),

    http.post(`${baseUrl}/auth/passkey/verify`, async ({ request }) => {
      const { credential, trustDevice } = (await request.json()) as {
        credential?: { response?: { userHandle?: string } }
        trustDevice?: boolean
      }
      const handle = credential?.response?.userHandle
      const userId = handle ? base64UrlDecode(handle) : ""
      const user = mockUsersList().find(
        (u) => u.id === userId && mockFactorTypes(u).includes("passkey"),
      )
      const session = getMockSession()
      const second = session?.stage === "challenge"
      if (!user || (second && session.userId !== user.id))
        return errorResponse(401, {
          code: "unauthenticated",
          message: "Unknown passkey",
        })
      return signedIn(user.id, "passkey", trustDevice, second)
    }),

    /** Демо-провайдер SSO: справжній сервер робить це у своєму `/auth/sso/<id>/callback`. */
    http.post(`${baseUrl}/auth/sso/mock`, async ({ request }) => {
      const { userId, provider } = (await request.json()) as {
        userId?: string
        provider?: string
      }
      const user = mockUsersList().find((u) => u.id === userId)
      if (!user) return unauthenticated()
      authenticate(user.id)
      recordSignIn(user, {
        result: "success",
        method: "sso",
        provider: methods.providers.find((p) => p.id === provider)?.name,
      })
      return noContent()
    }),

    http.post(`${baseUrl}/auth/password/forgot`, async ({ request }) => {
      const { email } = (await request.json()) as { email?: string }
      const user = email ? findUser(email) : undefined
      if (user) {
        const value = token()
        tokens.set(value, {
          userId: user.id,
          kind: "reset",
          expires: Date.now() + 60 * 60_000,
        })
        sendMockMessage({
          channel: "email",
          to: user.email,
          kind: "reset",
          link: linkUrl("reset", value),
        })
      }
      return noContent()
    }),

    http.post(`${baseUrl}/auth/password/reset`, async ({ request }) => {
      const body = (await request.json()) as {
        token?: string
        password?: string
      }
      const entry = body.token ? tokens.get(body.token) : undefined
      if (!body.token || entry?.kind !== "reset" || entry.expires < Date.now())
        return errorResponse(410, {
          code: "token_expired",
          message: "Link expired",
        })
      if (weakPassword(body.password)) return validation({ password: "weak" })
      const user = mockUsersList().find((u) => u.id === entry.userId)
      if (!user) return unauthenticated()
      if (reused(user, body.password)) return validation({ password: "reused" })
      tokens.delete(body.token)
      passwordChanged(user, body.password as string)
      return afterFirstFactor(user, "link")
    }),

    http.get(`${baseUrl}/auth/invite`, ({ request }) => {
      const value = new URL(request.url).searchParams.get("token")
      const invite = invites.find((i) => i.token === value)
      if (!invite || usedInvites.has(invite.token))
        return errorResponse(410, {
          code: "token_expired",
          message: "Invite expired",
        })
      return json({
        email: invite.email,
        name: invite.name,
        companyName: invite.companyName,
        invitedBy: invite.invitedBy,
      })
    }),

    http.post(`${baseUrl}/auth/invite/accept`, async ({ request }) => {
      const body = (await request.json()) as {
        token?: string
        name?: string
        password?: string
      }
      const invite = invites.find((i) => i.token === body.token)
      if (!invite || usedInvites.has(invite.token))
        return errorResponse(410, {
          code: "token_expired",
          message: "Invite expired",
        })
      if (!body.name?.trim()) return validation({ name: "required" })
      if (weakPassword(body.password)) return validation({ password: "weak" })
      usedInvites.add(invite.token)
      const user: MockUser = {
        id: `u-${token().slice(0, 8)}`,
        name: body.name.trim(),
        email: invite.email,
        password: body.password as string,
        totpCode: sentCode,
        factors: [],
        ...invite.user,
      }
      addMockUser(user)
      authenticate(user.id)
      recordSignIn(user, { result: "success", method: "link" })
      return json({ status: "authenticated" })
    }),

    http.post(`${baseUrl}/auth/signup`, async ({ request }) => {
      if (!methods.signUp)
        return errorResponse(403, {
          code: "forbidden",
          message: "Sign-up disabled",
        })
      const body = (await request.json()) as {
        name?: string
        email?: string
        password?: string
        company?: { name?: string; code?: string }
      }
      const fields: Record<string, string> = {}
      if (!body.name?.trim()) fields.name = "required"
      if (!body.email?.includes("@")) fields.email = "invalid"
      else if (findUser(body.email)) fields.email = "taken"
      if (weakPassword(body.password)) fields.password = "weak"
      if (!body.company?.name?.trim()) fields["company.name"] = "required"
      if (Object.keys(fields).length) return validation(fields)
      const companyId = `c-${token().slice(0, 8)}`
      const user: MockUser = {
        id: `u-${token().slice(0, 8)}`,
        name: (body.name ?? "").trim(),
        email: (body.email ?? "").trim(),
        password: body.password as string,
        totpCode: sentCode,
        roles: ["owner"],
        permissions: ["*"],
        companies: [
          {
            id: companyId,
            name: (body.company?.name ?? "").trim(),
            description: body.company?.code,
          },
        ],
        companyId,
        factors: [],
      }
      addMockUser(user)
      // Обліковий запис активується після коду з листа.
      return startChallenge(
        user.id,
        { methods: ["email"], method: "email", secondFactor: false },
        user,
      )
    }),

    http.post(`${baseUrl}/auth/session/extend`, () => {
      const user = currentMockUser()
      if (!user) return unauthenticated()
      return json({
        expiresAt: new Date(
          getMockSession()?.expiresAt ?? newExpiry(),
        ).toISOString(),
      })
    }),

    http.post(
      `${baseUrl}/auth/password/change-required`,
      async ({ request }) => {
        const { password } = (await request.json()) as { password?: string }
        const session = getMockSession()
        const user = mockUsersList().find((u) => u.id === session?.userId)
        if (session?.stage !== "password_change" || !user)
          return unauthenticated()
        if (weakPassword(password)) return validation({ password: "weak" })
        if (password === user.password) return validation({ password: "same" })
        if (reused(user, password)) return validation({ password: "reused" })
        user.mustChangePassword = false
        passwordChanged(user, password as string)
        authenticate(user.id)
        recordSignIn(user, { result: "success", method: "password" })
        return json({ status: "authenticated" })
      },
    ),

    http.post(`${baseUrl}/auth/reauth`, async ({ request }) => {
      const user = currentMockUser()
      if (!user) return unauthenticated()
      // Адміністратор не знає пароля користувача — і не повинен підтверджувати дії за нього.
      const impersonating = impersonationForbidden()
      if (impersonating) return impersonating
      const body = (await request.json()) as {
        password?: string
        method?: AuthFactor
        code?: string
      }
      const ok =
        body.password !== undefined
          ? body.password === user.password
          : body.method === "totp"
            ? body.code === user.totpCode
            : (body.method === "sms" || body.method === "email") &&
              body.code === sentCode
      if (!ok)
        return validation(
          body.password !== undefined
            ? { password: "invalid" }
            : { code: "invalid" },
        )
      const session = getMockSession()
      const grantedUntil = Date.now() + 5 * 60_000
      if (session) writeMockSession({ ...session, reauthUntil: grantedUntil })
      return json({ grantedUntil: new Date(grantedUntil).toISOString() })
    }),

    http.post(`${baseUrl}/me/email`, async ({ request }) => {
      const user = currentMockUser()
      if (!user) return unauthenticated()
      const denied = impersonationForbidden() ?? reauthRequired()
      if (denied) return denied
      const { email } = (await request.json()) as { email?: string }
      if (!email?.includes("@")) return validation({ email: "invalid" })
      if (findUser(email)) return validation({ email: "taken" })
      const session = getMockSession()
      if (session) writeMockSession({ ...session, pendingEmail: email })
      sendMockMessage({
        channel: "email",
        to: email,
        kind: "verify",
        code: sentCode,
      })
      return json({
        methods: ["email"],
        method: "email",
        destination: maskEmail(email),
        resendIn: RESEND_SECONDS,
        codeLength: 6,
        secondFactor: false,
      })
    }),

    http.post(`${baseUrl}/me/email/verify`, async ({ request }) => {
      const user = currentMockUser()
      const session = getMockSession()
      if (!user || !session?.pendingEmail) return unauthenticated()
      const { code } = (await request.json()) as { code?: string }
      if (code !== sentCode) return validation({ code: "invalid" })
      sendMockMessage({ channel: "email", to: user.email, kind: "notice" })
      user.email = session.pendingEmail
      writeMockSession({ ...session, pendingEmail: undefined })
      return noContent()
    }),

    http.post(`${baseUrl}/me/export`, () => {
      const user = currentMockUser()
      if (!user) return unauthenticated()
      const denied = impersonationForbidden()
      if (denied) return denied
      sendMockMessage({
        channel: "email",
        to: user.email,
        kind: "export",
        link: `${globalThis.location?.origin ?? ""}/export-${token()}.zip`,
      })
      return json({ status: "queued" }, { status: 202 })
    }),

    http.delete(`${baseUrl}/me`, () => {
      const user = currentMockUser()
      if (!user) return unauthenticated()
      const denied = impersonationForbidden() ?? reauthRequired()
      if (denied) return denied
      setMockUsers(mockUsersList().filter((u) => u.id !== user.id))
      writeMockSession(null)
      return noContent()
    }),

    http.post(`${baseUrl}/auth/logout`, () => {
      writeMockSession(null)
      return noContent()
    }),

    http.get(`${baseUrl}/me`, () => {
      const user = currentMockUser()
      return user ? json(toMe(user)) : unauthenticated()
    }),

    http.post(`${baseUrl}/me/password`, async ({ request }) => {
      const user = currentMockUser()
      if (!user) return unauthenticated()
      const denied = impersonationForbidden()
      if (denied) return denied
      const body = (await request.json()) as {
        currentPassword?: string
        newPassword?: string
      }
      if (body.currentPassword !== user.password)
        return validation({ currentPassword: "invalid" })
      if (weakPassword(body.newPassword))
        return validation({ newPassword: "weak" })
      if (reused(user, body.newPassword))
        return validation({ newPassword: "reused" })
      passwordChanged(user, body.newPassword as string)
      return noContent()
    }),

    http.get(`${baseUrl}/me/preferences`, () => {
      const user = currentMockUser()
      if (!user) return unauthenticated()
      try {
        const raw = globalThis.localStorage?.getItem(PREFS_KEY(user.id))
        return json(
          raw ? (JSON.parse(raw) as Preferences) : (defaultPreferences ?? {}),
        )
      } catch {
        return json(defaultPreferences ?? {})
      }
    }),

    http.put(`${baseUrl}/me/preferences`, async ({ request }) => {
      const user = currentMockUser()
      if (!user) return unauthenticated()
      const prefs = (await request.json()) as Preferences
      try {
        globalThis.localStorage?.setItem(
          PREFS_KEY(user.id),
          JSON.stringify(prefs),
        )
      } catch {
        // Не збереглося — мок однаково відповідає успіхом.
      }
      return json(prefs)
    }),

    /** Обов'язковий другий крок налаштовано — завершити вхід (ADR-0012). */
    http.post(`${baseUrl}/auth/factor-setup/complete`, () => {
      const session = getMockSession()
      const user = mockUsersList().find((u) => u.id === session?.userId)
      if (session?.stage !== "factor_setup" || !user) return unauthenticated()
      if (!mockFactorTypes(user).length)
        return errorResponse(409, {
          code: "factor_required",
          message: "Set up a method first",
        })
      return signedIn(user.id, "password")
    }),

    ...createAdminHandlers({
      baseUrl,
      roles,
      providers: baseMethods.providers.map(({ id, name }) => ({ id, name })),
      reauthRequired,
    }),

    ...createAuditHandlers({ baseUrl }),

    ...createWebhookHandlers({
      baseUrl,
      events: webhookEvents,
      reauthRequired,
    }),

    ...createNotificationHandlers({
      baseUrl,
      channels: notificationChannels,
      events: notificationEvents,
    }),

    ...createAccountHandlers({
      baseUrl,
      sentCode,
      available: setupFactors,
      twoFactorRequired: factorRequired,
      apiResources,
      issuer: () => brandingNow()?.name,
      reauthRequired,
    }),
  ]
}
