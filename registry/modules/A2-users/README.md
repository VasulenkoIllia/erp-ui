# A2 «Користувачі й ролі»

Модуль erp-ui (SPEC §14, §17; ADR-0013, ADR-0014, ADR-0020, ADR-0025, ADR-0031): люди компанії з ролями, доступом, сесіями й історією змін. Список — шаблон List Report, картка — Object Page з вкладками. Екрани складено з частин кіта (`erp/user-access-*`, `erp/user-roles-section`, `erp/user-sessions`, `erp/audit-log`, `erp/impersonation`): модуль дає сторінки, контракт `users`, моки й тип розширення.

- **Користувачі** — список з вкладками «Усі», «Активні», «Заблоковані» з лічильниками, фільтрами «Роль» (з каталогу ролей, право `roles:read`) і «Другий крок», пошуком за ім'ям чи email і запам'ятаним розміром сторінки; колонки — ім'я (посилання на картку), статус, email, ролі, посада, другий крок, останній вхід. На телефоні — картки.
- **Картка людини** — шапка (ім'я, статус, «Це ви», email, посада, ролі, останній вхід, дія «Увійти як…»), вкладки «Доступ» (стан акаунта, хто й чому заблокував, другий крок, останній вхід; вийти на всіх пристроях, скинути другий крок, заблокувати з причиною, розблокувати), «Ролі» (вибір ролей і «Зберегти ролі» з повторним підтвердженням), «Сесії» (завершити сесію пристрою) і «Історія» з журналу аудиту — праворуч на широкому, останньою вкладкою на вузькому. Свій доступ і свої ролі людина тут лише бачить.
- Ролі й матриця прав, запрошення колег — крок A2b2 (поки — `erp/roles-editor` і `erp/invitations-section` кіта на сторінках проекту).

## Встановлення

```sh
node scripts/erp-ui-kit.mjs update <версія кіта> --add modules/A2-users
```

Файли модуля стають у `src/modules/A2-users/`, спільні компоненти кіта, яких бракує, — на свої місця (`src/components/…`, `src/lib/…`, `src/hooks/…`). Файли модуля в проекті не правляться.

## Підключення

```ts
// src/modules.ts
import { createUsersModule } from "@/modules/A2-users"
import { usersExtension } from "@/extensions/A2-users"

export const usersModule = createUsersModule({ basePath: "/team", extension: usersExtension, homePath: "/" })
```

- Маршрути — `usersModule.routes` (React Router) під `Suspense` і межею помилок застосунку; сторінки — лінивими чанками. `basePath: "/team"` дає `/team/users` і `/team/users/:id`, а `/team` веде на список.
- Навігація — `usersModule.nav`; підпис мовою інтерфейсу — `localizedText(item.label, language)`.
- `homePath` — куди перейти після «Увійти як…»: картка людини може бути недоступна тому, за кого увійшли.
- Права й ресурси — `usersModule.resources`: `users` (`read` — список і картка; `update` — вкладки «Доступ» і «Сесії», зміна ролей; `create` — запрошення; `impersonate` — «Увійти як…»), `roles` (`read` — фільтр «Роль» і вибір ролей; `update` — матриця прав). Без `users:read` список і картка показують «Немає доступу» без запиту; без `users:update` вкладок «Доступ» і «Сесії» немає (SPEC §8.4), ролі — лише назвами; «Увійти як…» без права — неактивна з причиною.
- Рядки модуля — свій простір імен `A2-users`: українські приходять зі сторінками модуля, англійські — окремим чанком.

## Розширення під клієнта

Файл проекту `src/extensions/A2-users.ts` (тип `UsersExtension`):

- `users`: `fields` (нові поля запису людини: схема, підписи, значення для моків), `columns` (`change` — назва, ширина, пріоритет колонки модуля без заміни), `filters`, `tabs`, `recordFields` (поля шапки картки), `history: false` (картка без журналу «Історія»), `sections` (вкладки картки — компоненти проекту), `actions` (дії шапки з правом `access`);
- `strings` — перевизначення рядків модуля за ключами `i18n/uk.json` і `i18n/en.json`.

Форми людини немає: людину створює запрошення, а ролі й доступ змінюють вкладки картки. Ім'я в списку розширення не ховає. Ключі модуля для `hide`, `move`, `change` і `place` — типи `UserColumnId`, `UserFilterId`, `UserTabId`, `UserFieldId`, `UserSectionId`, `UserActionId` (`extension.ts`). Типи для файлу розширення й слотів — з індексу модуля (`import type { User, ExtensionField } from "@/modules/A2-users"`). Ролі й запрошення (A2b2) та права на рівні записів (A2c) з'являться новими необов'язковими ключами поруч з `users`: наявний файл розширення не зламається. Приклад — `apps/demo/src/extensions/A2-users.ts` у репозиторії erp-ui.

## Контракт API

`contract.ts` — схеми zod і опис (ADR-0002, ADR-0031):

- Компанія запиту — `X-Company-Id`, без нього — активна компанія сесії; компанія, де людина не працює, — 403; права — у компанії запиту.
- `GET /users` — люди компанії: `id`, `version`, `name`, `email`, `position`, `status` (`active` / `blocked`), `roles` (`{ id, name }`, назва мовою `Accept-Language`), `twoFactor`, `lastSignInAt` (ISO чи `null`) і поля розширення. Фільтри: `q` (ім'я, email), `status`, `roles` (хоч одна з), `twoFactor` (`true`/`false`), `id` (кілька); сортування — `name`, `email`, `lastSignInAt`. Право — `users:read`.
- `GET /users/:id` — той самий запис.
- **Довідник для полів-записів інших модулів** («Відповідальний менеджер», `type: "record"`, `resource: "users"`): кожен у компанії без `users:read` отримує лише `id`, `version`, `name`, `email`; пошук і сторінки — лише активні люди, за `id` — будь-хто (підпис уже вибраного не зникає); інші фільтри й сортування не за `name`, `email` чи `id` — 403, щоб `total` чи порядок не видали ролей, входів, другого кроку й блокування. Що довідник усе ж показує: людина, знайдена за `id`, але не в пошуку, — деактивована; `version` зростає й зі зміною ролей чи блокуванням. Бекенд обмежує `perPage` довідника й частоту запитів. Постійні умови довідника (`filter` поля-запису) для `users` діють лише з `users:read`.
- Людину створює запрошення (`POST /invitations`), а не `POST /users`; запис людини модуль не змінює й не видаляє. Ролі — `PUT /users/:id/roles` (ADR-0014); доступ і сесії — `GET /users/:id/access`, `POST /users/:id/block|unblock|sign-out`, `DELETE /sessions/:id` (ADR-0013). Після зміни ролей чи блокування `version` запису зростає.
- Історія картки — журнал аудиту `targetType=users`, `targetId=<id>`.

## Моки

```ts
import { createUsersFixtures } from "@/modules/A2-users/fixtures"
import { createUsersMocks } from "@/modules/A2-users/mocks"
import { usersMockExtension } from "@/extensions/A2-users-fields"

const team = createUsersFixtures({ company, roles: ["sales", "accountant"], emailDomain: "firm.example" })
const users = createUsersMocks({ extension: usersMockExtension })
setupWorker(
  ...createPlatformHandlers({ users: [...myUsers, ...team.users], accountSeeds: { ...mySeeds, ...team.accountSeeds }, roles, permissionResources }),
  ...createListSettingsHandlers(),
  ...users.handlers,
)
```

- `users` моки беруть із мок-сервера входу (`lib/mock-server`): ім'я й посада — з профілю, ролі — з `lib/mock-team`, другий крок, останній вхід і блокування — з `lib/mock-account`. Зміни на вкладках картки одразу видно в списку.
- Фікстури (`fixtures.ts`) — 16 колег українською чи англійською (`locale`): ролі проекту по черзі, дехто з другим кроком, дехто ще не входив, двоє заблоковані. Колеги не входять у демо (пароль випадковий).
- Сценарії `success`, `error`, `empty`, `slow`, `forbidden`, `offline` — для ресурсу `users` (`setScenario(scenario, "users")`, панель `DevPanel`); `conflict` A2b не стосується: запис людини модуль не змінює.
- Журнал аудиту пише людину на ім'я: поле-запис «Відповідальний менеджер» показує в «було → стало» ім'я (`mockRecordTitle`).

## Оновлення

Командою кіта в проекті (`docs/using-erp-ui.md` кіта, розділ 8): `node scripts/erp-ui-kit.mjs update vX.Y.Z --dry-run`, далі без `--dry-run`. Файли модуля в проекті не правляться; несумісна зміна типу розширення — мажорна версія кіта й розділ «Як оновити розширення» в `CHANGELOG.md`.
