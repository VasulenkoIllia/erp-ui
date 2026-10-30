/**
 * Мок вилучення людини з компанії запиту (ADR-0041): `POST /users/:id/remove-from-company`.
 *
 * - Дія над членством, а не над обліковим записом: інші компанії людини, пароль, другий крок і сесії
 *   не змінюються. Тому «стеля» лише в цій компанії (`mockManagesUserIn`), а не в усіх, як у дій над
 *   доступом (ADR-0040, п. 9). Ролями й запрошеннями керують лише в компанії, де людина працює, тож
 *   адміністратор платформи в чужій компанії вилучати теж не може.
 * - Порядок перевірок — як у дій, що дають права: право, ціль, 422, «стеля», 409, потім
 *   `reauth_required`.
 * - Остання компанія людини — та сама дія (вікторина на старті A2c3b): запис лишається без компаній,
 *   без прав і ролей (ADR-0036). Відповідь однакова, чи є в людини інші компанії, чи ні.
 * - Подія — лише в журналі компанії: після вилучення людина там більше не працює, тож подія
 *   облікового запису (`accountId`) зникла б із журналу цієї компанії.
 * - Сценарії ресурсу `users` (`lib/mock-scenarios`); `conflict` — перше вилучення кожної людини — 409.
 */
import { http, type HttpHandler } from "msw/http"

import { revokeMockCompanyTokens } from "@/registry/lib/mock-account"
import {
  beyondCeiling,
  notFound,
  validation,
} from "@/registry/lib/mock-account-state"
import { recordAudit } from "@/registry/lib/mock-audit"
import {
  applyMockRoles,
  mockManagesUserIn,
  readMockUserRoles,
  saveMockUserRoles,
  withoutAssignedRoles,
} from "@/registry/lib/mock-company-roles"
import { scenarioFor, subscribeScenarios } from "@/registry/lib/mock-scenarios"
import {
  applyScenario,
  errorResponse,
  leaveMockCompany,
  mockCompanyTarget,
  noContent,
  type MockUser,
} from "@/registry/lib/mock-server"

const USERS_RESOURCE = "users"
const ATTEMPTED = { action: "users.removed_from_company", category: "users" }

/** Хто діє і в якій компанії запиту. */
interface MembershipActor {
  user: MockUser
  companyId: string | null
}

export interface MembershipMockOptions {
  baseUrl: string
  /** Адміністратор із `users:update` у компанії запиту, не під час «Увійти як…» (`lib/mock-admin`). */
  actor: (request: Request) => MembershipActor | Response
  reauthRequired: () => Response | null
}

/**
 * Чи може той, хто діє, вилучити людину з компанії запиту: керує нею саме тут, це не він сам і не
 * адміністратор платформи. Інші компанії людини не враховуються: дія їх не чіпає.
 */
export const canRemoveMember = (
  { user, companyId }: MembershipActor,
  target: MockUser,
): boolean =>
  companyId !== null &&
  target.id !== user.id &&
  target.isPlatformAdmin !== true &&
  mockManagesUserIn(user, target, companyId)

/** Людина більше не в компанії: ролі й токени там зникають, решта її компаній як були. */
function removeMockMember(target: MockUser, companyId: string): void {
  leaveMockCompany(target, companyId)
  saveMockUserRoles(
    withoutAssignedRoles(readMockUserRoles(), target, companyId),
  )
  revokeMockCompanyTokens(target, companyId)
  applyMockRoles()
}

export function createMembershipHandlers({
  baseUrl,
  actor: actorOf,
  reauthRequired,
}: MembershipMockOptions): HttpHandler[] {
  /** Сценарій `conflict`: «людину щойно змінив інший адміністратор» — раз на людину. */
  const changedByOther = new Set<string>()
  subscribeScenarios(() => {
    changedByOther.clear()
  })
  const conflictFor = (id: string) => {
    if (scenarioFor(USERS_RESOURCE) !== "conflict" || changedByOther.has(id))
      return null
    changedByOther.add(id)
    return errorResponse(409, {
      code: "conflict",
      message: "The user was changed by someone else",
    })
  }

  return [
    http.post(
      `${baseUrl}/users/:id/remove-from-company`,
      async ({ params, request }) => {
        const early = await applyScenario(scenarioFor(USERS_RESOURCE))
        if (early) return early
        const actor = actorOf(request)
        if (actor instanceof Response) return actor
        const { companyId } = actor
        // Застосунок без компаній: вилучати нема звідки.
        if (companyId === null) return notFound()
        const target = mockCompanyTarget(request, actor.user, params.id)
        if (target instanceof Response) return target
        if (target.id === actor.user.id)
          return validation({ userId: "invalid" })
        const asTarget = { type: "users", id: target.id, name: target.name }
        if (!canRemoveMember(actor, target))
          return beyondCeiling({ ...ATTEMPTED, companyId, target: asTarget })
        const answer = conflictFor(target.id) ?? reauthRequired()
        if (answer) return answer
        removeMockMember(target, companyId)
        recordAudit({ ...ATTEMPTED, companyId, target: asTarget })
        return noContent()
      },
    ),
  ]
}
