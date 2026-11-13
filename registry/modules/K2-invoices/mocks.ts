/**
 * Моки модуля K2 на MSW (ADR-0002, ADR-0003): рахунки з рядками й сторонами (зберігаються разом із
 * записом, суми рахує «сервер»), дії графа з номером на проведенні (ADR-0057, ADR-0058), виправлена копія
 * й сторно, масові дії графа й «Видалити» чернетки фоновою задачею (ADR-0066), закриті періоди (PF13,
 * ADR-0069). Сценарії `success`, `error`, `empty`, `slow`, `conflict`, `forbidden`, `offline` — ресурсу
 * `sales-invoices` (`lib/mock-scenarios`, панель розробника), права — `sales-invoices:<дія>`.
 *
 *   const seeds = invoicesNumberingSeeds({ companies })
 *   const numbering = createNumberingMocks({ series: [...seeds.series], counters: [...seeds.counters] })
 *   const invoices = createInvoicesMocks({ companies, numbering, periodLock, releaseOrder: (removed) =>
 *     sales.releaseOrderInvoice(removed) })
 *   const sales = createSalesMocks({ ..., invoices: { create: invoices.fromOrder, hasActive: invoices.hasActive } })
 *   const flow = createDocumentFlowHandlers({ sources: [...sales.flowSources, ...invoices.flowSources] })
 *   setupWorker(...platform, ...numbering.handlers, ...createJobHandlers(), ...flow, ...invoices.handlers)
 *
 * - Рахунок — обліковий документ: з `periodLock` (`createPeriodLockMocks`) у закритому періоді його не
 *   створюють і не змінюють (422 `period_locked` біля дати), на записі — позначка на всі дії, крім сторно.
 *   Виправлена копія, сторно й рахунок із замовлення датуються сьогодні, а коли період закрито пізніше —
 *   першим відкритим днем.
 * - Рахунок із замовлення модуля B3 — `fromOrder` (для `createSalesMocks({ invoices })`): модулі не
 *   імпортують один одного, зв'язок — у застосунку. Видалена чернетка з замовлення звільняє його
 *   (`releaseOrder`).
 * - Нумерація — спільна для всіх документів проекту: модуль дає засів серії `sales-invoices`
 *   (`invoicesNumberingSeeds`) і бере `numbering.forResource`.
 * - Кредит-ноти (ADR-0072) — свій ресурс `sales-credit-notes` у тих самих моках: дія рахунку `creditNote`
 *   створює чернетку, кількість рядка разом із виставленими кредит-нотами не більша, ніж у рахунку, картка
 *   рахунку має `creditedTotal`, рахунок із виставленою кредит-нотою не скасовують і не сторнують (`linked`).
 *   Серія номерів `sales-credit-notes` — у `invoicesNumberingSeeds`, сховище — `creditNotesDb`.
 * - Рахунок у валюті (ADR-0071): з `rates` (базова валюта й `rateOn` моків A1) сервер рахує `exchange` —
 *   у чернетки на кожен запис, на «Виставити» закріплює; сторно бере курс першого. Курс чернетки моки
 *   оновлюють під час запису, а не читання: новий курс у таблиці чернетка побачить після збереження.
 * - Оплати модуля K4 (ADR-0073): з `payments` (`paidTotal` моків K4) картка рахунку має `paidTotal`, сервер
 *   ставить «Оплачено» рахунку, який оплати разом із кредит-нотами покрили, і знімає, коли оплату скасували;
 *   з `refundedTotal` (ADR-0083) — ще й `refundedTotal`, повернення зменшує переплату. Рахунок з оплатою чи
 *   поверненням, що діє, не скасовують і не сторнують (`has_payments`). Моки K4 беруть рахунки з
 *   `forPayments`. З оплатами є й звіт старіння боргу `GET /sales-invoices/aging` (ADR-0084).
 */
import type { LocalizedText } from "@/lib/auth"
import { addDays, todayIn, type CalendarDate } from "@/lib/dates"
import type { PartyDetails } from "@/lib/document-parties"
import { withMockValues } from "@/lib/extension-fields"
import {
  documentLinesText,
  LIFECYCLE_LINK_FIELDS,
  storedDocumentSchema,
  withoutServerFields,
  withTransitionSamples,
} from "@/lib/mock-documents"
import { createBulkHandlers } from "@/lib/mock-jobs"
import type {
  MockNumberingCounterSeed,
  MockNumberingSeriesSeed,
  NumberingMocks,
} from "@/lib/mock-numbering"
import type { createPeriodLockMocks } from "@/lib/mock-period-lock"
import type { MockDeniedRule } from "@/lib/mock-scope"
import {
  bulkTransitionActions,
  createTransitionHandlers,
  documentDeniedActions,
  mockCreatedDocument,
  releaseAmendedFrom,
  type MockCreatedDocument,
} from "@/lib/mock-transitions"
import { createResourceHandlers } from "@/lib/mocks"
import { mergeTransitions } from "@/lib/statuses"

import {
  CREATE_CREDIT_NOTE,
  CREDIT_NOTES,
  DEFAULT_INVOICE_STATUS,
  INVOICE_DUE_DAYS,
  INVOICE_TRANSITIONS,
  invoiceSchemaFor,
  INVOICES,
  INVOICES_RESOURCES,
  REVERSAL_STATUS,
  type InvoiceCard,
} from "./contract"
import {
  createCreditNoteFixtures,
  CREDIT_NOTE_NUMBER_TEMPLATE,
} from "./credit-note-fixtures"
import type { InvoicesMockExtension } from "./extension"
import { createAgingHandler } from "./mock-aging"
import { createCreditNoteHandlers } from "./mock-credit-note-handlers"
import { invoiceCreditDeniedActions } from "./mock-credit-notes"
import { invoiceExchange, reversedExchange } from "./mock-exchange"
import {
  createInvoiceFixtures,
  INVOICE_NUMBER_TEMPLATE,
  invoiceFixtureParties,
  type InvoiceFixtureOptions,
} from "./fixtures"
import {
  invoiceFromOrder,
  invoicesFlowSource,
  isActiveInvoice,
  type InvoiceOrderSource,
} from "./mock-links"
import {
  invoicePaymentDeniedActions,
  invoicePaymentsLink,
  type InvoiceMockPayments,
} from "./mock-payments"

export type { InvoiceOrderSource } from "./mock-links"
export type { InvoiceMockRates } from "./mock-exchange"
export {
  invoicePaymentSeed,
  type InvoiceMockPayments,
  type InvoicePaymentSource,
  type InvoicesForPayments,
} from "./mock-payments"

/** Закриті періоди застосунку: правила сервера для ресурсу й дата закриття компанії. */
type PeriodLockMocks = Pick<
  ReturnType<typeof createPeriodLockMocks>,
  "forResource" | "lockedThrough"
>

export interface InvoicesMocksOptions extends InvoiceFixtureOptions {
  /** Нумерація проекту з серією `sales-invoices` (`invoicesNumberingSeeds`): номер на проведенні. */
  readonly numbering: Pick<NumberingMocks, "forResource">
  /** Поля, статуси й переходи розширення проекту — дані без компонентів. */
  readonly extension?: InvoicesMockExtension
  /** Початок адрес API, як у `createResourceHandlers` (за замовчуванням `/api/v1`). */
  readonly baseUrl?: string
  /** Свої заборони проекту на записі (`deniedActions`, ADR-0037): зводяться з позначками життєвого циклу. */
  readonly deniedActions?: MockDeniedRule<InvoiceCard>
  /** Закриті періоди (PF13): без них рахунки не знають про закриття. */
  readonly periodLock?: PeriodLockMocks
  /** Видалили чернетку рахунку з замовлення: моки B3 звільняють замовлення (`releaseOrderInvoice`). */
  readonly releaseOrder?: (removed: {
    readonly id: string
    readonly orderId?: string | null
  }) => void
  /**
   * Оплати модуля K4 (ADR-0073): сума оплат, що діють, за рахунком (`paymentsMocks.paidTotal`) і повернень
   * (`paymentsMocks.refundedTotal`, ADR-0083). Без них рахунок не знає про оплати: статусу «Оплачено» й
   * `paidTotal` немає.
   */
  readonly payments?: InvoiceMockPayments
}

/**
 * Поля, які сервер веде сам: виправлена копія їх не бере, а отримує нові (дата — теж). `orderId` копія
 * бере: вона замінює скасований рахунок у тому самому процесі.
 */
const SERVER_FIELDS = new Set([
  "id",
  "version",
  "companyId",
  "number",
  "status",
  "docStatus",
  ...LIFECYCLE_LINK_FIELDS,
  "total",
  "totals",
  "exchange",
  "date",
  "dueDate",
  "deniedActions",
  "pinned",
])

/** Що сторно не бере: поля сервера й зв'язок із замовленням — замовлення лишається за першим рахунком. */
const REVERSAL_SKIPPED = new Set([...SERVER_FIELDS, "orderId"])

const FIELD_LABELS = {
  number: { uk: "Номер", en: "Number" },
  clientName: { uk: "Клієнт", en: "Client" },
  date: { uk: "Дата", en: "Date" },
  dueDate: { uk: "Сплатити до", en: "Payment due" },
  status: { uk: "Статус", en: "Status" },
  docStatus: { uk: "Стан документа", en: "Document state" },
  lines: { uk: "Рядки", en: "Lines" },
  discountPercent: { uk: "Знижка, %", en: "Discount, %" },
  discountAmount: { uk: "Знижка сумою", en: "Discount amount" },
  supplier: { uk: "Постачальник", en: "Supplier" },
  buyer: { uk: "Покупець", en: "Buyer" },
} satisfies Record<string, LocalizedText>

/** Сторона в журналі: назва й код, а не JSON реквізитів. */
const partyText = (party: PartyDetails) =>
  [party.name, party.code].filter(Boolean).join(", ")

/**
 * Засів серій `sales-invoices` і `sales-credit-notes` для `createNumberingMocks` (ADR-0058, ADR-0072):
 * шаблони мовою даних у кожній компанії й лічильники, які фікстури вже видали. Ті самі опції, що й у
 * `createInvoicesMocks`.
 */
export function invoicesNumberingSeeds(options: InvoiceFixtureOptions = {}): {
  series: MockNumberingSeriesSeed[]
  counters: MockNumberingCounterSeed[]
} {
  const locale = options.locale ?? "uk"
  const fixtures = createInvoiceFixtures(options)
  const templates = [
    [INVOICES, INVOICE_NUMBER_TEMPLATE[locale]],
    [CREDIT_NOTES, CREDIT_NOTE_NUMBER_TEMPLATE[locale]],
  ] as const
  return {
    series: (options.companies ?? [null]).flatMap((companyId) =>
      templates.map(([resource, template]) => ({
        companyId,
        resource,
        template,
      })),
    ),
    counters: [
      ...fixtures.counters,
      ...createCreditNoteFixtures(fixtures.invoices, options).counters,
    ],
  }
}

export function createInvoicesMocks({
  numbering,
  extension,
  baseUrl,
  deniedActions,
  periodLock,
  releaseOrder,
  payments,
  ...fixtureOptions
}: InvoicesMocksOptions) {
  const { rates } = fixtureOptions
  const invoiceExtension = extension?.invoices
  const transitions = mergeTransitions(
    INVOICE_TRANSITIONS,
    invoiceExtension?.transitions,
  )
  // Кредит-ноту до рахунку закритого періоду роблять, як сторно: вона датується сьогодні (ADR-0072).
  const lock = periodLock?.forResource<InvoiceCard>({
    resource: INVOICES,
    dateField: "date",
    actions: transitions
      .map((transition) => transition.id)
      .filter((id) => id !== CREATE_CREDIT_NOTE),
  })
  /** Дата нового документа сервера: сьогодні, а в закритому періоді — перший відкритий день. */
  const openDay = (companyId: string | null | undefined): CalendarDate => {
    const today = fixtureOptions.today ?? todayIn()
    const lockedThrough = periodLock?.lockedThrough(companyId ?? null)
    const firstOpen = lockedThrough ? addDays(lockedThrough, 1) : null
    return firstOpen && firstOpen > today ? firstOpen : today
  }
  // Свіжі фікстури на кожне скидання моків: записи змінюються на місці (PATCH, дії).
  const fixtures = () =>
    withMockValues(
      withTransitionSamples(
        paymentsLink.settledSeed(),
        invoiceExtension?.statuses,
        invoiceExtension?.transitions,
      ),
      invoiceExtension?.fields,
    )
  // Сховища — нижче: зв'язок звертається до них лише на запит.
  const paymentsLink = invoicePaymentsLink({
    fixtureOptions,
    payments,
    invoices: () => invoices.db,
    creditNotes: () => creditNotes.db.all(),
  })
  const { settlement } = paymentsLink
  const stored = storedDocumentSchema<InvoiceCard>(
    invoiceSchemaFor(invoiceExtension),
    {
      dueField: "dueDate",
      draftStatus: DEFAULT_INVOICE_STATUS,
      totalSign: (record) => (record.status === REVERSAL_STATUS ? -1 : 1),
    },
  )
  const invoices = createResourceHandlers<InvoiceCard>({
    resource: INVOICES,
    baseUrl,
    // Курс чернетки — свіжий на кожен запис; проведений і скасований тримають закріплений (ADR-0071).
    schema: stored.transform((invoice): InvoiceCard =>
      invoice.docStatus === "draft"
        ? { ...invoice, exchange: invoiceExchange(invoice, rates) }
        : invoice,
    ),
    data: fixtures,
    searchFields: ["number", "clientName"],
    titleField: "clientName",
    label: INVOICES_RESOURCES[0]?.label,
    fieldLabels: FIELD_LABELS,
    detailFields: ["lines", "totals"],
    // Суми кредит-нот і оплат — лише в картці: список їх не віддає.
    detail: (invoice) => ({
      creditedTotal: settlement.credited(invoice.id),
      ...(payments ? { paidTotal: settlement.paid(invoice.id) } : {}),
      ...(payments?.refundedTotal
        ? { refundedTotal: settlement.refunded(invoice.id) }
        : {}),
    }),
    serverFields: [
      ...LIFECYCLE_LINK_FIELDS,
      "orderId",
      "exchange",
      "creditedTotal",
      "paidTotal",
      "refundedTotal",
    ],
    auditValue: {
      lines: documentLinesText,
      supplier: partyText,
      buyer: partyText,
    },
    // Видалена виправлена копія звільняє скасований рахунок, а чернетка з замовлення — замовлення.
    afterDelete: (invoice) => {
      releaseAmendedFrom(invoices.db, invoice)
      releaseOrder?.(invoice)
    },
    // Причини життєвого циклу важливіші: закритий період додає лише дії, яких ще ніщо не забороняє.
    deniedActions: (actor, invoice) => {
      const denied = {
        ...lock?.deniedActions(actor, invoice),
        ...invoicePaymentDeniedActions(
          invoice,
          settlement.paid(invoice.id) + settlement.refunded(invoice.id),
        ),
        ...invoiceCreditDeniedActions(
          invoice,
          creditNotes.db.all(),
          CREATE_CREDIT_NOTE,
        ),
        ...documentDeniedActions(invoice),
        ...deniedActions?.(actor, invoice),
      }
      return Object.keys(denied).length ? denied : undefined
    },
    ...(lock
      ? { validateWrite: lock.validateWrite, afterWrite: lock.afterWrite }
      : {}),
  })
  const creditNotes = createCreditNoteHandlers({
    invoices: invoices.db,
    numbering,
    extension: extension?.creditNotes,
    baseUrl,
    periodLock,
    openDay,
    data: () =>
      createCreditNoteFixtures(
        createInvoiceFixtures(fixtureOptions).invoices,
        fixtureOptions,
      ).creditNotes,
    // Кредит-нота змінює борг: рахунок, який оплати разом із нею покрили, — «Оплачено» (ADR-0073).
    ...(payments ? { settleInvoice: paymentsLink.settle } : {}),
  })
  const invoiceNumbering = numbering.forResource({
    resource: INVOICES,
    db: invoices.db,
  })
  /** «Виставити» закріплює курс на дату рахунку й суму в базовій валюті (ADR-0071). */
  const submitFields = (invoice: InvoiceCard) => ({
    exchange: invoiceExchange(invoice, rates),
  })
  const invoiceTransitions = createTransitionHandlers<InvoiceCard>({
    resource: INVOICES,
    baseUrl,
    db: invoices.db,
    transitions,
    // Виправлена копія — нова чернетка з тими самими клієнтом, сторонами, рядками й полями розширення.
    amend: (invoice) => {
      const date = openDay(invoice.companyId)
      return {
        ...withoutServerFields(invoice, SERVER_FIELDS),
        date,
        dueDate: addDays(date, INVOICE_DUE_DAYS),
        status: DEFAULT_INVOICE_STATUS,
      }
    },
    // Сторно — проведений рахунок із тими самими рядками й сторонами, сума в списку з мінусом; курс —
    // першого рахунку, тож у базовій валюті сторно гасить його до копійки.
    reverse: (invoice) => {
      const date = openDay(invoice.companyId)
      return {
        ...withoutServerFields(invoice, REVERSAL_SKIPPED),
        date,
        dueDate: date,
        status: REVERSAL_STATUS,
        exchange: reversedExchange(invoice.exchange),
      }
    },
    // Колега в сценарії `conflict` переносить «Сплатити до» на тиждень.
    conflictChange: (invoice) => ({ dueDate: addDays(invoice.dueDate, 7) }),
    numbering: invoiceNumbering,
    submitFields,
    creates: { [CREATE_CREDIT_NOTE]: creditNotes.fromInvoice },
    ...(lock ? { afterTransition: lock.afterTransition } : {}),
  })
  const invoiceBulk = createBulkHandlers<InvoiceCard>({
    resource: INVOICES,
    baseUrl,
    db: invoices.db,
    // Чернетка без номера — у звіті клієнтом.
    title: (invoice) => invoice.number ?? invoice.clientName,
    actions: {
      ...bulkTransitionActions(
        {
          resource: INVOICES,
          transitions,
          numbering: invoiceNumbering,
          submitFields,
        },
        ["submit", "cancel"],
      ),
      // Виставлений і скасований не дає позначка `deniedActions.delete`: невдача з її кодом.
      delete: { apply: () => ({ remove: true }) },
    },
  })
  // Старіння боргу — лише з оплатами: без них рахунок не має боргу (ADR-0073).
  const aging = payments
    ? [
        createAgingHandler({
          baseUrl,
          db: invoices.db,
          settlement,
          rates,
          today: () => fixtureOptions.today ?? todayIn(),
        }),
      ]
    : []
  const parties = invoiceFixtureParties(fixtureOptions)
  const fromOrder: MockCreatedDocument<InvoiceOrderSource> =
    mockCreatedDocument<InvoiceOrderSource, InvoiceCard>({
      resource: INVOICES,
      db: invoices.db,
      body: (order) =>
        invoiceFromOrder(order, {
          date: openDay(order.companyId),
          parties,
          fields: invoiceExtension?.fields,
        }),
      mark: (invoiceId) => ({ invoiceId }),
    })
  return {
    // Масові дії, дії й звіт — перед ресурсом: `/sales-invoices/aging` і `POST /sales-invoices/…/<дія>` не
    // мають дійти до обробників запису.
    handlers: [
      ...aging,
      ...invoiceBulk,
      ...invoiceTransitions,
      ...creditNotes.handlers,
      ...invoices.handlers,
    ],
    db: invoices.db,
    /** Кредит-ноти (ADR-0072): скидання в тестах, події моку. */
    creditNotesDb: creditNotes.db,
    /** Рахунок-чернетка з замовлення B3: `createSalesMocks({ invoices: { create: fromOrder, hasActive } })`. */
    fromOrder,
    /** З замовлення є рахунок, що діє (не скасований і не сторнований): замовлення тоді не скасовують. */
    hasActive: (orderId: string) =>
      invoices.db
        .all()
        .some(
          (invoice) => invoice.orderId === orderId && isActiveInvoice(invoice),
        ),
    /** Джерела потоку документів: для `createDocumentFlowHandlers` застосунку, після джерел B3. */
    flowSources: [invoicesFlowSource(invoices.db), creditNotes.flowSource],
    /** Рахунки для моків оплат модуля K4 (ADR-0073): `createPaymentsMocks({ invoices: forPayments })`. */
    forPayments: paymentsLink.forPayments,
  }
}
