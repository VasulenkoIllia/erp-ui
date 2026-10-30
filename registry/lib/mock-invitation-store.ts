/**
 * Запрошення колег у моках (ADR-0014, ADR-0035): сховище, права того, хто запросив, і прийняття.
 *
 * - Запрошення живуть у localStorage (`erp-ui:mock-invitations`), як дані сервера; обробники
 *   адміністратора — `lib/mock-invitations`, перевірка й прийняття — мок входу (`lib/mock-sign-up`).
 * - Перевірка й прийняття — лише поки той, хто запросив (після повтору — той, хто повторив), досі
 *   може дати ролі запрошення (`inviterCanGrant`); інакше запрошення як прострочене (410).
 * - Адреса з обліковим записом приймає запрошення входом (ADR-0040): `mockInviteAccount` каже
 *   екрану, що показати, `joinMockInvitedCompany` додає людину до компанії, роль — лише в ній.
 * - Подія шини `users.joined` { id, name, email, roles, companyId } оновлює список користувачів
 *   проекту.
 */
import type { Invitation } from "@/registry/lib/invitations"
import type { InviteAccount } from "@/registry/lib/invite-check"
import { mockBlocked } from "@/registry/lib/mock-account"
import { recordAudit } from "@/registry/lib/mock-audit"
import {
  applyMockRoles,
  mockPermissionsIn,
  mockRoleGrants,
  readMockUserRoles,
  saveMockUserRoles,
  withAssignedRoles,
} from "@/registry/lib/mock-company-roles"
import { pushMockNotification } from "@/registry/lib/mock-inbox"
import {
  currentMockUser,
  emitMockEvent,
  getMockSession,
  isMockCompanyMember,
  joinMockCompany,
  mockUsersList,
  type MockUser,
} from "@/registry/lib/mock-server"
import type { MockInvite } from "@/registry/lib/mock-sign-up"
import { mockGrantsService } from "@/registry/lib/mock-scope"
import { canChangeRoles, permissionsOfRoles } from "@/registry/lib/roles"

const INVITES_KEY = "erp-ui:mock-invitations"

/** Запрошення в сховищі моку: те, що бачить адміністратор, і службове (токен, автор, компанія). */
export interface StoredMockInvitation extends Omit<Invitation, "status"> {
  token: string
  message?: string
  invitedById: string
  companyName: string
  companies: MockUser["companies"]
  companyId: MockUser["companyId"]
}

export function readMockInvitations(): StoredMockInvitation[] {
  try {
    const raw = globalThis.localStorage?.getItem(INVITES_KEY)
    const value: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(value) ? (value as StoredMockInvitation[]) : []
  } catch {
    return []
  }
}

export function writeMockInvitations(
  value: readonly StoredMockInvitation[],
): void {
  try {
    globalThis.localStorage?.setItem(INVITES_KEY, JSON.stringify(value))
  } catch {
    // Без сховища — до перезавантаження.
  }
}

/**
 * Чи може той, хто запросив (після повтору — той, хто повторив), досі дати ролі запрошення:
 * обліковий запис є й не заблокований, працює в компанії запрошення, має там `users:create`, кожна
 * роль є в компанії й дає лише права в межах його прав там зараз («стеля», ADR-0032).
 */
function inviterCanGrant(invite: StoredMockInvitation): boolean {
  const inviter = mockUsersList().find((user) => user.id === invite.invitedById)
  if (
    !inviter ||
    mockBlocked(inviter) ||
    !isMockCompanyMember(inviter, invite.companyId)
  )
    return false
  const permissions = mockPermissionsIn(inviter, invite.companyId)
  return (
    mockGrantsService(permissions, "users", "create") &&
    canChangeRoles(
      permissions,
      [],
      invite.roles,
      mockRoleGrants(invite.companyId),
    )
  )
}

/** Для екрана прийняття; прострочене чи вже не в правах автора — немає (410 без причини). */
export function findMockInvitation(token: string): MockInvite | undefined {
  const invite = readMockInvitations().find((i) => i.token === token)
  if (
    !invite ||
    Date.parse(invite.expiresAt) < Date.now() ||
    !inviterCanGrant(invite)
  )
    return undefined
  return {
    token: invite.token,
    email: invite.email,
    ...(invite.name ? { name: invite.name } : {}),
    companyName: invite.companyName,
    invitedBy: invite.invitedBy,
    user: {
      roles: invite.roles,
      permissions: permissionsOfRoles(
        invite.roles,
        mockRoleGrants(invite.companyId),
      ),
      companies: invite.companies,
      companyId: invite.companyId,
    },
  }
}

/**
 * Що показати тому, хто відкрив посилання (ADR-0040): `owner` — обліковий запис адреси запрошення.
 * Під «Увійти як…» — `other`: приймати за людину не можна, як і змінювати щось від її імені.
 */
export function mockInviteAccount(owner: MockUser | undefined): InviteAccount {
  const session = currentMockUser()
  if (!session) return owner ? "existing" : "new"
  return session.id === owner?.id && !getMockSession()?.impersonatorId
    ? "current"
    : "other"
}

/** Людина з обліковим записом у компанії запрошення: ролі лише там, інші компанії як були. */
export function joinMockInvitedCompany(
  user: MockUser,
  invited: MockInvite["user"],
): void {
  for (const company of invited.companies) joinMockCompany(user, company)
  saveMockUserRoles(
    withAssignedRoles(
      readMockUserRoles(),
      user,
      invited.companyId,
      invited.roles,
    ),
  )
  applyMockRoles()
}

/**
 * Запрошення прийнято: прибрати його, повідомити того, хто запрошував. `roles` — ролі запрошення:
 * у людини з обліковим записом `user.roles` — ролі активної компанії, а не цієї.
 */
export function acceptMockInvitation(
  token: string,
  user: MockUser,
  roles: readonly string[] = user.roles,
): void {
  const invite = readMockInvitations().find((i) => i.token === token)
  if (!invite) return
  writeMockInvitations(readMockInvitations().filter((i) => i.token !== token))
  emitMockEvent(
    "users.joined",
    {
      id: user.id,
      name: user.name,
      email: user.email,
      roles: [...roles],
      companyId: invite.companyId,
    },
    { companyId: invite.companyId },
  )
  recordAudit({
    action: "users.invitation_accepted",
    category: "users",
    companyId: invite.companyId,
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
