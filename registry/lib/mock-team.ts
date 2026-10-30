/**
 * Мок команди (ADR-0014): ролі й права, призначення ролей, запрошення колег.
 *
 * - Ролі компаній і призначені ролі живуть у localStorage (`lib/mock-company-roles`,
 *   `erp-ui:mock-user-roles`), як дані сервера.
 * - Ролі — компанії запиту (ADR-0033, `lib/mock-company-roles`): ролі проекту є в кожній компанії,
 *   зміна чи видалення — лише в своїй, нова роль — лише компанії, де її створили; `usersCount` і
 *   409 «роль призначена» — люди цієї компанії.
 * - Ролі людини — свої в кожній її компанії; права — об'єднання прав її ролей, якщо всі ролі описано,
 *   інакше — права з `MockUser`. Ролі, призначення ролей і запрошення беруть права в компанії запиту,
 *   де людина працює (`mockPermissionsIn`; `*` чужої не відкриває); `MockUser.permissions` — права
 *   в активній компанії (профіль і решта моків).
 * - Сценарії ресурсу `roles` (`lib/mock-scenarios`) — для `GET`, `POST`, `PATCH`, `DELETE /roles`;
 *   `conflict` — перший `PATCH` чи `DELETE` кожної ролі компанії — 409.
 * - Запрошення — `lib/mock-invitations` (обробники підключає `createTeamHandlers` зі своєю
 *   перевіркою права в компанії запиту); сховище, `findMockInvitation` і `acceptMockInvitation` —
 *   `lib/mock-invitation-store`.
 * - Подія шини (`subscribeMockEvents`) `users.roles_changed` { id, roles } — щоб список
 *   користувачів проекту оновився; `users.joined` — у `lib/mock-invitation-store`.
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
  mockRoleGrants,
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
import { beyondCeiling } from "@/registry/lib/mock-account-state"
import {
  acceptMockInvitation,
  findMockInvitation,
} from "@/registry/lib/mock-invitation-store"
import {
  createInvitationHandlers,
  type MockCompanyAccess as CompanyAccess,
} from "@/registry/lib/mock-invitations"
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
  noContent,
  randomToken,
  unauthenticated,
  type MockUser,
} from "@/registry/lib/mock-server"
import {
  canChangePermissions,
  canChangeRoles,
  canGrant,
  isCatalogPermission,
  permissionsOfRoles,
  type Role,
} from "@/registry/lib/roles"

/* ----------------------------------- Ролі ----------------------------------- */

// Стан ролей живе в `lib/mock-company-roles` (ADR-0033); старі імпорти з цього файлу працюють.
export { applyMockRoles, mockRoles }
// Запрошення живуть у `lib/mock-invitation-store` і `lib/mock-invitations`; старі імпорти працюють.
export { acceptMockInvitation, findMockInvitation }

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
  /** Дії з вибором «Свої / Усі» (`<ресурс>:<дія>:own`, A2c2b1); за замовчуванням — жодної. */
  own?: string[]
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
/**
 * Ресурси кіта без «Свої / Усі» (ADR-0038): їхні дії — службові, «своїх» записів немає, тож `own` у
 * каталозі проекту для них не діє.
 */
const KIT_RESOURCES_WITHOUT_OWN = new Set([
  "users",
  "roles",
  "security",
  "audit",
  "webhooks",
  "company",
])
/** Ресурс сценаріїв моків для `/roles` (панель розробника). */
const ROLES_RESOURCE = "roles"

/** Ролі й права нового користувача (запрошення, реєстрація) — за ролями його компанії. */
export function permissionsForRoles(
  roleIds: readonly string[],
  companyId: string | null = null,
): string[] {
  return permissionsOfRoles(roleIds, mockRoleGrants(companyId))
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
        ...(resource.own?.includes(action) && !KIT_RESOURCES_WITHOUT_OWN.has(id)
          ? { own: true }
          : {}),
      })),
    }))

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
      // Права ролі — лише з каталогу: `*`, `<ресурс>:*`, дія, дія `:own` з вибором (ADR-0038).
      const known = catalog(language)
      if (
        !list ||
        list.some(
          (p) => typeof p !== "string" || !isCatalogPermission(p, known),
        )
      )
        fields.permissions = "invalid"
    }
    return fields
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
      const name = (body.name ?? "").trim()
      if (!canGrant(permissions, body.permissions ?? []))
        return beyondCeiling({
          action: "users.role_created",
          category: "users",
          companyId,
        })
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
        companyId,
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
      const attempted = {
        action: "users.role_updated",
        category: "users",
        companyId,
        target: {
          type: "roles",
          id: current.id,
          name: localizedText(current.name, language) ?? current.id,
        },
      }
      // Сильнішу роль не змінити зовсім: перейменувати її на «Переглядач» — те саме, що дати права.
      if (!canGrant(permissions, current.permissions ?? []))
        return beyondCeiling(attempted)
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
        return beyondCeiling(attempted)
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
        companyId,
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
      const target = {
        type: "roles",
        id: current.id,
        name: localizedText(current.name, languageOf(request)) ?? current.id,
      }
      if (!canGrant(permissions, current.permissions ?? []))
        return beyondCeiling({
          action: "users.role_deleted",
          category: "users",
          companyId,
          target,
        })
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
        companyId,
        target,
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
      // Ролі адміністратора платформи змінює лише інший адміністратор платформи (ADR-0036).
      const isPlatformTarget =
        target.isPlatformAdmin === true && user.isPlatformAdmin !== true
      if (
        isPlatformTarget ||
        !canChangeRoles(permissions, before, next, mockRoleGrants(companyId))
      )
        return beyondCeiling({
          action: "users.roles_changed",
          category: "users",
          companyId,
          target: { type: "users", id: target.id, name: target.name },
        })
      const after = [...new Set(next)]
      saveMockUserRoles(
        withAssignedRoles(readMockUserRoles(), target, companyId, after),
      )
      applyMockRoles()
      emitMockEvent(
        "users.roles_changed",
        { id: target.id, name: target.name, roles: after },
        { companyId },
      )
      recordAudit({
        action: "users.roles_changed",
        category: "users",
        companyId,
        target: { type: "users", id: target.id, name: target.name },
        changes: [{ field: "roles", from: before, to: after }],
      })
      return noContent()
    }),

    ...createInvitationHandlers({ baseUrl, inviteLink, allowedIn }),
  ]
}
