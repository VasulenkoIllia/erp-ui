/**
 * Ролі в межах компанії для моку команди (`lib/mock-team`, ADR-0033): стан у localStorage
 * (`erp-ui:mock-company-roles`, `erp-ui:mock-user-roles`) і чисті функції над ним, без MSW.
 *
 * - Ролі проекту (`roles` у `createTeamHandlers`, вбудовані й задані кодом) є в кожній компанії.
 *   Перша зміна в компанії робить копію ролі для неї; видалення ховає роль лише в ній. Інша
 *   компанія бачить роль проекту як була.
 * - Нова роль належить компанії, де її створили: інші її не бачать.
 * - Ролі людини — свої в кожній її компанії: призначення в одній компанії іншої не зачіпає.
 * - Ключ компанії — її `id`; застосунок без компаній — `""` (одна команда).
 * - До A2b2b1 зміни ролей були спільні для всіх компаній (`erp-ui:mock-roles`): той ключ більше не
 *   читаємо, демо починає з ролей проекту. Сховище читаємо обережно: зіпсований запис — як порожній.
 * - Тут же — ролі проекту й ролі та права людей за компаніями; `lib/mock-team` реекспортує
 *   `mockRoles`, `mockCompanyRoles`, `applyMockRoles`, `mockUserRolesIn`, `mockPermissionsIn`.
 * - Права того, хто діє, — у компанії запиту (ADR-0034): `mockRequestPermissions` беруть профіль
 *   (`lib/mock-me`), доступ людей (`lib/mock-admin`) і «Увійти як…» (`lib/mock-impersonation`);
 *   ролі й запрошення (`lib/mock-team`) — `mockPermissionsIn` після своєї, суворішої перевірки
 *   членства (платформа не керує ролями чужої компанії). Права людини в усіх її компаніях —
 *   `mockPermissionsAcross` («стеля» доступу, `lib/mock-admin`).
 */
import {
  currentMockUser,
  errorResponse,
  hasMockCompanies,
  isMockCompanyMember,
  mockCompanyOrForbidden,
  mockUsersList,
  type MockUser,
} from "@/registry/lib/mock-server"
import { mockCompanyIdsOf, mockGrantsService } from "@/registry/lib/mock-scope"
import type { MockRole } from "@/registry/lib/mock-team"
import { canGrant } from "@/registry/lib/roles"

/** Ролі однієї компанії поверх ролей проекту. */
export interface MockCompanyRoles {
  /** Змінені в компанії ролі проекту й нові ролі компанії. */
  readonly roles: readonly MockRole[]
  /** Ролі проекту, видалені в компанії. */
  readonly removed: readonly string[]
}

/** Стан сховища: ключ — компанія (`id`, без компаній — `""`). */
export type MockCompanyRolesState = Readonly<Record<string, MockCompanyRoles>>

/**
 * Призначені ролі людей: список — у всіх компаніях людини (так їх засівають тести), об'єкт — за
 * компаніями; компанії без запису — ролі, які задав проект.
 */
export type MockUserRolesState = Readonly<
  Record<
    string,
    readonly string[] | Readonly<Record<string, readonly string[]>>
  >
>

const COMPANY_ROLES_KEY = "erp-ui:mock-company-roles"
const USER_ROLES_KEY = "erp-ui:mock-user-roles"
const EMPTY: MockCompanyRoles = { roles: [], removed: [] }

const companyKey = (companyId: string | null): string => companyId ?? ""

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isList = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string")

const isRole = (value: unknown): value is MockRole =>
  isRecord(value) &&
  typeof value.id === "string" &&
  (value.permissions === undefined || isList(value.permissions))

function readJson(key: string): unknown {
  try {
    const raw = globalThis.localStorage?.getItem(key)
    return raw ? (JSON.parse(raw) as unknown) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value))
  } catch {
    // Без сховища — до перезавантаження не зберігаємо: як і решта моку команди.
  }
}

export function readMockCompanyRoles(): MockCompanyRolesState {
  const raw = readJson(COMPANY_ROLES_KEY)
  if (!isRecord(raw)) return {}
  return Object.fromEntries(
    Object.entries(raw).flatMap(([key, scope]) =>
      isRecord(scope)
        ? [
            [
              key,
              {
                roles: Array.isArray(scope.roles)
                  ? scope.roles.filter(isRole)
                  : [],
                removed: isList(scope.removed) ? scope.removed : [],
              },
            ],
          ]
        : [],
    ),
  )
}

export function saveMockCompanyRoles(state: MockCompanyRolesState): void {
  writeJson(COMPANY_ROLES_KEY, state)
}

const scopeOf = (state: MockCompanyRolesState, companyId: string | null) =>
  Object.hasOwn(state, companyKey(companyId))
    ? (state[companyKey(companyId)] ?? EMPTY)
    : EMPTY

/**
 * Ролі компанії: ролі проекту (копія компанії замість змінених, без видалених), потім нові ролі
 * компанії в порядку створення.
 */
export function rolesOfCompany(
  shared: readonly MockRole[],
  state: MockCompanyRolesState,
  companyId: string | null,
): MockRole[] {
  const scope = scopeOf(state, companyId)
  const own = new Map(scope.roles.map((role) => [role.id, role]))
  const removed = new Set(scope.removed)
  const sharedIds = new Set(shared.map((role) => role.id))
  return [
    ...shared
      .filter((role) => !removed.has(role.id))
      .map((role) => own.get(role.id) ?? role),
    ...scope.roles.filter((role) => !sharedIds.has(role.id)),
  ]
}

/** Чи описана роль: роль проекту чи власна роль якоїсь компанії. */
export const isKnownRole = (
  shared: readonly MockRole[],
  state: MockCompanyRolesState,
  id: string,
): boolean =>
  shared.some((role) => role.id === id) ||
  Object.values(state).some((scope) => scope.roles.some((r) => r.id === id))

/** Записати роль компанії: нову, змінену свою чи копію ролі проекту. */
export function withCompanyRole(
  state: MockCompanyRolesState,
  companyId: string | null,
  role: MockRole,
): MockCompanyRolesState {
  const scope = scopeOf(state, companyId)
  const exists = scope.roles.some((item) => item.id === role.id)
  return {
    ...state,
    [companyKey(companyId)]: {
      removed: scope.removed,
      roles: exists
        ? scope.roles.map((item) => (item.id === role.id ? role : item))
        : [...scope.roles, role],
    },
  }
}

/** Видалити роль у компанії: свою — зовсім, роль проекту — сховати лише тут. */
export function withoutCompanyRole(
  state: MockCompanyRolesState,
  shared: readonly MockRole[],
  companyId: string | null,
  id: string,
): MockCompanyRolesState {
  const scope = scopeOf(state, companyId)
  const isShared = shared.some((role) => role.id === id)
  return {
    ...state,
    [companyKey(companyId)]: {
      roles: scope.roles.filter((role) => role.id !== id),
      removed:
        isShared && !scope.removed.includes(id)
          ? [...scope.removed, id]
          : scope.removed,
    },
  }
}

export function readMockUserRoles(): MockUserRolesState {
  const raw = readJson(USER_ROLES_KEY)
  if (!isRecord(raw)) return {}
  return Object.fromEntries(
    Object.entries(raw).flatMap(
      ([userId, assigned]): [string, MockUserRolesState[string]][] => {
        if (isList(assigned)) return [[userId, assigned]]
        if (!isRecord(assigned)) return []
        const byCompany = Object.entries(assigned).filter(
          (entry): entry is [string, readonly string[]] => isList(entry[1]),
        )
        return [[userId, Object.fromEntries(byCompany)]]
      },
    ),
  )
}

export function saveMockUserRoles(state: MockUserRolesState): void {
  writeJson(USER_ROLES_KEY, state)
}

const assignedOf = (state: MockUserRolesState, userId: string) =>
  Object.hasOwn(state, userId) ? state[userId] : undefined

/** Ролі людини в компанії: призначені там; без призначення — як задав проект (`base`). */
export function assignedRoles(
  state: MockUserRolesState,
  userId: string,
  companyId: string | null,
  base: readonly string[],
): readonly string[] {
  const assigned = assignedOf(state, userId)
  if (!assigned) return base
  if (isList(assigned)) return assigned
  const key = companyKey(companyId)
  return Object.hasOwn(assigned, key) ? (assigned[key] ?? base) : base
}

/** Призначити ролі людини лише в компанії запиту; в інших її компаніях ролі лишаються як були. */
export function withAssignedRoles(
  state: MockUserRolesState,
  user: Pick<MockUser, "id" | "companies">,
  companyId: string | null,
  roles: readonly string[],
): MockUserRolesState {
  const assigned = assignedOf(state, user.id)
  // Список діяв у всіх компаніях людини: розкласти його, перш ніж змінити одну.
  const others = isList(assigned)
    ? Object.fromEntries(user.companies.map((c) => [c.id, assigned]))
    : (assigned ?? {})
  return {
    ...state,
    [user.id]: { ...others, [companyKey(companyId)]: [...roles] },
  }
}

/**
 * Права людини в компанії — об'єднання прав її ролей у цій компанії. Роль, якої тут немає
 * (схована тут чи іншої компанії), і роль лише для назви прав не дають. Права з `MockUser`
 * (`base`) — лише коли проект не описав прав жодної ролі людини (без ролей, ролі лише для назви
 * чи невідомі проекту): моки без опису ролей працюють як раніше, а роль лише для назви не
 * повертає людині початкових прав поверх зменшених.
 */
export function permissionsInCompany(
  roleIds: readonly string[],
  companyRoles: readonly MockRole[],
  isKnown: (id: string) => boolean,
  base: readonly string[],
): string[] {
  // У порядку ролей людини: так права виглядають у профілі.
  const here = roleIds.flatMap((id) =>
    companyRoles.filter((role) => role.id === id),
  )
  const described = here.filter((role) => role.permissions)
  if (described.length)
    return [...new Set(described.flatMap((role) => role.permissions ?? []))]
  const nameOnly = (id: string) =>
    !isKnown(id) || here.some((role) => role.id === id && !role.permissions)
  return roleIds.every(nameOnly) ? [...base] : []
}

/** Сценарій `conflict` (SPEC §17): «роль щойно змінив інший адміністратор». */
export interface RoleConflicts {
  /** Перша зміна чи видалення ролі компанії — 409, наступні проходять; інакше `null`. */
  check(companyId: string | null, id: string): Response | null
  /** Сценарій змінився: наступний `conflict` починає спочатку. */
  reset(): void
}

export function roleConflictOnce(): RoleConflicts {
  const answered = new Set<string>()
  return {
    check(companyId, id) {
      const key = JSON.stringify([companyKey(companyId), id])
      if (answered.has(key)) return null
      answered.add(key)
      return errorResponse(409, {
        code: "conflict",
        message: "The role was changed by someone else",
      })
    },
    reset() {
      answered.clear()
    },
  }
}

/* ------------------------- Ролі проекту, ролі й права людей ------------------------- */

/** Ролі проекту, як їх задав `createTeamHandlers({ roles })`. */
let projectRoles: readonly MockRole[] = []
/** Ролі й права користувачів, як їх задав проект (до змін адміністратора). */
const original = new WeakMap<
  MockUser,
  { roles: string[]; permissions: string[] }
>()

export function setMockProjectRoles(roles: readonly MockRole[]): void {
  projectRoles = roles
}

export const mockProjectRoles = (): readonly MockRole[] => projectRoles

/**
 * Ролі активної компанії сесії зі змінами її адміністраторів.
 * @deprecated З A2b2b1 ролі свої в кожній компанії — `mockCompanyRoles(companyId)`.
 */
export function mockRoles(): MockRole[] {
  return mockCompanyRoles(currentMockUser()?.companyId ?? null)
}

/** Ролі компанії зі змінами її адміністраторів; `null` — застосунок без компаній. */
export function mockCompanyRoles(companyId: string | null): MockRole[] {
  return rolesOfCompany(projectRoles, readMockCompanyRoles(), companyId)
}

/** Ролі компанії з правами для «стелі» (ADR-0032): роль лише для назви — без прав. */
export const mockRoleGrants = (companyId: string | null) =>
  mockCompanyRoles(companyId).map((role) => ({
    id: role.id,
    permissions: role.permissions ?? [],
  }))

/** Ролі людини в компанії: призначені там, без призначення — як задав проект (ADR-0033). */
export function mockUserRolesIn(
  user: MockUser,
  companyId: string | null,
  assigned: MockUserRolesState = readMockUserRoles(),
): string[] {
  const base = original.get(user)?.roles ?? user.roles
  return [...assignedRoles(assigned, user.id, companyId, base)]
}

/**
 * Права людини в компанії — за її ролями там: зміна ролі в іншій компанії їх не зачіпає. Людина
 * поза компаніями в застосунку з компаніями — без прав (ADR-0036).
 */
export function mockPermissionsIn(
  user: MockUser,
  companyId: string | null,
  assigned: MockUserRolesState = readMockUserRoles(),
  state: MockCompanyRolesState = readMockCompanyRoles(),
): string[] {
  if (companyId === null && hasMockCompanies()) return []
  return permissionsInCompany(
    mockUserRolesIn(user, companyId, assigned),
    rolesOfCompany(projectRoles, state, companyId),
    (id) => isKnownRole(projectRoles, state, id),
    original.get(user)?.permissions ?? user.permissions,
  )
}

/**
 * Права людини в усіх її компаніях разом (ADR-0034): обліковий запис і сесії в неї одні на всі
 * компанії, тож блокування, вихід чи скидання другого кроку діють у кожній.
 */
export function mockPermissionsAcross(user: MockUser): string[] {
  const assigned = readMockUserRoles()
  const state = readMockCompanyRoles()
  return [
    ...new Set(
      mockCompanyIdsOf(user).flatMap((id) =>
        mockPermissionsIn(user, id, assigned, state),
      ),
    ),
  ]
}

/** Право керувати людьми цієї компанії в ній самій, а не в активній компанії адміністратора. */
export const mockManagesCompany = (
  admin: MockUser,
  companyId: string | null,
): boolean =>
  isMockCompanyMember(admin, companyId) &&
  mockGrantsService(mockPermissionsIn(admin, companyId), "users", "update")

/** Керує людиною в цій компанії: має там `users:update` і всі її права там; рівного — можна. */
export const mockManagesUserIn = (
  admin: MockUser,
  target: MockUser,
  companyId: string | null,
): boolean =>
  mockManagesCompany(admin, companyId) &&
  canGrant(
    mockPermissionsIn(admin, companyId),
    mockPermissionsIn(target, companyId),
  )

/**
 * Запис людини один на всі її компанії: чи керує нею адміністратор і в решті, крім `companyId`
 * (ADR-0040). Інакше компанія, куди людину запросили, діяла б і в інших. Адміністратор платформи —
 * поза цим правилом.
 */
export const mockManagesUserElsewhere = (
  admin: MockUser,
  target: MockUser,
  companyId: string | null,
): boolean =>
  admin.isPlatformAdmin === true ||
  mockCompanyIdsOf(target).every(
    (id) => id === companyId || mockManagesUserIn(admin, target, id),
  )

/** Ролі людини в усіх її компаніях разом: для політики безпеки облікового запису (A2c1). */
export function mockRolesAcross(user: MockUser): string[] {
  const assigned = readMockUserRoles()
  return [
    ...new Set(
      mockCompanyIdsOf(user).flatMap((id) =>
        mockUserRolesIn(user, id, assigned),
      ),
    ),
  ]
}

/**
 * Права того, хто діє, у компанії запиту (`X-Company-Id`, без нього — активна компанія сесії) — за
 * його ролями там (ADR-0034); компанія без членства — 403. Адміністратор платформи в компанії, де
 * не працює, і поза компаніями — з усіма правами; людина поза компаніями в застосунку з компаніями —
 * без прав: спільне вона лише бачить (ADR-0036).
 */
export function mockRequestPermissions(
  request: Request,
  user: MockUser,
): { companyId: string | null; permissions: string[] } | Response {
  const companyId = mockCompanyOrForbidden(request, user)
  if (companyId instanceof Response) return companyId
  return { companyId, permissions: requestPermissionsIn(user, companyId) }
}

function requestPermissionsIn(
  user: MockUser,
  companyId: string | null,
): string[] {
  const isMember = companyId !== null && isMockCompanyMember(user, companyId)
  if (user.isPlatformAdmin === true && !isMember) return ["*"]
  // Компанію без членства сюди й так пропускає лише позначка платформи: решті — без прав.
  return isMember || companyId === null
    ? mockPermissionsIn(user, companyId)
    : []
}

/** Перерахувати ролі й права користувачів (в активній компанії) після змін ролей і призначень. */
export function applyMockRoles(): void {
  // Сховище — один раз на перерахунок, а не на кожну людину.
  const assigned = readMockUserRoles()
  const state = readMockCompanyRoles()
  for (const user of mockUsersList()) {
    if (!original.has(user))
      original.set(user, {
        roles: [...user.roles],
        permissions: [...user.permissions],
      })
    user.roles = mockUserRolesIn(user, user.companyId, assigned)
    user.permissions = mockPermissionsIn(user, user.companyId, assigned, state)
  }
}

/** Люди компанії з роллю: `usersCount` і 409 «роль призначена» — без інших компаній. */
export function companyRoleMembers(roleId: string, companyId: string | null) {
  const assigned = readMockUserRoles()
  return mockUsersList().filter(
    (user) =>
      isMockCompanyMember(user, companyId) &&
      mockUserRolesIn(user, companyId, assigned).includes(roleId),
  )
}
