/**
 * Чиї дані й події в моках (ADR-0036): компанія запиту бачить свої й спільні (без компанії) записи,
 * події своєї компанії, облікових записів своїх людей і застосунку; підписки й токени — лише свої;
 * спільне в застосунку з компаніями змінює лише адміністратор платформи. У застосунку без компаній
 * усе спільне, як до ADR-0036. Позначка заборон на записі для того, хто питає (ADR-0037), «свої»
 * записи (`<ресурс>:<дія>:own`, ADR-0038) і правила запису проекту. Без MSW.
 */
import {
  hasMockCompanies,
  isMockCompanyMember,
  mockUsersList,
  type MockScope,
  type MockUser,
} from "@/registry/lib/mock-server"
import {
  kitAction,
  RECORD_DENIAL_REASONS,
  recordDenial,
  type RecordDeniedActions,
} from "@/registry/lib/record-access"
import { permissionScope } from "@/registry/lib/roles"

/**
 * Застосунок без компаній (за початковими людьми): дані й події видно всі, і людині, що
 * зареєструвалась із власною компанією, теж — режим одна команда (ADR-0036).
 */
const isNoCompanyApp = () => !hasMockCompanies()

/** Компанії людини; `[null]` — застосунок без компаній. */
export const mockCompanyIdsOf = (user: MockUser): (string | null)[] =>
  user.companies.length ? user.companies.map((company) => company.id) : [null]

/** Без полів області (`MockScope`): вони — справа сервера, у відповідь не йдуть. */
export function withoutMockScope<T extends MockScope>({
  companyId,
  accountId,
  ...rest
}: T) {
  void companyId
  void accountId
  return rest
}

/**
 * Чи видно подію в компанії запиту: подію компанії — лише в ній, облікового запису — у кожній
 * компанії, де людина працює зараз, застосунку (без `companyId`) — усюди. `companyId: null` — подія
 * поза компаніями (підписка застосунку, дія платформи без компанії): її в застосунку з компаніями
 * видно лише без компанії (ADR-0036).
 */
export function inMockScope(scope: MockScope, companyId: string | null) {
  if (isNoCompanyApp()) return true
  if (scope.companyId !== undefined) return scope.companyId === companyId
  if (!scope.accountId) return true
  const person = mockUsersList().find((user) => user.id === scope.accountId)
  return person ? isMockCompanyMember(person, companyId) : false
}

/**
 * Дані компанії запиту чи спільні (без компанії): спільні видно в кожній компанії (ADR-0036).
 * `null` — без компанії: лише спільне; у застосунку без компаній — усе.
 */
export const inMockCompany = (
  ownerId: string | null | undefined,
  companyId: string | null,
) => isNoCompanyApp() || ownerId == null || ownerId === companyId

/**
 * Спільне (без компанії) у застосунку з компаніями змінює лише адміністратор платформи — і з
 * компанією запиту, і без неї (ADR-0036).
 */
export const isMockSharedLocked = (
  actor: MockUser,
  ownerId: string | null | undefined,
) => ownerId == null && actor.isPlatformAdmin !== true && !isNoCompanyApp()

/** Запис ресурсу моків для правил доступу: поле відповідального задає ресурс. */
export interface MockScopedRecord {
  readonly companyId?: string | null
}

/**
 * Свої заборони проекту на записі (закритий період, проведений документ): та сама позначка, що й у
 * кіта (ADR-0037); дія з кодом — 403 на запит і `forbidden` у масовій дії.
 */
export type MockDeniedRule<T> = (
  actor: MockUser,
  record: T,
) => RecordDeniedActions | undefined

/** Правила запису ресурсу: опції `createResourceHandlers`. */
export interface MockRecordRules<T> {
  /** Поле відповідального: без нього «своїх» записів у ресурсі немає. */
  readonly responsibleField?: string
  /** Свої заборони проекту: `createResourceHandlers` дає їм запис, як у картці. */
  readonly deniedActions?: MockDeniedRule<T>
}

/** Хто питає про записи ресурсу: його права в компанії запиту й правила ресурсу. */
export interface MockRecordAccess<T> extends MockRecordRules<T> {
  readonly actor: MockUser
  readonly permissions: readonly string[]
  readonly resource: string
}

/** Дії, які моки мітять на записі: масова дія проекту перевіряється на кожному запису окремо. */
const MARKED_ACTIONS = ["update", "delete"] as const

const scopeOf = <T>(access: MockRecordAccess<T>, action: string) =>
  permissionScope(access.permissions, access.resource, kitAction(action))

const isOwnRecord = <T extends MockScopedRecord>(
  access: MockRecordAccess<T>,
  record: T,
) =>
  access.responsibleField !== undefined &&
  (record as Record<string, unknown>)[access.responsibleField] ===
    access.actor.id

/**
 * Чи дає роль дію над записами ресурсу: усі записи чи свої, коли ресурс знає відповідального; без
 * нього `:own` — відмова, а не доступ до всіх записів (ADR-0038).
 */
export function mockGrantsRecords<T>(
  access: MockRecordAccess<T>,
  action: string,
) {
  const scope = scopeOf(access, action)
  return (
    scope === "all" ||
    (scope === "own" && access.responsibleField !== undefined)
  )
}

/**
 * Чи видно запис: на `read:own` — лише свої, без права перегляду — жодного. Прихованого запису сервер
 * не показує й не підтверджує (404), зокрема в `current` конфлікту й у назвах масової дії.
 */
export function mockSeesRecord<T extends MockScopedRecord>(
  access: MockRecordAccess<T>,
  record: T,
) {
  const scope = scopeOf(access, "read")
  return scope === "all" || (scope === "own" && isOwnRecord(access, record))
}

/** Код правила кіта для дії: спільний запис — будь-яка дія, чужий — дія лише над своїми. */
function kitDenial<T extends MockScopedRecord>(
  access: MockRecordAccess<T>,
  record: T,
  action: string,
) {
  if (isMockSharedLocked(access.actor, record.companyId))
    return RECORD_DENIAL_REASONS.shared
  return scopeOf(access, action) === "own" && !isOwnRecord(access, record)
    ? RECORD_DENIAL_REASONS.own
    : undefined
}

/**
 * Чому дію над записом не можна (сервер перевіряє кожен запит, а позначка лише підказує
 * інтерфейсу): код кіта, потім правило проекту; `undefined` — можна.
 */
export function mockDeniedAction<T extends MockScopedRecord>(
  access: MockRecordAccess<T>,
  record: T,
  action: string,
): string | undefined {
  return (
    kitDenial(access, record, action) ??
    recordDenial(
      { deniedActions: access.deniedActions?.(access.actor, record) },
      action,
    )
  )
}

/**
 * Позначка сервера на записі (`deniedActions`, ADR-0037): `update` і `delete` з кодом кіта (`shared`,
 * `own`) поверх правила проекту; `undefined` — запис нічого не забороняє.
 */
export function mockDeniedActions<T extends MockScopedRecord>(
  access: MockRecordAccess<T>,
  record: T,
): RecordDeniedActions | undefined {
  const denied: Record<string, string> = {
    ...access.deniedActions?.(access.actor, record),
  }
  for (const action of MARKED_ACTIONS) {
    const code = kitDenial(access, record, action)
    if (code) denied[action] = code
  }
  return Object.keys(denied).length ? denied : undefined
}

/**
 * Запис для відповіді тому, хто питає: позначку заборон обчислює сервер щоразу, а збереженої (з
 * засіву, зі схеми без суворих полів) не віддає. `row` — що йде у відповідь, якщо це не весь запис:
 * рядок списку без вкладених колекцій.
 */
export function withMockDeniedActions<
  T extends MockScopedRecord,
  R extends object = T,
>(access: MockRecordAccess<T>, record: T, row?: R): R {
  const reply = { ...(row ?? record) } as Record<string, unknown>
  delete reply.deniedActions
  const denied = mockDeniedActions(access, record)
  return (denied ? { ...reply, deniedActions: denied } : reply) as R
}

/**
 * Службове право (`users`, `roles`, `audit`, `webhooks`…): «своїх» записів там немає (ADR-0038), тож
 * рядок `:own` із початкової ролі чи localStorage нічого не дає.
 */
export const mockGrantsService = (
  permissions: readonly string[],
  resource: string,
  action: string,
) => permissionScope(permissions, resource, kitAction(action)) === "all"

/**
 * Лише своєї компанії: підписки й токени (ADR-0036). Без компанії — підписка застосунку: її в
 * застосунку з компаніями бачить і змінює лише адміністратор платформи.
 */
export const ownedByMockCompany = (
  actor: MockUser,
  ownerId: string | null | undefined,
  companyId: string | null,
) =>
  isNoCompanyApp() ||
  (ownerId == null ? actor.isPlatformAdmin === true : ownerId === companyId)
