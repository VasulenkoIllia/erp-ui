/**
 * Мок адміністрування безпеки (ADR-0012): політика безпеки організації, запити «втратив доступ до
 * другого кроку» й скидання факторів користувача.
 *
 * - Політика й запити живуть у localStorage, як дані сервера: переживають перезавантаження демо.
 * - Політику читає мок входу (lib/mock-auth): обов'язковий другий крок, пароль, сесія, адреси.
 * - Права адміністратора — у компанії запиту (ADR-0034); вийти, завершити сесію, заблокувати,
 *   розблокувати чи скинути другий крок — лише людині, усі права якої він має сам («стеля»), і
 *   до повторного підтвердження: слабшого не просять пароль, щоб потім відмовити. Відмову «стелі»
 *   пише журнал компанії запиту, а дії над доступом — події облікового запису людини (A2c1).
 * - Політика — одна на застосунок (A2c1): у застосунку з компаніями змінює лише платформний
 *   адміністратор (`*`), `GET` каже це полем `canUpdate`; без компаній — право `security:update`.
 */
import { http, type HttpHandler } from "msw/http"

import { SETUP_FACTORS } from "@/registry/lib/account"
import { API_PREFIX } from "@/registry/lib/api"
import { localizedText, type LocalizedText } from "@/registry/lib/auth"
import {
  endAllMockUserSessions,
  endMockUserSession,
  hasMockUserSession,
  mockAccessSummary,
  mockBlocked,
  mockUserSessions,
  resetMockFactors,
  setMockBlocked,
} from "@/registry/lib/mock-account"
import {
  auditChanges,
  recordAudit,
  recordCeilingDenied,
  type MockCeilingDenial,
} from "@/registry/lib/mock-audit"
import {
  mockManagesCompany,
  mockManagesUserElsewhere,
  mockManagesUserIn,
  mockPermissionsAcross,
  mockRequestPermissions,
  mockRolesAcross,
  mockUserRolesIn,
} from "@/registry/lib/mock-company-roles"
import { pushMockNotification } from "@/registry/lib/mock-inbox"
import {
  CURRENT_IP,
  currentMockUser,
  emitMockEvent,
  errorResponse,
  getMockSession,
  impersonationForbidden,
  hasMockCompanies,
  isMockCompanyMember,
  json,
  mockCompanyTarget,
  mockUsersList,
  noContent,
  randomToken,
  sendMockMessage,
  setSessionMinutes,
  unauthenticated,
  type MockUser,
} from "@/registry/lib/mock-server"
import { mockCompanyIdsOf, mockGrantsService } from "@/registry/lib/mock-scope"
import { canGrant } from "@/registry/lib/roles"
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

/**
 * Чи вимагає політика другий крок від користувача: «для ролей» — за ролями в усіх його компаніях,
 * бо обліковий запис один (A2c1).
 */
export function policyRequiresFactor(user: MockUser): boolean {
  const policy = getMockPolicy()
  return (
    policy.twoFactor === "all" ||
    (policy.twoFactor === "roles" &&
      mockRolesAcross(user).some((role) =>
        policy.twoFactorRoles.includes(role),
      ))
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

/** Хто діє, у якій компанії запиту й з якими правами в ній (ADR-0034). */
interface AdminActor {
  user: MockUser
  companyId: string | null
  permissions: string[]
}

/** Дія для журналу: що пробували зробити з людиною. */
type AccessAction = Pick<MockCeilingDenial, "action" | "category">

/**
 * Політику змінює (ADR-0036) той, хто має `security:update` у компанії запиту, а в застосунку з
 * компаніями — лише адміністратор платформи (позначка облікового запису, а не `*` у ролі компанії).
 * У своїй компанії платформа діє за своєю роллю там, як і `PUT`.
 */
const canUpdatePolicy = ({ user, permissions }: AdminActor) =>
  mockGrantsService(permissions, "security", "update") &&
  (user.isPlatformAdmin === true || !hasMockCompanies())

/**
 * «Стеля» доступу (ADR-0034): вийти, завершити сесію, заблокувати, розблокувати чи скинути другий
 * крок — лише людині, якою адміністратор керує в кожній її компанії (ADR-0040): обліковий запис і
 * сесії в неї одні на всі компанії. Адміністратор платформи — поза цим правилом, його «стеля» —
 * права в компанії запиту проти всіх прав людини. Самого адміністратора платформи — лише інший
 * адміністратор платформи (ADR-0036).
 */
const canManageTarget = (
  { user, permissions, companyId }: AdminActor,
  target: MockUser,
) =>
  user.isPlatformAdmin === true
    ? canGrant(permissions, mockPermissionsAcross(target))
    : target.isPlatformAdmin !== true &&
      mockManagesUserIn(user, target, companyId) &&
      mockManagesUserElsewhere(user, target, companyId)

/** Дія над людиною понад «стелю»: у журнал і 403; `null` — можна. */
const withinCeiling = (
  actor: AdminActor,
  target: MockUser,
  attempted: AccessAction,
) => {
  if (canManageTarget(actor, target)) return null
  recordCeilingDenied({
    ...attempted,
    companyId: actor.companyId,
    target: { type: "users", id: target.id, name: target.name },
  })
  return forbidden("The user has permissions you don't have")
}

/**
 * Хто отримає сповіщення про запит на відновлення людини: колеги з `users:update` хоч в одній її
 * компанії — права там, а не в їхній активній компанії (ADR-0014, ADR-0034).
 */
const managesRecoveryOf = (admin: MockUser, user: MockUser) =>
  admin.id !== user.id &&
  mockCompanyIdsOf(user).some((companyId) =>
    mockManagesCompany(admin, companyId),
  )

export function createAdminHandlers({
  baseUrl = API_PREFIX,
  roles,
  providers,
  reauthRequired,
}: AdminMockOptions): HttpHandler[] {
  /**
   * Адміністратор із правом у компанії запиту (ADR-0034). `change` — не під час «Увійти як…»;
   * повторне підтвердження — у самій дії, після «стелі» (`withinCeiling`) чи права на політику.
   */
  const admin = (
    request: Request,
    resource: "security" | "users",
    action: "read" | "update",
    level: "read" | "change" = "read",
  ): AdminActor | Response => {
    const user = currentMockUser()
    if (!user) return unauthenticated()
    const access = mockRequestPermissions(request, user)
    if (access instanceof Response) return access
    if (!mockGrantsService(access.permissions, resource, action))
      return forbidden(`Missing ${resource}:${action}`)
    const actor = { user, ...access }
    if (level === "read") return actor
    return impersonationForbidden() ?? actor
  }

  /** Люди компанії запиту (ADR-0032). */
  const companyMembers = ({ companyId }: AdminActor) =>
    mockUsersList().filter((u) => isMockCompanyMember(u, companyId))

  /**
   * Людина компанії запиту (404), не сам адміністратор, коли так не можна (422), у межах «стелі»
   * (403), потім — повторне підтвердження, якщо потрібне: слабшого не просять пароль, щоб відмовити.
   */
  const accessTarget = (
    request: Request,
    actor: AdminActor,
    id: unknown,
    {
      self,
      confirm,
      attempted,
    }: { self: boolean; confirm: boolean; attempted: AccessAction },
  ): MockUser | Response => {
    const target = mockCompanyTarget(request, actor.user, id)
    if (target instanceof Response) return target
    const own = target.id === actor.user.id
    if (own && !self) return validation({ userId: "invalid" })
    // Дія над собою своїх прав не підвищує: «стеля» — лише для інших.
    return (
      (own ? null : withinCeiling(actor, target, attempted)) ??
      (confirm ? reauthRequired() : null) ??
      target
    )
  }
  const asTarget = (user: MockUser) => ({
    type: "users",
    id: user.id,
    name: user.name,
  })

  const readRequests = () => read<RecoveryRequest[]>(RECOVERY_KEY, [])

  return [
    http.get(`${baseUrl}/security-policy`, ({ request }) => {
      const actor = admin(request, "security", "read")
      if (actor instanceof Response) return actor
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
        canUpdate: canUpdatePolicy(actor),
      })
    }),

    http.put(`${baseUrl}/security-policy`, async ({ request }) => {
      const actor = admin(request, "security", "update", "change")
      if (actor instanceof Response) return actor
      // Одна політика на застосунок: адміністратора компанії не просять пароль, щоб відмовити.
      if (!canUpdatePolicy(actor))
        return forbidden("Only a platform administrator changes the policy")
      const reauth = reauthRequired()
      if (reauth) return reauth
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
      for (const admin of mockUsersList().filter((u) =>
        managesRecoveryOf(u, user),
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
        accountId: user.id,
        actor: { type: "user", id: user.id, name: user.name },
        ...(entry.comment ? { reason: entry.comment } : {}),
      })
      return json({ status: "queued" }, { status: 202 })
    }),

    http.get(`${baseUrl}/recovery-requests`, ({ request }) => {
      const actor = admin(request, "users", "update")
      if (actor instanceof Response) return actor
      const members = companyMembers(actor)
      return json(
        readRequests().filter((r) => members.some((u) => u.id === r.userId)),
      )
    }),

    http.delete(`${baseUrl}/recovery-requests/:id`, ({ params, request }) => {
      const actor = admin(request, "users", "update")
      if (actor instanceof Response) return actor
      // Уже розібраний запит — 204, як і раніше (ідемпотентно); запит людини іншої компанії — 404.
      // «Стелі» в компанії запиту немає: розібраний запит доступу не змінює (ADR-0034). Але запит
      // один на всі компанії людини, тож чужа компанія не прибирає його в інших (ADR-0040).
      const entry = readRequests().find((r) => r.id === params.id)
      if (!entry) return noContent()
      const target = mockCompanyTarget(request, actor.user, entry.userId)
      if (target instanceof Response) return target
      if (!mockManagesUserElsewhere(actor.user, target, actor.companyId))
        return forbidden("The request also belongs to other companies")
      write(
        RECOVERY_KEY,
        readRequests().filter((r) => r.id !== params.id),
      )
      return noContent()
    }),

    http.post(
      `${baseUrl}/users/:id/reset-factors`,
      async ({ params, request }) => {
        const actor = admin(request, "users", "update", "change")
        if (actor instanceof Response) return actor
        const attempted = {
          action: "security.factors_reset",
          category: "security",
        }
        const target = accessTarget(request, actor, params.id, {
          self: false,
          confirm: true,
          attempted,
        })
        if (target instanceof Response) return target
        const { reason } = (await request.json()) as { reason?: string }
        if (!reason?.trim()) return validation({ reason: "required" })
        resetMockFactors(target)
        recordAudit({
          ...attempted,
          accountId: target.id,
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
          detail: actor.user.name,
        })
        return noContent()
      },
    ),

    /* ------------------------- Доступ користувача ------------------------- */

    http.get(`${baseUrl}/users/:id/access`, ({ params, request }) => {
      const actor = admin(request, "users", "update")
      if (actor instanceof Response) return actor
      const target = mockCompanyTarget(request, actor.user, params.id)
      if (target instanceof Response) return target
      const blocked = mockBlocked(target)
      const language = languageOf(request)
      return json({
        userId: target.id,
        status: blocked ? "blocked" : "active",
        blocked,
        // Ролі людини в компанії запиту: за ними клієнт показує «стелю» (ADR-0034).
        roles: mockUserRolesIn(target, actor.companyId),
        // Те саме правило, що й у дій: кнопки знають відмову до запиту (ADR-0040).
        canManage:
          target.id === actor.user.id || canManageTarget(actor, target),
        ...mockAccessSummary(target),
        sessions: mockUserSessions(target, language).map((session) => ({
          ...session,
          user: { id: target.id, name: target.name, email: target.email },
        })),
      })
    }),

    http.get(`${baseUrl}/sessions`, ({ request }) => {
      const actor = admin(request, "users", "update")
      if (actor instanceof Response) return actor
      const params = new URL(request.url).searchParams
      const q = params.get("q")?.trim().toLocaleLowerCase("uk") ?? ""
      const page = Math.max(1, Number(params.get("page")) || 1)
      const perPage = Math.min(
        100,
        Math.max(1, Number(params.get("perPage")) || 20),
      )
      const language = languageOf(request)
      const sessions = companyMembers(actor)
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
      const actor = admin(request, "users", "update", "change")
      if (actor instanceof Response) return actor
      const sessionId = String(params.id)
      if (sessionId === getMockSession()?.id)
        return errorResponse(409, {
          code: "conflict",
          message: "This is your current session. Sign out instead",
        })
      // Сесія людини іншої компанії — «не знайдено», як і сама людина; сильнішої — 403: людину
      // видно в списку сесій компанії (ADR-0034).
      const owner = companyMembers(actor).find((u) =>
        hasMockUserSession(u, sessionId),
      )
      if (!owner) return notFound()
      const attempted = { action: "users.session_ended", category: "users" }
      const denied =
        owner.id === actor.user.id
          ? null
          : withinCeiling(actor, owner, attempted)
      if (denied) return denied
      endMockUserSession(owner, sessionId)
      recordAudit({
        ...attempted,
        accountId: owner.id,
        target: asTarget(owner),
      })
      return noContent()
    }),

    http.post(`${baseUrl}/users/:id/sign-out`, ({ params, request }) => {
      const actor = admin(request, "users", "update", "change")
      if (actor instanceof Response) return actor
      const attempted = { action: "users.signed_out", category: "users" }
      const target = accessTarget(request, actor, params.id, {
        self: true,
        confirm: false,
        attempted,
      })
      if (target instanceof Response) return target
      endAllMockUserSessions(target)
      recordAudit({
        ...attempted,
        accountId: target.id,
        target: asTarget(target),
      })
      return noContent()
    }),

    http.post(`${baseUrl}/users/:id/block`, async ({ params, request }) => {
      const actor = admin(request, "users", "update", "change")
      if (actor instanceof Response) return actor
      const attempted = { action: "users.blocked", category: "users" }
      const target = accessTarget(request, actor, params.id, {
        self: false,
        confirm: true,
        attempted,
      })
      if (target instanceof Response) return target
      const { reason } = (await request.json()) as { reason?: string }
      if (!reason?.trim()) return validation({ reason: "required" })
      setMockBlocked(target, { by: actor.user.name, reason: reason.trim() })
      recordAudit({
        ...attempted,
        accountId: target.id,
        target: asTarget(target),
        reason: reason.trim(),
      })
      emitMockEvent(
        "users.blocked",
        { id: target.id, name: target.name },
        { accountId: target.id },
      )
      return noContent()
    }),

    http.post(`${baseUrl}/users/:id/unblock`, ({ params, request }) => {
      const actor = admin(request, "users", "update", "change")
      if (actor instanceof Response) return actor
      const attempted = { action: "users.unblocked", category: "users" }
      const target = accessTarget(request, actor, params.id, {
        self: true,
        confirm: true,
        attempted,
      })
      if (target instanceof Response) return target
      setMockBlocked(target, null)
      recordAudit({
        ...attempted,
        accountId: target.id,
        target: asTarget(target),
      })
      emitMockEvent(
        "users.unblocked",
        { id: target.id, name: target.name },
        { accountId: target.id },
      )
      return noContent()
    }),
  ]
}
