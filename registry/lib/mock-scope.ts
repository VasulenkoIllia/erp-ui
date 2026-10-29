/**
 * Чиї дані й події в моках (ADR-0036): компанія запиту бачить свої й спільні (без компанії) записи,
 * події своєї компанії, облікових записів своїх людей і застосунку; підписки й токени — лише свої;
 * спільне в застосунку з компаніями змінює лише адміністратор платформи. У застосунку без компаній
 * усе спільне, як до ADR-0036. Позначка заборон на записі для того, хто питає (ADR-0037). Без MSW.
 */
import {
  hasMockCompanies,
  isMockCompanyMember,
  mockUsersList,
  type MockScope,
  type MockUser,
} from "@/registry/lib/mock-server"
import {
  RECORD_DENIAL_REASONS,
  type RecordDeniedActions,
} from "@/registry/lib/record-access"

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

/**
 * Позначка сервера на записі (`deniedActions`, ADR-0037): спільний запис у застосунку з компаніями
 * змінює й видаляє лише адміністратор платформи, решті `update` і `delete` заборонені з причиною
 * `shared`; `undefined` — запис нічого не забороняє.
 */
export function mockDeniedActions(
  actor: MockUser,
  ownerId: string | null | undefined,
): RecordDeniedActions | undefined {
  if (!isMockSharedLocked(actor, ownerId)) return undefined
  const { shared } = RECORD_DENIAL_REASONS
  return { update: shared, delete: shared }
}

/**
 * Запис для відповіді тому, хто питає: позначку заборон обчислює сервер щоразу, а збереженої (з
 * засіву, зі схеми без суворих полів) не віддає.
 */
export function withMockDeniedActions<
  T extends { companyId?: string | null; deniedActions?: unknown },
>(actor: MockUser, record: T): T {
  const row = { ...record }
  delete row.deniedActions
  const denied = mockDeniedActions(actor, record.companyId)
  return denied ? { ...row, deniedActions: denied } : row
}

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
