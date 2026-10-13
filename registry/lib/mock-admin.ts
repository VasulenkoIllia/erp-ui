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
import { CURRENT_IP, resetMockFactors } from "@/registry/lib/mock-account"
import {
  currentMockUser,
  errorResponse,
  getMockSession,
  impersonationForbidden,
  json,
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

const languageOf = (request: Request) =>
  (request.headers.get("Accept-Language") ?? "uk").slice(0, 2)

export function createAdminHandlers({
  baseUrl = API_PREFIX,
  roles,
  providers,
  reauthRequired,
}: AdminMockOptions): HttpHandler[] {
  /** Адміністратор із правом; зміни — ще й не «Увійти як…» і з повторним підтвердженням. */
  const admin = (
    resource: "security" | "users",
    action: "read" | "update",
    change = false,
  ): MockUser | Response => {
    const user = currentMockUser()
    if (!user) return unauthenticated()
    if (!hasPermission(user.permissions, resource, action))
      return forbidden(`Missing ${resource}:${action}`)
    if (!change) return user
    return impersonationForbidden() ?? reauthRequired() ?? user
  }

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
      const user = admin("security", "update", true)
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
      write(POLICY_KEY, policy)
      setSessionMinutes(policy.sessionMinutes)
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
      return json({ status: "queued" }, { status: 202 })
    }),

    http.get(`${baseUrl}/recovery-requests`, () => {
      const user = admin("users", "update")
      if (user instanceof Response) return user
      return json(readRequests())
    }),

    http.delete(`${baseUrl}/recovery-requests/:id`, ({ params }) => {
      const user = admin("users", "update")
      if (user instanceof Response) return user
      write(
        RECOVERY_KEY,
        readRequests().filter((r) => r.id !== params.id),
      )
      return noContent()
    }),

    http.post(
      `${baseUrl}/users/:id/reset-factors`,
      async ({ params, request }) => {
        const user = admin("users", "update", true)
        if (user instanceof Response) return user
        const { reason } = (await request.json()) as { reason?: string }
        if (!reason?.trim()) return validation({ reason: "required" })
        const target = mockUsersList().find((u) => u.id === params.id)
        if (!target)
          return errorResponse(404, { code: "not_found", message: "Not found" })
        if (target.id === user.id) return validation({ userId: "invalid" })
        resetMockFactors(target)
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
  ]
}
