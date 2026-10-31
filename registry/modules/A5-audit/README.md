# A5 «Аудит та історія»

Модуль erp-ui (SPEC §14, §17; ADR-0013, ADR-0020, ADR-0025, ADR-0036, ADR-0045): журнал аудиту компанії й перехід із рядка журналу до історії запису.

- **Журнал** — сторінка `paths.journal` зі спільною частиною кіта `erp/audit-log`: пошук, розділ, період, подробиці події, експорт CSV, «Показати ще». Журнал лише читається. Шаблон List Report тут не використовується: у журналу свій контракт, немає колонок, вибору й масових дій (ADR-0045).
- **Шухляда історії запису** — кнопка «Історія запису» в рядку події відкриває всі зміни цього запису. Подробиці вже відкриті, змінені слова виділено.
- **Що змінилося** — рядки «Було» і «Стало» одне під одним: текст порівнюється за словами, список за елементами, решта міняється цілком.

Шухляда на картках не потребує модуля: це спільна частина кіта `erp/record-history`, вона стоїть на картках A1, A2 і B1. Модуль додає сторінку журналу, пункт навігації, фікстури й тип розширення.

## Встановлення

```sh
node scripts/erp-ui-kit.mjs update <версія кіта> --add modules/A5-audit
```

Файли модуля стають у `src/modules/A5-audit/`, спільні компоненти кіта, яких бракує, — на свої місця (`src/components`, `src/lib`, `src/hooks`). Файли модуля в проекті не правимо: зміни під клієнта — у файлі розширення.

## Підключення

```ts
// src/modules.ts
import { createAuditModule } from "@/modules/A5-audit"
import { auditExtension } from "@/extensions/A5-audit"

export const auditModule = createAuditModule({ basePath: "/settings", extension: auditExtension })
```

- Маршрут — `auditModule.routes` (React Router) під `Suspense` і межею помилок застосунку; сторінка — лінивим чанком. Адреса `basePath` веде на журнал.
- Навігація — `auditModule.nav`: «Журнал аудиту» з правом `audit:read` (`access`). Сторінка без права каже «Немає доступу» й запитів не робить.
- Права й ресурси — `auditModule.resources`: `audit` (`read`). Кому його дати — вирішує проект у своїх ролях.
- `auditModule.preload(pathname)` — наперед завантажити чанк сторінки.
- Рядки модуля — свій простір імен `A5-audit`: українські приходять зі сторінкою, англійські — окремим чанком за потреби. Рядки самого журналу — у кіті (`audit.*`).

## Розширення під клієнта

Файл проекту `src/extensions/A5-audit.ts` (тип `AuditExtension`):

- `journal.actionLabels` — назви дій проекту мовами: `{ "invoices.paid": { uk: "Оплата рахунку", en: "Invoice paid" } }`. Діють у журналі й у шухляді, відкритій із нього. Важливіші за `actionLabel` від сервера.
- `journal.export: false` — без кнопки «Експорт CSV», якщо бекенд не має `GET /audit-events/export`.
- `strings` — перевизначення рядків модуля за ключами `i18n/uk.json` і `i18n/en.json`.

## Контракт API

Модуль нових адрес не додає, контракт — `lib/audit` (`contract.ts`, ADR-0013, ADR-0036):

- `GET /audit-events` → `{ data, total }`, новіші першими. Плоскі фільтри: `q`, `category` (кілька), `action`, `actorId`, `targetType`, `targetId`, `at_gte`, `at_lte`, сторінки `page`, `perPage`.
- `GET /audit-events/export` з тими самими фільтрами → CSV (UTF-8 з BOM), усі події без сторінок. Клітинка-рядок, що починається з `= + - @`, табуляції чи CR, має префікс `'`.
- Журнал пише й зберігає сервер, клієнт лише читає. Право `audit:read` — у компанії запиту (`X-Company-Id`), 403 без нього.
- Шухляда — ті самі події з `targetType` і `targetId`. Щоб історія запису була повною, сервер пише `target` у кожну зміну запису й віддає обидва значення в `changes[].from` і `to`: рядок, число, так чи ні, `null` або список рядків чи чисел. Різницю рахує кіт (`lib/value-diff`).

## Моки

```ts
import { createAuditMocks } from "@/modules/A5-audit/mocks"

const audit = createAuditMocks({ companies: ["company-1"] })
setupWorker(...createPlatformHandlers({ auditSeeds: audit.seeds }))
```

Журнал віддають моки платформи (`lib/mock-audit`), модуль їх не дублює: він дає лише початкові події, історію одного договору для кожної компанії. Сценарії (`success`, `error`, `empty`, `slow`, `conflict`, `forbidden`, `offline`) — ресурс `audit`, у панелі розробника чи `lib/mock-scenarios`. `empty` дає порожній список і CSV із самою шапкою. Журнал лише читається, тож `conflict` працює як `success`.
