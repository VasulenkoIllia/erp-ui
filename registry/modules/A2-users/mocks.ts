/**
 * Моки модуля A2 на MSW (ADR-0002, ADR-0003, ADR-0031): ресурс `users` — живий вигляд користувачів
 * мок-сервера входу (`lib/mock-server`): ім'я й посада з профілю, ролі з `lib/mock-team`, другий
 * крок, останній вхід і блокування з `lib/mock-account`. Ролі, доступ, сесії й запрошення — наявні
 * обробники платформи (`createPlatformHandlers`, ADR-0013, ADR-0014); модуль їх не дублює.
 *
 *   const users = createUsersMocks({ extension: usersMockExtension })
 *   setupWorker(...platform, ...users.handlers)
 *
 * - Компанія — `X-Company-Id`, без нього — компанія сесії; компанія, де людина не працює, — 403;
 *   застосунок без компаній — одна команда; права — у компанії запиту (`mockRequestPermissions`,
 *   ADR-0032, ADR-0036).
 * - Права: з `users:read` — повний запис; без нього — довідник (`id`, `version`, ім'я, email):
 *   пошук і сторінки — лише активні, за `id` — будь-хто; інші фільтри й сортування не за `name`,
 *   `email` чи `id` — 403 (контракт, `contract.ts`).
 * - Сценарії `success`, `error`, `empty`, `slow`, `forbidden`, `offline` — для ресурсу `users`
 *   (`lib/mock-scenarios`, панель розробника); `conflict` модуля A2b не стосується: запис людини
 *   модуль не змінює.
 * - `version` запису зростає з подіями шини `users.roles_changed`, `users.blocked`, `users.unblocked`:
 *   так картка перечитує «Історію» після змін. Лічильник — у пам'яті сторінки (після
 *   перезавантаження — знову 1, журнал аудиту лишається), підписка — на весь час життя моків.
 * - Поля розширення проекту (`UsersMockExtension`) — у схемі й записах (`mockValues` за порядком
 *   користувачів мок-сервера).
 */
import { http, type HttpHandler } from "msw/http"

import { API_PREFIX, fromSearchParams } from "@/lib/api"
import { localizedText } from "@/lib/auth"
import { withMockValues } from "@/lib/extension-fields"
import { mockAccessSummary, mockBlocked, mockProfile } from "@/lib/mock-account"
import { scenarioFor } from "@/lib/mock-scenarios"
import {
  applyScenario,
  currentMockUser,
  errorResponse,
  isMockCompanyMember,
  json,
  mockUsersList,
  subscribeMockEvents,
  type MockUser,
} from "@/lib/mock-server"
import {
  mockCompanyRoles,
  mockRequestPermissions,
  mockUserRolesIn,
} from "@/lib/mock-company-roles"
import { mockGrantsService } from "@/lib/mock-scope"
import {
  filterMockRecords,
  registerMockRecords,
  sortMockRecords,
} from "@/lib/mocks"

import {
  USERS,
  userSchemaFor,
  type User,
  type UserDirectoryEntry,
} from "./contract"
import type { UsersMockExtension } from "./extension"

export interface UsersMocksOptions {
  /** Поля розширення проекту — дані без компонентів. */
  readonly extension?: UsersMockExtension
  /** Початок адрес API, як у `createResourceHandlers` (за замовчуванням `/api/v1`). */
  readonly baseUrl?: string
}

export interface UsersMocks {
  readonly handlers: HttpHandler[]
}

/** Пошук `q` — за ім'ям і email, як на сервері. */
const SEARCH_FIELDS = ["name", "email"] as const
/** Фільтри й сортування довідника без `users:read`: решта розкрила б ролі, входи чи блокування. */
const DIRECTORY_FILTERS = new Set(["q", "id"])
const DIRECTORY_SORT = new Set(["name", "email", "id"])
/** Події, після яких запис людини змінюється (ролі, статус). */
const CHANGE_EVENTS = new Set([
  "users.roles_changed",
  "users.blocked",
  "users.unblocked",
])
/** Мови даних моків: решта — українською. */
const languageOf = (request: Request) =>
  (request.headers.get("Accept-Language") ?? "uk").slice(0, 2)

/** Короткий запис довідника. */
const directoryEntry = (user: User): UserDirectoryEntry => ({
  id: user.id,
  version: user.version,
  name: user.name,
  email: user.email,
})

const forbidden = (message: string) =>
  errorResponse(403, { code: "forbidden", message })

export function createUsersMocks({
  extension,
  baseUrl = API_PREFIX,
}: UsersMocksOptions = {}): UsersMocks {
  const fields = extension?.users?.fields
  const schema = userSchemaFor(extension?.users)
  const versions = new Map<string, number>()
  subscribeMockEvents((event) => {
    const { id } = event.data
    if (CHANGE_EVENTS.has(event.type) && typeof id === "string")
      versions.set(id, (versions.get(id) ?? 1) + 1)
  })

  /**
   * Запис людини мовою запиту: профіль поверх даних входу, ролі з назвами ролей компанії запиту
   * (ADR-0033), стан акаунта.
   */
  const recordOf = (
    user: MockUser,
    language: string,
    companyId: string | null,
  ) => {
    const profile = mockProfile(user)
    const roles = mockCompanyRoles(companyId)
    const summary = mockAccessSummary(user)
    return {
      id: user.id,
      version: versions.get(user.id) ?? 1,
      name: profile.name ?? user.name,
      email: user.email,
      position: profile.position ?? user.position ?? "",
      status: mockBlocked(user) ? "blocked" : "active",
      // Ролі людини в компанії запиту; схованої тут ролі не показуємо: її тут не дати й не зняти.
      roles: mockUserRolesIn(user, companyId).flatMap((id) => {
        const role = roles.find((item) => item.id === id)
        return role
          ? [{ id, name: localizedText(role.name, language) ?? id }]
          : []
      }),
      twoFactor: summary.factors.length > 0,
      lastSignInAt: summary.lastSignInAt,
    }
  }

  /**
   * Записи вибраних людей зі значеннями полів розширення (за порядком усіх користувачів, як
   * `withMockValues`): значення стають до розбору схемою, тож обов'язкове поле розширення не валить
   * відповідь. Стан акаунта читається лише для вибраних.
   */
  const recordsOf = (
    people: readonly MockUser[],
    language: string,
    companyId: string | null,
  ): User[] => {
    const all = mockUsersList()
    const samples = withMockValues(
      all.map((user) => ({ id: user.id })),
      fields,
    )
    return people.map((user) =>
      schema.parse({
        ...samples[all.indexOf(user)],
        ...recordOf(user, language, companyId),
      }),
    )
  }

  registerMockRecords(USERS, {
    find: (id) => {
      const user = mockUsersList().find((item) => item.id === id)
      return user ? recordsOf([user], "uk", user.companyId)[0] : undefined
    },
    titleField: "name",
  })

  /** Сценарій, сесія й компанія; повертає відповідь-відмову або доступ того, хто питає. */
  async function guard(
    request: Request,
  ): Promise<
    | Response
    | { canRead: boolean; companyId: string | null; members: MockUser[] }
  > {
    const early = await applyScenario(scenarioFor(USERS))
    if (early) return early
    const me = currentMockUser(request)
    if (!me)
      return errorResponse(401, {
        code: "unauthenticated",
        message: "Not signed in",
      })
    const access = mockRequestPermissions(request, me)
    if (access instanceof Response) return access
    const { companyId } = access
    return {
      // Права в компанії запиту: `users:read` в одній компанії не відкриває повних записів іншої,
      // людина поза компаніями в застосунку з компаніями — без прав (ADR-0036).
      canRead: mockGrantsService(access.permissions, USERS, "read"),
      companyId,
      members: mockUsersList().filter((user) =>
        isMockCompanyMember(user, companyId),
      ),
    }
  }

  const handlers: HttpHandler[] = [
    http.get(`${baseUrl}/${USERS}`, async ({ request }) => {
      const access = await guard(request)
      if (access instanceof Response) return access
      if (scenarioFor(USERS) === "empty") return json({ data: [], total: 0 })
      const { page, perPage, sort, filter } = fromSearchParams(
        new URL(request.url).searchParams,
      )
      if (
        !access.canRead &&
        (Object.keys(filter).some((key) => !DIRECTORY_FILTERS.has(key)) ||
          sort.some(({ field }) => !DIRECTORY_SORT.has(field)))
      )
        return forbidden("Missing permission users:read")
      const people = recordsOf(
        access.members,
        languageOf(request),
        access.companyId,
      )
      // Без `users:read` за `id` — будь-хто (підпис уже вибраного), пошук і сторінки — лише активні.
      const visible =
        access.canRead || "id" in filter
          ? people
          : people.filter((person) => person.status === "active")
      const found = sortMockRecords(
        filterMockRecords(visible.map(forFilter), filter, [...SEARCH_FIELDS]),
        sort,
      ).map(fromFilter)
      const start = (page - 1) * perPage
      const pageRows = found.slice(start, start + perPage)
      return json({
        data: access.canRead ? pageRows : pageRows.map(directoryEntry),
        total: found.length,
      })
    }),

    http.get(`${baseUrl}/${USERS}/:id`, async ({ params, request }) => {
      const access = await guard(request)
      if (access instanceof Response) return access
      const user = access.members.find((member) => member.id === params.id)
      const person =
        user && recordsOf([user], languageOf(request), access.companyId)[0]
      if (!person)
        return errorResponse(404, {
          code: "not_found",
          message: `${USERS}: not found`,
        })
      return json(access.canRead ? person : directoryEntry(person))
    }),
  ]

  return { handlers }
}

/**
 * Фільтр `roles` — за `id` ролі, а в записі ролі — `{ id, name }`: фільтр бачить список `id`, а
 * відповідь — запис як є.
 */
interface FilterRow {
  readonly id: string
  readonly version: number
  readonly record: User
  readonly [field: string]: unknown
}

const forFilter = (record: User): FilterRow => ({
  ...record,
  roles: record.roles.map((role) => role.id),
  record,
})

const fromFilter = (row: FilterRow): User => row.record
