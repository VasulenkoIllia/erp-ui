/**
 * Мок адміністрування безпеки (ADR-0012): політика безпеки організації, запити «втратив доступ до
 * другого кроку» й скидання факторів користувача.
 *
 * - Політика й запити живуть у localStorage, як дані сервера: переживають перезавантаження демо.
 * - Політику читає мок входу (lib/mock-auth): обов'язковий другий крок, пароль, сесія, адреси.
 */
import { http, type HttpHandler } from "msw/http"

import { SETUP_FACTORS } from "@/registry/lib/account"
import { API_PREFIX } from "@/registry/lib/api"
import {
  hasPermission,
  localizedText,
  type LocalizedText,
} from "@/registry/lib/auth"
import {
  endAllMockUserSessions,
  endMockUserSession,
  mockAccessSummary,
  mockBlocked,
  mockUserSessions,
  resetMockFactors,
  setMockBlocked,
} from "@/registry/lib/mock-account"
import { auditChanges, recordAudit } from "@/registry/lib/mock-audit"
import { pushMockNotification } from "@/registry/lib/mock-inbox"
import {
  CURRENT_IP,
  currentMockUser,
  emitMockEvent,
  errorResponse,
  getMockSession,
  impersonationForbidden,
  isMockCompanyMember,
  json,
  mockCompanyOrForbidden,
  mockCompanyTarget,
  mockUsersList,
  noContent,
  randomToken,
  sendMockMessage,
  setSessionMinutes,
  unauthenticated,
  type MockUser,
} from "@/registry/lib/mock-server"
import {
  ipAllowed,
  isValidCidr,
  securityPolicySchema,
  type RecoveryRequest,
  type SecurityPolicy,
} from "@/registry/lib/security-policy"

/* --------------------------------- Політика --------------------------------- */

const POLICY_KEY = "erp-ui:mock-security-policy"
const RECOVERY_KEY = "erp-ui:mock-recovery-requests"

export const DEFAULT_MOCK_POLICY: SecurityPolicy = {
  twoFactor: "off",
  twoFactorRoles: [],
  allowedFactors: [...SETUP_FACTORS],
  passwordless: ["email", "sms", "passkey"],
  ssoProviders: ["google", "apple"],
  password: { minLength: 10, expiryDays: null, preventReuse: 0 },
  sessionMinutes: 30,
  idleTimeoutMinutes: null,
  trustedDeviceDays: 30,
  ipAllowlist: [],
}

let policyDefaults: SecurityPolicy = DEFAULT_MOCK_POLICY

/** Типова політика проекту (з налаштувань мока входу). */
export function setMockPolicyDefaults(policy: SecurityPolicy): void {
  policyDefaults = policy
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value))
  } catch {
    // Без сховища зміни живуть до перезавантаження.
  }
}

/** Чинна політика: збережена адміністратором або типова. */
export function getMockPolicy(): SecurityPolicy {
  const parsed = securityPolicySchema.safeParse(read(POLICY_KEY, null))
  return parsed.success ? parsed.data : policyDefaults
}

/** Чи вимагає політика другий крок від користувача. */
export function policyRequiresFactor(user: MockUser): boolean {
  const policy = getMockPolicy()
  return (
    policy.twoFactor === "all" ||
    (policy.twoFactor === "roles" &&
      user.roles.some((role) => policy.twoFactorRoles.includes(role)))
  )
}

/** Чи пускає політика поточну адресу (мок завжди «бачить» CURRENT_IP). */
export function ipAllowedByPolicy(): boolean {
  return ipAllowed(CURRENT_IP, getMockPolicy().ipAllowlist)
}

export const ipNotAllowed = () =>
  errorResponse(403, {
    code: "ip_not_allowed",
    message: "Sign-in from this network is not allowed",
  })

/* --------------------------------- Обробники --------------------------------- */

export interface AdminMockOptions {
  baseUrl?: string
  /** Назви ролей для вибору в політиці; без них — id ролей з користувачів. */
  roles?: { id: string; name: LocalizedText }[]
  /** SSO-провайдери проекту (з `GET /auth/methods`). */
  providers: { id: string; name: string }[]
  reauthRequired: () => Response | null
}

const validation = (fields: Record<string, string>) =>
  errorResponse(422, {
    code: "validation",
    message: "Validation failed",
    fieldErrors: fields,
  })

const forbidden = (message: string) =>
  errorResponse(403, { code: "forbidden", message })

const notFound = () =>
  errorResponse(404, { code: "not_found", message: "Not found" })

/** Політика одним рівнем — для «було → стало» в журналі аудиту. */
function flattenPolicy({ password, ...rest }: SecurityPolicy) {
  return {
    ...rest,
    "password.minLength": password.minLength,
    "password.expiryDays": password.expiryDays,
    "password.preventReuse": password.preventReuse,
  }
}

const POLICY_LABELS: Record<string, LocalizedText> = {
  twoFactor: {
    uk: "Обов'язкова двоетапна перевірка",
    en: "Required two-step verification",
  },
  twoFactorRoles: { uk: "Ролі з обов'язковою перевіркою", en: "Roles" },
  allowedFactors: { uk: "Дозволені способи", en: "Allowed methods" },
  passwordless: { uk: "Вхід без пароля", en: "Passwordless sign-in" },
  ssoProviders: { uk: "Вхід через провайдера", en: "Sign-in providers" },
  "password.minLength": {
    uk: "Мінімальна довжина пароля",
    en: "Minimum password length",
  },
  "password.expiryDays": {
    uk: "Термін дії пароля, днів",
    en: "Password expiry, days",
  },
  "password.preventReuse": {
    uk: "Не повторювати останніх паролів",
    en: "Prevent reusing passwords",
  },
  sessionMinutes: { uk: "Сесія без активності, хв", en: "Idle session, min" },
  idleTimeoutMinutes: { uk: "Автовихід, хв", en: "Auto sign-out, min" },
  trustedDeviceDays: {
    uk: "Довірений пристрій, днів",
    en: "Trusted device, days",
  },
  ipAllowlist: { uk: "Дозволені адреси", en: "Allowed addresses" },
}

const languageOf = (request: Request) =>
  (request.headers.get("Accept-Language") ?? "uk").slice(0, 2)

export function createAdminHandlers({
  baseUrl = API_PREFIX,
  roles,
  providers,
  reauthRequired,
}: AdminMockOptions): HttpHandler[] {
  /**
   * Адміністратор із правом. `change` — не під час «Увійти як…»; `sensitive` — ще й після
   * повторного підтвердження.
   */
  const admin = (
    resource: "security" | "users",
    action: "read" | "update",
    level: "read" | "change" | "sensitive" = "read",
  ): MockUser | Response => {
    const user = currentMockUser()
    if (!user) return unauthenticated()
    if (!hasPermission(user.permissions, resource, action))
      return forbidden(`Missing ${resource}:${action}`)
    if (level === "read") return user
    const denied = impersonationForbidden()
    if (denied) return denied
    return level === "sensitive" ? (reauthRequired() ?? user) : user
  }

  /** Люди компанії запиту або 403 (ADR-0032). */
  const companyMembers = (request: Request, user: MockUser) => {
    const companyId = mockCompanyOrForbidden(request, user)
    return companyId instanceof Response
      ? companyId
      : mockUsersList().filter((u) => isMockCompanyMember(u, companyId))
  }
  /** Чи працюють двоє в одній компанії; без компаній — одна команда. */
  const sharesCompany = (a: MockUser, b: MockUser) =>
    b.companies.length === 0
      ? isMockCompanyMember(a, null)
      : b.companies.some((company) => isMockCompanyMember(a, company.id))
  const asTarget = (user: MockUser) => ({
    type: "users",
    id: user.id,
    name: user.name,
  })

  const readRequests = () => read<RecoveryRequest[]>(RECOVERY_KEY, [])

  return [
    http.get(`${baseUrl}/security-policy`, ({ request }) => {
      const user = admin("security", "read")
      if (user instanceof Response) return user
      const language = languageOf(request)
      const roleOptions =
        roles?.map((role) => ({
          id: role.id,
          name: localizedText(role.name, language) ?? role.id,
        })) ??
        [...new Set(mockUsersList().flatMap((u) => u.roles))].map((id) => ({
          id,
          name: id,
        }))
      return json({
        policy: getMockPolicy(),
        options: { roles: roleOptions, providers, currentIp: CURRENT_IP },
      })
    }),

    http.put(`${baseUrl}/security-policy`, async ({ request }) => {
      const user = admin("security", "update", "sensitive")
      if (user instanceof Response) return user
      const parsed = securityPolicySchema.safeParse(await request.json())
      if (!parsed.success)
        return validation(
          Object.fromEntries(
            parsed.error.issues.map((issue) => [
              issue.path.join("."),
              issue.code === "too_small" &&
              issue.path.join(".") === "allowedFactors"
                ? "required"
                : "invalid",
            ]),
          ),
        )
      const policy = parsed.data
      const fields: Record<string, string> = {}
      if (policy.twoFactor === "roles" && !policy.twoFactorRoles.length)
        fields.twoFactorRoles = "required"
      policy.ipAllowlist.forEach((cidr, index) => {
        if (!isValidCidr(cidr))
          fields[`ipAllowlist.${String(index)}`] = "invalid"
      })
      if (
        !Object.keys(fields).length &&
        !ipAllowed(CURRENT_IP, policy.ipAllowlist)
      )
        fields.ipAllowlist = "excludesCurrent"
      if (Object.keys(fields).length) return validation(fields)
      const before = getMockPolicy()
      write(POLICY_KEY, policy)
      setSessionMinutes(policy.sessionMinutes)
      recordAudit({
        action: "security.policy_updated",
        category: "security",
        changes: auditChanges(
          flattenPolicy(before),
          flattenPolicy(policy),
          POLICY_LABELS,
        ),
      })
      return json(policy)
    }),

    http.post(`${baseUrl}/auth/recovery-request`, async ({ request }) => {
      const session = getMockSession()
      const user = mockUsersList().find((u) => u.id === session?.userId)
      // Лише на кроці коду після пароля: особу вже підтверджено першим фактором.
      if (
        session?.stage !== "challenge" ||
        !session.challenge?.secondFactor ||
        !user
      )
        return unauthenticated()
      const { comment } = (await request.json()) as { comment?: string }
      const entry: RecoveryRequest = {
        id: `rec-${randomToken().slice(0, 8)}`,
        userId: user.id,
        userName: user.name,
        email: user.email,
        requestedAt: new Date().toISOString(),
        ...(comment?.trim() ? { comment: comment.trim().slice(0, 500) } : {}),
      }
      write(RECOVERY_KEY, [
        entry,
        ...readRequests().filter((r) => r.userId !== user.id),
      ])
      sendMockMessage({ channel: "email", to: user.email, kind: "recovery" })
      // Адміністраторам компаній цієї людини — у центр сповіщень (ADR-0014, ADR-0032).
      for (const admin of mockUsersList().filter(
        (u) =>
          u.id !== user.id &&
          hasPermission(u.permissions, "users", "update") &&
          sharesCompany(u, user),
      ))
        pushMockNotification(admin.id, {
          type: "security.recovery_requested",
          title: {
            uk: `Запит на відновлення доступу: ${user.name}`,
            en: `Access recovery request: ${user.name}`,
          },
          ...(entry.comment
            ? { body: { uk: entry.comment, en: entry.comment } }
            : {}),
          severity: "warning",
          actor: { name: user.name },
          link: "/settings/users",
        })
      recordAudit({
        action: "auth.recovery_requested",
        category: "auth",
        actor: { type: "user", id: user.id, name: user.name },
        ...(entry.comment ? { reason: entry.comment } : {}),
      })
      return json({ status: "queued" }, { status: 202 })
    }),

    http.get(`${baseUrl}/recovery-requests`, ({ request }) => {
      const user = admin("users", "update")
      if (user instanceof Response) return user
      const members = companyMembers(request, user)
      if (members instanceof Response) return members
      return json(
        readRequests().filter((r) => members.some((u) => u.id === r.userId)),
      )
    }),

    http.delete(`${baseUrl}/recovery-requests/:id`, ({ params, request }) => {
      const user = admin("users", "update")
      if (user instanceof Response) return user
      // Уже розібраний запит — 204, як і раніше (ідемпотентно); запит людини іншої компанії — 404.
      const entry = readRequests().find((r) => r.id === params.id)
      if (!entry) return noContent()
      const target = mockCompanyTarget(request, user, entry.userId)
      if (target instanceof Response) return target
      write(
        RECOVERY_KEY,
        readRequests().filter((r) => r.id !== params.id),
      )
      return noContent()
    }),

    http.post(
      `${baseUrl}/users/:id/reset-factors`,
      async ({ params, request }) => {
        const user = admin("users", "update", "sensitive")
        if (user instanceof Response) return user
        const { reason } = (await request.json()) as { reason?: string }
        if (!reason?.trim()) return validation({ reason: "required" })
        const target = mockCompanyTarget(request, user, params.id)
        if (target instanceof Response) return target
        if (target.id === user.id) return validation({ userId: "invalid" })
        resetMockFactors(target)
        recordAudit({
          action: "security.factors_reset",
          category: "security",
          target: asTarget(target),
          reason: reason.trim(),
        })
        write(
          RECOVERY_KEY,
          readRequests().filter((r) => r.userId !== target.id),
        )
        sendMockMessage({
          channel: "email",
          to: target.email,
          kind: "factors_reset",
          detail: user.name,
        })
        return noContent()
      },
    ),

    /* ------------------------- Доступ користувача ------------------------- */

    http.get(`${baseUrl}/users/:id/access`, ({ params, request }) => {
      const user = admin("users", "update")
      if (user instanceof Response) return user
      const target = mockCompanyTarget(request, user, params.id)
      if (target instanceof Response) return target
      const blocked = mockBlocked(target)
      const language = languageOf(request)
      return json({
        userId: target.id,
        status: blocked ? "blocked" : "active",
        blocked,
        roles: target.roles,
        ...mockAccessSummary(target),
        sessions: mockUserSessions(target, language).map((session) => ({
          ...session,
          user: { id: target.id, name: target.name, email: target.email },
        })),
      })
    }),

    http.get(`${baseUrl}/sessions`, ({ request }) => {
      const user = admin("users", "update")
      if (user instanceof Response) return user
      const params = new URL(request.url).searchParams
      const q = params.get("q")?.trim().toLocaleLowerCase("uk") ?? ""
      const page = Math.max(1, Number(params.get("page")) || 1)
      const perPage = Math.min(
        100,
        Math.max(1, Number(params.get("perPage")) || 20),
      )
      const language = languageOf(request)
      const members = companyMembers(request, user)
      if (members instanceof Response) return members
      const sessions = members
        .filter(
          (u) =>
            !q ||
            u.name.toLocaleLowerCase("uk").includes(q) ||
            u.email.toLowerCase().includes(q),
        )
        .flatMap((u) =>
          mockUserSessions(u, language).map((session) => ({
            ...session,
            user: { id: u.id, name: u.name, email: u.email },
          })),
        )
        .sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt))
      const start = (page - 1) * perPage
      return json({
        data: sessions.slice(start, start + perPage),
        total: sessions.length,
      })
    }),

    http.delete(`${baseUrl}/sessions/:id`, ({ params, request }) => {
      const user = admin("users", "update", "change")
      if (user instanceof Response) return user
      const members = companyMembers(request, user)
      if (members instanceof Response) return members
      if (params.id === getMockSession()?.id)
        return errorResponse(409, {
          code: "conflict",
          message: "This is your current session — sign out instead",
        })
      // Сесія людини іншої компанії — «не знайдено», як і сама людина.
      const owner = members.find((u) =>
        endMockUserSession(u, String(params.id)),
      )
      if (!owner) return notFound()
      recordAudit({
        action: "users.session_ended",
        category: "users",
        target: asTarget(owner),
      })
      return noContent()
    }),

    http.post(`${baseUrl}/users/:id/sign-out`, ({ params, request }) => {
      const user = admin("users", "update", "change")
      if (user instanceof Response) return user
      const target = mockCompanyTarget(request, user, params.id)
      if (target instanceof Response) return target
      endAllMockUserSessions(target)
      recordAudit({
        action: "users.signed_out",
        category: "users",
        target: asTarget(target),
      })
      return noContent()
    }),

    http.post(`${baseUrl}/users/:id/block`, async ({ params, request }) => {
      const user = admin("users", "update", "sensitive")
      if (user instanceof Response) return user
      const target = mockCompanyTarget(request, user, params.id)
      if (target instanceof Response) return target
      if (target.id === user.id) return validation({ userId: "invalid" })
      const { reason } = (await request.json()) as { reason?: string }
      if (!reason?.trim()) return validation({ reason: "required" })
      setMockBlocked(target, { by: user.name, reason: reason.trim() })
      recordAudit({
        action: "users.blocked",
        category: "users",
        target: asTarget(target),
        reason: reason.trim(),
      })
      emitMockEvent("users.blocked", { id: target.id, name: target.name })
      return noContent()
    }),

    http.post(`${baseUrl}/users/:id/unblock`, ({ params, request }) => {
      const user = admin("users", "update", "sensitive")
      if (user instanceof Response) return user
      const target = mockCompanyTarget(request, user, params.id)
      if (target instanceof Response) return target
      setMockBlocked(target, null)
      recordAudit({
        action: "users.unblocked",
        category: "users",
        target: asTarget(target),
      })
      emitMockEvent("users.unblocked", { id: target.id, name: target.name })
      return noContent()
    }),
  ]
}
