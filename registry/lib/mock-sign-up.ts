/**
 * Мок відновлення пароля, запрошень і реєстрації (ADR-0010, ADR-0014, ADR-0032): лист зі скиданням
 * пароля, перевірка й прийняття запрошення (токен у тілі, застарілий `GET` — для сервера без
 * `POST`), реєстрація нової компанії з кодом із листа. Обробники бере `createPlatformHandlers`
 * (`lib/mock-auth`); запрошення адміністраторів — `lib/mock-invitations`, їх сховище — `lib/mock-invitation-store`.
 * Адреса з обліковим записом приймає запрошення входом, а не новим паролем (ADR-0040): `account` у
 * перевірці каже екрану, що показати, а прийняття — лише в сесії цього облікового запису.
 */
import { http, type HttpHandler } from "msw/http"

import { passwordChanged, recordSignIn } from "@/registry/lib/mock-account"
import {
  addMockUser,
  authenticate,
  currentMockUser,
  errorResponse,
  findMockUserByEmail,
  impersonationForbidden,
  isMockCompanyMember,
  json,
  mockUsersList,
  noContent,
  randomToken,
  sendMockMessage,
  unauthenticated,
  type MockUser,
} from "@/registry/lib/mock-server"
import type { SignInFlow } from "@/registry/lib/mock-sign-in-flow"
import {
  acceptMockInvitation,
  findMockInvitation,
  joinMockInvitedCompany,
  mockInviteAccount,
} from "@/registry/lib/mock-invitation-store"

export interface MockInvite {
  token: string
  email: string
  name?: string
  companyName: string
  invitedBy?: string
  /** Ролі, права й компанії нового користувача. */
  user: Pick<MockUser, "roles" | "permissions" | "companies" | "companyId">
}

export interface SignUpMockOptions {
  baseUrl: string
  flow: Pick<
    SignInFlow,
    | "tokens"
    | "findUser"
    | "startChallenge"
    | "afterFirstFactor"
    | "weakPassword"
    | "reused"
    | "validation"
  >
  /** Код, який мок «надсилає» в листах. */
  sentCode: string
  linkUrl: (kind: "login" | "reset" | "invite", token: string) => string
  invites: MockInvite[]
  /** Чи ввімкнено реєстрацію (`GET /auth/methods`). */
  signUp: boolean
}

const token = randomToken

export function createSignUpHandlers({
  baseUrl,
  flow,
  sentCode,
  linkUrl,
  invites,
  signUp,
}: SignUpMockOptions): HttpHandler[] {
  const {
    tokens,
    findUser,
    startChallenge,
    afterFirstFactor,
    weakPassword,
    reused,
    validation,
  } = flow
  const usedInvites = new Set<string>()

  /**
   * Запрошення за токеном листа й обліковий запис його адреси; невідоме, прийняте, прострочене чи
   * людина вже в цій компанії — немає.
   */
  const liveInvite = (value: unknown) => {
    if (typeof value !== "string" || !value) return null
    const invite =
      invites.find((i) => i.token === value) ?? findMockInvitation(value)
    if (!invite || usedInvites.has(invite.token)) return null
    const owner = findMockUserByEmail(invite.email)
    return owner && isMockCompanyMember(owner, invite.user.companyId)
      ? null
      : { invite, owner }
  }

  const inviteExpired = () =>
    errorResponse(410, { code: "token_expired", message: "Invite expired" })

  const inviteCheck = (value: string | null) => {
    const found = liveInvite(value)
    if (!found) return inviteExpired()
    const { invite, owner } = found
    return json({
      email: invite.email,
      name: invite.name,
      companyName: invite.companyName,
      invitedBy: invite.invitedBy,
      account: mockInviteAccount(owner),
    })
  }

  /**
   * Адреса вже має обліковий запис: приймає лише він сам, у своїй сесії. Ні гість із новим паролем,
   * ні інший обліковий запис: 409, екран перечитує перевірку й показує, що робити.
   */
  const acceptByAccount = (invite: MockInvite, owner: MockUser) => {
    if (currentMockUser()?.id !== owner.id)
      return errorResponse(409, {
        code: "conflict",
        message: "Sign in to the account of the invited address",
      })
    usedInvites.add(invite.token)
    joinMockInvitedCompany(owner, invite.user)
    acceptMockInvitation(invite.token, owner, invite.user.roles)
    return json({
      status: "authenticated",
      companyId: invite.user.companyId ?? undefined,
    })
  }

  return [
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

    // Перевірка запрошення: токен у тілі, а не в адресі (ADR-0032).
    http.post(`${baseUrl}/auth/invite/check`, async ({ request }) => {
      const { token: value } = (await request.json()) as { token?: unknown }
      return inviteCheck(typeof value === "string" ? value : null)
    }),

    // Застарілий шлях до A2b2 (токен в адресі): кіт іде сюди лише на сервер без `POST`; прибрати
    // у 2.0. Мок лишає його для тестів запасного шляху.
    http.get(`${baseUrl}/auth/invite`, ({ request }) =>
      inviteCheck(new URL(request.url).searchParams.get("token")),
    ),

    http.post(`${baseUrl}/auth/invite/accept`, async ({ request }) => {
      const body = (await request.json()) as {
        token?: string
        name?: string
        password?: string
      }
      const found = liveInvite(body.token)
      if (!found) return inviteExpired()
      const denied = impersonationForbidden()
      if (denied) return denied
      const { invite, owner } = found
      if (owner) return acceptByAccount(invite, owner)
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
      acceptMockInvitation(invite.token, user)
      authenticate(user.id)
      recordSignIn(user, { result: "success", method: "link" })
      return json({ status: "authenticated" })
    }),

    http.post(`${baseUrl}/auth/signup`, async ({ request }) => {
      if (!signUp)
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
      else if (findMockUserByEmail(body.email)) fields.email = "taken"
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
  ]
}
