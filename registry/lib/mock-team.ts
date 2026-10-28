/**
 * Мок команди (ADR-0014): ролі й права, призначення ролей, запрошення колег.
 *
 * - Ролі компаній, призначені ролі й запрошення живуть у localStorage (`lib/mock-company-roles`,
 *   `erp-ui:mock-user-roles`, `erp-ui:mock-invitations`), як дані сервера.
 * - Ролі — компанії запиту (ADR-0033, `lib/mock-company-roles`): ролі проекту є в кожній компанії,
 *   зміна чи видалення — лише в своїй, нова роль — лише компанії, де її створили; `usersCount` і
 *   409 «роль призначена» — люди цієї компанії.
 * - Ролі людини — свої в кожній її компанії; права — об'єднання прав її ролей, якщо всі ролі описано,
 *   інакше — права з `MockUser`. Ролі, призначення ролей і запрошення беруть права в компанії запиту,
 *   де людина працює (`mockPermissionsIn`; `*` чужої не відкриває); `MockUser.permissions` — права
 *   в активній компанії (профіль і решта моків).
 * - Сценарії ресурсу `roles` (`lib/mock-scenarios`) — для `GET`, `POST`, `PATCH`, `DELETE /roles`;
 *   `conflict` — перший `PATCH` чи `DELETE` кожної ролі компанії — 409.
 * - Запрошення приймає екран `AcceptInviteScreen` через мок входу (`findMockInvitation`).
 * - Події шини (`subscribeMockEvents`): `users.roles_changed` { id, roles } і `users.joined`
 *   { id, name, email, roles, companyId } — щоб список користувачів проекту оновився.
 */
import { http, type HttpHandler } from "msw/http"

import { API_PREFIX } from "@/registry/lib/api"
import {
  hasPermission,
  localizedText,
  type LocalizedText,
} from "@/registry/lib/auth"
import { auditChanges, recordAudit } from "@/registry/lib/mock-audit"
import {
  applyMockRoles,
  companyRoleMembers,
  mockCompanyRoles,
  mockPermissionsIn,
  mockProjectRoles,
  mockRoles,
  mockUserRolesIn,
  readMockCompanyRoles,
  readMockUserRoles,
  roleConflictOnce,
  saveMockCompanyRoles,
  saveMockUserRoles,
  setMockProjectRoles,
  withAssignedRoles,
  withCompanyRole,
  withoutCompanyRole,
} from "@/registry/lib/mock-company-roles"
import { pushMockNotification } from "@/registry/lib/mock-inbox"
import { scenarioFor } from "@/registry/lib/mock-scenarios"
import {
  applyScenario,
  currentMockUser,
  emitMockEvent,
  errorResponse,
  impersonationForbidden,
  isMockCompanyMember,
  json,
  mockCompanyOrForbidden,
  mockCompanyTarget,
  mockUsersList,
  noContent,
  randomToken,
  sendMockMessage,
  unauthenticated,
  type MockUser,
} from "@/registry/lib/mock-server"
import { INVITATION_DAYS, type Invitation } from "@/registry/lib/invitations"
import {
  canChangePermissions,
  canChangeRoles,
  canGrant,
  permissionsOfRoles,
  type Role,
} from "@/registry/lib/roles"

/* ----------------------------------- Ролі ----------------------------------- */

// Стан ролей живе в `lib/mock-company-roles` (ADR-0033); старі імпорти з цього файлу працюють.
export { applyMockRoles, mockRoles }

/** Роль проекту: назва й опис мовами, права. */
export interface MockRole {
  id: string
  name: LocalizedText
  description?: LocalizedText
  /** Вбудована: лише перегляд. */
  system?: boolean
  /** Без прав — роль лише для назви (права беруться з `MockUser`). */
  permissions?: string[]
}

/** Ресурс у каталозі прав: назва, розділ, дії (за замовчуванням — CRUD). */
export interface MockPermissionResource {
  label: LocalizedText
  group?: LocalizedText
  actions?: string[]
}

/** Назви дій, які знає мок; інші — як є. */
const ACTION_LABELS: Record<string, LocalizedText> = {
  read: { uk: "Перегляд", en: "Read" },
  create: { uk: "Створення", en: "Create" },
  update: { uk: "Зміна", en: "Update" },
  delete: { uk: "Видалення", en: "Delete" },
  export: { uk: "Експорт", en: "Export" },
  approve: { uk: "Погодження", en: "Approve" },
  impersonate: { uk: "«Увійти як…»", en: "“Sign in as…”" },
}
const CRUD = ["read", "create", "update", "delete"]
/** Ресурс сценаріїв моків для `/roles` (панель розробника). */
const ROLES_RESOURCE = "roles"

const INVITES_KEY = "erp-ui:mock-invitations"

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
    // Без сховища — до перезавантаження.
  }
}

/** Ролі й права нового користувача (запрошення, реєстрація) — за ролями його компанії. */
export function permissionsForRoles(
  roleIds: readonly string[],
  companyId: string | null = null,
): string[] {
  return permissionsOfRoles(roleIds, roleGrants(companyId))
}

/* ------------------------------- Запрошення ------------------------------- */

interface StoredInvitation extends Omit<Invitation, "status"> {
  token: string
  message?: string
  invitedById: string
  companyName: string
  companies: MockUser["companies"]
  companyId: MockUser["companyId"]
}

const readInvites = () => read<StoredInvitation[]>(INVITES_KEY, [])

/** Запрошення для екрана прийняття: як `MockInvite` мока входу. */
export function findMockInvitation(token: string) {
  const invite = readInvites().find((i) => i.token === token)
  if (!invite || Date.parse(invite.expiresAt) < Date.now()) return undefined
  return {
    token: invite.token,
    email: invite.email,
    name: invite.name,
    companyName: invite.companyName,
    invitedBy: invite.invitedBy,
    user: {
      roles: invite.roles,
      permissions: permissionsForRoles(invite.roles, invite.companyId),
      companies: invite.companies,
      companyId: invite.companyId,
    },
  }
}

/** Запрошення прийнято: прибрати його, повідомити того, хто запрошував. */
export function acceptMockInvitation(token: string, user: MockUser): void {
  const invite = readInvites().find((i) => i.token === token)
  if (!invite) return
  write(
    INVITES_KEY,
    readInvites().filter((i) => i.token !== token),
  )
  emitMockEvent("users.joined", {
    id: user.id,
    name: user.name,
    email: user.email,
    roles: user.roles,
    companyId: user.companyId,
  })
  recordAudit({
    action: "users.invitation_accepted",
    category: "users",
    actor: { type: "user", id: user.id, name: user.name },
    target: { type: "users", id: user.id, name: user.name },
  })
  pushMockNotification(invite.invitedById, {
    type: "team.invitation_accepted",
    title: {
      uk: `Запрошення прийнято: ${user.name}`,
      en: `Invitation accepted: ${user.name}`,
    },
    body: { uk: user.email, en: user.email },
    severity: "success",
    actor: { name: user.name },
    link: "/settings/users",
  })
}

/* --------------------------------- Обробники --------------------------------- */

export interface TeamMockOptions {
  baseUrl?: string
  roles?: MockRole[]
  resources?: Record<string, MockPermissionResource>
  /** Адреса посилання із запрошення (як у мока входу). */
  inviteLink: (token: string) => string
  reauthRequired: () => Response | null
}

const validation = (fields: Record<string, string>) =>
  errorResponse(422, {
    code: "validation",
    message: "Validation failed",
    fieldErrors: fields,
  })

const notFound = () =>
  errorResponse(404, { code: "not_found", message: "Not found" })

/** «Стеля» (ADR-0032): не дати й не змінити права, яких немає в того, хто дає. */
const beyondCeiling = () =>
  errorResponse(403, {
    code: "forbidden",
    message: "Exceeds your own permissions",
  })

/** Хто діє, у якій компанії запиту й з якими правами в ній (ADR-0033). */
interface CompanyAccess {
  user: MockUser
  companyId: string | null
  permissions: string[]
}

/** Ролі компанії з правами для «стелі»: роль лише для назви — без прав. */
const roleGrants = (companyId: string | null) =>
  mockCompanyRoles(companyId).map((role) => ({
    id: role.id,
    permissions: role.permissions ?? [],
  }))

const languageOf = (request: Request) =>
  (request.headers.get("Accept-Language") ?? "uk").slice(0, 2)

const emailValid = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

export function createTeamHandlers({
  baseUrl = API_PREFIX,
  roles = [],
  resources = {},
  inviteLink,
  reauthRequired,
}: TeamMockOptions): HttpHandler[] {
  setMockProjectRoles(roles)
  applyMockRoles()

  const allowed = (
    resource: string,
    action: string,
    level: "read" | "change" | "sensitive" = "read",
    permissions?: readonly string[],
  ): MockUser | Response => {
    const user = currentMockUser()
    if (!user) return unauthenticated()
    if (!hasPermission(permissions ?? user.permissions, resource, action))
      return errorResponse(403, {
        code: "forbidden",
        message: `Missing ${resource}:${action}`,
      })
    if (level === "read") return user
    const denied = impersonationForbidden()
    if (denied) return denied
    return level === "sensitive" ? (reauthRequired() ?? user) : user
  }

  /** Право в компанії запиту, де людина працює: за її ролями в цій компанії (ADR-0033). */
  const allowedIn = (
    request: Request,
    resource: string,
    action: string,
    level: "read" | "change" | "sensitive" = "read",
  ): CompanyAccess | Response => {
    const user = currentMockUser()
    if (!user) return unauthenticated()
    const companyId = memberCompany(request, user)
    if (companyId instanceof Response) return companyId
    const permissions = mockPermissionsIn(user, companyId)
    const checked = allowed(resource, action, level, permissions)
    return checked instanceof Response
      ? checked
      : { user, companyId, permissions }
  }

  const catalog = (language: string) =>
    Object.entries(resources).map(([id, resource]) => ({
      id,
      label: localizedText(resource.label, language) ?? id,
      ...(resource.group
        ? { group: localizedText(resource.group, language) ?? "" }
        : {}),
      actions: (resource.actions ?? CRUD).map((action) => ({
        id: action,
        label: localizedText(ACTION_LABELS[action], language) ?? action,
      })),
    }))

  /** Права ролі — лише з каталогу: `<ресурс>:<дія>`, `<ресурс>:*` або `*`. */
  const validPermission = (permission: string) => {
    if (permission === "*") return true
    const [resource = "", action = "", ...rest] = permission.split(":")
    // `Object.hasOwn`: інакше `constructor:read` чи `__proto__:read` пройшли б як ресурс.
    const known = Object.hasOwn(resources, resource)
      ? resources[resource]
      : undefined
    return Boolean(
      known &&
      !rest.length &&
      (action === "*" || (known.actions ?? CRUD).includes(action)),
    )
  }

  const publicRole = (
    role: MockRole,
    language: string,
    companyId: string | null,
  ): Role => {
    const description = localizedText(role.description, language)
    return {
      id: role.id,
      name: localizedText(role.name, language) ?? role.id,
      ...(description ? { description } : {}),
      system: role.system ?? false,
      permissions: role.permissions ?? [],
      usersCount: companyRoleMembers(role.id, companyId).length,
    }
  }

  /** Ролі: сценарій ресурсу `roles`, право й компанія запиту (ADR-0033). */
  const rolesAccess = async (
    request: Request,
    action: "read" | "update",
  ): Promise<CompanyAccess | Response> => {
    const scenario = scenarioFor(ROLES_RESOURCE)
    // Сценарій змінився — наступний `conflict` знову починає з 409.
    if (scenario !== "conflict") changedByOther.reset()
    const early = await applyScenario(scenario)
    if (early) return early
    const level = action === "read" ? "read" : "change"
    return allowedIn(request, "roles", action, level)
  }
  /** Сценарій `conflict`: роль «щойно змінив інший адміністратор» — раз на роль компанії. */
  const changedByOther = roleConflictOnce()
  const conflictFor = (companyId: string | null, id: string) =>
    scenarioFor(ROLES_RESOURCE) === "conflict"
      ? changedByOther.check(companyId, id)
      : null

  const checkRole = (
    body: { name?: unknown; permissions?: unknown },
    language: string,
    companyId: string | null,
    exceptId?: string,
  ) => {
    const fields: Record<string, string> = {}
    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : ""
      if (!name) fields.name = "required"
      else if (
        mockCompanyRoles(companyId).some(
          (r) =>
            r.id !== exceptId &&
            (localizedText(r.name, language) ?? r.id).toLocaleLowerCase(
              "uk",
            ) === name.toLocaleLowerCase("uk"),
        )
      )
        fields.name = "taken"
    }
    if (body.permissions !== undefined) {
      const list = Array.isArray(body.permissions)
        ? (body.permissions as unknown[])
        : null
      if (
        !list ||
        list.some((p) => typeof p !== "string" || !validPermission(p))
      )
        fields.permissions = "invalid"
    }
    return fields
  }

  const invitationOf = ({
    token,
    message,
    invitedById,
    companyName,
    companies,
    companyId,
    ...rest
  }: StoredInvitation): Invitation => {
    void token
    void message
    void invitedById
    void companyName
    void companies
    void companyId
    return {
      ...rest,
      status: Date.parse(rest.expiresAt) < Date.now() ? "expired" : "pending",
    }
  }

  /**
   * Компанія запиту для ролей і запрошень — лише та, де людина сама працює: `*` пускає в будь-яку
   * компанію, але не дає керувати ролями чи запрошеннями чужої (ADR-0032, ADR-0033).
   */
  const memberCompany = (
    request: Request,
    user: MockUser,
  ): string | null | Response => {
    const companyId = mockCompanyOrForbidden(request, user)
    if (companyId instanceof Response || isMockCompanyMember(user, companyId))
      return companyId
    return errorResponse(403, {
      code: "forbidden",
      message: "Not a member of the company",
    })
  }

  /** Запрошення в компанію запиту; чуже — 404, як невідоме (ADR-0032). */
  const companyInvite = (
    request: Request,
    user: MockUser,
    id: unknown,
  ): StoredInvitation | Response => {
    const companyId = memberCompany(request, user)
    if (companyId instanceof Response) return companyId
    return (
      readInvites().find(
        (invite) => invite.id === id && invite.companyId === companyId,
      ) ?? notFound()
    )
  }

  /** Термін дії від моменту надсилання. */
  const expiry = (sentAt: string) =>
    new Date(Date.parse(sentAt) + INVITATION_DAYS * 86_400_000).toISOString()

  return [
    /* -------------------------------- Ролі -------------------------------- */

    http.get(`${baseUrl}/roles`, async ({ request }) => {
      const access = await rolesAccess(request, "read")
      if (access instanceof Response) return access
      const language = languageOf(request)
      const roles =
        scenarioFor(ROLES_RESOURCE) === "empty"
          ? []
          : mockCompanyRoles(access.companyId)
      return json({
        roles: roles.map((role) =>
          publicRole(role, language, access.companyId),
        ),
        resources: catalog(language),
      })
    }),

    http.post(`${baseUrl}/roles`, async ({ request }) => {
      const access = await rolesAccess(request, "update")
      if (access instanceof Response) return access
      const { permissions, companyId } = access
      const language = languageOf(request)
      const body = (await request.json()) as {
        name?: string
        description?: string
        permissions?: string[]
      }
      const fields = checkRole(
        { name: body.name ?? "", permissions: body.permissions ?? [] },
        language,
        companyId,
      )
      if (Object.keys(fields).length) return validation(fields)
      if (!canGrant(permissions, body.permissions ?? [])) return beyondCeiling()
      const name = (body.name ?? "").trim()
      const description = body.description?.trim()
      const role: MockRole = {
        id: `role-${randomToken().slice(0, 8)}`,
        name: { uk: name, en: name },
        ...(description
          ? { description: { uk: description, en: description } }
          : {}),
        permissions: body.permissions ?? [],
      }
      saveMockCompanyRoles(
        withCompanyRole(readMockCompanyRoles(), companyId, role),
      )
      recordAudit({
        action: "users.role_created",
        category: "users",
        target: { type: "roles", id: role.id, name },
      })
      return json(publicRole(role, language, companyId), { status: 201 })
    }),

    http.patch(`${baseUrl}/roles/:id`, async ({ params, request }) => {
      const access = await rolesAccess(request, "update")
      if (access instanceof Response) return access
      const { permissions, companyId } = access
      const language = languageOf(request)
      // Роль іншої компанії — 404, як невідома (ADR-0033).
      const current = mockCompanyRoles(companyId).find(
        (r) => r.id === params.id,
      )
      if (!current) return notFound()
      if (current.system)
        return errorResponse(403, {
          code: "forbidden",
          message: "System roles are read-only",
        })
      const body = (await request.json()) as {
        name?: string
        description?: string
        permissions?: string[]
      }
      // Сильнішу роль не змінити зовсім: перейменувати її на «Переглядач» — те саме, що дати права.
      if (!canGrant(permissions, current.permissions ?? []))
        return beyondCeiling()
      const fields = checkRole(body, language, companyId, current.id)
      if (Object.keys(fields).length) return validation(fields)
      if (
        body.permissions &&
        !canChangePermissions(
          permissions,
          current.permissions ?? [],
          body.permissions,
          catalog(language),
        )
      )
        return beyondCeiling()
      const conflict = conflictFor(companyId, current.id)
      if (conflict) return conflict
      const name = body.name?.trim()
      const description = body.description?.trim()
      const next: MockRole = {
        ...current,
        ...(name ? { name: { uk: name, en: name } } : {}),
        ...(body.description !== undefined
          ? description
            ? { description: { uk: description, en: description } }
            : { description: undefined }
          : {}),
        ...(body.permissions ? { permissions: body.permissions } : {}),
      }
      saveMockCompanyRoles(
        withCompanyRole(readMockCompanyRoles(), companyId, next),
      )
      applyMockRoles()
      recordAudit({
        action: "users.role_updated",
        category: "users",
        target: {
          type: "roles",
          id: next.id,
          name: localizedText(next.name, language) ?? next.id,
        },
        changes: auditChanges(
          {
            name: localizedText(current.name, language),
            permissions: current.permissions ?? [],
          },
          {
            name: localizedText(next.name, language),
            permissions: next.permissions ?? [],
          },
        ),
      })
      return json(publicRole(next, language, companyId))
    }),

    http.delete(`${baseUrl}/roles/:id`, async ({ params, request }) => {
      const access = await rolesAccess(request, "update")
      if (access instanceof Response) return access
      const { permissions, companyId } = access
      const current = mockCompanyRoles(companyId).find(
        (r) => r.id === params.id,
      )
      if (!current) return notFound()
      if (current.system)
        return errorResponse(403, {
          code: "forbidden",
          message: "System roles can't be deleted",
        })
      if (!canGrant(permissions, current.permissions ?? []))
        return beyondCeiling()
      const conflict = conflictFor(companyId, current.id)
      if (conflict) return conflict
      if (companyRoleMembers(current.id, companyId).length)
        return errorResponse(409, {
          code: "conflict",
          message: "The role is assigned to users",
        })
      saveMockCompanyRoles(
        withoutCompanyRole(
          readMockCompanyRoles(),
          mockProjectRoles(),
          companyId,
          current.id,
        ),
      )
      recordAudit({
        action: "users.role_deleted",
        category: "users",
        target: {
          type: "roles",
          id: current.id,
          name: localizedText(current.name, languageOf(request)) ?? current.id,
        },
      })
      return noContent()
    }),

    http.put(`${baseUrl}/users/:id/roles`, async ({ params, request }) => {
      const access = allowedIn(request, "users", "update", "sensitive")
      if (access instanceof Response) return access
      const { user, companyId, permissions } = access
      const target = mockCompanyTarget(request, user, params.id)
      if (target instanceof Response) return target
      if (target.id === user.id) return validation({ userId: "invalid" })
      const { roles: next } = (await request.json()) as { roles?: string[] }
      if (!Array.isArray(next) || !next.length)
        return validation({ roles: "required" })
      // Лише ролі компанії запиту; роль іншої компанії — як невідома (ADR-0033).
      const companyRoles = new Set(mockCompanyRoles(companyId).map((r) => r.id))
      if (next.some((id) => !companyRoles.has(id)))
        return validation({ roles: "invalid" })
      // Ролі людини — свої в кожній її компанії: змінюються лише в компанії запиту.
      const before = mockUserRolesIn(target, companyId).filter((id) =>
        companyRoles.has(id),
      )
      if (!canChangeRoles(permissions, before, next, roleGrants(companyId)))
        return beyondCeiling()
      const after = [...new Set(next)]
      saveMockUserRoles(
        withAssignedRoles(readMockUserRoles(), target, companyId, after),
      )
      applyMockRoles()
      emitMockEvent("users.roles_changed", {
        id: target.id,
        name: target.name,
        roles: after,
      })
      recordAudit({
        action: "users.roles_changed",
        category: "users",
        target: { type: "users", id: target.id, name: target.name },
        changes: [{ field: "roles", from: before, to: after }],
      })
      return noContent()
    }),

    /* ------------------------------ Запрошення ------------------------------ */

    http.get(`${baseUrl}/invitations`, ({ request }) => {
      const access = allowedIn(request, "users", "create")
      if (access instanceof Response) return access
      const { companyId } = access
      return json(
        readInvites()
          .filter((invite) => invite.companyId === companyId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map(invitationOf),
      )
    }),

    http.post(`${baseUrl}/invitations`, async ({ request }) => {
      const access = allowedIn(request, "users", "create", "change")
      if (access instanceof Response) return access
      const { user, companyId, permissions } = access
      const body = (await request.json()) as {
        email?: string
        name?: string
        roles?: string[]
        message?: string
      }
      const email = body.email?.trim().toLowerCase() ?? ""
      const fields: Record<string, string> = {}
      if (!email) fields.email = "required"
      else if (!emailValid(email)) fields.email = "invalid"
      else if (mockUsersList().some((u) => u.email.toLowerCase() === email))
        fields.email = "taken"
      else if (
        readInvites().some(
          (i) => i.email === email && Date.parse(i.expiresAt) > Date.now(),
        )
      )
        fields.email = "invited"
      const roles = body.roles ?? []
      if (!roles.length) fields.roles = "required"
      else if (
        roles.some(
          (id) => !mockCompanyRoles(companyId).some((r) => r.id === id),
        )
      )
        fields.roles = "invalid"
      if (Object.keys(fields).length) return validation(fields)
      if (!canChangeRoles(permissions, [], roles, roleGrants(companyId)))
        return beyondCeiling()
      const company = user.companies.find((c) => c.id === companyId)
      const now = new Date().toISOString()
      const invite: StoredInvitation = {
        id: `inv-${randomToken().slice(0, 10)}`,
        token: randomToken(),
        email,
        ...(body.name?.trim() ? { name: body.name.trim() } : {}),
        roles,
        ...(body.message?.trim() ? { message: body.message.trim() } : {}),
        invitedBy: user.name,
        invitedById: user.id,
        companyName: company?.name ?? "",
        companies: company ? [company] : [],
        companyId: company?.id ?? null,
        createdAt: now,
        lastSentAt: now,
        expiresAt: expiry(now),
      }
      write(INVITES_KEY, [
        invite,
        ...readInvites().filter((i) => i.email !== email),
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
        target: { type: "invitations", id: invite.id, name: email },
        details: { roles: roles.join(", ") },
      })
      return json(invitationOf(invite), { status: 201 })
    }),

    http.post(`${baseUrl}/invitations/:id/resend`, ({ params, request }) => {
      const access = allowedIn(request, "users", "create", "change")
      if (access instanceof Response) return access
      const { user } = access
      const invite = companyInvite(request, user, params.id)
      if (invite instanceof Response) return invite
      if (Date.now() - Date.parse(invite.lastSentAt) < 60_000)
        return errorResponse(429, {
          code: "rate_limited",
          message: "Wait a minute before sending again",
        })
      const sentAt = new Date().toISOString()
      const next: StoredInvitation = {
        ...invite,
        lastSentAt: sentAt,
        expiresAt: expiry(sentAt),
      }
      write(
        INVITES_KEY,
        readInvites().map((i) => (i.id === next.id ? next : i)),
      )
      sendMockMessage({
        channel: "email",
        to: next.email,
        kind: "invite",
        link: inviteLink(next.token),
      })
      return json(invitationOf(next))
    }),

    http.delete(`${baseUrl}/invitations/:id`, ({ params, request }) => {
      const access = allowedIn(request, "users", "create", "change")
      if (access instanceof Response) return access
      const { user } = access
      const invite = companyInvite(request, user, params.id)
      if (invite instanceof Response) return invite
      write(
        INVITES_KEY,
        readInvites().filter((i) => i.id !== invite.id),
      )
      recordAudit({
        action: "users.invitation_revoked",
        category: "users",
        target: { type: "invitations", id: invite.id, name: invite.email },
      })
      return noContent()
    }),
  ]
}
