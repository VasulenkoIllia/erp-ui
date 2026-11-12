# K4 «Оплати»

Модуль erp-ui (SPEC §14, §17; ADR-0020, ADR-0025, ADR-0057, ADR-0058, ADR-0069, ADR-0071, ADR-0073, ADR-0083): оплата клієнта за рахунками модуля K2 і повернення грошей клієнту за рахунками з переплатою. Оплата й повернення — облікові документи, проведені одразу з номером своєї серії: закритий період (PF13) їх стосується. Список — шаблон List Report, картка — Object Page, форма — сторінка з рахунками клієнта.

- **Список** — вкладки за статусом («Отримано», «Скасовано», «Сторновано», «Сторно» і статуси розширення), фільтри «Клієнт», «Дата» й «Спосіб», пошук за номером, клієнтом чи призначенням, сортування за номером, датою, клієнтом і сумою. Колонка «Рахунки» — номери рахунків оплати. Сума сторно — з мінусом. «Зареєструвати оплату» — з правом `sales-payments:create`, без нього неактивна з причиною.
- **Картка** — номер («ОП-2026-0001»), статус, клієнт (посилання на його картку, якщо проект її дав), дата, спосіб («Переказ на рахунок», «Картка», «Готівка», «Інше» і способи розширення), сума, у валюті — «У базовій валюті» з курсом на дату оплати, призначення. Над панеллю дій — смуга закритого періоду (`erp/period-lock-banner`). Дії: «Скасувати» з причиною (помилкова оплата у відкритому періоді) і «Сторнувати» з причиною (оплата закритого періоду: нова проведена оплата «Сторно» з датою сьогодні й сумою з мінусом, перша — «Сторновано»). Сторно дій не має. Секції: рахунки оплати з сумою кожному (посилання на картку рахунку, коли проект дав адресу) і потік документів (`erp/document-flow`: оплата «на підставі» кожного рахунку). Праворуч — «Історія» з журналу аудиту чи стрічка зі слота `aside`.
- **Форма** — `…/payments/new`: клієнт із ресурсу клієнтів проекту, «Валюта» (лише коли в клієнта є рахунки в кількох валютах), дата (у закритому періоді — підказка й перший відкритий день, `usePostingDate`), спосіб, сума, призначення (до 140 символів), поля розширення; нижче — рахунки клієнта з боргом у цій валюті, від найранішої «Сплатити до» (прострочений — з позначкою), з сумою кожному. «Розписати від найстаршого» розкладає суму оплати на рахунки по черзі; під списком — скільки розписано з суми оплати й скільки лишилось чи скільки зайве. Переплати й авансу немає (рішення власника 11.11.2026): сума кожному рахунку не більша за його борг, сума оплати дорівнює сумі рознесення — інакше помилка біля поля, і те саме перевіряє сервер. Клієнта не вибрано, рахунків немає, помилка зі «Спробувати ще» й немає доступу — свої стани.
- **З картки рахунку** — модуль K2 з `payments` показує на виставленому рахунку з боргом «Зареєструвати оплату»: форма відкривається з клієнтом, валютою й цим рахунком, сума — його борг. Після реєстрації — назад на картку рахунку.
- **Статус рахунку** — «Оплачено» ставить сервер, а не дія: рахунок, який оплати разом із кредит-нотами покрили. Часткова оплата статусу не змінює: на картці рахунку — «Оплачено» й «До сплати». Скасована чи сторнована оплата повертає рахунку «Виставлено». Рахунок з оплатою, що діє, не скасовують і не сторнують: спершу скасовують чи сторнують оплату.
- **Подвійне натискання** — форма надсилає ключ ідемпотентності `requestId`, один на форму: повтор того самого запиту (подвійне натискання, повтор після втраченої відповіді) повертає ту саму оплату, а не другу.
- **Повернення** (ADR-0083) — клієнт оплатив рахунок, потім частину товару повернули кредит-нотою: рахунок має переплату. Розділ «Повернення» (`…/refunds`) — окремий документ зі своєю серією («ПВ-2026-0001») і правом `sales-refunds:*`, з тими самими списком, карткою й формою, що в оплати; статус нового — «Повернено». У формі — рахунки клієнта з переплатою, кожному не більше за переплату, сума повернення дорівнює сумі рознесення. Модуль K2 з `payments.refunds` показує на рахунку з переплатою «Повернути переплату»: форма з клієнтом і цим рахунком, сума — переплата. Картка рахунку має рядок «Повернено»; статус рахунку повернення не змінює. Скасоване чи сторноване повернення переплату повертає.

## Встановлення

```sh
node scripts/erp-ui-kit.mjs update <версія кіта> --add modules/K4-payments
```

Файли модуля стають у `src/modules/K4-payments/`, спільні компоненти кіта, яких бракує, — на свої місця. Файли модуля в проекті не правляться: так оновлення модуля не конфліктує з правками під клієнта.

## Підключення

```ts
// src/modules.ts
import { createInvoicesModule, invoicesPaths } from "@/modules/K2-invoices"
import { createPaymentsModule, paymentsPaths } from "@/modules/K4-payments"
import { paymentsExtension } from "@/extensions/K4-payments"

export const paymentsModule = createPaymentsModule({
  basePath: "/finance",
  extension: paymentsExtension,
  clients: {
    resource: "organizations",
    labelField: "name",
    descriptionField: "code",
    href: contactsModule.paths.organization,
  },
  // Рахунки модуля K2: ресурс для потоку документів і адреса картки рахунку.
  invoices: { resource: "sales-invoices", href: invoicesPaths("/finance").invoice },
})

// «Зареєструвати оплату» й «Повернути переплату» на картці рахунку: лише адреси, фабрики одна від одної не залежать.
const payments = paymentsPaths("/finance")
export const invoicesModule = createInvoicesModule({
  basePath: "/finance",
  payments: {
    resource: "sales-payments",
    register: payments.newPayment,
    href: payments.payment,
    // Без `refunds` картка рахунку без «Повернути переплату».
    refunds: { resource: "sales-refunds", register: payments.newRefund, href: payments.refund },
  },
})
```

- Маршрути — `paymentsModule.routes`: `basePath: "/finance"` дає `/finance/payments`, `/finance/payments/new` (з картки рахунку — `?client=<id>&invoice=<id>`), `/finance/payments/:id`, повернення — `/finance/refunds`, `/finance/refunds/new` (з картки рахунку — `?client=<id>&invoice=<id>`), `/finance/refunds/:id`; `/finance` веде на список оплат. Коли рахунки й оплати мають той самий `basePath`, у роутер іде маршрут `basePath` лише одного модуля.
- Навігація — `paymentsModule.nav`: «Оплати» (`K4-payments`) з правом `sales-payments:read` і «Повернення» (`K4-refunds`) з правом `sales-refunds:read`.
- Права й ресурси — `paymentsModule.resources`: `sales-payments` з діями `read`, `create` («Зареєструвати оплату»), `cancel`, `reverse` і діями розширення. `sales-refunds` з діями `read`, `create` («Повернути переплату»), `cancel`, `reverse`. Форма читає ресурс клієнтів і рахунки клієнта: з боргом (`GET /sales-payments/open-invoices`, право `sales-payments:create`) чи з переплатою (`GET /sales-refunds/overpaid-invoices`, право `sales-refunds:create`).
- Модуль не імпортує інших модулів: клієнтів і рахунки бере за назвами ресурсів і адресами.
- Рядки модуля — простір імен `K4-payments`.

## Розширення під клієнта

Усе, чим клієнт відрізняється, — у файлі проекту `src/extensions/K4-payments.ts` (тип `PaymentsExtension`):

- `fields` — нові поля шапки; далі `columns`, `filters`, `tabs`, `recordFields`, `form` (`add` поля розширення з місцем, `hide`, `move`, `change` підпису поля модуля);
- `methods` — способи оплати: `add` свого (напр. «Взаємозалік»), `hide` чи `change` підпису способу модуля;
- `statuses` і `transitions` — свій статус і дія до нього (ADR-0057); `change` дії модуля — підпис, `from` і причина, але не `to`;
- `sections` (`allocations`, `flow`), `actions`, `aside`, `history: false`;
- `refunds` — те саме для повернень: `fields`, `statuses`, `transitions`, `columns`, `filters`, `tabs`, `recordFields`, `sections`, `actions`, `form` (тип `RefundsExtension`, ключі `RefundIds`); способи оплати, стрічка й `aside` — спільні з оплатами;
- `strings` — перевизначення рядків модуля за ключами `i18n/uk.json` і `i18n/en.json`.

Ключі модуля — типи `PaymentColumnId`, `PaymentFilterId`, `PaymentFieldId`, `PaymentFormFieldId`, `PaymentSectionId`, `PaymentTransitionId` (`extension.ts`). Типи — з індексу модуля (`import type { Payment, PaymentsExtension } from "@/modules/K4-payments"`).

## Контракт API

`contract.ts` — схеми zod і опис ресурсу (ADR-0002):

- `GET /sales-payments` — оплати: `number`, `date`, `clientId`, `clientName`, `currency`, `amount` (у сторно — з мінусом), `method`, `reference`, `allocations` (`invoiceId`, `invoiceNumber`, `invoiceDate` — знімки рахунку, `amount`), `exchange`, `status`, `docStatus` і зв'язки життєвого циклу.
- `POST /sales-payments` — `requestId` (ключ ідемпотентності, до 64 символів), `date`, `clientId`, `currency`, `method`, `amount`, `reference`, `allocations: [{ invoiceId, amount }]` і поля розширення → 201 проведена оплата з номером серії `sales-payments`. Повтор із тим самим `requestId` → 200 та сама оплата, навіть коли тіло інше. Назву клієнта, номери й дати рахунків бере сервер; номер, статус, стан, версію й зв'язки сторно з тіла запиту не бере. Помилки — 422 `fieldErrors`: `allocations.<індекс>.amount: exceeds_debt` (більше за борг), `allocations.<індекс>.invoiceId: invoice_unavailable` (рахунок не виставлений, не цього клієнта чи валюти, без боргу), `amount: not_allocated` (сума оплати не дорівнює сумі рознесення), `date: period_locked`. Перевірку й запис сервер робить в одній транзакції з блокуванням рядків рахунків, а `requestId` унікальний у компанії: два одночасні запити з різними ключами разом не перевищать борг (повернення — переплату).
- `GET /sales-payments/open-invoices?clientId=<id>` — рахунки клієнта з боргом (`{ data, total }`): `id`, `number`, `date`, `dueDate`, `currency`, `total`, `debt` — «виставлено мінус кредит-ноти мінус оплачено» (ADR-0072), від найранішої «Сплатити до».
- Дії — `POST /sales-payments/:id/<дія>` з `version` і `reason` (ADR-0057): `cancel` (у відкритому періоді), `reverse` — нова проведена оплата зі статусом `reversal`, `reversalOf`, датою сьогодні (перший відкритий день) і сумою з мінусом, перша — `reversed` з `reversedBy`.
- Закритий період (ADR-0069): в оплаті з датою в закритому періоді `deniedActions` з `period_locked` на всі дії, крім `reverse`; реєстрація з такою датою — 422 `period_locked` біля `date`.
- Оплата у валюті (ADR-0071): `exchange` на дату оплати веде сервер; сторно бере курс першої, `baseTotal` з мінусом.
- Рахунок модуля K2 після кожної зміни оплат: `paidTotal` у `GET /sales-invoices/:id`, статус `paid` («Оплачено») — коли оплати разом із кредит-нотами покрили рахунок, інакше `issued`; на рахунку з оплатою, що діє, `deniedActions.cancel` і `reverse` = `"has_payments"`.
- Потік документів — `GET /sales-payments/:id/flow` (ADR-0061): рахунки — `basedOn`.
- Поля й статуси розширення входять у схему через `paymentSchemaFor(extension)`.
- Повернення (ADR-0083) — `GET|POST /sales-refunds`, дії `cancel` і `reverse`, потік `GET /sales-refunds/:id/flow`: поля, тіло, `requestId`, закритий період і валюта — як в оплати, статуси `refunded`, `cancelled`, `reversed`, `reversal`, схема з розширенням — `refundSchemaFor(extension.refunds)`. Помилки: `allocations.<індекс>.amount: exceeds_overpayment` (більше за переплату), `allocations.<індекс>.invoiceId: invoice_unavailable` (у рахунку немає переплати), `amount: not_allocated`.
- `GET /sales-refunds/overpaid-invoices?clientId=<id>` — рахунки клієнта з переплатою: поля як у рахунків з боргом, `overpaid` замість `debt`.
- Рахунок модуля K2 після кожної зміни повернень: `refundedTotal` у `GET /sales-invoices/:id`, борг — `total − creditedTotal − paidTotal + refundedTotal`; статус повернення не змінює; на рахунку з поверненням, що діє, `deniedActions.cancel` і `reverse` = `"has_payments"`.

## Моки

```ts
import { createDocumentFlowHandlers } from "@/lib/mock-document-flow"
import { createNumberingMocks } from "@/lib/mock-numbering"
import { createPeriodLockMocks } from "@/lib/mock-period-lock"
import { createInvoicesMocks, invoicePaymentSeed, invoicesNumberingSeeds } from "@/modules/K2-invoices/mocks"
import { createPaymentsMocks, paymentsNumberingSeeds } from "@/modules/K4-payments/mocks"
import { createCompanyMocks } from "@/modules/A1-company/mocks"

const options = { companies: ["company-a"], locale: "uk" } as const
const company = createCompanyMocks({ companies: ["company-a"] })
const rates = { baseCurrency: () => "UAH", rateOn: company.rateOn }
const invoiceSeeds = invoicesNumberingSeeds(options)
// Засів оплат — від рахунків засіву K2: його будують до моків, як і серію рахунків.
const paymentSeeds = paymentsNumberingSeeds({ invoices: invoicePaymentSeed(options), companies: options.companies, rates })
const numbering = createNumberingMocks({
  series: [...invoiceSeeds.series, ...paymentSeeds.series],
  counters: [...invoiceSeeds.counters, ...paymentSeeds.counters],
})
const periodLock = createPeriodLockMocks({ seeds: [{ companyId: "company-a", lockedThrough: "2026-10-20" }] })
const invoices = createInvoicesMocks({
  ...options,
  numbering,
  periodLock,
  rates,
  // Моки оплат створюються нижче: виклик — лише на запит.
  payments: {
    paidTotal: (invoiceId) => payments.paidTotal(invoiceId),
    refundedTotal: (invoiceId) => payments.refundedTotal(invoiceId),
  },
})
const payments = createPaymentsMocks({ invoices: invoices.forPayments, numbering, periodLock, rates })
const flow = createDocumentFlowHandlers({ sources: [...invoices.flowSources, ...payments.flowSources] })
setupWorker(...platformHandlers, ...numbering.handlers, ...periodLock.handlers, ...flow, ...invoices.handlers,
  ...payments.handlers)
```

- Фікстури — українською чи англійською (`locale`), дати від сьогодні (`today` у тестах), від рахунків засіву K2: у кожній компанії оплата на два рахунки того самого клієнта (новіший сплачено — він «Оплачено», старший прострочений — наполовину), половина боргу рахунку з кредит-нотою карткою, частина рахунку в євро, сторнована оплата найстаршого рахунку зі сторно сьогодні й скасована оплата. Повернення: половина переплати рахунку, сплаченого повністю, на який потім виставили кредит-ноту (засів кредит-нот K2).
- Сценарії `success`, `error`, `empty`, `slow`, `conflict`, `forbidden`, `offline` — ресурсів `sales-payments` і `sales-refunds`. У `conflict` колега дописує призначення.
- Моки беруть лише дані розширення без компонентів (`PaymentsMockExtension`, з `refunds`).
- `paidTotal(invoiceId)` і `refundedTotal(invoiceId)` — суми оплат і повернень, що діють, для моків K2; `refundsDb` — сховище повернень.

## Оновлення

Командою кіта в проекті (`docs/using-erp-ui.md` кіта, розділ 8): `node scripts/erp-ui-kit.mjs update vX.Y.Z --dry-run`, далі без `--dry-run`. Нове в модулі — сумісні доповнення типу розширення (мінорна версія); несумісна зміна — мажорна.
