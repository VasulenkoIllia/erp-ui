/**
 * Мок команди (ADR-0014): ролі й права, призначення ролей, запрошення колег.
 *
 * - Ролі, призначені ролі й запрошення живуть у localStorage (`erp-ui:mock-roles`,
 *   `erp-ui:mock-user-roles`, `erp-ui:mock-invitations`), як дані сервера.
 * - Права користувача — об'єднання прав його ролей, якщо всі ролі описано; інакше лишаються права
 *   з `MockUser` (сумісність із моками без опису ролей).
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
import { pushMockNotification } from "@/registry/lib/mock-inbox"
import {
  currentMockUser,
  emitMockEvent,
  errorResponse,
  impersonationForbidden,
  json,
  mockUsersList,
  noContent,
  randomToken,
  sendMockMessage,
  unauthenticated,
  type MockUser,
} from "@/registry/lib/mock-server"
import { INVITATION_DAYS, type Invitation } from "@/registry/lib/invitations"
import type { Role } from "@/registry/lib/roles"

/* ----------------------------------- Ролі ----------------------------------- */

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

const ROLES_KEY = "erp-ui:mock-roles"
const USER_ROLES_KEY = "erp-ui:mock-user-roles"
const INVITES_KEY = "erp-ui:mock-invitations"

let seedRoles: MockRole[] = []
/** Ролі й права користувачів, як їх задав проект (до змін адміністратора). */
const original = new WeakMap<
  MockUser,
  { roles: string[]; permissions: string[] }
>()

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

export function mockRoles(): MockRole[] {
  return read<MockRole[]>(ROLES_KEY, seedRoles)
}

/** Перерахувати ролі й права користувачів після змін (ролі, призначення). */
export function applyMockRoles(): void {
  const roles = mockRoles()
  const assigned = read<Record<string, string[]>>(USER_ROLES_KEY, {})
  for (const user of mockUsersList()) {
    if (!original.has(user))
      original.set(user, {
        roles: [...user.roles],
        permissions: [...user.permissions],
      })
    const base = original.get(user)
    if (!base) continue
    user.roles = assigned[user.id] ?? base.roles
    const defined = user.roles.map((id) => roles.find((r) => r.id === id))
    user.permissions =
      defined.length > 0 && defined.every((r) => r?.permissions)
        ? [...new Set(defined.flatMap((r) => r?.permissions ?? []))]
        : base.permissions
  }
}

/** Ролі й права нового користувача (запрошення, реєстрація). */
export function permissionsForRoles(roleIds: readonly string[]): string[] {
  const roles = mockRoles()
  return [
    ...new Set(
      roleIds.flatMap(
        (id) => roles.find((r) => r.id === id)?.permissions ?? [],
      ),
    ),
  ]
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
      permissions: permissionsForRoles(invite.roles),
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
  seedRoles = roles
  applyMockRoles()

  const allowed = (
    resource: string,
    action: string,
    level: "read" | "change" | "sensitive" = "read",
  ): MockUser | Response => {
    const user = currentMockUser()
    if (!user) return unauthenticated()
    if (!hasPermission(user.permissions, resource, action))
      return errorResponse(403, {
        code: "forbidden",
        message: `Missing ${resource}:${action}`,
      })
    if (level === "read") return user
    const denied = impersonationForbidden()
    if (denied) return denied
    return level === "sensitive" ? (reauthRequired() ?? user) : user
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
    const [resource = "", action = ""] = permission.split(":")
    const known = resources[resource]
    return Boolean(
      known && (action === "*" || (known.actions ?? CRUD).includes(action)),
    )
  }

  const publicRole = (role: MockRole, language: string): Role => {
    const description = localizedText(role.description, language)
    return {
      id: role.id,
      name: localizedText(role.name, language) ?? role.id,
      ...(description ? { description } : {}),
      system: role.system ?? false,
      permissions: role.permissions ?? [],
      usersCount: mockUsersList().filter((u) => u.roles.includes(role.id))
        .length,
    }
  }

  const checkRole = (
    body: { name?: unknown; permissions?: unknown },
    language: string,
    exceptId?: string,
  ) => {
    const fields: Record<string, string> = {}
    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : ""
      if (!name) fields.name = "required"
      else if (
        mockRoles().some(
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

  /** Термін дії від моменту надсилання. */
  const expiry = (sentAt: string) =>
    new Date(Date.parse(sentAt) + INVITATION_DAYS * 86_400_000).toISOString()

  return [
    /* -------------------------------- Ролі -------------------------------- */

    http.get(`${baseUrl}/roles`, ({ request }) => {
      const user = allowed("roles", "read")
      if (user instanceof Response) return user
      const language = languageOf(request)
      return json({
        roles: mockRoles().map((role) => publicRole(role, language)),
        resources: catalog(language),
      })
    }),

    http.post(`${baseUrl}/roles`, async ({ request }) => {
      const user = allowed("roles", "update", "change")
      if (user instanceof Response) return user
      const language = languageOf(request)
      const body = (await request.json()) as {
        name?: string
        description?: string
        permissions?: string[]
      }
      const fields = checkRole(
        { name: body.name ?? "", permissions: body.permissions ?? [] },
        language,
      )
      if (Object.keys(fields).length) return validation(fields)
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
      write(ROLES_KEY, [...mockRoles(), role])
      recordAudit({
        action: "users.role_created",
        category: "users",
        target: { type: "roles", id: role.id, name },
      })
      return json(publicRole(role, language), { status: 201 })
    }),

    http.patch(`${baseUrl}/roles/:id`, async ({ params, request }) => {
      const user = allowed("roles", "update", "change")
      if (user instanceof Response) return user
      const language = languageOf(request)
      const current = mockRoles().find((r) => r.id === params.id)
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
      const fields = checkRole(body, language, current.id)
      if (Object.keys(fields).length) return validation(fields)
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
      write(
        ROLES_KEY,
        mockRoles().map((r) => (r.id === next.id ? next : r)),
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
      return json(publicRole(next, language))
    }),

    http.delete(`${baseUrl}/roles/:id`, ({ params, request }) => {
      const user = allowed("roles", "update", "change")
      if (user instanceof Response) return user
      const current = mockRoles().find((r) => r.id === params.id)
      if (!current) return notFound()
      if (current.system)
        return errorResponse(403, {
          code: "forbidden",
          message: "System roles can't be deleted",
        })
      if (mockUsersList().some((u) => u.roles.includes(current.id)))
        return errorResponse(409, {
          code: "conflict",
          message: "The role is assigned to users",
        })
      write(
        ROLES_KEY,
        mockRoles().filter((r) => r.id !== current.id),
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
      const user = allowed("users", "update", "sensitive")
      if (user instanceof Response) return user
      const target = mockUsersList().find((u) => u.id === params.id)
      if (!target) return notFound()
      if (target.id === user.id) return validation({ userId: "invalid" })
      const { roles: next } = (await request.json()) as { roles?: string[] }
      if (!Array.isArray(next) || !next.length)
        return validation({ roles: "required" })
      if (next.some((id) => !mockRoles().some((r) => r.id === id)))
        return validation({ roles: "invalid" })
      const before = [...target.roles]
      write(USER_ROLES_KEY, {
        ...read<Record<string, string[]>>(USER_ROLES_KEY, {}),
        [target.id]: [...new Set(next)],
      })
      applyMockRoles()
      emitMockEvent("users.roles_changed", {
        id: target.id,
        name: target.name,
        roles: target.roles,
      })
      recordAudit({
        action: "users.roles_changed",
        category: "users",
        target: { type: "users", id: target.id, name: target.name },
        changes: [{ field: "roles", from: before, to: target.roles }],
      })
      return noContent()
    }),

    /* ------------------------------ Запрошення ------------------------------ */

    http.get(`${baseUrl}/invitations`, () => {
      const user = allowed("users", "create")
      if (user instanceof Response) return user
      return json(
        readInvites()
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map(invitationOf),
      )
    }),

    http.post(`${baseUrl}/invitations`, async ({ request }) => {
      const user = allowed("users", "create", "change")
      if (user instanceof Response) return user
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
      else if (roles.some((id) => !mockRoles().some((r) => r.id === id)))
        fields.roles = "invalid"
      if (Object.keys(fields).length) return validation(fields)
      const now = new Date().toISOString()
      const company = user.companies.find((c) => c.id === user.companyId)
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

    http.post(`${baseUrl}/invitations/:id/resend`, ({ params }) => {
      const user = allowed("users", "create", "change")
      if (user instanceof Response) return user
      const invite = readInvites().find((i) => i.id === params.id)
      if (!invite) return notFound()
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

    http.delete(`${baseUrl}/invitations/:id`, ({ params }) => {
      const user = allowed("users", "create", "change")
      if (user instanceof Response) return user
      const invite = readInvites().find((i) => i.id === params.id)
      if (!invite) return notFound()
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
