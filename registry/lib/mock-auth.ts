/**
 * Мок входу й профілю (ADR-0003, ADR-0010): усі способи з контракту lib/auth — пароль, коди
 * (застосунок, резервні, SMS/Viber, email), посилання з листа, ключ доступу, SSO, відновлення
 * пароля, запрошення, реєстрація, довірений пристрій, ковзна сесія, перевірка «не бот»; `/me`
 * і вподобання PF11.
 *
 * Коди SMS і email мок не надсилає — він передає їх `subscribeMockMessages` (демо показує як
 * сповіщення). Ключ доступу мок не перевіряє криптографічно: користувача визначає `userHandle`.
 * Фактори, сесії, журнал входів і «Увійти як…» — lib/mock-account (ADR-0011).
 *
 * Частини: кроки входу — `lib/mock-sign-in-flow`, відновлення пароля, запрошення й реєстрація —
 * `lib/mock-sign-up`, профіль `/me` — `lib/mock-me`; тут — налаштування, маршрути входу й збирання
 * всіх обробників платформи. Старі імпорти з цього файлу працюють.
 */
import { http, type HttpHandler } from "msw/http"

import { SETUP_FACTORS, type SetupFactor } from "@/registry/lib/account"
import { API_PREFIX } from "@/registry/lib/api"
import type {
  AuthFactor,
  AuthMethods,
  Branding,
  LocalizedText,
} from "@/registry/lib/auth"
import {
  consumeBackupCode,
  createAccountHandlers,
  mockFactorTypes,
  passwordChanged,
  recordSignIn,
  setMockAccountSeeds,
  type MockAccountSeed,
} from "@/registry/lib/mock-account"
import { RESEND_SECONDS } from "@/registry/lib/mock-account-state"
import {
  createCompanyHandlers,
  type MockCompanyProfile,
} from "@/registry/lib/mock-company"
import {
  createInboxHandlers,
  setMockInboxSeeds,
  type MockInboxItem,
} from "@/registry/lib/mock-inbox"
import { createMeHandlers } from "@/registry/lib/mock-me"
import { createRealtimeHandlers } from "@/registry/lib/mock-realtime"
import { createSignInFlow } from "@/registry/lib/mock-sign-in-flow"
import {
  createSignUpHandlers,
  type MockInvite,
} from "@/registry/lib/mock-sign-up"
import {
  createTeamHandlers,
  type MockPermissionResource,
  type MockRole,
} from "@/registry/lib/mock-team"
import {
  createAuditHandlers,
  setMockAuditSeeds,
  type MockAuditEvent,
} from "@/registry/lib/mock-audit"
import {
  createNotificationHandlers,
  type MockNotificationEvent,
} from "@/registry/lib/mock-notifications"
import { createPushHandlers } from "@/registry/lib/mock-push"
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
  policyRequiresFactor,
  setMockPolicyDefaults,
} from "@/registry/lib/mock-admin"
import {
  authenticate,
  errorResponse,
  getMockSession,
  json,
  mockUsersList,
  noContent,
  setMockUsers,
  setSessionMinutes,
  unauthenticated,
  writeMockSession,
  type MockUser,
} from "@/registry/lib/mock-server"
import type { Preferences } from "@/registry/lib/preferences"
import type { SecurityPolicy } from "@/registry/lib/security-policy"

// erp-ui: окремі import + export, бо shadcn CLI хибно переписує шляхи в `export … from`.
export type { MockInvite }

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
  /**
   * Ролі проекту: назви мовами, права, вбудовані (ADR-0014). Без прав — лише назви (для політики
   * безпеки), а права користувачів беруться з `MockUser`.
   */
  roles?: MockRole[]
  /** Каталог прав для матриці ролей; без нього — `apiResources` з діями CRUD. */
  permissionResources?: Record<string, MockPermissionResource>
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
  /** Початкові сповіщення в застосунку (ключ — id користувача). */
  inboxSeeds?: Record<string, MockInboxItem[]>
  /** Початкові профілі компаній (реквізити, філії). */
  companyProfiles?: Record<string, MockCompanyProfile>
}

const MAX_ATTEMPTS = 5

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
  permissionResources,
  inboxSeeds = {},
  companyProfiles,
}: PlatformMockOptions): HttpHandler[] {
  setMockInboxSeeds(inboxSeeds)
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
  const flow = createSignInFlow({
    sentCode,
    linkUrl,
    captchaAfter,
    setupFactors,
    factorRequired,
  })
  const {
    failures,
    tokens,
    findUser,
    needsCaptcha,
    captchaRequired,
    deliver,
    startChallenge,
    signedIn,
    reauthRequired,
    afterFirstFactor,
    weakPassword,
    reused,
    validation,
  } = flow

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

    ...createSignUpHandlers({
      baseUrl,
      flow,
      sentCode,
      linkUrl,
      invites,
      signUp: methods.signUp,
    }),

    ...createMeHandlers({ baseUrl, flow, sentCode, defaultPreferences }),

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

    ...createTeamHandlers({
      baseUrl,
      roles,
      resources:
        permissionResources ??
        Object.fromEntries(
          Object.entries(apiResources ?? {}).map(([id, label]) => [
            id,
            { label },
          ]),
        ),
      inviteLink: (value) => linkUrl("invite", value),
      reauthRequired,
    }),

    ...createInboxHandlers({ baseUrl }),
    ...createRealtimeHandlers({ baseUrl }),

    ...createPushHandlers({ baseUrl }),

    ...createCompanyHandlers({ baseUrl, profiles: companyProfiles }),

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
