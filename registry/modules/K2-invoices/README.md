# K2 «Рахунки клієнтам»

Модуль erp-ui (SPEC §14, §17; ADR-0020, ADR-0025, ADR-0056…ADR-0062, ADR-0068…ADR-0070): рахунки на оплату, «Виставити рахунок» із замовлення модуля B3, сторно, потік документів і друк із QR-кодом оплати НБУ. Рахунок — обліковий документ: закритий період (PF13) його стосується. Список — шаблон List Report, картка — Object Page, форма — сторінка з редактором рядків і сторонами.

- **Список** — вкладки за статусом («Чернетка», «Виставлено», «Скасовано», «Сторновано», «Сторно» і статуси розширення), фільтри «Клієнт» і «Дата», пошук за номером чи клієнтом, сортування за номером, клієнтом, датою, «Сплатити до» й сумою. Чернетка — «Без номера». Виставлений рахунок із минулою «Сплатити до» — з позначкою «Прострочено» (окремого статусу немає). Сума сторно — з мінусом. Вибрані рахунки — «Виставити», «Скасувати» (причина одна на всі) і «Видалити» (лише чернетки) фоновою задачею сервера (`erp/bulk-action`); рахунок у закритому періоді — у звіті невдалих із причиною.
- **Картка** — номер, статус, клієнт (посилання на його картку, якщо проект її дав), дата, «Сплатити до», сума; етапи «Чернетка → Виставлено»; над панеллю дій — смуга закритого періоду (`erp/period-lock-banner`): дата рахунку в закритому періоді, що робити — сторнувати. Панель дій графа: «Виставити» (підтвердження «Виставити рахунок?», номер серії дає сервер), «Скасувати» з причиною, «Виправити» (нова чернетка зі скасованого), «Сторнувати» з причиною (новий проведений рахунок «Сторно» з датою сьогодні, перший — «Сторновано»; картка відкриває сторно). Сторно дій не має. «Видалити чернетку» — лише чернетка. Рядки лише для читання з підсумками сервера, сторони (постачальник і покупець з реквізитами знімків рахунку), потік документів (`erp/document-flow`): замовлення, з якого виставлено рахунок («На підставі ЗМ-…»), виправлені копії й сторно. Праворуч — «Історія» з журналу аудиту чи стрічка зі слота `aside`.
- **Рахунок із замовлення** — у підтвердженого й виконаного замовлення B3 дія «Виставити рахунок» (коли проект підключив рахунки, див. нижче): сервер створює чернетку з тим самим клієнтом, рядками, знижкою й валютою, датою сьогодні (у закритому періоді — першим відкритим днем), сторонами з профілю компанії й картки клієнта. Поля розширення рахунку беруть значення поля замовлення з тим самим ключем, якщо воно підходить. Один рахунок на замовлення: повторно дія неактивна з причиною, під панеллю — «Відкрити рахунок»; поки рахунок діє (не скасований і не сторнований), замовлення не скасувати. Видалена чернетка рахунку звільняє замовлення. Виправлена копія скасованого рахунку лишається на підставі того самого замовлення, навіть коли замовлення тим часом скасували: модуль не бачить статусу замовлення, рішення за бухгалтером.
- **Форма** — `…/invoices/new` і `…/invoices/:id/edit`: клієнт із ресурсу клієнтів проекту (пошук на сервері; новий клієнт — нові реквізити покупця з його картки), дата (у закритому періоді — підказка й перший відкритий день, `usePostingDate`), «Сплатити до» (не раніше дати, за замовчуванням через 5 днів), поля розширення, сторони (`erp/party-details`: «Заповнити з профілю компанії» і «Заповнити з картки клієнта» заповнюють лише порожні поля), редактор рядків, липка панель збереження. Змінити можна лише чернетку у відкритому періоді; поки сторінка відкрита, запис тримає «Редагує …» (ADR-0051).
- **Копіювати** — нова форма (`…/new?copy=<id>`) з тими самими клієнтом, сторонами, рядками, знижкою й полями розширення, дата — сьогодні; рахунок з'являється лише після «Зберегти».
- **Друк** — `…/invoices/:id/print`: аркуш A4 мовою документа (`company.language`), «Рахунок на оплату № … від …», «Сплатити до …», постачальник і покупець із реквізитами, рядки, підсумки із сумою прописом, підписи; чернетка й скасований — з позначкою навскіс, сторно — «Сторно рахунку». У виставленого рахунку в гривнях — QR-код оплати за форматом НБУ (`lib/payment-qr`): отримувач, IBAN, код, сума й призначення «Оплата за рахунком № … від …, у т.ч. ПДВ …». Неповні реквізити постачальника (IBAN, код, назва) — QR немає, над аркушем пояснення, на папір воно не йде.

## Встановлення

```sh
node scripts/erp-ui-kit.mjs update <версія кіта> --add modules/K2-invoices
```

Файли модуля стають у `src/modules/K2-invoices/`, спільні компоненти кіта, яких бракує, — на свої місця. Файли модуля в проекті не правляться: так оновлення модуля не конфліктує з правками під клієнта.

## Підключення

```ts
// src/modules.ts
import { createInvoicesModule, invoicesPaths } from "@/modules/K2-invoices"
import { createSalesModule } from "@/modules/B3-sales"
import { invoicesExtension } from "@/extensions/K2-invoices"

export const invoicesModule = createInvoicesModule({
  basePath: "/finance",
  extension: invoicesExtension,
  clients: {
    resource: "organizations",
    labelField: "name",
    descriptionField: "code",
    href: contactsModule.paths.organization,
    // Реквізити покупця з запису клієнта: ними заповнюються порожні поля сторони.
    party: (organization) => ({ name: organization.name, code: organization.code, iban: organization.iban }),
  },
  // Потік документів: картки замовлень і пропозицій B3.
  sources: { order: salesModule.paths.order, quote: salesModule.paths.quote },
})

// «Виставити рахунок» на замовленні B3: лише адреса картки рахунку, фабрики одна від одної не залежать.
export const salesModule = createSalesModule({
  basePath: "/sales",
  invoices: { href: invoicesPaths("/finance").invoice },
})
```

- Маршрути — `invoicesModule.routes`: `basePath: "/finance"` дає `/finance/invoices`, `/finance/invoices/new`, `/finance/invoices/:id`, `/finance/invoices/:id/edit`, `/finance/invoices/:id/print`, а `/finance` веде на список.
- Навігація — `invoicesModule.nav`: «Рахунки» (`K2-invoices`) з правом `sales-invoices:read`.
- Права й ресурси — `invoicesModule.resources`: `sales-invoices` з діями `read`, `create`, `update`, `delete` (видалення чернетки) і діями графа `submit`, `cancel`, `reverse`, `amend`; дії розширення — за своїм ключем. Рахунок із замовлення — право `orders:invoice` модуля B3 (сервер вимагає ще й `sales-invoices:create`). Масова дія — те саме право.
- Модуль не імпортує інших модулів: клієнтів, довідники й замовлення бере за назвами ресурсів і адресами.
- Рядки модуля — простір імен `K2-invoices`.

## Розширення під клієнта

Усе, чим клієнт відрізняється, — у файлі проекту `src/extensions/K2-invoices.ts` (тип `InvoicesExtension`), під ключем `invoices`:

- `fields` — нові поля шапки; далі `columns`, `filters`, `tabs`, `recordFields`, `form` (`add` поля розширення з місцем, `hide`, `move`, `change` підпису поля модуля);
- `statuses` і `transitions` — свій статус і дія до нього (ADR-0057); `change` дії модуля — підпис, `from` і причина, але не `to`;
- `sections` (`lines`, `parties`, `flow`), `actions` (`edit`, `copy`, `delete`, `print`), `aside`, `history: false`, `editLock: false`;
- `strings` — перевизначення рядків модуля за ключами `i18n/uk.json` і `i18n/en.json`.

Ключі модуля — типи `InvoiceColumnId`, `InvoiceFilterId`, `InvoiceFieldId`, `InvoiceFormFieldId`, `InvoiceSectionId`, `InvoiceActionId`, `InvoiceTransitionId` (`extension.ts`). Типи — з індексу модуля (`import type { Invoice, InvoicesExtension } from "@/modules/K2-invoices"`). Повний приклад — `apps/demo/src/extensions/K2-sales-invoices.ts` у репозиторії erp-ui.

## Контракт API

`contract.ts` — схеми zod і опис ресурсу (ADR-0002):

- `GET /sales-invoices` — шапки без рядків: `number` (`null` у чернетки), `date`, `dueDate`, `clientId`, `clientName`, `currency`, `discountPercent`, `discountAmount`, `total` (у сторно — з мінусом), `supplier`, `buyer` (`PartyDetails`, ADR-0068), `orderId`, `status`, `docStatus` і зв'язки життєвого циклу. `GET /sales-invoices/:id` — ще й `lines` і `totals`.
- `POST /sales-invoices` — шапка, сторони, рядки, знижка документа й валюта; `PATCH /sales-invoices/:id` — змінені поля з `version`, рядки й сторона — цілим значенням. Суми рахує сервер. Помилки — 422 `fieldErrors`: `dueDate: before_date`, `date: period_locked`, рядки — `lines.<індекс>.<поле>`, сторони — `buyer.<поле>`. Конфлікт — 409 з `current`.
- Дії — `POST /sales-invoices/:id/<дія>` з `version` і `reason` (ADR-0057): номер на `submit` (ADR-0058); `cancel` і `reverse` — з причиною; `amend` — нова чернетка з `amendedFrom`; `reverse` — новий проведений рахунок зі статусом `reversal`, `reversalOf` і датою сьогодні (перший відкритий день), перший — `reversed` з `reversedBy`.
- Закритий період (ADR-0069): у рахунку з датою в закритому періоді `deniedActions` з `period_locked` на всі дії, крім `reverse`; створення й зміна з такою датою — 422 `period_locked` біля `date`.
- Видалення — `DELETE /sales-invoices/:id`, лише чернетка; видалена виправлена копія знімає `amendedBy` зі скасованого, видалена чернетка з замовлення знімає `invoiceId` із замовлення.
- Масові дії — `POST /sales-invoices/bulk/<дія>` → 202 `{ jobId }` (`lib/jobs`): `submit`, `cancel` з `reason`, `delete` чернеток.
- Рахунок із замовлення — `POST /orders/:id/invoice` з `version` → 201 рахунок-чернетка з `orderId`; замовлення отримує `invoiceId`. Повторно — 403 `deniedActions.invoice = "linked"`; поки рахунок діє — `deniedActions.cancel = "linked"` на замовленні. `orderId`, `invoiceId` і зв'язки життєвого циклу веде сервер.
- Потік документів — `GET /sales-invoices/:id/flow` (ADR-0061): зв'язок із замовленням — `basedOn`.
- Поля й статуси розширення входять у схему через `invoiceSchemaFor(extension)` і `invoiceCardSchemaFor(extension)`.

## Моки

```ts
import { createDocumentFlowHandlers } from "@/lib/mock-document-flow"
import { createJobHandlers } from "@/lib/mock-jobs"
import { createNumberingMocks } from "@/lib/mock-numbering"
import { createPeriodLockMocks } from "@/lib/mock-period-lock"
import { createInvoicesMocks, invoicesNumberingSeeds } from "@/modules/K2-invoices/mocks"
import { createSalesMocks, salesNumberingSeeds } from "@/modules/B3-sales/mocks"

const options = { companies: ["company-a"], locale: "uk" } as const
const invoiceSeeds = invoicesNumberingSeeds(options)
const salesSeeds = salesNumberingSeeds(options)
const numbering = createNumberingMocks({
  series: [...salesSeeds.series, ...invoiceSeeds.series],
  counters: [...salesSeeds.counters, ...invoiceSeeds.counters],
})
const periodLock = createPeriodLockMocks({ seeds: [{ companyId: "company-a", lockedThrough: "2026-10-20" }] })
const invoices = createInvoicesMocks({
  ...options,
  numbering,
  periodLock,
  // Моки B3 створюються нижче: виклик — лише на запит.
  releaseOrder: (removed) => sales.releaseOrderInvoice(removed),
})
const sales = createSalesMocks({
  ...options,
  numbering,
  invoices: { create: invoices.fromOrder, hasActive: invoices.hasActive },
})
const flow = createDocumentFlowHandlers({ sources: [...sales.flowSources, ...invoices.flowSources] })
setupWorker(...platformHandlers, ...numbering.handlers, ...periodLock.handlers, ...createJobHandlers(), ...flow,
  ...sales.handlers, ...invoices.handlers)
```

- Фікстури — українською чи англійською (`locale`), дати від сьогодні (`today` у тестах): чернетки (одна на 14 рядків із розділами), виставлені (свіжий, прострочений, зі знижкою, давній), скасований із виправленою копією, сторнований зі сторно. `clients` (з реквізитами `party`), `supplier` і `dictionaries` — клієнти, реквізити компанії й знімки довідників проекту; без них — свої модуля з правильними тестовими кодами й IBAN.
- Сценарії `success`, `error`, `empty`, `slow`, `conflict`, `forbidden`, `offline` — ресурсу `sales-invoices`. У `conflict` колега переносить «Сплатити до» на тиждень.
- Моки беруть лише дані розширення без компонентів (`InvoicesMockExtension`).

## Оновлення

Командою кіта в проекті (`docs/using-erp-ui.md` кіта, розділ 8): `node scripts/erp-ui-kit.mjs update vX.Y.Z --dry-run`, далі без `--dry-run`. Нове в модулі — сумісні доповнення типу розширення (мінорна версія); несумісна зміна — мажорна.
