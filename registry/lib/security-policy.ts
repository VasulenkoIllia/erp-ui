/**
 * Політики безпеки організації й відновлення доступу (ADR-0012, PF01): що адміністратор налаштовує для
 * всіх користувачів і як допомагає тому, хто втратив другий крок.
 *
 * Контракт (усе — під `/api/v1`, право `security:update` чи `users:update`, зміни — після повторного
 * підтвердження, ADR-0010):
 * - `GET /security-policy` → { policy, options }: політика й з чого обирати (ролі, SSO-провайдери,
 *   поточна адреса адміністратора). `PUT /security-policy` (policy) → policy; помилки — 422
 *   `fieldErrors` (напр. `ipAllowlist: "excludesCurrent"` — список відрізав би самого адміністратора).
 * - Політика діє на вхід (ADR-0011, `lib/auth`): обов'язковий другий крок → після пароля
 *   `factor_setup_required`, протермінований пароль → `password_change_required` з `reason: "expired"`,
 *   адреса поза списком → 403 `ip_not_allowed`; довжина пароля, сесія й автовихід — у `GET /auth/methods`.
 * - `GET /recovery-requests` → запити «втратив доступ до другого кроку»; `DELETE /recovery-requests/:id`
 *   — відхилити. `POST /users/:id/reset-factors` { reason } → 204: скинути фактори, резервні коди,
 *   довірені пристрої й сесії користувача; лист користувачу, запис в аудит.
 * - Доступ користувача (ADR-0013, право `users:update`):
 *   - `GET /users/:id/access` → стан (активний чи заблокований, ким і чому), фактори, останній
 *     вхід, сесії;
 *   - `GET /sessions?q=&page=&perPage=` → { data, total }: активні сесії всіх користувачів;
 *     `DELETE /sessions/:id` — завершити; `POST /users/:id/sign-out` — завершити всі сесії людини;
 *   - `POST /users/:id/block` { reason } → 204 (повторне підтвердження; не себе; сесії
 *     завершуються, токени API не діють); `POST /users/:id/unblock` → 204;
 *   - вхід заблокованого — 403 `account_blocked`.
 */
import { z } from "zod"

import { accountSessionSchema, SETUP_FACTORS } from "@/registry/lib/account"
import { listResultSchema, type ApiClient } from "@/registry/lib/api"

/* --------------------------------- Схеми --------------------------------- */

/** Обов'язковий другий крок: ні, для вибраних ролей, для всіх. */
export const TWO_FACTOR_MODES = ["off", "roles", "all"] as const
export type TwoFactorMode = (typeof TWO_FACTOR_MODES)[number]

/** Як PASSWORDLESS_METHODS у lib/auth (тут — без імпорту, щоб не було циклу модулів). */
const PASSWORDLESS = ["email", "sms", "passkey"] as const

export const PASSWORD_LIMITS = { min: 8, max: 64 } as const

export const securityPolicySchema = z.object({
  twoFactor: z.enum(TWO_FACTOR_MODES),
  /** Ролі, для яких другий крок обов'язковий (коли `twoFactor: "roles"`). */
  twoFactorRoles: z.array(z.string()),
  /** Які другі кроки користувачі можуть налаштувати. */
  allowedFactors: z.array(z.enum(SETUP_FACTORS)).min(1),
  /** Вхід без пароля. */
  passwordless: z.array(z.enum(PASSWORDLESS)),
  /** Увімкнені SSO-провайдери (id). */
  ssoProviders: z.array(z.string()),
  password: z.object({
    minLength: z
      .number()
      .int()
      .min(PASSWORD_LIMITS.min)
      .max(PASSWORD_LIMITS.max),
    /** Через скільки днів пароль треба змінити; null — без терміну. */
    expiryDays: z.number().int().min(1).max(730).nullable(),
    /** Скільки останніх паролів не можна повторювати. */
    preventReuse: z.number().int().min(0).max(24),
  }),
  /** Сесія без активності, хв. */
  sessionMinutes: z.number().int().min(5).max(1440),
  /** Автовихід після бездіяльності в інтерфейсі, хв; null — вимкнено. */
  idleTimeoutMinutes: z.number().int().min(5).max(1440).nullable(),
  /** Скільки днів пристрій може бути довіреним; 0 — вимкнено. */
  trustedDeviceDays: z.number().int().min(0).max(90),
  /** Дозволені адреси (IPv4/IPv6, CIDR); порожньо — будь-які. */
  ipAllowlist: z.array(z.string()),
})
export type SecurityPolicy = z.infer<typeof securityPolicySchema>

export const securityPolicyResponseSchema = z.object({
  policy: securityPolicySchema,
  options: z.object({
    roles: z.array(z.object({ id: z.string(), name: z.string() })),
    providers: z.array(z.object({ id: z.string(), name: z.string() })),
    /** Адреса адміністратора, як її бачить сервер: щоб не відрізати себе списком. */
    currentIp: z.string().optional(),
  }),
})
export type SecurityPolicyResponse = z.infer<
  typeof securityPolicyResponseSchema
>

export const recoveryRequestSchema = z.object({
  id: z.string(),
  userId: z.string(),
  userName: z.string(),
  email: z.string(),
  requestedAt: z.string(),
  /** Що написав користувач («загубив телефон»). */
  comment: z.string().optional(),
})
export type RecoveryRequest = z.infer<typeof recoveryRequestSchema>

/** Сесія будь-якого користувача — для адміністратора. */
export const adminSessionSchema = accountSessionSchema.extend({
  user: z.object({ id: z.string(), name: z.string(), email: z.string() }),
})
export type AdminSession = z.infer<typeof adminSessionSchema>

const adminSessionsPageSchema = listResultSchema(adminSessionSchema)
export type AdminSessionsPage = z.infer<typeof adminSessionsPageSchema>

export const userAccessSchema = z.object({
  userId: z.string(),
  status: z.enum(["active", "blocked"]),
  blocked: z
    .object({ at: z.string(), by: z.string(), reason: z.string() })
    .nullable(),
  /** Налаштовані способи другого кроку. */
  factors: z.array(z.enum(SETUP_FACTORS)),
  lastSignInAt: z.string().nullable(),
  sessions: z.array(adminSessionSchema),
})
export type UserAccess = z.infer<typeof userAccessSchema>

/* -------------------------------- Клієнт API -------------------------------- */

export interface AdminApi {
  getSecurityPolicy: () => Promise<SecurityPolicyResponse>
  updateSecurityPolicy: (policy: SecurityPolicy) => Promise<SecurityPolicy>
  getRecoveryRequests: () => Promise<RecoveryRequest[]>
  declineRecoveryRequest: (id: string) => Promise<void>
  /** Скинути другий крок користувача (втратив телефон і коди); причина — в аудит. */
  resetFactors: (userId: string, reason: string) => Promise<void>
  getUserAccess: (userId: string) => Promise<UserAccess>
  /** Активні сесії всіх; `q` — ім'я чи email. */
  getSessions: (
    q: string,
    page: number,
    perPage: number,
  ) => Promise<AdminSessionsPage>
  endSession: (sessionId: string) => Promise<void>
  /** Завершити всі сесії користувача. */
  signOutUser: (userId: string) => Promise<void>
  blockUser: (userId: string, reason: string) => Promise<void>
  unblockUser: (userId: string) => Promise<void>
}

export function createAdminApi(client: ApiClient): AdminApi {
  return {
    getSecurityPolicy: () =>
      client.get("/security-policy", { schema: securityPolicyResponseSchema }),
    updateSecurityPolicy: (policy) =>
      client.put("/security-policy", policy, { schema: securityPolicySchema }),
    getRecoveryRequests: () =>
      client.get("/recovery-requests", {
        schema: z.array(recoveryRequestSchema),
      }),
    async declineRecoveryRequest(id) {
      await client.delete(`/recovery-requests/${encodeURIComponent(id)}`)
    },
    async resetFactors(userId, reason) {
      await client.post(`/users/${encodeURIComponent(userId)}/reset-factors`, {
        reason,
      })
    },
    getUserAccess: (userId) =>
      client.get(`/users/${encodeURIComponent(userId)}/access`, {
        schema: userAccessSchema,
      }),
    getSessions: (q, page, perPage) =>
      client.get("/sessions", {
        query: {
          q: q.trim() || undefined,
          page: String(page),
          perPage: String(perPage),
        },
        schema: adminSessionsPageSchema,
      }),
    async endSession(sessionId) {
      await client.delete(`/sessions/${encodeURIComponent(sessionId)}`)
    },
    async signOutUser(userId) {
      await client.post(`/users/${encodeURIComponent(userId)}/sign-out`)
    },
    async blockUser(userId, reason) {
      await client.post(`/users/${encodeURIComponent(userId)}/block`, {
        reason,
      })
    },
    async unblockUser(userId) {
      await client.post(`/users/${encodeURIComponent(userId)}/unblock`)
    },
  }
}

export const ADMIN_QUERY_KEYS = {
  securityPolicy: ["erp-ui", "admin", "security-policy"],
  recoveryRequests: ["erp-ui", "admin", "recovery-requests"],
  sessions: ["erp-ui", "admin", "sessions"],
  userAccess: (userId: string) => ["erp-ui", "admin", "user-access", userId],
} as const

/* -------------------------------- Адреси IP -------------------------------- */

/** «192.0.2.10» → 32-бітне число; не IPv4 — null. */
export function parseIpv4(value: string): number | null {
  const parts = value.split(".")
  if (parts.length !== 4) return null
  let result = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const n = Number(part)
    if (n > 255 || (part.length > 1 && part.startsWith("0"))) return null
    result = result * 256 + n
  }
  return result
}

function isIpv6(value: string): boolean {
  if (!value.includes(":") || !/^[\da-f:.]+$/i.test(value)) return false
  try {
    // Браузер і Node розбирають IPv6 у хості URL; некоректна адреса — виняток.
    new URL(`http://[${value}]/`)
    return true
  } catch {
    return false
  }
}

/** Адреса чи мережа: «203.0.113.7», «203.0.113.0/24», «2001:db8::/32». */
export function isValidCidr(value: string): boolean {
  const [address = "", prefix, extra] = value.trim().split("/")
  if (extra !== undefined) return false
  const v4 = parseIpv4(address) !== null
  const v6 = !v4 && isIpv6(address)
  if (!v4 && !v6) return false
  if (prefix === undefined) return true
  if (!/^\d{1,3}$/.test(prefix)) return false
  return Number(prefix) <= (v4 ? 32 : 128)
}

/** Чи входить IPv4-адреса в мережу (IPv6 — лише точний збіг адреси без префікса). */
export function ipInCidr(ip: string, cidr: string): boolean {
  const [address = "", prefix] = cidr.trim().split("/")
  const target = parseIpv4(ip)
  const network = parseIpv4(address)
  if (target === null || network === null)
    return prefix === undefined && ip.toLowerCase() === address.toLowerCase()
  const bits = prefix === undefined ? 32 : Number(prefix)
  if (bits === 0) return true
  const size = 2 ** (32 - bits)
  return Math.floor(target / size) === Math.floor(network / size)
}

/** Чи пускає список адресу; порожній список — будь-яку. */
export function ipAllowed(ip: string, allowlist: readonly string[]): boolean {
  return !allowlist.length || allowlist.some((cidr) => ipInCidr(ip, cidr))
}
