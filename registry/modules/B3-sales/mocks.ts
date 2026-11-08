/**
 * Моки модуля B3 на MSW (ADR-0002, ADR-0003): пропозиції з рядками (зберігаються разом із записом,
 * суми рахує «сервер»), дії графа переходів з номером на «Надіслати» (ADR-0057, ADR-0058). Сценарії
 * `success`, `error`, `empty`, `slow`, `conflict`, `forbidden`, `offline` — ресурсу `quotes`
 * (`lib/mock-scenarios`, панель розробника), права — `quotes:<дія>` поточного користувача моків.
 *
 *   const seeds = salesNumberingSeeds({ companies })
 *   const numbering = createNumberingMocks({ series: [...seeds.series], counters: [...seeds.counters] })
 *   const sales = createSalesMocks({ companies, numbering, extension: salesMockExtension })
 *   setupWorker(...platform, ...numbering.handlers, ...sales.handlers)
 *
 * Нумерація — спільна для всіх документів проекту (`createNumberingMocks` один на застосунок), тож
 * модуль не створює своєї: дає засів серії й лічильника (`salesNumberingSeeds`) і бере
 * `numbering.forResource`. Поля, статуси й переходи розширення проекту (`SalesMockExtension`) — у схемі,
 * у фікстурах і в графі переходів.
 */
import { z } from "zod"

import { addDays, todayIn } from "@/lib/dates"
import { documentBodySchemaFor } from "@/lib/document-lines"
import { withMockValues } from "@/lib/extension-fields"
import { currencyDigits } from "@/lib/format"
import type {
  MockNumberingCounterSeed,
  MockNumberingSeriesSeed,
  NumberingMocks,
} from "@/lib/mock-numbering"
import type { MockDeniedRule } from "@/lib/mock-scope"
import {
  createTransitionHandlers,
  documentDeniedActions,
} from "@/lib/mock-transitions"
import { createResourceHandlers } from "@/lib/mocks"
import {
  mergeTransitions,
  type ExtensionStatusChanges,
  type ExtensionTransitionChanges,
} from "@/lib/statuses"

import {
  QUOTE_TRANSITIONS,
  QUOTES,
  quoteSchemaFor,
  SALES_RESOURCES,
  type QuoteCard,
  type QuoteSchemaExtension,
} from "./contract"
import type { SalesMockExtension } from "./extension"
import {
  createSalesFixtures,
  QUOTE_NUMBER_TEMPLATE,
  type SalesFixtureOptions,
} from "./fixtures"
import { quoteSumsOf } from "./quote-totals"

export interface SalesMocksOptions extends SalesFixtureOptions {
  /** Нумерація проекту з серією `quotes` (`salesNumberingSeeds`): номер на «Надіслати». */
  readonly numbering: Pick<NumberingMocks, "forResource">
  /** Поля, статуси й переходи розширення проекту — дані без компонентів. */
  readonly extension?: SalesMockExtension
  /** Початок адрес API, як у `createResourceHandlers` (за замовчуванням `/api/v1`). */
  readonly baseUrl?: string
  /** Свої заборони проекту на записі (`deniedActions`, ADR-0037): зводяться з позначками життєвого циклу. */
  readonly deniedActions?: { readonly quotes?: MockDeniedRule<QuoteCard> }
}

/** Строк виправленої копії: два тижні від сьогодні. */
const AMEND_VALID_DAYS = 14

/** Поля, які сервер веде сам: копія їх не бере, а отримує нові. */
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
  "validUntil",
  "deniedActions",
  "pinned",
])

/**
 * Збережений запис, як його перевіряє сервер: шапка (`quoteSchemaFor`), рядки й знижка документа за
 * знаками валюти (`documentBodySchemaFor`), строк не раніше дати; суми рахує сам (`quoteSumsOf`), тож
 * `total` і `totals` із запиту не беруться.
 */
function storedQuoteSchema(
  extension?: QuoteSchemaExtension,
): z.ZodType<QuoteCard> {
  const header = quoteSchemaFor(extension)
  return z.unknown().transform((input, ctx) => {
    // Нова пропозиція — чернетка без номера: номер і стан документа ставить сервер, а не форма.
    const record: Record<string, unknown> = {
      number: null,
      docStatus: "draft",
      ...(input as Record<string, unknown> | undefined),
    }
    const currency = typeof record.currency === "string" ? record.currency : ""
    const body = documentBodySchemaFor(currencyDigits(currency)).safeParse(
      record,
    )
    const sums = body.success ? quoteSumsOf({ currency, ...body.data }) : null
    const parsed = header.safeParse({ ...record, total: sums?.total ?? 0 })
    const issues = [
      ...(body.error?.issues ?? []),
      ...(parsed.error?.issues ?? []),
    ]
    if (
      parsed.success &&
      parsed.data.validUntil < parsed.data.date &&
      !issues.length
    )
      issues.push({
        code: "custom",
        path: ["validUntil"],
        message: "before_date",
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
    return { ...parsed.data, lines: sums.lines, totals: sums.totals }
  })
}

/**
 * Статус розширення з `mockEvery` (`lib/statuses`): кожна N-та пропозиція засіву в статусі, з якого
 * веде дія до нього, — ніби дію вже виконали. Статус без такої дії засів не отримує: документ не
 * стає в статус поза графом.
 */
function withTransitionSamples(
  quotes: QuoteCard[],
  statuses?: ExtensionStatusChanges,
  transitions?: ExtensionTransitionChanges,
): QuoteCard[] {
  const samples = (statuses?.add ?? []).flatMap((status) => {
    const from = transitions?.add?.find((action) => action.to === status.id)
      ?.from[0]
    return status.mockEvery && from
      ? [{ id: status.id, from, every: status.mockEvery }]
      : []
  })
  const seen = new Map<string, number>()
  return quotes.map((quote) => {
    const sample = samples.find((candidate) => candidate.from === quote.status)
    if (!sample) return quote
    const count = (seen.get(sample.id) ?? 0) + 1
    seen.set(sample.id, count)
    return count % sample.every === 0 ? { ...quote, status: sample.id } : quote
  })
}

/** Рядки в журналі — рядками «назва × кількість», а не JSON. */
const linesText = (lines: readonly QuoteCard["lines"][number][]) =>
  lines.map((line) =>
    line.kind === "item"
      ? `${line.name} × ${line.quantity}`
      : line.kind === "section"
        ? line.title
        : line.text,
  )

const labelOf = (name: string) =>
  SALES_RESOURCES.find((resource) => resource.name === name)?.label

/**
 * Засів серії `quotes` для `createNumberingMocks` (ADR-0058): шаблон мовою даних у кожній компанії й
 * лічильники, які фікстури вже видали. Ті самі опції, що й у `createSalesMocks`.
 */
export function salesNumberingSeeds(options: SalesFixtureOptions = {}): {
  series: MockNumberingSeriesSeed[]
  counters: MockNumberingCounterSeed[]
} {
  const template = QUOTE_NUMBER_TEMPLATE[options.locale ?? "uk"]
  return {
    series: (options.companies ?? [null]).map((companyId) => ({
      companyId,
      resource: QUOTES,
      template,
    })),
    counters: createSalesFixtures(options).counters.map((counter) => ({
      ...counter,
      resource: QUOTES,
    })),
  }
}

export function createSalesMocks({
  numbering,
  extension,
  baseUrl,
  deniedActions,
  ...fixtureOptions
}: SalesMocksOptions) {
  const quoteExtension = extension?.quotes
  const transitions = mergeTransitions(
    QUOTE_TRANSITIONS,
    quoteExtension?.transitions,
  )
  // Свіжі фікстури на кожне скидання моків: записи змінюються на місці (PATCH, дії).
  const fixtures = () =>
    withMockValues(
      withTransitionSamples(
        createSalesFixtures(fixtureOptions).quotes,
        quoteExtension?.statuses,
        quoteExtension?.transitions,
      ),
      quoteExtension?.fields,
    )
  const quotes = createResourceHandlers<QuoteCard>({
    resource: QUOTES,
    baseUrl,
    schema: storedQuoteSchema(quoteExtension),
    data: fixtures,
    searchFields: ["number", "clientName"],
    titleField: "clientName",
    label: labelOf(QUOTES),
    fieldLabels: {
      number: { uk: "Номер", en: "Number" },
      clientName: { uk: "Клієнт", en: "Client" },
      date: { uk: "Дата", en: "Date" },
      validUntil: { uk: "Дійсна до", en: "Valid until" },
      status: { uk: "Статус", en: "Status" },
      docStatus: { uk: "Стан документа", en: "Document state" },
      lines: { uk: "Рядки", en: "Lines" },
      discountPercent: { uk: "Знижка, %", en: "Discount, %" },
      discountAmount: { uk: "Знижка сумою", en: "Discount amount" },
    },
    detailFields: ["lines", "totals"],
    auditValue: { lines: linesText },
    // Проведену й скасовану не змінюють, виправлену вдруге не виправляють (ADR-0057).
    deniedActions: (actor, quote) => {
      const denied = {
        ...documentDeniedActions(quote),
        ...deniedActions?.quotes?.(actor, quote),
      }
      return Object.keys(denied).length ? denied : undefined
    },
  })
  const quoteTransitions = createTransitionHandlers<QuoteCard>({
    resource: QUOTES,
    baseUrl,
    db: quotes.db,
    transitions,
    // Виправлена копія — нова чернетка з тими самими клієнтом, рядками й полями розширення.
    amend: (quote) => {
      const today = todayIn()
      return {
        ...Object.fromEntries(
          Object.entries(quote).filter(([key]) => !SERVER_FIELDS.has(key)),
        ),
        date: today,
        validUntil: addDays(today, AMEND_VALID_DAYS),
        status: "draft",
      }
    },
    // Колега в сценарії `conflict` продовжує строк на тиждень.
    conflictChange: (quote) => ({ validUntil: addDays(quote.validUntil, 7) }),
    numbering: numbering.forResource({ resource: QUOTES, db: quotes.db }),
  })
  return {
    // Дії — перед ресурсом: `POST /quotes/:id/<дія>` не має дійти до обробників запису.
    handlers: [...quoteTransitions, ...quotes.handlers],
    db: { quotes: quotes.db },
  }
}
