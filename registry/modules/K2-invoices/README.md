# K2 «Рахунки клієнтам»

Модуль erp-ui (SPEC §14, §17; ADR-0020, ADR-0025, ADR-0056…ADR-0062, ADR-0068…ADR-0072): рахунки на оплату, «Виставити рахунок» із замовлення модуля B3, сторно, потік документів, друк із QR-кодом оплати НБУ, рахунок у валюті компанії із сумою в базовій валюті поруч, кредит-ноти на підставі виставлених рахунків. Рахунок і кредит-нота — облікові документи: закритий період (PF13) його стосується. Список — шаблон List Report, картка — Object Page, форма — сторінка з редактором рядків і сторонами.

- **Список** — вкладки за статусом («Чернетка», «Виставлено», «Скасовано», «Сторновано», «Сторно» і статуси розширення), фільтри «Клієнт» і «Дата», пошук за номером чи клієнтом, сортування за номером, клієнтом, датою, «Сплатити до» й сумою. Чернетка — «Без номера». У рахунку у валюті під сумою документа, дрібніше, — сума в базовій валюті («без курсу», коли курсу немає). Виставлений рахунок із минулою «Сплатити до» — з позначкою «Прострочено» (окремого статусу немає). Сума сторно — з мінусом. Вибрані рахунки — «Виставити», «Скасувати» (причина одна на всі) і «Видалити» (лише чернетки) фоновою задачею сервера (`erp/bulk-action`); рахунок у закритому періоді — у звіті невдалих із причиною.
- **Картка** — номер, статус, клієнт (посилання на його картку, якщо проект її дав), дата, «Сплатити до», сума, у рахунку у валюті — «У базовій валюті» з курсом і його датою (у чернетці — «закріпиться, коли рахунок виставлять»; курсу немає — на яку дату його бракує); етапи «Чернетка → Виставлено»; над панеллю дій — смуга закритого періоду (`erp/period-lock-banner`): дата рахунку в закритому періоді, що робити — сторнувати. Панель дій графа: «Виставити» (підтвердження «Виставити рахунок?», номер серії дає сервер), «Скасувати» з причиною, «Виправити» (нова чернетка зі скасованого), «Сторнувати» з причиною (новий проведений рахунок «Сторно» з датою сьогодні, перший — «Сторновано»; картка відкриває сторно). Сторно дій не має. «Видалити чернетку» — лише чернетка. Рядки лише для читання з підсумками сервера, сторони (постачальник і покупець з реквізитами знімків рахунку), потік документів (`erp/document-flow`): замовлення, з якого виставлено рахунок («На підставі ЗМ-…»), виправлені копії й сторно. Праворуч — «Історія» з журналу аудиту чи стрічка зі слота `aside`.
- **Рахунок із замовлення** — у підтвердженого й виконаного замовлення B3 дія «Виставити рахунок» (коли проект підключив рахунки, див. нижче): сервер створює чернетку з тим самим клієнтом, рядками, знижкою й валютою, датою сьогодні (у закритому періоді — першим відкритим днем), сторонами з профілю компанії й картки клієнта. Поля розширення рахунку беруть значення поля замовлення з тим самим ключем, якщо воно підходить. Один рахунок на замовлення: повторно дія неактивна з причиною, під панеллю — «Відкрити рахунок»; поки рахунок діє (не скасований і не сторнований), замовлення не скасувати. Видалена чернетка рахунку звільняє замовлення. Виправлена копія скасованого рахунку лишається на підставі того самого замовлення, навіть коли замовлення тим часом скасували: модуль не бачить статусу замовлення, рішення за бухгалтером.
- **Форма** — `…/invoices/new` і `…/invoices/:id/edit`: клієнт із ресурсу клієнтів проекту (пошук на сервері; новий клієнт — нові реквізити покупця з його картки), дата (у закритому періоді — підказка й перший відкритий день, `usePostingDate`), «Сплатити до» (не раніше дати, за замовчуванням через 5 днів), «Валюта» (коли проект дав валюти компанії: базова першою, далі активні; змінюється, поки рахунок чернетка), поля розширення, сторони (`erp/party-details`: «Заповнити з профілю компанії» і «Заповнити з картки клієнта» заповнюють лише порожні поля), редактор рядків, липка панель збереження. Змінити можна лише чернетку у відкритому періоді; поки сторінка відкрита, запис тримає «Редагує …» (ADR-0051).
- **Копіювати** — нова форма (`…/new?copy=<id>`) з тими самими клієнтом, сторонами, рядками, знижкою й полями розширення, дата — сьогодні; рахунок з'являється лише після «Зберегти».
- **Друк** — `…/invoices/:id/print`: аркуш A4 мовою документа (`company.language`), «Рахунок на оплату № … від …», «Сплатити до …», постачальник і покупець із реквізитами, рядки, підсумки із сумою прописом, підписи; чернетка й скасований — з позначкою навскіс, сторно — «Сторно рахунку». У виставленого рахунку в гривнях — QR-код оплати за форматом НБУ (`lib/payment-qr`): отримувач, IBAN, код, сума й призначення «Оплата за рахунком № … від …, у т.ч. ПДВ …». Неповні реквізити постачальника (IBAN, код, назва) — QR немає, над аркушем пояснення, на папір воно не йде. Рахунок у валюті друкується без QR: реквізити валютного рахунку бухгалтер вписує в блок постачальника самого рахунку (ADR-0071).
- **Кредит-нота** (ADR-0072) — окремий документ на підставі виставленого рахунку: клієнт повернув товар чи сума зменшилась. На картці виставленого рахунку — «Створити кредит-ноту»: сервер створює чернетку з рядками, які ще не повернули інші кредит-ноти, датою сьогодні (у закритому періоді — першим відкритим днем), клієнтом, сторонами, валютою й курсом рахунку; відкривається її картка. Кредит-нот до рахунку може бути кілька, разом вони не більші за рахунок: кількість кожного рядка перевіряє сервер. На картці рахунку — поле «Кредит-ноти» із сумою виставлених; статус рахунку не змінюється. Рахунок із виставленою кредит-нотою не скасовують і не сторнують (спершу сторнують кредит-ноту), повністю покритий — «Створити кредит-ноту» неактивна з причиною.
  - **Список** — `…/credit-notes`, пункт меню «Кредит-ноти»: вкладки за статусом, фільтри «Клієнт» і «Дата», пошук за номером, клієнтом чи рахунком, колонка «Рахунок» із посиланням на рахунок-підставу. Кнопки «Створити» немає: порожній список пояснює, де створюють кредит-ноту.
  - **Картка** — номер своєї серії («КН-2026-0001»), статус, клієнт, рахунок-підстава з датою (посилання), дата, сума, у валюті — сума в базовій валюті за курсом рахунку; етапи, смуга закритого періоду, панель дій графа: «Виставити» (сервер ще раз рахує суми й перевіряє, що інші кредит-ноти тим часом не повернули ті самі рядки), «Скасувати», «Виправити», «Сторнувати» — як у рахунку. Рядки лише для читання, сторони, потік документів (рахунок «на підставі»), «Історія».
  - **Форма** — `…/credit-notes/:id/edit`, лише чернетка: дата й повернені рядки. Назва, ціна, знижка й податок — з рахунку; змінити можна кількість (не більше, ніж лишилось у рахунку: «з 5 шт.» під полем) і прибрати рядок. Сума рядка й кредит-ноти рахується одразу тим самим правилом, що на сервері.
  - **Суми** — частка рядка рахунку за кількістю, а не «кількість × ціна»: частка накопичувальна (частка до нової межі мінус суми, які вже повернули виставлені кредит-ноти), тож кредит-ноти частинами дають рівно суму рахунку, а копійки не губляться й не додаються й після сторно однієї з них (`credit-note-sums.ts`).
  - **Друк** — `…/credit-notes/:id/print`: «Кредит-нота № … від …», «До рахунку № … від …», сторони, рядки, підсумки із сумою прописом, підписи; без QR-коду.

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
  // Рахунок у валюті: валюти компанії модуля A1 (поля `code` і `active`). Без опції — лише базова валюта.
  currencies: { resource: "currencies" },
})

// «Виставити рахунок» на замовленні B3: лише адреса картки рахунку, фабрики одна від одної не залежать.
export const salesModule = createSalesModule({
  basePath: "/sales",
  invoices: { href: invoicesPaths("/finance").invoice },
})
```

- Маршрути — `invoicesModule.routes`: `basePath: "/finance"` дає `/finance/invoices`, `/finance/invoices/new`, `/finance/invoices/:id`, `/finance/invoices/:id/edit`, `/finance/invoices/:id/print`, `/finance/credit-notes`, `/finance/credit-notes/:id`, `/finance/credit-notes/:id/edit`, `/finance/credit-notes/:id/print`, а `/finance` веде на список рахунків.
- Навігація — `invoicesModule.nav`: «Рахунки клієнтам» (`K2-invoices`) з правом `sales-invoices:read` і «Кредит-ноти» (`K2-credit-notes`) з правом `sales-credit-notes:read`.
- Права й ресурси — `invoicesModule.resources`: `sales-invoices` з діями `read`, `create`, `update`, `delete` (видалення чернетки) і діями графа `submit`, `cancel`, `reverse`, `amend`, `creditNote` («Створити кредит-ноту», сервер вимагає ще й `sales-credit-notes:create`); `sales-credit-notes` з діями `read`, `create`, `update`, `delete`, `submit`, `cancel`, `reverse`, `amend`; дії розширення — за своїм ключем. Рахунок із замовлення — право `orders:invoice` модуля B3 (сервер вимагає ще й `sales-invoices:create`). Масова дія — те саме право.
- Бекенд без кредит-нот: дію рахунку сховати розширенням (`invoices.transitions.hide: ["creditNote"]`) і не давати права `sales-credit-notes:read` — пункту меню «Кредит-ноти» не буде.
- Модуль не імпортує інших модулів: клієнтів, довідники, валюти й замовлення бере за назвами ресурсів і адресами. Поле «Валюта» читає ресурс валют, тож бухгалтеру потрібне ще `currencies:read`; без нього у виборі лише базова валюта.
- Рядки модуля — простір імен `K2-invoices`.

## Розширення під клієнта

Усе, чим клієнт відрізняється, — у файлі проекту `src/extensions/K2-invoices.ts` (тип `InvoicesExtension`), під ключами `invoices` і `creditNotes`:

- `fields` — нові поля шапки; далі `columns`, `filters`, `tabs`, `recordFields`, `form` (`add` поля розширення з місцем, `hide`, `move`, `change` підпису поля модуля);
- `statuses` і `transitions` — свій статус і дія до нього (ADR-0057); `change` дії модуля — підпис, `from` і причина, але не `to`;
- `sections` (`lines`, `parties`, `flow`), `actions` (`edit`, `copy`, `delete`, `print`), `aside`, `history: false`, `editLock: false`;
- `creditNotes` — те саме для кредит-нот (тип `CreditNoteDocumentExtension`): колонки (`number`, `client`, `invoice`, `date`, `total`, `status`), поля шапки (`client`, `invoice`, `date`, `total`, `baseTotal`), секції (`lines`, `parties`, `flow`), дії (`edit`, `delete`, `print`), форма (`date`); «Копіювати» немає;
- `strings` — перевизначення рядків модуля за ключами `i18n/uk.json` і `i18n/en.json`.

Ключі модуля — типи `InvoiceColumnId`, `InvoiceFilterId`, `InvoiceFieldId`, `InvoiceFormFieldId`, `InvoiceSectionId`, `InvoiceActionId`, `InvoiceTransitionId` і такі самі `CreditNote…Id` (`extension.ts`). Типи — з індексу модуля (`import type { Invoice, InvoicesExtension } from "@/modules/K2-invoices"`). Повний приклад — `apps/demo/src/extensions/K2-sales-invoices.ts` у репозиторії erp-ui.

## Контракт API

`contract.ts` — схеми zod і опис ресурсу (ADR-0002):

- `GET /sales-invoices` — шапки без рядків: `number` (`null` у чернетки), `date`, `dueDate`, `clientId`, `clientName`, `currency`, `discountPercent`, `discountAmount`, `total` (у сторно — з мінусом), `exchange`, `supplier`, `buyer` (`PartyDetails`, ADR-0068), `orderId`, `status`, `docStatus` і зв'язки життєвого циклу. `GET /sales-invoices/:id` — ще й `lines` і `totals`.
- Рахунок у валюті (ADR-0071): `exchange` веде сервер — `baseCurrency`, `rate` (скільки базової за 1 одиницю валюти рахунку), `rateDate` (дата курсу в таблиці: дата рахунку чи остання перед нею), `baseTotal` (`total × rate`, половина від нуля до мінорної одиниці базової валюти). Курсу немає — три останні `null`. Рахунок у базовій валюті — `exchange: null`. Чернетка — свіжий курс, `submit` закріплює; сторно бере курс першого, `baseTotal` з мінусом. Клієнт `exchange` не надсилає.
- `POST /sales-invoices` — шапка, сторони, рядки, знижка документа й валюта; `PATCH /sales-invoices/:id` — змінені поля з `version` (валюта — лише в чернетці), рядки й сторона — цілим значенням. Суми рахує сервер. Помилки — 422 `fieldErrors`: `dueDate: before_date`, `date: period_locked`, рядки — `lines.<індекс>.<поле>`, сторони — `buyer.<поле>`. Конфлікт — 409 з `current`.
- Дії — `POST /sales-invoices/:id/<дія>` з `version` і `reason` (ADR-0057): номер на `submit` (ADR-0058); `cancel` і `reverse` — з причиною; `amend` — нова чернетка з `amendedFrom`; `reverse` — новий проведений рахунок зі статусом `reversal`, `reversalOf` і датою сьогодні (перший відкритий день), перший — `reversed` з `reversedBy`.
- Закритий період (ADR-0069): у рахунку з датою в закритому періоді `deniedActions` з `period_locked` на всі дії, крім `reverse`; створення й зміна з такою датою — 422 `period_locked` біля `date`.
- Видалення — `DELETE /sales-invoices/:id`, лише чернетка; видалена виправлена копія знімає `amendedBy` зі скасованого, видалена чернетка з замовлення знімає `invoiceId` із замовлення.
- Масові дії — `POST /sales-invoices/bulk/<дія>` → 202 `{ jobId }` (`lib/jobs`): `submit`, `cancel` з `reason`, `delete` чернеток.
- Рахунок із замовлення — `POST /orders/:id/invoice` з `version` → 201 рахунок-чернетка з `orderId`; замовлення отримує `invoiceId`. Повторно — 403 `deniedActions.invoice = "linked"`; поки рахунок діє — `deniedActions.cancel = "linked"` на замовленні. `orderId`, `invoiceId` і зв'язки життєвого циклу веде сервер.
- Потік документів — `GET /sales-invoices/:id/flow` (ADR-0061): зв'язок із замовленням — `basedOn`.
- Кредит-нота (ADR-0072) — ресурс `sales-credit-notes`: шапка рахунку-документа (`number`, `date`, `clientId`, `clientName`, `currency`, `discountPercent`, `discountAmount`, `total`, `exchange`, `supplier`, `buyer`, `status`, `docStatus`, зв'язки життєвого циклу) і `invoiceId`, `invoiceNumber`, `invoiceDate` — знімки рахунку-підстави. `GET /sales-credit-notes/:id` — ще й `lines` (лише товари; `id` рядка — `id` рядка рахунку), `totals` і в чернетці `basis` за `id` рядка: `quantity` рахунку, `available` — скільки можна повернути разом із цією кредит-нотою, `totals` рядка рахунку, `credited` — суми, які вже повернули інші виставлені кредит-ноти.
- Створення — дія рахунку `POST /sales-invoices/:id/creditNote` з `version` → 201 чернетка кредит-ноти (лише виставлений рахунок; повністю покритий — 403 `deniedActions.creditNote = "credited"`). `POST /sales-credit-notes` немає.
- `PATCH /sales-credit-notes/:id` — `date` і `lines` (`[{ id, quantity }]`, решту сервер бере з рахунку) з `version`. Кількість разом із виставленими кредит-нотами понад рахунок — 422 `lines.<індекс>.quantity: exceeds_invoice`; рядка немає в рахунку — `not_in_invoice`; без рядків — `lines: required`. Суми — частка рядка рахунку (`credit-note-sums.ts`).
- Дії кредит-ноти — як у рахунку (`submit`, `cancel`, `reverse`, `amend`); `submit` рахує суми заново. Чернетку не виставити: `deniedActions.submit = "invoice_inactive"` (рахунок скасовано чи сторновано) чи `"exceeds_invoice"` (інші кредит-ноти вже повернули ці кількості). На рахунку з виставленою кредит-нотою — `deniedActions.cancel` і `reverse` = `"linked"`; сума виставлених — `creditedTotal` у `GET /sales-invoices/:id`. Курс — рахунку (`exchange.rate` і `rateDate`), `baseTotal` — від суми кредит-ноти.
- Потік документів — `GET /sales-credit-notes/:id/flow`: рахунок — `basedOn`.
- Поля й статуси розширення входять у схему через `invoiceSchemaFor(extension)`, `invoiceCardSchemaFor(extension)`, `creditNoteSchemaFor(extension)` і `creditNoteCardSchemaFor(extension)`.

## Моки

```ts
import { createDocumentFlowHandlers } from "@/lib/mock-document-flow"
import { createJobHandlers } from "@/lib/mock-jobs"
import { createNumberingMocks } from "@/lib/mock-numbering"
import { createPeriodLockMocks } from "@/lib/mock-period-lock"
import { createInvoicesMocks, invoicesNumberingSeeds } from "@/modules/K2-invoices/mocks"
import { createSalesMocks, salesNumberingSeeds } from "@/modules/B3-sales/mocks"
import { createCompanyMocks } from "@/modules/A1-company/mocks"

const options = { companies: ["company-a"], locale: "uk" } as const
const invoiceSeeds = invoicesNumberingSeeds(options)
const salesSeeds = salesNumberingSeeds(options)
const numbering = createNumberingMocks({
  series: [...salesSeeds.series, ...invoiceSeeds.series],
  counters: [...salesSeeds.counters, ...invoiceSeeds.counters],
})
const periodLock = createPeriodLockMocks({ seeds: [{ companyId: "company-a", lockedThrough: "2026-10-20" }] })
const company = createCompanyMocks({ companies: ["company-a"] })
const invoices = createInvoicesMocks({
  ...options,
  numbering,
  periodLock,
  // Рахунок у валюті: курс на дату з таблиці курсів модуля A1.
  rates: { baseCurrency: () => "UAH", rateOn: company.rateOn },
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

- Фікстури — українською чи англійською (`locale`), дати від сьогодні (`today` у тестах): чернетки (одна на 14 рядків із розділами), виставлені (свіжий, прострочений, зі знижкою, давній), скасований із виправленою копією, сторнований зі сторно; у кінці — рахунки у валюті (чернетка в доларах, виставлений сьогодні в євро, чернетка в злотих на дату без курсу). Суму в базовій валюті вони мають лише з `rates`; «сервер» моків рахує курс чернетки на кожен запис, а не на читання. `clients` (з реквізитами `party`), `supplier` і `dictionaries` — клієнти, реквізити компанії й знімки довідників проекту; без них — свої модуля з правильними тестовими кодами й IBAN.
- Кредит-ноти засіву: у кожній компанії виставлена на частину рахунку зі знижкою документа й чернетка на весь рахунок у євро.
- Сценарії `success`, `error`, `empty`, `slow`, `conflict`, `forbidden`, `offline` — ресурсів `sales-invoices` і `sales-credit-notes`. У `conflict` колега переносить «Сплатити до» рахунку на тиждень, дату кредит-ноти — на день.
- Моки беруть лише дані розширення без компонентів (`InvoicesMockExtension`).

## Оновлення

Командою кіта в проекті (`docs/using-erp-ui.md` кіта, розділ 8): `node scripts/erp-ui-kit.mjs update vX.Y.Z --dry-run`, далі без `--dry-run`. Нове в модулі — сумісні доповнення типу розширення (мінорна версія); несумісна зміна — мажорна.
