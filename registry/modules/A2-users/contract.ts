/**
 * Контракт модуля A2 «Користувачі й ролі» (SPEC §14, §17; ADR-0002, ADR-0013, ADR-0014, ADR-0031).
 *
 * Ресурс `users` (`/api/v1/users`, плоскі параметри списку, відповідь `{ data, total }`) — люди
 * компанії запиту:
 * - Компанію визначає сервер: `X-Company-Id`, без нього — активна компанія сесії; компанія, де людина
 *   не працює, — 403 (заголовку без членства не віримо, «усіх компаній» не буває). Права —
 *   у компанії запиту.
 * - `GET /users` — список, `GET /users/:id` — запис `User` (той самий, вкладених колекцій немає).
 *   Фільтри: `q` (ім'я, email), `status`, `roles` (хоч одна з вибраних), `twoFactor` (`true`/`false`),
 *   `id` (кілька), поля розширення — `<поле>=…`; сортування: `name`, `email`, `lastSignInAt`.
 *   Право — `users:read`.
 * - Людину створює запрошення (`POST /invitations`, ADR-0014), а не `POST /users`; запис людини
 *   модуль не змінює й не видаляє: ролі — `PUT /users/:id/roles` (ADR-0014), доступ і сесії —
 *   `GET /users/:id/access`, `POST /users/:id/block|unblock|sign-out`, `DELETE /sessions/:id`
 *   (право `users:update`, ADR-0013). Після зміни ролей чи блокування `version` запису зростає.
 *   Вилучити людину лише з компанії запиту — `POST /users/:id/remove-from-company` (ADR-0041).
 *   Вилучена людина лишається лише підписом: `GET /users?id=…` віддає її записом довідника.
 * - Ролі в записі — `{ id, name }`: назва мовою `Accept-Language`, тож список показує ролі й без
 *   права `roles:read`; фільтр і `PUT /users/:id/roles` — за `id`.
 * - **Довідник для полів-записів інших модулів** (`type: "record"`, `resource: "users"`, ADR-0030;
 *   вікторина на старті A2b): кожен у компанії без `users:read` отримує з `GET /users` і
 *   `GET /users/:id` лише `UserDirectoryEntry` — `id`, `version`, `name`, `email`. Пошук `q` і
 *   сторінки довідника — лише активні люди; за `id` — будь-хто, тож підпис уже вибраного не зникає.
 *   Інші фільтри й сортування не за `name`, `email` чи `id` без `users:read` — 403: інакше `total`
 *   чи порядок видали б ролі, входи, другий крок чи блокування. Що довідник усе ж показує: людина,
 *   яку знайдено за `id`, але немає в пошуку, — деактивована; `version` зростає й зі зміною ролей
 *   чи блокуванням. Справжній бекенд обмежує `perPage` довідника й частоту запитів. Журнал аудиту
 *   пише людину на ім'я (`target.name`), як і довідник.
 * - Історія картки — журнал аудиту з `targetType=users`, `targetId=<id>` (ADR-0013).
 * - Права на рівні записів («Свої / Усі» в ролях) — крок A2c: з'являться новими необов'язковими
 *   полями ролі, контракт запису людини вони не змінюють.
 *
 * Поля розширення проекту (ADR-0020) входять у схему через `userSchemaFor`: нею моки будують
 * записи з полями розширення, а тести перевіряють відповідь; застосунок відповідей не розбирає.
 */
import { z } from "zod"

import { recordBaseSchema } from "@/lib/api"
import {
  extendSchema,
  type ExtensionField,
  type ExtensionValues,
} from "@/lib/extension-fields"

export { ROLES, USERS, USERS_RESOURCES } from "./resources"

/** Активний — входить; заблокований адміністратором — ні (ADR-0013). */
export const USER_STATUSES = ["active", "blocked"] as const
export type UserStatus = (typeof USER_STATUSES)[number]

export const userRoleRefSchema = z.object({
  id: z.string(),
  name: z.string(),
})
export type UserRoleRef = z.infer<typeof userRoleRefSchema>

/** Короткий запис довідника: його бачить кожен у компанії. */
export const userDirectoryEntrySchema = recordBaseSchema.extend({
  name: z.string(),
  email: z.string(),
})
export type UserDirectoryEntry = z.infer<typeof userDirectoryEntrySchema>

const userShape = userDirectoryEntrySchema.extend({
  /** Посада з профілю людини; порожня — не вказано. */
  position: z.string(),
  status: z.enum(USER_STATUSES),
  roles: z.array(userRoleRefSchema),
  /** Чи налаштовано другий крок входу (застосунок, SMS, ключ доступу…). */
  twoFactor: z.boolean(),
  /** Останній успішний вхід (ISO); `null` — ще не входили. */
  lastSignInAt: z.string().nullable(),
})

/** Те, що схема запису бере з розширення проекту: нові поля. */
export interface UserSchemaExtension {
  readonly fields?: readonly ExtensionField[]
}

/** Схема запису людини з полями розширення. */
export function userSchemaFor(extension?: UserSchemaExtension) {
  return extendSchema(userShape, extension?.fields)
}

export type User = z.output<typeof userShape> & ExtensionValues
