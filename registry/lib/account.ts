/**
 * Акаунт користувача (ADR-0011, ADR-0012, PF01): профіль, способи підтвердження, резервні коди,
 * сесії й пристрої, журнал входів, листи про вхід з нового пристрою, токени API.
 *
 * Контракт (усе — під `/api/v1`, для користувача, що увійшов):
 * - `GET /me/security` → фактори, які можна додати, залишок резервних кодів, чи вимагає компанія
 *   другий крок, листи про новий вхід. `PATCH /me/security` { newSignInAlerts } → 204.
 * - Новий фактор — лише після повторного підтвердження (інакше 403 `reauth_required`):
 *   - застосунок: `POST /me/factors/totp` → { setupId, secret, uri };
 *     `POST /me/factors/totp/verify` { setupId, code } → { factor, backupCodes? };
 *   - SMS/Viber: `POST /me/factors/sms` { phone } → { setupId, destination, resendIn, codeLength };
 *     `POST /me/factors/sms/verify` { setupId, code } → { factor, backupCodes? };
 *   - email: `POST /me/factors/email` → { factor, backupCodes? } (адресу вже підтверджено);
 *   - ключ доступу: `POST /me/factors/passkey/options` → { publicKey } (JSON-форма WebAuthn);
 *     `POST /me/factors/passkey` { name, credential } → { factor, backupCodes? }.
 *   - `backupCodes` приходять разом із першим фактором — їх показують один раз.
 * - `PATCH /me/factors/:id` { name } → фактор; `DELETE /me/factors/:id` → 204. Останній фактор, коли
 *   компанія вимагає другий крок, — 409 `factor_required`.
 * - `POST /me/backup-codes` → { codes }: нові резервні коди, старі більше не діють.
 * - `GET /me/sessions` → сесії; `DELETE /me/sessions/:id` — вийти на пристрої;
 *   `DELETE /me/sessions` — вийти на всіх інших пристроях.
 * - `GET /me/trusted-devices` → пристрої без другого кроку; `DELETE /me/trusted-devices/:id`;
 *   `DELETE /me/trusted-devices` — забути всі.
 * - `GET /me/sign-ins?page=&perPage=` → { data, total }: журнал входів, новіші першими.
 * - Профіль (ADR-0012): `PATCH /me` { name, position, phone, timezone, signature } → 204;
 *   `PUT /me/avatar` (multipart, поле `file`) → { avatarUrl }; `DELETE /me/avatar` → 204.
 * - Токени API (ADR-0012): `GET /me/api-tokens` → { tokens, scopes }; `POST /me/api-tokens`
 *   { name, scopes, expiresInDays } → { token, item } — сам токен показується один раз;
 *   `DELETE /me/api-tokens/:id` — відкликати. Права токена — не ширші за права користувача.
 * - Сповіщення (ADR-0013): `GET` / `PUT /me/notification-settings` — див. lib/notification-settings.
 * - Під час «Увійти як…» (ADR-0011) зміни безпеки недоступні: 403 `impersonation_forbidden`.
 */
import { z } from "zod"

import { listResultSchema, type ApiClient } from "@/registry/lib/api"
import {
  notificationSettingsSchema,
  type NotificationSettings,
  type NotificationSettingsUpdate,
} from "@/registry/lib/notification-settings"
import { createPasskey } from "@/registry/lib/passkey"

/* --------------------------------- Схеми --------------------------------- */

/** Фактори, які користувач налаштовує сам; резервні коди — окремо (`backupCodes`). */
export const SETUP_FACTORS = ["totp", "sms", "email", "passkey"] as const
export type SetupFactor = (typeof SETUP_FACTORS)[number]

export const DEVICE_TYPES = ["desktop", "mobile", "tablet"] as const

export const deviceSchema = z.object({
  type: z.enum(DEVICE_TYPES),
  /** «Chrome», «Safari»… */
  browser: z.string().optional(),
  /** «Windows», «iOS»… */
  os: z.string().optional(),
})
export type Device = z.infer<typeof deviceSchema>

export const factorSchema = z.object({
  id: z.string(),
  type: z.enum(SETUP_FACTORS),
  /** Назва від користувача: «iPhone», «YubiKey». */
  name: z.string().optional(),
  /** Маскована адреса для sms та email: «+380 •• ••• •• 45». */
  destination: z.string().optional(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable().optional(),
})
export type Factor = z.infer<typeof factorSchema>

export const securityOverviewSchema = z.object({
  factors: z.array(factorSchema),
  /** Які фактори проект дозволяє додати. */
  available: z.array(z.enum(SETUP_FACTORS)),
  /** Резервні коди: скільки лишилось; null — ще не створено. */
  backupCodes: z
    .object({
      remaining: z.number().int().min(0),
      total: z.number().int().min(1),
    })
    .nullable(),
  /** Компанія вимагає другий крок: останній фактор не видалити. */
  twoFactorRequired: z.boolean(),
  /** Лист про вхід з нового пристрою. */
  newSignInAlerts: z.boolean(),
  /** Коли востаннє змінено пароль (ISO); null — пароля немає (лише SSO чи вхід без пароля). */
  passwordChangedAt: z.string().nullable().optional(),
})
export type SecurityOverview = z.infer<typeof securityOverviewSchema>

export const totpSetupSchema = z.object({
  setupId: z.string(),
  /** Ключ base32 для введення вручну. */
  secret: z.string(),
  /** `otpauth://totp/…` — вміст QR-коду. */
  uri: z.string(),
})
export type TotpSetup = z.infer<typeof totpSetupSchema>

export const smsSetupSchema = z.object({
  setupId: z.string(),
  destination: z.string(),
  resendIn: z.number().int().min(0).optional(),
  codeLength: z.number().int().min(4).max(12).optional(),
})
export type SmsSetup = z.infer<typeof smsSetupSchema>

export const factorEnrolledSchema = z.object({
  factor: factorSchema,
  /** Резервні коди, якщо це перший фактор: показати один раз. */
  backupCodes: z.array(z.string()).optional(),
})
export type FactorEnrolled = z.infer<typeof factorEnrolledSchema>

const backupCodesSchema = z.object({ codes: z.array(z.string()).min(1) })
const passkeyCreationSchema = z.object({
  publicKey: z.custom<PublicKeyCredentialCreationOptionsJSON>(
    (value) => typeof value === "object" && value !== null,
  ),
})

export const accountSessionSchema = z.object({
  id: z.string(),
  /** Сесія цього браузера. */
  current: z.boolean(),
  device: deviceSchema,
  ip: z.string().optional(),
  /** Приблизно за IP: «Київ, Україна». */
  location: z.string().optional(),
  createdAt: z.string(),
  lastActiveAt: z.string(),
  /** Адміністратор, що працює від імені користувача («Увійти як…»). */
  impersonatedBy: z.string().optional(),
})
export type AccountSession = z.infer<typeof accountSessionSchema>

export const trustedDeviceSchema = z.object({
  id: z.string(),
  current: z.boolean(),
  device: deviceSchema,
  location: z.string().optional(),
  createdAt: z.string(),
  expiresAt: z.string(),
})
export type TrustedDevice = z.infer<typeof trustedDeviceSchema>

/** Чим увійшли: пароль, фактор, посилання, SSO або «Увійти як…» адміністратора. */
export const SIGN_IN_METHODS = [
  "password",
  "totp",
  "backup_code",
  "sms",
  "email",
  "passkey",
  "link",
  "sso",
  "impersonation",
] as const
export type SignInMethod = (typeof SIGN_IN_METHODS)[number]

export const signInEventSchema = z.object({
  id: z.string(),
  at: z.string(),
  /** blocked — забагато спроб або перевірка «не бот» не пройдена. */
  result: z.enum(["success", "failed", "blocked"]),
  method: z.enum(SIGN_IN_METHODS),
  /** Назва SSO-провайдера. */
  provider: z.string().optional(),
  device: deviceSchema,
  ip: z.string().optional(),
  location: z.string().optional(),
  /** Перший вхід із цього пристрою — про нього надходить лист. */
  newDevice: z.boolean().optional(),
  impersonatedBy: z.string().optional(),
})
export type SignInEvent = z.infer<typeof signInEventSchema>

const signInPageSchema = listResultSchema(signInEventSchema)
export type SignInPage = z.infer<typeof signInPageSchema>

/** Що користувач змінює у профілі; відсутнє поле — без змін, "" — очистити. */
export interface ProfileUpdate {
  name?: string
  /** Посада: «Головна бухгалтерка». */
  position?: string
  /** Контактний телефон (E.164); вхід кодом у SMS — окремо, у факторах. */
  phone?: string
  /** Часовий пояс IANA: «Europe/Kyiv». */
  timezone?: string
  /** Підпис для листів і документів. */
  signature?: string
}

const avatarSchema = z.object({ avatarUrl: z.string() })

/** Термін дії токена в днях; null — без терміну. */
export const API_TOKEN_EXPIRY_DAYS = [30, 90, 365, null] as const

export const apiTokenSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Початок токена, щоб відрізнити: «erp_7f3a…». */
  prefix: z.string(),
  scopes: z.array(z.string()),
  createdAt: z.string(),
  expiresAt: z.string().nullable(),
  lastUsedAt: z.string().nullable().optional(),
})
export type ApiToken = z.infer<typeof apiTokenSchema>

export const apiTokenScopeSchema = z.object({
  /** Право `<ресурс>:<дія>`: «invoices:read». */
  id: z.string(),
  /** Підпис мовою з `Accept-Language`: «Перегляд». */
  label: z.string(),
  /** Група (ресурс): «Рахунки». */
  group: z.string(),
})
export type ApiTokenScope = z.infer<typeof apiTokenScopeSchema>

const apiTokensSchema = z.object({
  tokens: z.array(apiTokenSchema),
  /** Права, які можна дати токену (не ширші за права користувача). */
  scopes: z.array(apiTokenScopeSchema),
})
export type ApiTokens = z.infer<typeof apiTokensSchema>

const apiTokenCreatedSchema = z.object({
  /** Повний токен — показати один раз. */
  token: z.string(),
  item: apiTokenSchema,
})
export type ApiTokenCreated = z.infer<typeof apiTokenCreatedSchema>

/* -------------------------------- Клієнт API -------------------------------- */

export interface AccountApi {
  getSecurity: () => Promise<SecurityOverview>
  setSignInAlerts: (enabled: boolean) => Promise<void>
  startTotp: () => Promise<TotpSetup>
  verifyTotp: (setupId: string, code: string) => Promise<FactorEnrolled>
  startSms: (phone: string) => Promise<SmsSetup>
  verifySms: (setupId: string, code: string) => Promise<FactorEnrolled>
  enableEmail: () => Promise<FactorEnrolled>
  /** Системне вікно створення ключа; скасування — `PasskeyCancelledError`. */
  addPasskey: (name: string) => Promise<FactorEnrolled>
  renameFactor: (id: string, name: string) => Promise<Factor>
  removeFactor: (id: string) => Promise<void>
  regenerateBackupCodes: () => Promise<string[]>
  getSessions: () => Promise<AccountSession[]>
  endSession: (id: string) => Promise<void>
  endOtherSessions: () => Promise<void>
  getTrustedDevices: () => Promise<TrustedDevice[]>
  forgetDevice: (id: string) => Promise<void>
  forgetAllDevices: () => Promise<void>
  getSignIns: (page: number, perPage: number) => Promise<SignInPage>
  updateProfile: (patch: ProfileUpdate) => Promise<void>
  /** Квадратне зображення (AvatarEditor обрізає й стискає); повертає нову адресу. */
  uploadAvatar: (image: Blob) => Promise<string>
  removeAvatar: () => Promise<void>
  getApiTokens: () => Promise<ApiTokens>
  createApiToken: (data: {
    name: string
    scopes: string[]
    expiresInDays: number | null
  }) => Promise<ApiTokenCreated>
  revokeApiToken: (id: string) => Promise<void>
  /** Сповіщення: події, канали, тихі години (ADR-0013, lib/notification-settings). */
  getNotificationSettings: () => Promise<NotificationSettings>
  updateNotificationSettings: (
    update: NotificationSettingsUpdate,
  ) => Promise<NotificationSettings>
}

export interface AccountApiOptions {
  /** Профіль змінився (фактори, ім'я, фото): `/me` треба завантажити заново. */
  onMeChange?: () => Promise<unknown>
}

const id = (value: string) => encodeURIComponent(value)

export function createAccountApi(
  client: ApiClient,
  { onMeChange }: AccountApiOptions = {},
): AccountApi {
  /** Після зміни оновити профіль, але повернути результат дії. */
  const changed = async <T>(result: T): Promise<T> => {
    try {
      await onMeChange?.()
    } catch {
      // Дія на сервері вже вдалася (нові резервні коди, фото): збій оновлення профілю не робить
      // її помилкою. Ціна: useMe (staleTime Infinity) показує попередній профіль до наступного
      // перечитування (useRefreshMe, перезавантаження), а 401 тут проявиться в наступному запиті.
    }
    return result
  }

  return {
    getSecurity: () =>
      client.get("/me/security", { schema: securityOverviewSchema }),

    async setSignInAlerts(enabled) {
      await client.patch("/me/security", { newSignInAlerts: enabled })
    },

    startTotp: () =>
      client.post("/me/factors/totp", undefined, { schema: totpSetupSchema }),

    verifyTotp: (setupId, code) =>
      client
        .post(
          "/me/factors/totp/verify",
          { setupId, code },
          { schema: factorEnrolledSchema },
        )
        .then(changed),

    startSms: (phone) =>
      client.post("/me/factors/sms", { phone }, { schema: smsSetupSchema }),

    verifySms: (setupId, code) =>
      client
        .post(
          "/me/factors/sms/verify",
          { setupId, code },
          { schema: factorEnrolledSchema },
        )
        .then(changed),

    enableEmail: () =>
      client
        .post("/me/factors/email", undefined, { schema: factorEnrolledSchema })
        .then(changed),

    async addPasskey(name) {
      const { publicKey } = await client.post(
        "/me/factors/passkey/options",
        undefined,
        { schema: passkeyCreationSchema },
      )
      const credential = await createPasskey(publicKey)
      return client
        .post(
          "/me/factors/passkey",
          { name, credential },
          { schema: factorEnrolledSchema },
        )
        .then(changed)
    },

    renameFactor: (factorId, name) =>
      client.patch(
        `/me/factors/${id(factorId)}`,
        { name },
        { schema: factorSchema },
      ),

    async removeFactor(factorId) {
      await client.delete(`/me/factors/${id(factorId)}`)
      await changed(undefined)
    },

    async regenerateBackupCodes() {
      const { codes } = await client.post("/me/backup-codes", undefined, {
        schema: backupCodesSchema,
      })
      return changed(codes)
    },

    getSessions: () =>
      client.get("/me/sessions", { schema: z.array(accountSessionSchema) }),

    async endSession(sessionId) {
      await client.delete(`/me/sessions/${id(sessionId)}`)
    },

    async endOtherSessions() {
      await client.delete("/me/sessions")
    },

    getTrustedDevices: () =>
      client.get("/me/trusted-devices", {
        schema: z.array(trustedDeviceSchema),
      }),

    async forgetDevice(deviceId) {
      await client.delete(`/me/trusted-devices/${id(deviceId)}`)
    },

    async forgetAllDevices() {
      await client.delete("/me/trusted-devices")
    },

    getSignIns: (page, perPage) =>
      client.get("/me/sign-ins", {
        query: { page: String(page), perPage: String(perPage) },
        schema: signInPageSchema,
      }),

    async updateProfile(patch) {
      await client.patch("/me", patch)
      await changed(undefined)
    },

    async uploadAvatar(image) {
      const form = new FormData()
      form.append("file", image, "avatar")
      const { avatarUrl } = await client.put("/me/avatar", form, {
        schema: avatarSchema,
      })
      return changed(avatarUrl)
    },

    async removeAvatar() {
      await client.delete("/me/avatar")
      await changed(undefined)
    },

    getApiTokens: () =>
      client.get("/me/api-tokens", { schema: apiTokensSchema }),

    createApiToken: (data) =>
      client.post("/me/api-tokens", data, { schema: apiTokenCreatedSchema }),

    async revokeApiToken(tokenId) {
      await client.delete(`/me/api-tokens/${id(tokenId)}`)
    },

    getNotificationSettings: () =>
      client.get("/me/notification-settings", {
        schema: notificationSettingsSchema,
      }),

    updateNotificationSettings: (update) =>
      client.put("/me/notification-settings", update, {
        schema: notificationSettingsSchema,
      }),
  }
}

/* ------------------------------ Ключі кешу ------------------------------ */

/** Ключі TanStack Query для екранів безпеки: інвалідація після змін. */
export const ACCOUNT_QUERY_KEYS = {
  security: ["erp-ui", "account", "security"],
  sessions: ["erp-ui", "account", "sessions"],
  trustedDevices: ["erp-ui", "account", "trusted-devices"],
  signIns: ["erp-ui", "account", "sign-ins"],
  apiTokens: ["erp-ui", "account", "api-tokens"],
  notifications: ["erp-ui", "account", "notifications"],
} as const

/** Опис пристрою з User-Agent — для моків і серверів без власного розбору. */
export function deviceFromUserAgent(userAgent: string): Device {
  const ua = userAgent.toLowerCase()
  const tablet =
    /ipad|tablet/.test(ua) || (/android/.test(ua) && !/mobile/.test(ua))
  const mobile = !tablet && /iphone|android|mobile/.test(ua)
  const os = /iphone|ipad|ios/.test(ua)
    ? "iOS"
    : /android/.test(ua)
      ? "Android"
      : /windows/.test(ua)
        ? "Windows"
        : /mac os|macintosh/.test(ua)
          ? "macOS"
          : /linux/.test(ua)
            ? "Linux"
            : undefined
  const browser = /edg\//.test(ua)
    ? "Edge"
    : /firefox\//.test(ua)
      ? "Firefox"
      : /chrome\/|chromium\//.test(ua)
        ? "Chrome"
        : /safari\//.test(ua)
          ? "Safari"
          : undefined
  return {
    type: tablet ? "tablet" : mobile ? "mobile" : "desktop",
    ...(browser ? { browser } : {}),
    ...(os ? { os } : {}),
  }
}
