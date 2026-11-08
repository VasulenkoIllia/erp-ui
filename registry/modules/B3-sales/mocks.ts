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
 *   setupWorker(...platform, ...numbering.handlers, ...createJobHandlers(), ...sales.handlers)
 *
 * Хід масової задачі (`GET /jobs/:id`) — спільний на застосунок (`createJobHandlers` з lib/mock-jobs),
 * як і нумерація: модуль дає лише `POST /<ресурс>/bulk/<дія>`.
 *
 * Нумерація — спільна для всіх документів проекту (`createNumberingMocks` один на застосунок), тож
 * модуль не створює своєї: дає засів серій `quotes` і `orders` з лічильниками (`salesNumberingSeeds`) і
 * бере `numbering.forResource`. Поля, статуси й переходи розширення проекту (`SalesMockExtension`) — у
 * схемі, у фікстурах і в графі переходів.
 */
import { z } from "zod"

import type { LocalizedText } from "@/lib/auth"
import { addDays, todayIn, type CalendarDate } from "@/lib/dates"
import { documentBodySchemaFor } from "@/lib/document-lines"
import { withMockValues } from "@/lib/extension-fields"
import { currencyDigits } from "@/lib/format"
import type {
  MockNumberingCounterSeed,
  MockNumberingSeriesSeed,
  NumberingMocks,
} from "@/lib/mock-numbering"
import { createBulkHandlers } from "@/lib/mock-jobs"
import type { MockDeniedRule } from "@/lib/mock-scope"
import {
  bulkTransitionActions,
  createTransitionHandlers,
  documentDeniedActions,
  releaseAmendedFrom,
} from "@/lib/mock-transitions"
import { createResourceHandlers } from "@/lib/mocks"
import {
  mergeTransitions,
  type ExtensionStatusChanges,
  type ExtensionTransitionChanges,
  type StatusTransition,
} from "@/lib/statuses"

import {
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
import { salesSumsOf } from "./sales-totals"

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
}

/** Виправлена копія: друга дата за стільки днів від сьогодні. */
const AMEND_DUE_DAYS = { quotes: 14, orders: 7 } as const

/** Поля, які сервер веде сам: копія їх не бере, а отримує нові (друга дата — теж). */
const SERVER_FIELDS = new Set([
  "id",
  "version",
  "companyId",
  "number",
  "status",
  "docStatus",
  "amendedFrom",
  "amendedBy",
  "reversalOf",
  "reversedBy",
  "total",
  "totals",
  "date",
  "deniedActions",
  "pinned",
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * Новий документ (`version: 1` — створення чи виправлена копія; PATCH завжди дає версію від 2) —
 * чернетка без номера: номер, стан документа й статус ставить сервер, а не запит.
 */
const asServerDraft = (record: Record<string, unknown>, status: string) =>
  record.version === 1
    ? { ...record, number: null, docStatus: "draft", status }
    : record

/** Помилки шапки й тіла без повторів: знижка документа є в обох схемах. */
function uniqueIssues(issues: readonly z.core.$ZodIssue[]) {
  const seen = new Set<string>()
  return issues.filter((issue) => {
    const key = `${issue.path.join(".")}:${issue.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Збережений документ, як його перевіряє сервер: шапка (схема ресурсу), рядки й знижка документа за
 * знаками валюти (`documentBodySchemaFor`), друга дата не раніше дати; суми рахує сам (`salesSumsOf`),
 * тож `total` і `totals` із запиту не беруться.
 */
function storedDocumentSchema<T extends SalesDocument & SalesDocumentDetail>(
  header: z.ZodType<SalesDocument>,
  dueField: keyof T & string,
  draftStatus: string,
): z.ZodType<T> {
  return z.unknown().transform((input, ctx) => {
    if (!isRecord(input)) {
      ctx.addIssue({ code: "custom", path: [], message: "invalid" })
      return z.NEVER
    }
    const record = asServerDraft(input, draftStatus)
    const currency = typeof record.currency === "string" ? record.currency : ""
    const body = documentBodySchemaFor(currencyDigits(currency)).safeParse(
      record,
    )
    const sums = body.success ? salesSumsOf({ currency, ...body.data }) : null
    const parsed = header.safeParse({ ...record, total: sums?.total ?? 0 })
    const issues = uniqueIssues([
      ...(body.error?.issues ?? []),
      ...(parsed.error?.issues ?? []),
    ])
    const due = parsed.success ? parsed.data[dueField] : undefined
    if (parsed.success && typeof due === "string" && due < parsed.data.date)
      issues.push({
        code: "custom",
        path: [dueField],
        message: "before_date",
        input,
      })
    // Тіло за схемою, а суми не склались (межа контракту): помилка рядків, а не тихий `undefined`.
    if (body.success && !sums)
      issues.push({
        code: "custom",
        path: ["lines"],
        message: "totals_invalid",
        input,
      })
    if (!parsed.success || !sums || issues.length) {
      for (const issue of issues)
        ctx.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message,
        })
      return z.NEVER
    }
    // Шапка — за схемою ресурсу, рядки й підсумки — пораховані: це і є збережений документ `T`.
    return { ...parsed.data, lines: sums.lines, totals: sums.totals } as T
  })
}

/**
 * Статус розширення з `mockEvery` (`lib/statuses`): кожен N-й документ засіву в статусі, з якого веде
 * дія до нього, — ніби дію вже виконали. Статус без такої дії засів не отримує: документ не стає в
 * статус поза графом.
 */
function withTransitionSamples<T extends SalesDocument>(
  documents: T[],
  statuses?: ExtensionStatusChanges,
  transitions?: ExtensionTransitionChanges,
): T[] {
  const samples = (statuses?.add ?? []).flatMap((status) => {
    const from = transitions?.add?.find((action) => action.to === status.id)
      ?.from[0]
    return status.mockEvery && from
      ? [{ id: status.id, from, every: status.mockEvery }]
      : []
  })
  const seen = new Map<string, number>()
  return documents.map((document) => {
    const sample = samples.find(
      (candidate) => candidate.from === document.status,
    )
    if (!sample) return document
    const count = (seen.get(sample.id) ?? 0) + 1
    seen.set(sample.id, count)
    return count % sample.every === 0
      ? { ...document, status: sample.id }
      : document
  })
}

/** Рядки в журналі — рядками «назва × кількість», а не JSON. */
const linesText = (lines: readonly SalesDocumentDetail["lines"][number][]) =>
  lines.map((line) =>
    line.kind === "item"
      ? `${line.name} × ${line.quantity}`
      : line.kind === "section"
        ? line.title
        : line.text,
  )

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
  readonly dueField: keyof T & string
  readonly dueLabel: LocalizedText
  readonly transitions: readonly StatusTransition[]
  /** Дії графа, які список запускає масово (ADR-0066). */
  readonly bulk: readonly string[]
  readonly fixtures: () => T[]
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
  }: {
    numbering: SalesMocksOptions["numbering"]
    extension: MockDocumentExtension | undefined
    baseUrl: string | undefined
    deniedActions: MockDeniedRule<T> | undefined
  },
) {
  const { resource, dueField } = spec
  const transitions = mergeTransitions(spec.transitions, extension?.transitions)
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
    schema: storedDocumentSchema(
      spec.schema(extension),
      dueField,
      spec.draftStatus,
    ),
    data: fixtures,
    searchFields: ["number", "clientName"],
    titleField: "clientName",
    label: labelOf(resource),
    fieldLabels: {
      ...COMMON_FIELD_LABELS,
      [dueField]: spec.dueLabel,
    } as Partial<Record<keyof T & string, LocalizedText>>,
    detailFields: ["lines", "totals"],
    auditValue: { lines: linesText } as Partial<
      Record<keyof T & string, (value: never) => string[]>
    >,
    // Видалена виправлена копія звільняє скасований документ: його можна виправити знову (ADR-0066).
    afterDelete: (document) => {
      releaseAmendedFrom(documents.db, document)
    },
    // Проведений і скасований не змінюють, виправлений удруге не виправляють (ADR-0057).
    deniedActions: (actor, document) => {
      const denied = {
        ...documentDeniedActions(document),
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
        ...Object.fromEntries(
          Object.entries(document).filter(
            ([key]) => !SERVER_FIELDS.has(key) && key !== dueField,
          ),
        ),
        date: today,
        [dueField]: addDays(today, AMEND_DUE_DAYS[resource]),
        status: spec.draftStatus,
      }
    },
    // Колега в сценарії `conflict` переносить другу дату на тиждень.
    conflictChange: (document) =>
      ({
        [dueField]: addDays(document[dueField] as CalendarDate, 7),
      }) as Partial<T>,
    numbering: documentNumbering,
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
  ...fixtureOptions
}: SalesMocksOptions) {
  const fixtures = () => createSalesFixtures(fixtureOptions)
  const quotes = createDocumentMocks<QuoteCard>(
    {
      resource: QUOTES,
      schema: quoteSchemaFor,
      draftStatus: DEFAULT_QUOTE_STATUS,
      dueField: "validUntil",
      dueLabel: { uk: "Дійсна до", en: "Valid until" },
      transitions: QUOTE_TRANSITIONS,
      bulk: ["submit", "cancel"],
      fixtures: () => fixtures().quotes,
    },
    {
      numbering,
      extension: extension?.quotes,
      baseUrl,
      deniedActions: deniedActions?.quotes,
    },
  )
  const orders = createDocumentMocks<OrderCard>(
    {
      resource: ORDERS,
      schema: orderSchemaFor,
      draftStatus: DEFAULT_ORDER_STATUS,
      dueField: "dueDate",
      dueLabel: { uk: "Виконати до", en: "Due by" },
      transitions: ORDER_TRANSITIONS,
      bulk: ["submit", "complete", "cancel"],
      fixtures: () => fixtures().orders,
    },
    {
      numbering,
      extension: extension?.orders,
      baseUrl,
      deniedActions: deniedActions?.orders,
    },
  )
  return {
    handlers: [...quotes.handlers, ...orders.handlers],
    db: { quotes: quotes.db, orders: orders.db },
  }
}
