/**
 * Чиї дані й події в моках (ADR-0036): компанія запиту бачить свої й спільні (без компанії) записи,
 * події своєї компанії, облікових записів своїх людей і застосунку; підписки й токени — лише свої;
 * спільне в застосунку з компаніями змінює лише адміністратор платформи. У застосунку без компаній
 * усе спільне, як до ADR-0036. Без MSW.
 */
import {
  hasMockCompanies,
  isMockCompanyMember,
  mockUsersList,
  type MockScope,
  type MockUser,
} from "@/registry/lib/mock-server"

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
