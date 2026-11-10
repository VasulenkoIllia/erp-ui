/**
 * Моки модуля B3 на MSW (ADR-0002, ADR-0003): пропозиції й замовлення з рядками (зберігаються разом із
 * записом, суми рахує «сервер»), дії графа переходів з номером на проведенні (ADR-0057, ADR-0058),
 * масові дії графа й «Видалити» чернетки фоновою задачею (ADR-0066). Сценарії `success`, `error`,
 * `empty`, `slow`, `conflict`, `forbidden`, `offline` — ресурсів `quotes` і `orders`
 * (`lib/mock-scenarios`, панель розробника), права — `<ресурс>:<дія>` поточного користувача моків.
 *
 *   const seeds = salesNumberingSeeds({ companies })
 *   const numbering = createNumberingMocks({ series: [...seeds.series], counters: [...seeds.counters] })
 *   const sales = createSalesMocks({ companies, numbering, extension: salesMockExtension })
 *   const flow = createDocumentFlowHandlers({ sources: [...sales.flowSources] })
 *   setupWorker(...platform, ...numbering.handlers, ...createJobHandlers(), ...flow, ...sales.handlers)
 *
 * Хід масової задачі (`GET /jobs/:id`) — спільний на застосунок (`createJobHandlers` з lib/mock-jobs),
 * як і нумерація: модуль дає лише `POST /<ресурс>/bulk/<дія>`. Потік документів (`GET /<ресурс>/:id/flow`,
 * ADR-0061) — теж один на застосунок (`createDocumentFlowHandlers` з lib/mock-document-flow): модуль
 * дає джерела `flowSources` у порядку процесу (пропозиції, замовлення), а документи інших модулів
 * (рахунки K2a) стають у той самий потік своїми джерелами.
 *
 * Замовлення з пропозиції (`POST /quotes/:id/order`, ADR-0067): нова чернетка з клієнтом, рядками й
 * знижкою пропозиції, `quoteId` на замовленні й `orderId` на пропозиції; повторно — 403 `linked`.
 * Пропозицію з нескасованим замовленням не скасовують (`linked`, і масово). Видалена чернетка
 * замовлення звільняє пропозицію. Поля розширення замовлення беруть значення полів пропозиції з тим
 * самим ключем (ADR-0070).
 *
 * Рахунок із замовлення (`POST /orders/:id/invoice`, ADR-0070) — лише з опцією `invoices` (моки модуля K2):
 * `invoiceId` на замовленні, повторно — 403 `linked`, замовлення з рахунком, що діє, не скасовують.
 *
 * Нумерація — спільна для всіх документів проекту (`createNumberingMocks` один на застосунок), тож
 * модуль не створює своєї: дає засів серій `quotes` і `orders` з лічильниками (`salesNumberingSeeds`) і
 * бере `numbering.forResource`. Поля, статуси й переходи розширення проекту (`SalesMockExtension`) — у
 * схемі, у фікстурах і в графі переходів.
 */
import type { z } from "zod"

import type { LocalizedText } from "@/lib/auth"
import { addDays, todayIn, type CalendarDate } from "@/lib/dates"
import { withMockValues } from "@/lib/extension-fields"
import type {
  MockNumberingCounterSeed,
  MockNumberingSeriesSeed,
  NumberingMocks,
} from "@/lib/mock-numbering"
import {
  documentLinesText,
  LIFECYCLE_LINK_FIELDS,
  storedDocumentSchema,
  withoutServerFields,
  withTransitionSamples,
  type CalendarFieldOf,
} from "@/lib/mock-documents"
import { createBulkHandlers } from "@/lib/mock-jobs"
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
import type { RecordDeniedActions } from "@/lib/record-access"
import {
  mergeTransitions,
  type ExtensionTransitionChanges,
  type StatusTransition,
} from "@/lib/statuses"

import {
  CREATE_INVOICE,
  CREATE_ORDER,
  DEFAULT_ORDER_STATUS,
  DEFAULT_QUOTE_STATUS,
  ORDER_TRANSITIONS,
  orderSchemaFor,
  ORDERS,
  QUOTE_TRANSITIONS,
  QUOTES,
  quoteSchemaFor,
  SALES_RESOURCES,
  type OrderCard,
  type QuoteCard,
  type SalesDocument,
  type SalesDocumentDetail,
  type SalesSchemaExtension,
} from "./contract"
import type { SalesMockExtension } from "./extension"
import {
  createSalesFixtures,
  ORDER_NUMBER_TEMPLATE,
  QUOTE_NUMBER_TEMPLATE,
  type SalesFixtureOptions,
} from "./fixtures"
import {
  NEW_DUE_DAYS,
  orderFromQuote,
  orderInvoiceDenials,
  quoteOrderDenials,
  releaseOrderInvoice,
  releaseQuoteOrder,
  salesFlowSources,
  type SalesInvoiceMocks,
} from "./mock-links"

export type { SalesInvoiceMocks } from "./mock-links"

export interface SalesMocksOptions extends SalesFixtureOptions {
  /** Нумерація проекту з серіями `quotes` і `orders` (`salesNumberingSeeds`): номер на проведенні. */
  readonly numbering: Pick<NumberingMocks, "forResource">
  /** Поля, статуси й переходи розширення проекту — дані без компонентів. */
  readonly extension?: SalesMockExtension
  /** Початок адрес API, як у `createResourceHandlers` (за замовчуванням `/api/v1`). */
  readonly baseUrl?: string
  /** Свої заборони проекту на записі (`deniedActions`, ADR-0037): зводяться з позначками життєвого циклу. */
  readonly deniedActions?: {
    readonly quotes?: MockDeniedRule<QuoteCard>
    readonly orders?: MockDeniedRule<OrderCard>
  }
  /**
   * Рахунки модуля K2 (ADR-0070): «Виставити рахунок» із замовлення. Без них дії в графі замовлення
   * немає. Видалена чернетка рахунку звільняє замовлення — `releaseOrderInvoice` результату.
   */
  readonly invoices?: SalesInvoiceMocks
}

/**
 * Поля, які сервер веде сам: копія їх не бере, а отримує нові (друга дата — теж). `quoteId`
 * виправлена копія замовлення бере: вона замінює скасоване в тому самому процесі.
 */
const SERVER_FIELDS = new Set([
  "id",
  "version",
  "companyId",
  "number",
  "status",
  "docStatus",
  ...LIFECYCLE_LINK_FIELDS,
  "orderId",
  "invoiceId",
  "total",
  "totals",
  "date",
  "deniedActions",
  "pinned",
])

const labelOf = (name: string) =>
  SALES_RESOURCES.find((resource) => resource.name === name)?.label

/** Підписи полів у журналі, спільні для документів продажу. */
const COMMON_FIELD_LABELS = {
  number: { uk: "Номер", en: "Number" },
  clientName: { uk: "Клієнт", en: "Client" },
  date: { uk: "Дата", en: "Date" },
  status: { uk: "Статус", en: "Status" },
  docStatus: { uk: "Стан документа", en: "Document state" },
  lines: { uk: "Рядки", en: "Lines" },
  discountPercent: { uk: "Знижка, %", en: "Discount, %" },
  discountAmount: { uk: "Знижка сумою", en: "Discount amount" },
} satisfies Record<string, LocalizedText>

/**
 * Засів серій `quotes` і `orders` для `createNumberingMocks` (ADR-0058): шаблон мовою даних у кожній
 * компанії й лічильники, які фікстури вже видали. Ті самі опції, що й у `createSalesMocks`.
 */
export function salesNumberingSeeds(options: SalesFixtureOptions = {}): {
  series: MockNumberingSeriesSeed[]
  counters: MockNumberingCounterSeed[]
} {
  const locale = options.locale ?? "uk"
  const templates = [
    { resource: QUOTES, template: QUOTE_NUMBER_TEMPLATE[locale] },
    { resource: ORDERS, template: ORDER_NUMBER_TEMPLATE[locale] },
  ]
  return {
    series: templates.flatMap(({ resource, template }) =>
      (options.companies ?? [null]).map((companyId) => ({
        companyId,
        resource,
        template,
      })),
    ),
    counters: createSalesFixtures(options).counters,
  }
}

/** Ресурс документа продажу в моку: що відрізняє пропозицію від замовлення. */
interface DocumentMockSpec<T extends SalesDocument & SalesDocumentDetail> {
  readonly resource: typeof QUOTES | typeof ORDERS
  schema(extension?: SalesSchemaExtension): z.ZodType<SalesDocument>
  readonly draftStatus: string
  readonly dueField: CalendarFieldOf<T>
  readonly dueLabel: LocalizedText
  readonly transitions: readonly StatusTransition[]
  /** Дії графа, які список запускає масово (ADR-0066). */
  readonly bulk: readonly string[]
  /** Зв'язки з іншим видом (`orderId`, `quoteId`): їх ставить лише сервер, не POST і PATCH клієнта. */
  readonly serverFields: readonly (keyof T & string)[]
  readonly fixtures: () => T[]
  /** Дії графа, яких у проекті немає (`invoice` без рахунків). */
  readonly omit?: readonly string[]
}

/** Розширення ресурсу для моків: поля, статуси й переходи. */
type MockDocumentExtension = SalesSchemaExtension & {
  readonly transitions?: ExtensionTransitionChanges
}

/** Ресурс, дії графа з номером на проведенні й масові дії одного документа продажу. */
function createDocumentMocks<T extends SalesDocument & SalesDocumentDetail>(
  spec: DocumentMockSpec<T>,
  {
    numbering,
    extension,
    baseUrl,
    deniedActions,
    linkDenials,
    creates,
    afterDelete,
  }: {
    numbering: SalesMocksOptions["numbering"]
    extension: MockDocumentExtension | undefined
    baseUrl: string | undefined
    deniedActions: MockDeniedRule<T> | undefined
    /** Позначки зв'язків з іншими документами модуля (`linked`). */
    linkDenials?: (document: T) => RecordDeniedActions | undefined
    /** Дії, що створюють документ іншого ресурсу (`creates` графа). */
    creates?: Readonly<Record<string, MockCreatedDocument<T>>>
    /** Що ще звільняє видалена чернетка: пропозицію видаленого замовлення. */
    afterDelete?: (document: T) => void
  },
) {
  const { resource, dueField } = spec
  const transitions = mergeTransitions(
    spec.transitions.filter(
      (transition) => !spec.omit?.includes(transition.id),
    ),
    extension?.transitions,
  )
  // Свіжі фікстури на кожне скидання моків: записи змінюються на місці (PATCH, дії).
  const fixtures = () =>
    withMockValues(
      withTransitionSamples(
        spec.fixtures(),
        extension?.statuses,
        extension?.transitions,
      ),
      extension?.fields,
    )
  const documents = createResourceHandlers<T>({
    resource,
    baseUrl,
    schema: storedDocumentSchema<T>(spec.schema(extension), {
      dueField,
      draftStatus: spec.draftStatus,
    }),
    data: fixtures,
    searchFields: ["number", "clientName"],
    titleField: "clientName",
    label: labelOf(resource),
    fieldLabels: {
      ...COMMON_FIELD_LABELS,
      [dueField]: spec.dueLabel,
    } as Partial<Record<keyof T & string, LocalizedText>>,
    detailFields: ["lines", "totals"],
    serverFields: [...LIFECYCLE_LINK_FIELDS, ...spec.serverFields],
    auditValue: { lines: documentLinesText } as Partial<
      Record<keyof T & string, (value: never) => string[]>
    >,
    // Видалена виправлена копія звільняє скасований документ: його можна виправити знову (ADR-0066).
    afterDelete: (document) => {
      releaseAmendedFrom(documents.db, document)
      afterDelete?.(document)
    },
    // Проведений і скасований не змінюють, виправлений удруге не виправляють (ADR-0057).
    deniedActions: (actor, document) => {
      const denied = {
        ...documentDeniedActions(document),
        ...linkDenials?.(document),
        ...deniedActions?.(actor, document),
      }
      return Object.keys(denied).length ? denied : undefined
    },
  })
  const documentNumbering = numbering.forResource({
    resource,
    db: documents.db,
  })
  const documentTransitions = createTransitionHandlers<T>({
    resource,
    baseUrl,
    db: documents.db,
    transitions,
    // Виправлена копія — нова чернетка з тими самими клієнтом, рядками й полями розширення.
    amend: (document) => {
      const today = todayIn()
      return {
        ...withoutServerFields(document, SERVER_FIELDS),
        date: today,
        [dueField]: addDays(today, NEW_DUE_DAYS[resource]),
        status: spec.draftStatus,
      }
    },
    // Колега в сценарії `conflict` переносить другу дату на тиждень.
    conflictChange: (document) =>
      ({
        [dueField]: addDays(document[dueField] as CalendarDate, 7),
      }) as Partial<T>,
    numbering: documentNumbering,
    ...(creates ? { creates } : {}),
  })
  const documentBulk = createBulkHandlers<T>({
    resource,
    baseUrl,
    db: documents.db,
    // Чернетка без номера — у звіті клієнтом.
    title: (document) => document.number ?? document.clientName,
    actions: {
      ...bulkTransitionActions(
        { resource, transitions, numbering: documentNumbering },
        spec.bulk,
      ),
      // Проведений і скасований не дає позначка `deniedActions.delete`: невдача з її кодом.
      delete: { apply: () => ({ remove: true }) },
    },
  })
  return {
    // Масові дії й дії — перед ресурсом: `POST /<ресурс>/…/<дія>` не має дійти до обробників запису.
    handlers: [...documentBulk, ...documentTransitions, ...documents.handlers],
    db: documents.db,
  }
}

export function createSalesMocks({
  numbering,
  extension,
  baseUrl,
  deniedActions,
  invoices,
  ...fixtureOptions
}: SalesMocksOptions) {
  const fixtures = () => createSalesFixtures(fixtureOptions)
  // Замовлення — першими: дія пропозиції «Створити замовлення» пише в їхнє сховище.
  const orders = createDocumentMocks<OrderCard>(
    {
      resource: ORDERS,
      schema: orderSchemaFor,
      draftStatus: DEFAULT_ORDER_STATUS,
      dueField: "dueDate",
      dueLabel: { uk: "Виконати до", en: "Due by" },
      transitions: ORDER_TRANSITIONS,
      bulk: ["submit", "complete", "cancel"],
      serverFields: ["quoteId", "invoiceId"],
      fixtures: () => fixtures().orders,
      omit: invoices ? [] : [CREATE_INVOICE],
    },
    {
      numbering,
      extension: extension?.orders,
      baseUrl,
      deniedActions: deniedActions?.orders,
      ...(invoices
        ? {
            linkDenials: (order: OrderCard) =>
              orderInvoiceDenials(order, invoices),
            creates: { [CREATE_INVOICE]: invoices.create },
          }
        : {}),
      // `quotes` — нижче: видалення буває лише після створення обох ресурсів.
      afterDelete: (order) => {
        releaseQuoteOrder(quotes.db, order)
      },
    },
  )
  const quotes = createDocumentMocks<QuoteCard>(
    {
      resource: QUOTES,
      schema: quoteSchemaFor,
      draftStatus: DEFAULT_QUOTE_STATUS,
      dueField: "validUntil",
      dueLabel: { uk: "Дійсна до", en: "Valid until" },
      transitions: QUOTE_TRANSITIONS,
      bulk: ["submit", "cancel"],
      serverFields: ["orderId"],
      fixtures: () => fixtures().quotes,
    },
    {
      numbering,
      extension: extension?.quotes,
      baseUrl,
      deniedActions: deniedActions?.quotes,
      linkDenials: (quote) => quoteOrderDenials(quote, orders.db),
      creates: {
        [CREATE_ORDER]: mockCreatedDocument<QuoteCard, OrderCard>({
          resource: ORDERS,
          db: orders.db,
          body: (quote) => orderFromQuote(quote, extension?.orders?.fields),
          mark: (orderId) => ({ orderId }),
        }),
      },
    },
  )
  return {
    handlers: [...quotes.handlers, ...orders.handlers],
    db: { quotes: quotes.db, orders: orders.db },
    /** Видалили чернетку рахунку з замовлення (`afterDelete` моків K2): замовлення знову може дати рахунок. */
    releaseOrderInvoice: (removed: {
      readonly id: string
      readonly orderId?: string | null
    }) => {
      releaseOrderInvoice(orders.db, removed)
    },
    /** Джерела потоку документів у порядку процесу: для `createDocumentFlowHandlers` застосунку. */
    flowSources: salesFlowSources(quotes.db, orders.db),
  }
}
