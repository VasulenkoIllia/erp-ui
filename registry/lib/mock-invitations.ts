/**
 * Мок запрошень колег (ADR-0014, ADR-0032, ADR-0033, ADR-0035): список, надсилання, повтор і
 * відкликання — лише в компанії запиту, де людина сама працює.
 *
 * - Сховище, права того, хто запросив, перевірка й прийняття — `lib/mock-invitation-store`.
 * - Повтор — від імені того, хто повторив (подія журналу `users.invitation_resent`); повтор і
 *   відкликання запрошення з ролями понад свої права — 403 («стеля», ADR-0032).
 * - Сценарії ресурсу `invitations` (`lib/mock-scenarios`) — для `GET`, `POST`, повтору й
 *   відкликання; `conflict` — перший повтор чи відкликання кожного запрошення — 409.
 * - Обробники бере `createTeamHandlers` (`lib/mock-team`) зі своєю перевіркою права в компанії
 *   запиту (`allowedIn`: `*` не керує запрошеннями чужої компанії).
 */
import { http, type HttpHandler } from "msw/http"

import { INVITATION_DAYS, type Invitation } from "@/registry/lib/invitations"
import {
  beyondCeiling,
  notFound,
  validation,
} from "@/registry/lib/mock-account-state"
import { recordAudit } from "@/registry/lib/mock-audit"
import {
  mockCompanyRoles,
  mockRoleGrants,
} from "@/registry/lib/mock-company-roles"
import {
  readMockInvitations,
  writeMockInvitations,
  type StoredMockInvitation,
} from "@/registry/lib/mock-invitation-store"
import { scenarioFor } from "@/registry/lib/mock-scenarios"
import {
  applyScenario,
  errorResponse,
  json,
  mockUsersList,
  noContent,
  randomToken,
  sendMockMessage,
  type MockUser,
} from "@/registry/lib/mock-server"
import {
  canChangeRoles,
  canGrant,
  permissionsOfRoles,
} from "@/registry/lib/roles"

/** Ресурс сценаріїв моків для `/invitations` (панель розробника). */
const INVITATIONS_RESOURCE = "invitations"
/** Повтор — не частіше ніж раз на хвилину (429). */
const RESEND_INTERVAL_MS = 60_000
const DAY_MS = 86_400_000

/** Хто діє, у якій компанії запиту й з якими правами в ній (ADR-0033). */
export interface MockCompanyAccess {
  user: MockUser
  companyId: string | null
  permissions: string[]
}

export interface InvitationMockOptions {
  baseUrl: string
  /** Адреса посилання із запрошення (як у мока входу). */
  inviteLink: (token: string) => string
  /** Право в компанії запиту, де людина працює (`createTeamHandlers`, ADR-0033). */
  allowedIn: (
    request: Request,
    resource: string,
    action: string,
    level?: "read" | "change" | "sensitive",
  ) => MockCompanyAccess | Response
}

/** Спільне для обробників: адреса, лист, право з урахуванням сценарію, конфлікт сценарію. */
interface HandlerContext {
  baseUrl: string
  inviteLink: (token: string) => string
  access: (
    request: Request,
    level: "read" | "change",
  ) => Promise<MockCompanyAccess | Response>
  conflictFor: (id: string) => Response | null
}

const emailValid = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

/** Що бачить адміністратор: лише поля контракту, без токена, листа й службових полів. */
const invitationOf = (invite: StoredMockInvitation): Invitation => ({
  id: invite.id,
  email: invite.email,
  ...(invite.name ? { name: invite.name } : {}),
  roles: invite.roles,
  invitedBy: invite.invitedBy,
  createdAt: invite.createdAt,
  lastSentAt: invite.lastSentAt,
  expiresAt: invite.expiresAt,
  status: Date.parse(invite.expiresAt) < Date.now() ? "expired" : "pending",
})

/** Запрошення в компанію запиту; чуже — 404, як невідоме (ADR-0032). */
const companyInvite = (
  companyId: string | null,
  id: unknown,
): StoredMockInvitation | Response =>
  readMockInvitations().find(
    (invite) => invite.id === id && invite.companyId === companyId,
  ) ?? notFound()

/** Термін дії від моменту надсилання. */
const expiry = (sentAt: string) =>
  new Date(Date.parse(sentAt) + INVITATION_DAYS * DAY_MS).toISOString()

/** Права ролей запрошення в компанії; роль, якої там уже немає, прав не дає. */
const invitePermissions = (invite: StoredMockInvitation) =>
  permissionsOfRoles(invite.roles, mockRoleGrants(invite.companyId))

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "")

/**
 * Тіло `POST /invitations`: значення й помилки полів (422). Не рядок чи не список — як порожнє чи
 * невідоме, а не 500. «Зайнята» й «запрошена» адреса — поки в усіх компаніях (A2c).
 */
function readInvitationInput(body: unknown, companyId: string | null) {
  const raw: Record<string, unknown> =
    typeof body === "object" && body !== null ? { ...body } : {}
  const email = text(raw.email).toLowerCase()
  const roles: unknown[] = Array.isArray(raw.roles) ? raw.roles : []
  const known = new Set(mockCompanyRoles(companyId).map((role) => role.id))
  const fields: Record<string, string> = {}
  if (!email) fields.email = "required"
  else if (!emailValid(email)) fields.email = "invalid"
  else if (mockUsersList().some((u) => u.email.toLowerCase() === email))
    fields.email = "taken"
  else if (
    readMockInvitations().some(
      (i) => i.email === email && Date.parse(i.expiresAt) > Date.now(),
    )
  )
    fields.email = "invited"
  if (!roles.length) fields.roles = "required"
  else if (roles.some((id) => typeof id !== "string" || !known.has(id)))
    fields.roles = "invalid"
  return {
    fields,
    email,
    name: text(raw.name),
    roles: roles.filter((id): id is string => typeof id === "string"),
    message: text(raw.message),
  }
}

function listHandler({ baseUrl, access }: HandlerContext) {
  return http.get(`${baseUrl}/invitations`, async ({ request }) => {
    const allowed = await access(request, "read")
    if (allowed instanceof Response) return allowed
    if (scenarioFor(INVITATIONS_RESOURCE) === "empty") return json([])
    return json(
      readMockInvitations()
        .filter((invite) => invite.companyId === allowed.companyId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(invitationOf),
    )
  })
}

function createHandler({ baseUrl, inviteLink, access }: HandlerContext) {
  return http.post(`${baseUrl}/invitations`, async ({ request }) => {
    const allowed = await access(request, "change")
    if (allowed instanceof Response) return allowed
    const { user, companyId, permissions } = allowed
    // Зіпсований JSON — як порожнє тіло (422 біля полів), а не 500.
    const body: unknown = await request.json().catch(() => null)
    const input = readInvitationInput(body, companyId)
    if (Object.keys(input.fields).length) return validation(input.fields)
    const { email, roles } = input
    if (!canChangeRoles(permissions, [], roles, mockRoleGrants(companyId)))
      return beyondCeiling({
        action: "users.invited",
        category: "users",
        companyId,
        target: { type: "invitations", id: email, name: email },
      })
    const company = user.companies.find((c) => c.id === companyId)
    const now = new Date().toISOString()
    const invite: StoredMockInvitation = {
      id: `inv-${randomToken().slice(0, 10)}`,
      token: randomToken(),
      email,
      ...(input.name ? { name: input.name } : {}),
      roles,
      ...(input.message ? { message: input.message } : {}),
      invitedBy: user.name,
      invitedById: user.id,
      companyName: company?.name ?? "",
      companies: company ? [company] : [],
      companyId: company?.id ?? null,
      createdAt: now,
      lastSentAt: now,
      expiresAt: expiry(now),
    }
    // Нове замінює старе (прострочене) запрошення на ту саму адресу лише в цій компанії.
    writeMockInvitations([
      invite,
      ...readMockInvitations().filter(
        (i) => i.email !== email || i.companyId !== invite.companyId,
      ),
    ])
    sendMockMessage({
      channel: "email",
      to: email,
      kind: "invite",
      link: inviteLink(invite.token),
    })
    recordAudit({
      action: "users.invited",
      category: "users",
      companyId: invite.companyId,
      target: { type: "invitations", id: invite.id, name: email },
      details: { roles: roles.join(", ") },
    })
    return json(invitationOf(invite), { status: 201 })
  })
}

function resendHandler({
  baseUrl,
  inviteLink,
  access,
  conflictFor,
}: HandlerContext) {
  return http.post(
    `${baseUrl}/invitations/:id/resend`,
    async ({ params, request }) => {
      const allowed = await access(request, "change")
      if (allowed instanceof Response) return allowed
      const { user, companyId, permissions } = allowed
      const invite = companyInvite(companyId, params.id)
      if (invite instanceof Response) return invite
      if (!canGrant(permissions, invitePermissions(invite)))
        return beyondCeiling({
          action: "users.invitation_resent",
          category: "users",
          companyId,
          target: { type: "invitations", id: invite.id, name: invite.email },
        })
      // Ролі вже немає в компанії: прийняти таке запрошення однаково не можна.
      const known = new Set(mockCompanyRoles(companyId).map((role) => role.id))
      if (invite.roles.some((id) => !known.has(id)))
        return validation({ roles: "invalid" })
      const conflict = conflictFor(invite.id)
      if (conflict) return conflict
      if (Date.now() - Date.parse(invite.lastSentAt) < RESEND_INTERVAL_MS)
        return errorResponse(429, {
          code: "rate_limited",
          message: "Wait a minute before sending again",
        })
      const sentAt = new Date().toISOString()
      // Повтор — від імені того, хто повторив: його права перевіряться при прийнятті.
      const next: StoredMockInvitation = {
        ...invite,
        invitedBy: user.name,
        invitedById: user.id,
        lastSentAt: sentAt,
        expiresAt: expiry(sentAt),
      }
      writeMockInvitations(
        readMockInvitations().map((i) => (i.id === next.id ? next : i)),
      )
      sendMockMessage({
        channel: "email",
        to: next.email,
        kind: "invite",
        link: inviteLink(next.token),
      })
      // Автор змінився — у журналі видно, чиїми правами запрошення діє далі.
      recordAudit({
        action: "users.invitation_resent",
        category: "users",
        companyId: next.companyId,
        target: { type: "invitations", id: next.id, name: next.email },
        ...(invite.invitedById === user.id
          ? {}
          : { details: { previousInviter: invite.invitedBy } }),
      })
      return json(invitationOf(next))
    },
  )
}

function revokeHandler({ baseUrl, access, conflictFor }: HandlerContext) {
  return http.delete(
    `${baseUrl}/invitations/:id`,
    async ({ params, request }) => {
      const allowed = await access(request, "change")
      if (allowed instanceof Response) return allowed
      const invite = companyInvite(allowed.companyId, params.id)
      if (invite instanceof Response) return invite
      if (!canGrant(allowed.permissions, invitePermissions(invite)))
        return beyondCeiling({
          action: "users.invitation_revoked",
          category: "users",
          companyId: allowed.companyId,
          target: { type: "invitations", id: invite.id, name: invite.email },
        })
      const conflict = conflictFor(invite.id)
      if (conflict) return conflict
      writeMockInvitations(
        readMockInvitations().filter((i) => i.id !== invite.id),
      )
      recordAudit({
        action: "users.invitation_revoked",
        category: "users",
        companyId: invite.companyId,
        target: { type: "invitations", id: invite.id, name: invite.email },
      })
      return noContent()
    },
  )
}

export function createInvitationHandlers({
  baseUrl,
  inviteLink,
  allowedIn,
}: InvitationMockOptions): HttpHandler[] {
  /** Сценарій `conflict`: «запрошення щойно змінив інший адміністратор» — раз на запрошення. */
  const changedByOther = new Set<string>()
  const context: HandlerContext = {
    baseUrl,
    inviteLink,
    // Сценарій ресурсу `invitations`, право `users:create` і компанія запиту.
    async access(request, level) {
      const scenario = scenarioFor(INVITATIONS_RESOURCE)
      // Сценарій змінився — наступний `conflict` знову починає з 409.
      if (scenario !== "conflict") changedByOther.clear()
      const early = await applyScenario(scenario)
      if (early) return early
      return allowedIn(request, "users", "create", level)
    },
    conflictFor(id) {
      if (
        scenarioFor(INVITATIONS_RESOURCE) !== "conflict" ||
        changedByOther.has(id)
      )
        return null
      changedByOther.add(id)
      return errorResponse(409, {
        code: "conflict",
        message: "The invitation was changed by someone else",
      })
    },
  }
  return [
    listHandler(context),
    createHandler(context),
    resendHandler(context),
    revokeHandler(context),
  ]
}
