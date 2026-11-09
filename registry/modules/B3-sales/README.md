# B3 «Пропозиції й замовлення»

Модуль erp-ui (SPEC §14, §17; ADR-0020, ADR-0025, ADR-0056…ADR-0062, ADR-0065…ADR-0067): пропозиції й замовлення. «Створити замовлення з пропозиції», потік документів на картках і «Копіювати документ» додає крок `B3b2`. Список — шаблон List Report, картка — Object Page, форма — сторінка з редактором рядків.

- **Список** — вкладки за статусом (зі статусами розширення), фільтри «Клієнт» і «Дата», пошук за номером чи клієнтом, сортування за номером, клієнтом, датою, строком і сумою. Чернетка — «Без номера». Надіслана пропозиція з минулим строком «Дійсна до» — з позначкою «Термін минув» (окремого статусу немає, рішення власника 08.11.2026). Вибрані пропозиції — «Надіслати», «Скасувати» (причина одна на всі, без неї задача не починається) і «Видалити» (лише чернетки) фоновою задачею сервера (`erp/bulk-action`): прогрес і підсумок у сповіщенні, «Подробиці» — невдалі з причиною («Надіслати можна лише чернетку», «Надіслану пропозицію не видаляють: скасуйте її»). Дія графа, яку розширення сховало, зі списку теж зникає.
- **Картка** — номер, статус, клієнт (посилання на його картку, якщо проект її дав), дата, «Дійсна до», сума; етапи «Чернетка → Надіслано → Прийнято»; панель дій графа (`erp/document-action-bar`): «Надіслати» (підтвердження «Надіслати пропозицію?», номер серії дає сервер), «Клієнт прийняв», «Клієнт відхилив» (причина за бажанням), «Скасувати» (з причиною), «Виправити» (нова чернетка зі скасованої, перехід на неї). «Видалити чернетку» в шапці — лише чернетка без номера; у надісланої й скасованої кнопка неактивна з причиною, поки чернетку редагує інша людина — теж. Видалена виправлена копія звільняє скасовану: її можна виправити знову. Рядки лише для читання з підсумками сервера; від 12 рядків — пошук і «До підсумків». Праворуч — «Історія» з журналу аудиту чи стрічка зі слота `aside`. «Змінити» й «Друк» — у шапці й у палітрі команд.
- **Форма** — сторінка `…/quotes/new` і `…/quotes/:id/edit`: клієнт із ресурсу клієнтів проекту (пошук на сервері), дата, «Дійсна до» (не раніше дати), поля розширення, редактор рядків `erp/document-lines-editor` (розділи, нотатки, знижка рядка й документа, ПДВ, підсумки), липка панель збереження. Одиниці, ставки й типові значення нового рядка — з довідників A6 (`units`, `taxes`, `dictionary-defaults`), без них рядок пишеться вільним текстом. Змінити можна лише чернетку: надіслану змінюють через «Скасувати» й «Виправити», про це каже причина неактивної кнопки «Змінити» і форма лише для читання. Поки сторінка відкрита, запис тримає «Редагує …» (ADR-0051); чужий запис — та сама форма лише для читання з причиною.
- **Друк** — `…/quotes/:id/print`: аркуш A4 мовою документа (`company.language`), «Комерційна пропозиція № … від …», «Пропозиція дійсна до …», сторони, рядки, підсумки із сумою прописом, підписи; чернетка й скасована — з позначкою навскіс.
- **Замовлення** (ADR-0067) — ті самі список, картка, форма й друк під `…/orders`: статуси «Чернетка», «Підтверджено», «Виконано», «Скасовано»; друга дата — «Виконати до» (не раніше дати, за замовчуванням тиждень), підтверджене з минулим строком — позначка «Прострочено». Дії: «Підтвердити» (підтвердження «Підтвердити замовлення?», номер серії `orders`), «Позначити виконаним», «Скасувати» з причиною (з підтвердженого й виконаного), «Виправити», «Видалити чернетку». Масово — «Підтвердити», «Позначити виконаним», «Скасувати» (причина одна на всі) і «Видалити» (лише чернетки). Друк — «Замовлення покупця № … від …», «Виконати до …». Пропозиція й замовлення — одні компоненти на описі виду документа (`sales-kinds.ts`).

## Встановлення

```sh
node scripts/erp-ui-kit.mjs update <версія кіта> --add modules/B3-sales
```

Файли модуля стають у `src/modules/B3-sales/`, спільні компоненти кіта, яких бракує, — на свої місця (`src/components/…`, `src/lib/…`, `src/hooks/…`). Файли модуля в проекті не правляться: так оновлення модуля не конфліктує з правками під клієнта.

## Підключення

```ts
// src/modules.ts
import { createSalesModule } from "@/modules/B3-sales"
import { salesExtension } from "@/extensions/B3-sales"

export const salesModule = createSalesModule({
  basePath: "/sales",
  extension: salesExtension,
  // Клієнти — організації модуля B1 (за замовчуванням) з посиланням на їхню картку.
  clients: {
    resource: "organizations",
    labelField: "name",
    descriptionField: "code",
    href: contactsModule.paths.organization,
  },
  // Необов'язково: вибір товару в рядку з ресурсу проекту.
  lineItem: {
    resource: "products",
    optionLabel: (product: Product) => product.name,
    toLine: (product: Product) => ({ name: product.name, price: String(product.price) }),
  },
})
```

- Маршрути — `salesModule.routes` під `Suspense` і межею помилок застосунку; сторінки — лінивими чанками. `basePath: "/sales"` дає `/sales/quotes`, `/sales/quotes/new`, `/sales/quotes/:id`, `/sales/quotes/:id/edit`, `/sales/quotes/:id/print` і так само `/sales/orders…`, а `/sales` веде на список пропозицій.
- Навігація — `salesModule.nav`: «Пропозиції» з правом `quotes:read` і «Замовлення» (`B3-orders`) з правом `orders:read` (`id`, підпис `{ uk, en }`, адреса, іконка, `access`).
- Права й ресурси — `salesModule.resources`: `quotes` з діями `read`, `create`, `update`, `delete` (видалення чернетки) і діями графа `submit`, `accept`, `decline`, `cancel`, `amend` (`quotes:<дія>`, ADR-0014); `orders` з діями `read`, `create`, `update`, `delete` і `submit`, `complete`, `cancel`, `amend`; дії розширення — так само за своїм ключем. Масова дія — те саме право. Дія без права — неактивна з причиною.
- Модуль не імпортує інших модулів: клієнтів і довідники бере за назвами ресурсів. Без B1 — свій ресурс клієнтів у `clients`; без A6 — рядки без довідників.
- Рядки модуля — свій простір імен `B3-sales`: українські приходять зі сторінками модуля, англійські — окремим чанком.

## Розширення під клієнта

Усе, чим клієнт відрізняється, — у файлі проекту `src/extensions/B3-sales.ts` (тип `SalesExtension`):

- `quotes.fields` — нові поля шапки; далі `columns` (нова колонка чи `change` колонки модуля), `filters`, `tabs`, `recordFields` (поле шапки картки), `form` (`add` поля розширення з місцем, `hide`, `move`, `change` підпису поля модуля);
- `quotes.statuses` і `quotes.transitions` — свій статус і дія до нього (ADR-0057): `add` дії з `from` і `to`; `change` дії модуля змінює підпис, `from` і причину, але не `to`. Статус з `mockEvery` моки ставлять кожній N-й пропозиції засіву в статусі, з якого веде дія розширення до нього;
- `quotes.sections`, `quotes.actions` — секції й дії шапки картки (компоненти проекту); `quotes.aside` — стрічка замість «Історії» (`timelineModule.aside`, ADR-0054); `history: false` — без журналу; `editLock: false` — без «Редагує …»;
- `orders` — те саме для замовлень (тип `OrdersExtension`);
- `strings` — перевизначення рядків модуля за ключами `i18n/uk.json` і `i18n/en.json`.

Ключі модуля для `hide`, `move`, `change` і `place` — типи `QuoteColumnId`, `QuoteFilterId`, `QuoteFieldId`, `QuoteFormFieldId`, `QuoteSectionId`, `QuoteActionId`, `QuoteTransitionId` і так само `Order…Id` (`extension.ts`). Номер у списку (посилання на картку) розширення не ховає. Типи — з індексу модуля (`import type { Quote, QuotesExtension } from "@/modules/B3-sales"`). Повний приклад — `apps/demo/src/extensions/B3-sales.ts` і `B3-sales-fields.ts` у репозиторії erp-ui.

## Контракт API

`contract.ts` — схеми zod і опис ресурсу (ADR-0002):

- `GET /quotes` — шапки без рядків: `number` (`null` у чернетки), `date`, `validUntil`, `clientId`, `clientName`, `currency`, `discountPercent`, `discountAmount`, `total`, `status`, `docStatus` і зв'язки життєвого циклу. `GET /quotes/:id` — ще й `lines` і `totals` (ADR-0019).
- `POST /quotes` — шапка, рядки, знижка документа й валюта (базова валюта компанії); `PATCH /quotes/:id` — змінені поля з `version`, рядки — усім масивом. Суми рахує сервер (`lib/document-totals`): `totals` рядків і документа, `total`. Помилки — 422 `fieldErrors`: `validUntil: before_date`, `clientId: invalid`, рядки — `lines.<індекс>.<поле>`. Конфлікт — 409 з `current`.
- Дії — `POST /quotes/:id/<дія>` з `version` і `reason` (ADR-0057): номер на `submit` (ADR-0058), `deniedActions.update` у надісланої й скасованої, `amend` — нова чернетка з `amendedFrom`.
- Видалення — `DELETE /quotes/:id`, лише чернетка: у надісланої й скасованої `deniedActions.delete` (`submitted`, `cancelled`) і 403. Видалена виправлена копія знімає `amendedBy` зі скасованої (ADR-0066).
- Масові дії — `POST /quotes/bulk/<дія>` з `{ ids }` чи `{ filter, exclude? }` → 202 `{ jobId }`, хід — `GET /jobs/:id` (`lib/jobs`, ADR-0018): `submit` і `cancel` над кожною пропозицією в її поточній версії, `cancel` — з `reason`, одна на всі (без неї 422 `fieldErrors.reason = "required"`), `delete` — чернетки. Невдачі групами за кодом: `transition_not_allowed`, `submitted`, `cancelled` чи коди API; у групі — номер, у чернетки — клієнт.
- Клієнт — знімок назви `clientName` разом із `clientId` (ADR-0056); сервер може перевірити й перезаписати знімок.
- Замовлення — так само під `/orders`: шапка з `dueDate` замість `validUntil` (422 `dueDate: before_date`), дії `submit`, `complete`, `cancel`, `amend`, масові `submit`, `complete`, `cancel` і `delete`.
- Поля й статуси розширення входять у схему через `quoteSchemaFor(extension)` і `orderSchemaFor(extension)`, детальний запис — `quoteCardSchemaFor(extension)` і `orderCardSchemaFor(extension)`.

## Моки

```ts
import { createJobHandlers } from "@/lib/mock-jobs"
import { createNumberingMocks } from "@/lib/mock-numbering"
import { createSalesMocks, salesNumberingSeeds } from "@/modules/B3-sales/mocks"
import { salesMockExtension } from "@/extensions/B3-sales-fields"

const options = { companies: ["company-a"], locale: "uk" } as const
const seeds = salesNumberingSeeds(options)
const numbering = createNumberingMocks({ series: seeds.series, counters: seeds.counters })
const sales = createSalesMocks({ ...options, numbering, extension: salesMockExtension })
setupWorker(...platformHandlers, ...numbering.handlers, ...createJobHandlers(), ...sales.handlers)
```

- Нумерація спільна для всіх документів застосунку: модуль дає засів серій `quotes` і `orders` та лічильників, а номер на «Надіслати» видає `numbering.forResource` — і для масового «Надіслати».
- Хід масових задач — спільний на застосунок: `createJobHandlers()` з `@/lib/mock-jobs` (один на застосунок), модуль дає лише `POST /quotes/bulk/<дія>` і `POST /orders/bulk/<дія>`.
- Фікстури — українською чи англійською (`locale`), дати від сьогодні (`today` у тестах): усі статуси, надіслана з минулим строком, скасована з виправленою копією, чернетка на 14 рядків із розділами; замовлення всіх статусів, прострочене, скасоване з виправленою копією й підтверджене на 13 рядків із розділами. `sales.db` — `{ quotes, orders }`. `clients` і `dictionaries` — клієнти й знімки довідників компанії проекту; без них — свої назви модуля.
- Сценарії `success`, `error`, `empty`, `slow`, `conflict`, `forbidden`, `offline` — ресурсів `quotes` і `orders` (панель розробника). У `conflict` колега продовжує строк на тиждень перед дією.
- Моки беруть лише дані розширення без компонентів (`SalesMockExtension`).

## Оновлення

Командою кіта в проекті (`docs/using-erp-ui.md` кіта, розділ 8): `node scripts/erp-ui-kit.mjs update vX.Y.Z --dry-run`, далі без `--dry-run`. Нове в модулі — сумісні доповнення типу розширення (мінорна версія); несумісна зміна — мажорна, що змінити — у розділі «Як оновити розширення» в `CHANGELOG.md`.
