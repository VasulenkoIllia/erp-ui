/**
 * Вхід, профіль і права (ADR-0003, ADR-0010, PF01): httpOnly cookie-сесія, коди підтвердження,
 * вхід без пароля, ключі доступу, SSO, відновлення пароля, запрошення й реєстрація.
 *
 * Контракт (усе — під `/api/v1`):
 * - `GET /auth/methods` → що ввімкнено в проекті: пароль, вхід без пароля, SSO-провайдери, реєстрація…
 * - `POST /auth/login` { email, password } → `{ status: "authenticated" }` або
 *   `{ status: "challenge", challenge }` — сервер просить підтвердження (другий фактор).
 * - `POST /auth/start` { method: "email" | "sms", identifier } → challenge: код (і посилання) надіслано.
 * - `POST /auth/challenge/send` { method } → challenge: інший метод або повторне надсилання.
 * - `POST /auth/challenge/verify` { method, code, trustDevice } → результат входу;
 *   хибний код — 422 `fieldErrors.code`, забагато спроб — 429.
 * - `POST /auth/link` { token } — посилання з листа; `POST /auth/passkey/options` → `{ publicKey }`,
 *   `POST /auth/passkey/verify` { credential } — ключ доступу (і без пароля, і другим фактором).
 * - SSO: браузер переходить на `GET /auth/sso/<провайдер>/start?returnTo=…`; після провайдера сервер
 *   ставить cookie й повертає на `returnTo` (маршрут застосунку `/auth/callback`).
 * - `POST /auth/password/forgot` { email } → 204 завжди (не розкриваємо, чи є такий акаунт);
 *   `POST /auth/password/reset` { token, password } → результат входу.
 * - `POST /auth/invite/check` { token } → запрошення (`lib/invite-check`); `POST /auth/invite/accept`.
 *   Обидва — 410, коли термін минув або той, хто запросив, уже не може дати ці ролі (ADR-0035).
 * - `POST /auth/signup` { name, email, password, company } → challenge (підтвердити email).
 * - `{ status: "password_change_required" }` — тимчасовий чи скинутий пароль: спершу новий,
 *   `POST /auth/password/change-required` { password } → результат входу.
 * - `POST /auth/reauth` { password } або { method, code } → { grantedUntil }: повторне підтвердження
 *   перед чутливими діями; без нього вони відповідають 403 `reauth_required`.
 * - `POST /me/email` { email } → challenge (код на нову адресу); `POST /me/email/verify` { code }.
 * - `POST /me/export` → дані надходять листом; `DELETE /me` — видалити акаунт.
 * - `POST /auth/session/extend` → { expiresAt }; `POST /auth/logout` → 204.
 * - `GET /me` → профіль, ролі, ефективні права, компанії, увімкнені фактори; без сесії — 401.
 * - `POST /me/password` { currentPassword, newPassword } → 204.
 * - Після кількох невдалих спроб сервер відповідає 428 `captcha_required`; запит повторюється з
 *   `captchaToken` (Turnstile, ADR-0010).
 * - `GET /auth/methods` → `branding`: логотип, назва, палітра й бічна панель сторінки входу —
 *   сервер обирає за доменом (white-label, ADR-0011).
 * - «Увійти як…» (ADR-0011): `POST /auth/impersonation` { userId, reason } → 204, право
 *   `users:impersonate` і повторне підтвердження; `DELETE /auth/impersonation` → назад до свого
 *   акаунта. Поки триває, `GET /me` містить `impersonator`.
 * - Фактори, сесії, пристрої й журнал входів — `provider.account` (lib/account).
 * - Політика безпеки організації (ADR-0012, lib/security-policy, `provider.admin`):
 *   - обов'язковий другий крок без налаштованого фактора → `{ status: "factor_setup_required",
 *     factors }`: користувач налаштовує фактор (ті самі `/me/factors/*`, без повторного
 *     підтвердження) і завершує `POST /auth/factor-setup/complete` → результат входу;
 *   - пароль, термін дії якого минув, → `password_change_required` з `reason: "expired"`;
 *   - адреса поза дозволеним списком → 403 `ip_not_allowed`.
 * - Немає доступу до жодного фактора: `POST /auth/recovery-request` { comment } на кроці коду → 202;
 *   адміністратор скидає другий крок (`provider.admin.resetFactors`).
 *
 * Права — рядки `<ресурс>:<дія>` ("invoices:approve"), `*` — будь-що. Перевірка на клієнті лише
 * ховає й вимикає дії; сервер (і MSW-моки) перевіряють ті самі права самі.
 */
import type { AuthProvider } from "ra-core"
import { z } from "zod"

import {
  createAccountApi,
  SETUP_FACTORS,
  type AccountApi,
} from "@/registry/lib/account"
import { ApiError, isApiError, type ApiClient } from "@/registry/lib/api"
import { PALETTES } from "@/registry/lib/appearance"
import { createAuditApi, type AuditApi } from "@/registry/lib/audit"
import { createCompanyApi, type CompanyApi } from "@/registry/lib/company"
import {
  getCompanyId,
  setCompanyId,
  syncCompany,
} from "@/registry/lib/company-scope"
import {
  createInvitationsApi,
  type InvitationsApi,
} from "@/registry/lib/invitations"
import { inviteChecker } from "@/registry/lib/invite-check"
import { createInboxApi, type InboxApi } from "@/registry/lib/notifications"
import { getPasskeyAssertion } from "@/registry/lib/passkey"
import { createRolesApi, type RolesApi } from "@/registry/lib/roles"
import { createAdminApi, type AdminApi } from "@/registry/lib/security-policy"
import { broadcastAuthEvent, setSessionExpiresAt } from "@/registry/lib/session"
import { createWebhooksApi, type WebhooksApi } from "@/registry/lib/webhooks"

/* --------------------------------- Схеми --------------------------------- */

/** Методи підтвердження: застосунок, резервний код, SMS/Viber, email, ключ доступу. */
export const AUTH_FACTORS = [
  "totp",
  "backup_code",
  "sms",
  "email",
  "passkey",
] as const
export type AuthFactor = (typeof AUTH_FACTORS)[number]

/** Вхід без пароля: код чи посилання на email, код у SMS/Viber, ключ доступу. */
export const PASSWORDLESS_METHODS = ["email", "sms", "passkey"] as const
export type PasswordlessMethod = (typeof PASSWORDLESS_METHODS)[number]

export const ssoProviderSchema = z.object({
  /** Сегмент шляху `/auth/sso/<id>/start`. */
  id: z.string(),
  /** google і apple мають готові кнопки за правилами брендів; oidc — будь-який провайдер з конфігу. */
  type: z.enum(["google", "apple", "oidc"]),
  /** Назва для кнопки «Увійти через …» (для oidc). */
  name: z.string(),
})
export type SsoProvider = z.infer<typeof ssoProviderSchema>

/** Текст однією мовою або за мовами: «Вхід» чи { uk: "Вхід", en: "Sign in" }. */
export const localizedTextSchema = z.union([
  z.string(),
  z.record(z.string(), z.string()),
])
export type LocalizedText = z.infer<typeof localizedTextSchema>

/** Текст мовою інтерфейсу; немає перекладу — перший наявний. */
export function localizedText(
  value: LocalizedText | undefined,
  language: string,
): string | undefined {
  if (value === undefined || typeof value === "string") return value
  return value[language] ?? Object.values(value)[0]
}

/** Бренд сторінки входу (white-label): сервер обирає за доменом. */
export const brandingSchema = z.object({
  /** Назва компанії чи продукту: заголовок вкладки й підпис логотипа. */
  name: z.string(),
  logoUrl: z.string().optional(),
  /** Логотип для темної теми; немає — той самий. */
  logoDarkUrl: z.string().optional(),
  /** Палітра бренду — типова для гостя й для користувача без власного вибору. */
  palette: z.enum(PALETTES).optional(),
  /** Бічна панель на широких екранах. */
  panel: z
    .object({
      title: localizedTextSchema,
      text: localizedTextSchema.optional(),
      /** Фонове зображення (декоративне). */
      imageUrl: z.string().optional(),
    })
    .optional(),
  supportEmail: z.string().optional(),
  termsUrl: z.string().optional(),
  privacyUrl: z.string().optional(),
})
export type Branding = z.infer<typeof brandingSchema>

export const authMethodsSchema = z.object({
  password: z.boolean(),
  passwordless: z.array(z.enum(PASSWORDLESS_METHODS)),
  providers: z.array(ssoProviderSchema),
  passwordReset: z.boolean(),
  signUp: z.boolean(),
  /** Скільки днів пристрій може бути довіреним (без другого фактора); 0 — вимкнено. */
  trustedDeviceDays: z.number().int().min(0),
  /** Автовихід після бездіяльності, хв; null — вимкнено. */
  idleTimeoutMinutes: z.number().int().positive().nullable(),
  /** Ключ сайту Turnstile для перевірки «не бот». */
  captchaSiteKey: z.string().optional(),
  branding: brandingSchema.optional(),
  /** Вимоги до пароля з політики організації (ADR-0012); немає — типові кіта. */
  passwordPolicy: z.object({ minLength: z.number().int().min(1) }).optional(),
})
export type AuthMethods = z.infer<typeof authMethodsSchema>

export const challengeSchema = z.object({
  /** Методи, якими можна підтвердити цей вхід. */
  methods: z.array(z.enum(AUTH_FACTORS)).min(1),
  /** Поточний метод: для sms/email код уже надіслано. */
  method: z.enum(AUTH_FACTORS),
  /** Куди надіслано код, у маскованому вигляді: «+380 •• ••• 45», «o•••@zoriana.example». */
  destination: z.string().optional(),
  /** Через скільки секунд можна надіслати код знову. */
  resendIn: z.number().int().min(0).optional(),
  /** Довжина коду (за замовчуванням 6; резервні коди — свої). */
  codeLength: z.number().int().min(4).max(12).optional(),
  /** true — другий крок після пароля; false — вхід без пароля. */
  secondFactor: z.boolean(),
})
export type Challenge = z.infer<typeof challengeSchema>

/** Чому треба новий пароль: тимчасовий, минув термін, не відповідає політиці. */
export const PASSWORD_CHANGE_REASONS = [
  "temporary",
  "expired",
  "policy",
] as const
export type PasswordChangeReason = (typeof PASSWORD_CHANGE_REASONS)[number]

export const loginResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("authenticated") }),
  z.object({ status: z.literal("challenge"), challenge: challengeSchema }),
  z.object({
    status: z.literal("password_change_required"),
    reason: z.enum(PASSWORD_CHANGE_REASONS).optional(),
  }),
  z.object({
    status: z.literal("factor_setup_required"),
    /** Які фактори політика дозволяє налаштувати. */
    factors: z.array(z.enum(SETUP_FACTORS)).min(1),
  }),
])
export type LoginResult = z.infer<typeof loginResultSchema>

export const companyRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
})

export const meSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string().optional(),
  avatarUrl: z.string().optional(),
  roles: z.array(z.string()),
  /** Ефективні права з усіх ролей: "invoices:read", "invoices:*", "*". */
  permissions: z.array(z.string()),
  companies: z.array(companyRefSchema),
  /** Компанія за замовчуванням для `X-Company-Id`. */
  companyId: z.string().nullable(),
  /** Увімкнені другі фактори; порожньо — другого кроку немає. */
  factors: z.array(z.enum(AUTH_FACTORS)),
  /** Коли сесія закінчиться без активності (ISO). */
  sessionExpiresAt: z.string().optional(),
  /** Адміністратор, що працює від імені цього користувача («Увійти як…»). */
  impersonator: z.object({ id: z.string(), name: z.string() }).optional(),
  /** Профіль (ADR-0012): посада, часовий пояс IANA, підпис для листів. */
  position: z.string().optional(),
  timezone: z.string().optional(),
  signature: z.string().optional(),
})
export type Me = z.infer<typeof meSchema>

export const inviteSchema = z.object({
  email: z.string(),
  name: z.string().optional(),
  companyName: z.string(),
  invitedBy: z.string().optional(),
})
export type Invite = z.infer<typeof inviteSchema>

export const signUpRequestSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  password: z.string().min(1),
  company: z.object({
    name: z.string().min(1),
    /** ЄДРПОУ або РНОКПП (LC12), необов'язково. */
    code: z.string().optional(),
  }),
  captchaToken: z.string().optional(),
})
export type SignUpRequest = z.infer<typeof signUpRequestSchema>

const expiresSchema = z.object({ expiresAt: z.string() })
const reauthSchema = z.object({ grantedUntil: z.string() })
const passkeyOptionsSchema = z.object({
  publicKey: z.custom<PublicKeyCredentialRequestOptionsJSON>(
    (value) => typeof value === "object" && value !== null,
  ),
})

/* ---------------------------------- Права ---------------------------------- */

/** Ключ кешу профілю в TanStack Query (hooks/use-me); `onMe` провайдера оновлює його. */
export const ME_QUERY_KEY = ["erp-ui", "me"] as const

/** Скільки чекати на `POST /auth/logout`, перш ніж вважати вихід невдалим. */
const LOGOUT_TIMEOUT_MS = 10_000

/** Дії ra-core (`useCanAccess`, вбудовані контролери) → дії прав erp-ui. */
const RA_ACTIONS: Record<string, string> = {
  list: "read",
  show: "read",
  export: "read",
  edit: "update",
}

/**
 * Чи дозволяє набір прав дію: точний збіг, `<ресурс>:*` або `*`.
 * Дії ra-core (`list`, `show`, `edit`) зводяться до `read` і `update`.
 */
export function hasPermission(
  permissions: readonly string[],
  resource: string,
  action: string,
): boolean {
  const normalized = RA_ACTIONS[action] ?? action
  return permissions.some(
    (p) =>
      p === "*" || p === `${resource}:*` || p === `${resource}:${normalized}`,
  )
}

/* --------------------------------- Помилки --------------------------------- */

/** Сервер просить підтвердити вхід: показати форму коду з `challenge`. */
export class AuthChallengeError extends ApiError {
  readonly challenge: Challenge

  constructor(challenge: Challenge) {
    super(401, {
      code: "challenge_required",
      message: "Sign-in confirmation required",
    })
    this.name = "AuthChallengeError"
    this.challenge = challenge
  }
}

export function isChallengeRequired(
  error: unknown,
): error is AuthChallengeError {
  return error instanceof AuthChallengeError
}

/** Пароль тимчасовий, протермінований чи не за політикою: спершу встановити новий. */
export class PasswordChangeRequiredError extends ApiError {
  readonly reason: PasswordChangeReason

  constructor(reason: PasswordChangeReason = "temporary") {
    super(401, {
      code: "password_change_required",
      message: "Set a new password to continue",
    })
    this.name = "PasswordChangeRequiredError"
    this.reason = reason
  }
}

/** Політика вимагає другий крок, а його ще немає: налаштувати, потім `completeFactorSetup`. */
export class FactorSetupRequiredError extends ApiError {
  readonly factors: (typeof SETUP_FACTORS)[number][]

  constructor(factors: (typeof SETUP_FACTORS)[number][]) {
    super(401, {
      code: "factor_setup_required",
      message: "Set up two-step verification to continue",
    })
    this.name = "FactorSetupRequiredError"
    this.factors = factors
  }
}

export function isFactorSetupRequired(
  error: unknown,
): error is FactorSetupRequiredError {
  return error instanceof FactorSetupRequiredError
}

export function isPasswordChangeRequired(
  error: unknown,
): error is PasswordChangeRequiredError {
  return error instanceof PasswordChangeRequiredError
}

/** Чутлива дія потребує повторного підтвердження (ReauthDialog), після нього — повторити. */
export function isReauthRequired(error: unknown): boolean {
  return isApiError(error) && error.code === "reauth_required"
}

/** Дія недоступна, поки адміністратор працює від імені користувача. */
export function isImpersonationForbidden(error: unknown): boolean {
  return (
    isApiError(error) &&
    error.status === 403 &&
    error.code === "impersonation_forbidden"
  )
}

/** Після кількох невдалих спроб сервер просить перевірку «не бот». */
export function isCaptchaRequired(error: unknown): boolean {
  return isApiError(error) && error.code === "captcha_required"
}

/* -------------------------------- Провайдер -------------------------------- */

export type LoginParams =
  | { email: string; password: string; captchaToken?: string }
  | { method: "email" | "sms"; identifier: string; captchaToken?: string }
  | {
      method: Exclude<AuthFactor, "passkey">
      code: string
      trustDevice?: boolean
    }
  | { method: "passkey"; trustDevice?: boolean }
  | { link: string }

export interface ErpAuthProvider extends AuthProvider {
  /** Профіль поточного користувача (кешується до виходу чи нового входу). */
  getMe: () => Promise<Me>
  /** Завантажити профіль заново (вхід в іншій вкладці, зміна даних). */
  refreshMe: () => Promise<Me>
  /** Що ввімкнено в проекті: від цього залежить сторінка входу. */
  getMethods: () => Promise<AuthMethods>
  login: (params: LoginParams) => Promise<void>
  /** Інший метод підтвердження або повторне надсилання коду. */
  sendCode: (method: AuthFactor) => Promise<Challenge>
  /** Адреса, на яку браузер переходить для входу через провайдера. */
  ssoUrl: (providerId: string, returnTo: string) => string
  forgotPassword: (email: string, captchaToken?: string) => Promise<void>
  resetPassword: (token: string, password: string) => Promise<void>
  getInvite: (token: string) => Promise<Invite>
  acceptInvite: (
    token: string,
    data: { name: string; password: string },
  ) => Promise<void>
  signUp: (data: SignUpRequest) => Promise<void>
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<void>
  /** Продовжити сесію («Продовжити роботу» в попередженні). */
  extendSession: () => Promise<void>
  /** Новий пароль замість тимчасового (після `password_change_required`). */
  setNewPassword: (password: string) => Promise<void>
  /** Повторне підтвердження перед чутливою дією; повертає, до коли діє дозвіл (ISO). */
  reauthenticate: (
    params: { password: string } | { method: AuthFactor; code: string },
  ) => Promise<string>
  /** Змінити email: код надходить на нову адресу. */
  changeEmail: (email: string) => Promise<Challenge>
  confirmEmail: (code: string) => Promise<void>
  /** Експорт персональних даних (GDPR): архів надходить листом. */
  exportData: () => Promise<void>
  /** Видалити акаунт (після повторного підтвердження) і вийти. */
  deleteAccount: () => Promise<void>
  /** «Увійти як…»: адміністратор працює від імені користувача; причина — в аудит. */
  impersonate: (userId: string, reason: string) => Promise<void>
  /** Повернутися до свого акаунта. */
  stopImpersonation: () => Promise<void>
  /** Фактори, резервні коди, сесії, пристрої, журнал входів, профіль, токени API (lib/account). */
  account: AccountApi
  /**
   * Політика безпеки, запити на відновлення, скидання другого кроку, доступ користувачів —
   * сесії й блокування (lib/security-policy).
   */
  admin: AdminApi
  /** Журнал аудиту (lib/audit, ADR-0013). */
  audit: AuditApi
  /** Вебхуки (lib/webhooks, ADR-0013). */
  webhooks: WebhooksApi
  /** Ролі, права й призначення ролей (lib/roles, ADR-0014). */
  roles: RolesApi
  /** Запрошення колег (lib/invitations, ADR-0014). */
  invitations: InvitationsApi
  /** Центр сповіщень (lib/notifications, ADR-0014). */
  inbox: InboxApi
  /** Налаштування поточної компанії (lib/company, ADR-0014). */
  company: CompanyApi
  /** Обов'язковий другий крок налаштовано — завершити вхід. */
  completeFactorSetup: () => Promise<void>
  /** Немає доступу до жодного фактора: попросити адміністратора відновити (на кроці коду). */
  requestRecovery: (comment: string) => Promise<void>
}

export interface AuthProviderOptions {
  /** Зміна профілю: вхід, вихід, перезавантаження. */
  onMe?: (me: Me | null) => void
  /** Адреса API для переходів браузера (SSO); за замовчуванням — `/api/v1`. */
  baseUrl?: string
  /** Перевизначити адресу SSO (напр. демо-сторінка провайдера). */
  ssoUrl?: (providerId: string, returnTo: string) => string
}

/** Умовне походження для перевірки шляху: справжня адреса застосунку тут не потрібна. */
const REDIRECT_CHECK_ORIGIN = "http://erp-ui.invalid"

/**
 * Адреса для переходу з параметра (`next`): лише шлях цього застосунку. `https://…`, `//хост` чи
 * `/\хост` вели б на чужий сайт (відкритий редирект). Повертаємо розібране парсером, як прочитає
 * браузер (`/\t/хост` → `//хост`), і без `//` на початку (`/.//хост` після розбору — `//хост`).
 */
export function safeRedirectPath(
  value: string | null | undefined,
  fallback = "/",
): string {
  if (!value?.startsWith("/")) return fallback
  try {
    const url = new URL(value, REDIRECT_CHECK_ORIGIN)
    const path = `${url.pathname}${url.search}${url.hash}`
    return url.origin === REDIRECT_CHECK_ORIGIN && !path.startsWith("//")
      ? path
      : fallback
  } catch {
    return fallback
  }
}

/** Параметр з адреси, зокрема з хеша (`#/auth/callback?next=…`). */
export function urlParam(name: string): string | null {
  if (typeof window === "undefined") return null
  const { search, hash } = window.location
  const fromHash = hash.includes("?") ? hash.slice(hash.indexOf("?")) : ""
  return (
    new URLSearchParams(fromHash).get(name) ??
    new URLSearchParams(search).get(name)
  )
}

export function createAuthProvider(
  client: ApiClient,
  { onMe, baseUrl = "/api/v1", ssoUrl }: AuthProviderOptions = {},
): ErpAuthProvider {
  let me: Promise<Me> | null = null
  /** Сесії вже немає (401 чи вихід): наступний вихід не надсилає `POST /auth/logout`. */
  let sessionEnded = false

  const fetchMe = () => client.get("/me", { schema: meSchema })

  const loadMe = (): Promise<Me> => {
    if (me) return me
    const sentCompany = getCompanyId()
    const request: Promise<Me> = fetchMe()
      .catch((error: unknown) => {
        // Збережену компанію закрили (чи на ПК увійшов інший): 403 навіть на профіль — без неї
        // профіль дасть типову. Лише останній запит і та сама компанія: новіший вибір не стираємо.
        if (
          me !== request ||
          !sentCompany ||
          getCompanyId() !== sentCompany ||
          !isApiError(error) ||
          error.status !== 403
        )
          throw error
        setCompanyId(null)
        return fetchMe()
      })
      .then(
        (profile) => {
          // Поки летів запит, профіль уже запитали заново (швидке перемикання компаній): старіша
          // відповідь не перезаписує новішу.
          if (me !== request) return profile
          sessionEnded = false
          if (profile.sessionExpiresAt)
            setSessionExpiresAt(profile.sessionExpiresAt)
          // Компанія — до перших запитів даних, щоб вони вже йшли з правильним X-Company-Id.
          syncCompany(profile)
          onMe?.(profile)
          return profile
        },
        (error: unknown) => {
          if (me === request) me = null
          throw error
        },
      )
    me = request
    return request
  }

  /** Результат кроку входу: профіль або виклик підтвердження. */
  const finish = async (result: LoginResult) => {
    if (result.status === "challenge")
      throw new AuthChallengeError(result.challenge)
    if (result.status === "password_change_required")
      throw new PasswordChangeRequiredError(result.reason)
    if (result.status === "factor_setup_required")
      throw new FactorSetupRequiredError(result.factors)
    me = null
    await loadMe()
    broadcastAuthEvent({ type: "login" })
  }

  const post = (path: string, body?: unknown) =>
    client.post(path, body, { schema: loginResultSchema }).then(finish)

  /** Сесія перемкнулася на іншого користувача: профіль заново, інші вкладки — теж. */
  const switched = async () => {
    me = null
    await loadMe()
    broadcastAuthEvent({ type: "login" })
  }

  const loginWithPasskey = async (trustDevice?: boolean) => {
    const { publicKey } = await client.post(
      "/auth/passkey/options",
      undefined,
      { schema: passkeyOptionsSchema },
    )
    const credential = await getPasskeyAssertion(publicKey)
    await post("/auth/passkey/verify", { credential, trustDevice })
  }

  return {
    getMe: loadMe,

    refreshMe: () => {
      me = null
      return loadMe()
    },

    getMethods: () =>
      client.get("/auth/methods", { schema: authMethodsSchema }),

    login(params: LoginParams) {
      if ("link" in params) return post("/auth/link", { token: params.link })
      if ("password" in params) return post("/auth/login", params)
      if (params.method === "passkey")
        return loginWithPasskey(params.trustDevice)
      if ("code" in params) return post("/auth/challenge/verify", params)
      return post("/auth/start", params)
    },

    sendCode: (method) =>
      client.post(
        "/auth/challenge/send",
        { method },
        { schema: challengeSchema },
      ),

    ssoUrl:
      ssoUrl ??
      ((providerId, returnTo) =>
        `${baseUrl}/auth/sso/${encodeURIComponent(providerId)}/start?returnTo=${encodeURIComponent(returnTo)}`),

    async forgotPassword(email, captchaToken) {
      await client.post("/auth/password/forgot", { email, captchaToken })
    },

    resetPassword: (token, password) =>
      post("/auth/password/reset", { token, password }),

    getInvite: inviteChecker(client, inviteSchema),

    acceptInvite: (token, data) =>
      post("/auth/invite/accept", { token, ...data }),

    signUp: (data) => post("/auth/signup", data),

    async changePassword(currentPassword, newPassword) {
      await client.post("/me/password", { currentPassword, newPassword })
    },

    async extendSession() {
      const { expiresAt } = await client.post(
        "/auth/session/extend",
        undefined,
        { schema: expiresSchema },
      )
      setSessionExpiresAt(expiresAt)
    },

    setNewPassword: (password) =>
      post("/auth/password/change-required", { password }),

    async reauthenticate(params) {
      const { grantedUntil } = await client.post("/auth/reauth", params, {
        schema: reauthSchema,
      })
      return grantedUntil
    },

    changeEmail: (email) =>
      client.post("/me/email", { email }, { schema: challengeSchema }),

    async confirmEmail(code) {
      await client.post("/me/email/verify", { code })
      me = null
      await loadMe()
    },

    async exportData() {
      await client.post("/me/export")
    },

    async deleteAccount() {
      await client.delete("/me")
      me = null
      onMe?.(null)
      setSessionExpiresAt(null)
      broadcastAuthEvent({ type: "logout" })
    },

    async impersonate(userId, reason) {
      await client.post("/auth/impersonation", { userId, reason })
      await switched()
    },

    async stopImpersonation() {
      await client.delete("/auth/impersonation")
      await switched()
    },

    account: createAccountApi(client, {
      onMeChange: () => {
        // На кроці налаштування другого кроку профілю ще немає — оновлювати нічого.
        if (!me) return Promise.resolve()
        me = null
        return loadMe()
      },
    }),

    admin: createAdminApi(client),

    audit: createAuditApi(client),

    webhooks: createWebhooksApi(client),

    roles: createRolesApi(client),

    invitations: createInvitationsApi(client),

    inbox: createInboxApi(client),

    company: createCompanyApi(client),

    completeFactorSetup: () => post("/auth/factor-setup/complete"),

    async requestRecovery(comment) {
      await client.post("/auth/recovery-request", { comment })
    },

    /**
     * `{ remote: true }` — сесії на сервері вже немає (вихід в іншій вкладці, 401): лише очистити
     * стан тут. Інакше спершу `POST /auth/logout`; збій (офлайн, 5xx) кидається: сесія на сервері
     * жива, і людина не повинна думати, що вийшла (чужий ПК) — інтерфейс покаже помилку.
     */
    async logout(params?: { remote?: boolean }) {
      // Після 401 (checkAuth, checkError) ra-core виходить сам і помилку не ловить: запит виходу
      // зайвий, а без мережі він зупинив би перехід на сторінку входу.
      if (!params?.remote && !sessionEnded) {
        try {
          // Мережа, що зависла, теж має закінчитись помилкою: автовихід тоді ховає дані сам.
          await client.post("/auth/logout", undefined, {
            signal: AbortSignal.timeout(LOGOUT_TIMEOUT_MS),
          })
        } catch (error) {
          // Для інтерфейсу тайм-аут — той самий збій мережі.
          if (error instanceof DOMException && error.name === "TimeoutError")
            throw new ApiError(0, { code: "offline", message: "Timeout" })
          // 401 — сесія вже закінчилась: вихід однаково успішний.
          if (!isApiError(error) || error.status !== 401) throw error
        }
      }
      if (!params?.remote) broadcastAuthEvent({ type: "logout" })
      // Сесії вже немає: повторний вихід (ra-core і SessionGuard на той самий 401) — без запиту.
      sessionEnded = true
      me = null
      onMe?.(null)
      setSessionExpiresAt(null)
    },

    async checkAuth() {
      try {
        await loadMe()
      } catch (error) {
        // 401 — кінець сесії, 403 на профіль — входу немає (блокування, IP поза списком): ra-core
        // виходить в усіх вкладках. Збій сервера чи мережі — не привід виходити: стан помилки.
        const status = isApiError(error) ? error.status : null
        if (status === 401 || status === 403) {
          sessionEnded = true
          throw error
        }
      }
    },

    checkError(error: unknown) {
      // 403 — це «немає прав» на конкретну дію, а не кінець сесії.
      if (isApiError(error) && error.status === 401) {
        me = null
        sessionEnded = true
        return Promise.reject(error)
      }
      return Promise.resolve()
    },

    /** Повернення з SSO (маршрут `/auth/callback`): помилка провайдера або профіль і `next`. */
    async handleCallback() {
      const error = urlParam("error")
      if (error)
        throw new ApiError(401, { code: "unauthenticated", message: error })
      me = null
      await loadMe()
      broadcastAuthEvent({ type: "login" })
      return { redirectTo: safeRedirectPath(urlParam("next")) }
    },

    async getIdentity() {
      const profile = await loadMe()
      return {
        id: profile.id,
        fullName: profile.name,
        avatar: profile.avatarUrl,
      }
    },

    async getPermissions() {
      return (await loadMe()).permissions
    },

    async canAccess({
      resource,
      action,
    }: {
      resource: string
      action: string
    }) {
      return hasPermission((await loadMe()).permissions, resource, action)
    },
  }
}
