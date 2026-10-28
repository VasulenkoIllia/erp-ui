/**
 * Мок профілю `/me` (ADR-0003, ADR-0010, ADR-0012): профіль із правами, ковзна сесія, повторне
 * підтвердження, зміна email і пароля, експорт і видалення даних (GDPR), вихід, вподобання PF11.
 * Обробники бере `createPlatformHandlers` (`lib/mock-auth`); профіль, фото й безпека акаунта —
 * `lib/mock-account`. Ролі й права в профілі — у компанії запиту (`X-Company-Id`, без нього —
 * активна компанія сесії, ADR-0034).
 */
import { http, type HttpHandler } from "msw/http"

import { meSchema, type AuthFactor, type Me } from "@/registry/lib/auth"
import {
  mockFactorTypes,
  mockProfile,
  passwordChanged,
} from "@/registry/lib/mock-account"
import { RESEND_SECONDS } from "@/registry/lib/mock-account-state"
import {
  mockRequestPermissions,
  mockUserRolesIn,
} from "@/registry/lib/mock-company-roles"
import {
  currentMockUser,
  getMockSession,
  impersonationForbidden,
  json,
  maskEmail,
  mockUsersList,
  newExpiry,
  noContent,
  randomToken,
  removeMockUser,
  sendMockMessage,
  unauthenticated,
  writeMockSession,
  type MockUser,
} from "@/registry/lib/mock-server"
import type { SignInFlow } from "@/registry/lib/mock-sign-in-flow"
import type { Preferences } from "@/registry/lib/preferences"

export interface MeMockOptions {
  baseUrl: string
  flow: Pick<
    SignInFlow,
    "findUser" | "reauthRequired" | "weakPassword" | "reused" | "validation"
  >
  /** Код, який мок «надсилає» в листах і приймає в повторному підтвердженні. */
  sentCode: string
  defaultPreferences?: Partial<Preferences>
}

const PREFS_KEY = (userId: string) => `erp-ui:mock-preferences:${userId}`

/**
 * Профіль людини з її ролями й правами в компанії запиту (ADR-0034); під «Увійти як…» — лише
 * компанія, де його почали: інших компаній людини перемикач не покаже.
 */
function toMe(
  user: MockUser,
  {
    companyId,
    permissions,
  }: { companyId: string | null; permissions: string[] },
): Me {
  const session = getMockSession()
  const admin = session?.impersonatorId
    ? mockUsersList().find((u) => u.id === session.impersonatorId)
    : undefined
  const bound = session?.impersonationCompanyId
  return meSchema.parse({
    ...user,
    ...(bound
      ? {
          companyId: bound,
          companies: user.companies.filter((company) => company.id === bound),
        }
      : {}),
    roles: mockUserRolesIn(user, companyId),
    permissions,
    ...mockProfile(user),
    factors: mockFactorTypes(user),
    sessionExpiresAt: new Date(session?.expiresAt ?? newExpiry()).toISOString(),
    ...(admin ? { impersonator: { id: admin.id, name: admin.name } } : {}),
  })
}

const token = randomToken

export function createMeHandlers({
  baseUrl,
  flow,
  sentCode,
  defaultPreferences,
}: MeMockOptions): HttpHandler[] {
  const { findUser, reauthRequired, weakPassword, reused, validation } = flow
  return [
    http.post(`${baseUrl}/auth/session/extend`, () => {
      const user = currentMockUser()
      if (!user) return unauthenticated()
      return json({
        expiresAt: new Date(
          getMockSession()?.expiresAt ?? newExpiry(),
        ).toISOString(),
      })
    }),

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
      removeMockUser(user.id)
      writeMockSession(null)
      return noContent()
    }),

    http.post(`${baseUrl}/auth/logout`, () => {
      writeMockSession(null)
      return noContent()
    }),

    http.get(`${baseUrl}/me`, ({ request }) => {
      const user = currentMockUser()
      if (!user) return unauthenticated()
      // Як сервер (ADR-0002 §5): з компанією, до якої доступу немає, — відмова навіть у профілі;
      // під «Увійти як…» — і з іншою компанією людини (ADR-0034).
      const access = mockRequestPermissions(request, user)
      if (access instanceof Response) return access
      // Ролі й права — у компанії запиту: після перемикання компанії профіль з правами нової.
      return json(toMe(user, access))
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
  ]
}
