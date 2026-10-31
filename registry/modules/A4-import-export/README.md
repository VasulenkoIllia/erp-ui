# A4 «Імпорт і експорт»

Модуль erp-ui (SPEC §14, §17; ADR-0020, ADR-0025, ADR-0049, ADR-0050): завантаження записів із таблиці, збереження записів у файл та історія запусків.

- **Цілі** — сторінка з переліком того, що можна імпортувати й експортувати: контакти й організації B1, податки, одиниці, теги й причини A6, свої цілі проекту. Без права створювати записи кнопка «Імпортувати» неактивна й пояснює причину, без права читати так само поводиться «Експортувати». Ціль без жодного з прав не показано.
- **Майстер імпорту** — `erp/import-wizard` на окремій адресі цілі: файл, рядок із назвами колонок, колонки, перевірка, перегляд, звіт. Після «Готово» сторінка веде до історії.
- **Експорт** — `erp/export-dialog`: файл збирає браузер зі сторінок списку. Назви колонок ті самі, що в шаблоні імпорту, тож збережений файл можна завантажити назад.
- **Історія** — запуски компанії на шаблоні List Report: файл, ціль, стан, хто й коли, лічильники. Пошук за файлом, фільтри цілі й стану. Подробиці в шухляді показують причини невдач і номери рядків. Запуск, що йде, сторінка наздоганяє сама.

Умов оплати A6 у цілях немає: частини оплати не лягають на один рядок таблиці. Контакт приходить без організації: зв'язок ставить людина чи свій код проекту. Сам файл запуску сервер не зберігає, тому файл помилок є лише в майстрі, а в історії видно номери рядків.

## Встановлення

```sh
node scripts/erp-ui-kit.mjs update <версія кіта> --add modules/A4-import-export
```

Файли модуля стають у `src/modules/A4-import-export/`, спільні компоненти кіта, яких бракує, — на свої місця (`src/components`, `src/lib`, `src/hooks`). Файли модуля в проекті не правимо: зміни під клієнта — у файлі розширення.

## Підключення

```ts
// src/modules.ts
import { createImportExportModule } from "@/modules/A4-import-export"
import { importExportExtension } from "@/extensions/A4-import-export"

export const importExportModule = createImportExportModule({ basePath: "/settings", extension: importExportExtension })
```

- Маршрути — `importExportModule.routes` (React Router) під `Suspense` і межею помилок застосунку; сторінки — лінивими чанками. Адреса `basePath` веде на цілі.
- Навігація — `importExportModule.nav`: «Імпорт і експорт» і «Історія імпорту» з правом `import-runs:read`. Адреси — `importExportModule.paths`.
- Кнопка «Імпорт» на своєму списку проекту веде на майстер цілі: `importRunPath(importExportModule.paths, "contacts")`.
- Права й ресурси — `importExportModule.resources`: `import-runs` (`read`, `read:own` — лише свої запуски). Окремого права імпорту немає: імпорт цілі просить `<ресурс>:create`, а оновлення наявних записів ще й `<ресурс>:update`. Експорт просить `<ресурс>:read`, обсяг `read:own` діє сам.
- `importExportModule.preload(pathname)` — наперед завантажити чанк сторінки.
- Рядки модуля — свій простір імен `A4-import-export`: українські приходять зі сторінками модуля, англійські — окремим чанком за потреби.

## Розширення під клієнта

Файл проекту `src/extensions/A4-import-export.ts` (тип `ImportExportExtension`):

- `targets.hide` — сховати ціль, якщо модуля-цілі в проекті немає: `{ hide: ["taxes", "units", "tags", "reasons"] }`. Без `hide` такі цілі бачить лише той, хто має на них права, наприклад роль із `*`.
- `targets.add` — своя ціль: `id` (ресурс API), `label`, `fields`, `matchField`, `place`.
- `targets.change` — змінити ціль модуля: `label`, `matchField` чи `fields`. Нове поле: `fields: [...CONTACTS_TARGET.fields, { key: "source", label: "Джерело" }]`, дані цілей — у `targets.ts`.
- `targets.move` — порядок цілей.
- `history.page: false` — без сторінки й пункту навігації, якщо бекенд не веде запуски. Тоді «Готово» веде на цілі.
- `history.columns`, `history.filters` — колонки й фільтри історії. Файл розширення не ховає: він відкриває подробиці.
- `strings` — перевизначення рядків модуля за ключами `i18n/uk.json` і `i18n/en.json`.

Поле цілі: `key`, `label`, `required`, `type` (`text`, `number`, `integer`, `boolean`, `date`, `enum`), `options`, `aliases`, `example`, `format: "phone"` (будь-який запис номера у файлі, E.164 на сервері).

## Контракт API

`contract.ts` — схема zod і опис (ADR-0002, ADR-0050). Компанія запиту — `X-Company-Id`, без нього — активна компанія сесії.

Кожна ціль потребує від бекенду контракт `lib/imports`: `POST /<ресурс>/import/check` і `POST /<ресурс>/import` (ADR-0049). Без цих адрес майстер покаже помилку запиту, а експорт працюватиме: йому досить `GET /<ресурс>`.

Рядок без необов'язкової клітинки не несе поля. Новий запис сервер заповнює так само, як форму без цього поля, наявний лишає як є.

Історія:

- `GET /import-runs` (фільтри `target`, `status`, пошук `q` за назвою файла, сортування `startedAt`), `GET /import-runs/:id`.
- Запуск створює сервер у `POST /<ресурс>/import`: один запис на один `requestId`.
- Поля: `target`, `fileName`, `status` (`running`, `done`, `partial`, `failed`), `total`, `created`, `updated`, `skipped`, `failed`, `failures` (форма невдач задачі ADR-0018, `items[].id` — номер рядка файла), `startedBy`, `startedByName`, `startedAt`, `finishedAt`.

## Моки

```ts
import { createImportExportMocks, importTargetMock } from "@/modules/A4-import-export/mocks"

const importExport = createImportExportMocks({
  companies: ["company-1"],
  targets: [
    importTargetMock({ resource: "contacts", db: contacts.db.contacts }),
    importTargetMock({ resource: "products", db: products.db, defaults: { stock: 0 } }),
  ],
})
setupWorker(...createPlatformHandlers({}), ...importExport.handlers)
```

`db` цілі дають моки її модуля: модулі ставляться окремо, тому цей файл їх не імпортує. `defaults` — значення полів, яких немає в рядку, для цілей B1 вони вбудовані.

Сценарії (`success`, `error`, `empty`, `slow`, `conflict`, `forbidden`, `offline`) — окремо для `import-runs` і для кожної цілі, у панелі розробника чи `lib/mock-scenarios`. Опитування задачі — сценарії ресурсу `jobs`. Моки відповідають і на `POST`, `PATCH` та `DELETE` історії, бо їх дає спільний `createResourceHandlers`; контракт цих адрес не має.
