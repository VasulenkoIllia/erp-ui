/**
 * Моки модуля K4 на MSW (ADR-0002, ADR-0003, ADR-0073): оплати клієнтів за рахунками застосунку. Сценарії
 * `success`, `error`, `empty`, `slow`, `conflict`, `forbidden`, `offline` — ресурсу `sales-payments`
 * (`lib/mock-scenarios`, панель розробника), права — `sales-payments:<дія>`.
 *
 *   const seeds = paymentsNumberingSeeds({ invoices: invoicePaymentSeed(invoiceFixtures), companies })
 *   const numbering = createNumberingMocks({ series: [...seeds.series], counters: [...seeds.counters] })
 *   const invoices = createInvoicesMocks({ ..., payments: { paidTotal: (id) => payments.paidTotal(id) } })
 *   const payments = createPaymentsMocks({ invoices: invoices.forPayments, numbering, periodLock, rates })
 *   const flow = createDocumentFlowHandlers({ sources: [...invoices.flowSources, payments.flowSource] })
 *   setupWorker(...platform, ...numbering.handlers, ...flow, ...invoices.handlers, ...payments.handlers)
 *
 * - Реєстрація (`POST /sales-payments`) — одразу проведена оплата з номером серії `sales-payments`. Після
 *   останнього очікування обробник нічого не чекає: два одночасні запити з тим самим `requestId` дають одну
 *   оплату, другий отримує її ж (200).
 * - Рахунки дає застосунок (`invoices`, моки модуля K2): модулі не імпортують один одного. Після кожної зміни
 *   оплат моки рахунків перераховують статус рахунку (`settle`): «Оплачено» ставить сервер.
 * - Обліковий документ (PF13): з `periodLock` дата в закритому періоді — 422 `period_locked`, «Скасувати» на
 *   оплаті закритого періоду заборонено; сторно датується сьогодні чи першим відкритим днем.
 * - Оплата у валюті (ADR-0071): з `rates` сервер рахує `exchange` на дату оплати; сторно бере курс першої.
 */
import { http, type HttpHandler } from "msw/http"

import { API_PREFIX, fromSearchParams } from "@/lib/api"
import type { LocalizedText } from "@/lib/auth"
import { addDays, todayIn, type CalendarDate } from "@/lib/dates"
import { validation } from "@/lib/mock-account-state"
import { mockRequestPermissions } from "@/lib/mock-company-roles"
import {
  LIFECYCLE_LINK_FIELDS,
  withoutServerFields,
  withTransitionSamples,
} from "@/lib/mock-documents"
import { withMockValues } from "@/lib/extension-fields"
import type { NumberingMocks } from "@/lib/mock-numbering"
import type { createPeriodLockMocks } from "@/lib/mock-period-lock"
import { scenarioFor } from "@/lib/mock-scenarios"
import {
  mockGrantsRecords,
  withMockDeniedActions,
  type MockDeniedRule,
} from "@/lib/mock-scope"
import {
  applyScenario,
  currentMockUser,
  errorResponse,
  json,
  unauthenticated,
} from "@/lib/mock-server"
import {
  createTransitionHandlers,
  documentDeniedActions,
} from "@/lib/mock-transitions"
import { createResourceHandlers } from "@/lib/mocks"
import { mergeTransitions } from "@/lib/statuses"

import {
  OPEN_INVOICES_PATH,
  PAYMENT_TRANSITIONS,
  paymentSchemaFor,
  PAYMENTS,
  PAYMENTS_RESOURCES,
  RECEIVED_STATUS,
  REVERSAL_STATUS,
  type Payment,
} from "./contract"
import type { PaymentsMockExtension } from "./extension"
import type { FixtureLocale } from "./fixtures"
import {
  paymentExchange,
  paymentFixtures,
  type PaymentMockRates,
} from "./mock-fixtures"
import {
  openInvoicesOf,
  paidByInvoice,
  paymentFromRequest,
  paymentsFlowSource,
  requestIdOf,
  type PaymentInvoices,
} from "./mock-payments"

export {
  paymentsNumberingSeeds,
  type PaymentMockRates,
  type PaymentSeedOptions,
} from "./mock-fixtures"
export type { PaymentInvoices, PaymentInvoiceSource } from "./mock-payments"

/** Закриті періоди застосунку: правила сервера для ресурсу й дата закриття компанії. */
type PeriodLockMocks = Pick<
  ReturnType<typeof createPeriodLockMocks>,
  "forResource" | "lockedThrough"
>

export interface PaymentsMocksOptions {
  /** Рахунки застосунку (`createInvoicesMocks(...).forPayments`). */
  readonly invoices: PaymentInvoices
  /** Нумерація проекту з серією `sales-payments` (`paymentsNumberingSeeds`). */
  readonly numbering: Pick<NumberingMocks, "forResource">
  /** Поля, статуси й переходи розширення проекту — дані без компонентів. */
  readonly extension?: PaymentsMockExtension
  /** Початок адрес API, як у `createResourceHandlers` (за замовчуванням `/api/v1`). */
  readonly baseUrl?: string
  /** Свої заборони проекту на записі (`deniedActions`, ADR-0037). */
  readonly deniedActions?: MockDeniedRule<Payment>
  /** Закриті періоди (PF13): без них оплати не знають про закриття. */
  readonly periodLock?: PeriodLockMocks
  /** Курси компанії (ADR-0071): без них оплата у валюті не має суми в базовій валюті. */
  readonly rates?: PaymentMockRates
  readonly locale?: FixtureLocale
  /** Сьогодні: від нього дати засіву. Тести ставлять сталу дату. */
  readonly today?: CalendarDate
}

const FIELD_LABELS = {
  number: { uk: "Номер", en: "Number" },
  clientName: { uk: "Клієнт", en: "Client" },
  date: { uk: "Дата", en: "Date" },
  amount: { uk: "Сума", en: "Amount" },
  method: { uk: "Спосіб", en: "Method" },
  reference: { uk: "Призначення", en: "Reference" },
  status: { uk: "Статус", en: "Status" },
  docStatus: { uk: "Стан документа", en: "Document state" },
  allocations: { uk: "Рахунки", en: "Invoices" },
} satisfies Record<string, LocalizedText>

/** Поля, які сервер веде сам: сторно їх не бере, а отримує нові (дата — теж). */
const SERVER_FIELDS = new Set([
  "id",
  "version",
  "companyId",
  "number",
  "status",
  "docStatus",
  ...LIFECYCLE_LINK_FIELDS,
  "exchange",
  "date",
  "deniedActions",
  "pinned",
])

/** Рознесення в журналі: номери рахунків, а не JSON. */
const allocationsText = (allocations: Payment["allocations"]) =>
  allocations.map((item) => item.invoiceNumber).join(", ")

export function createPaymentsMocks({
  invoices,
  numbering,
  extension,
  baseUrl = API_PREFIX,
  deniedActions,
  periodLock,
  rates,
  locale,
  today,
}: PaymentsMocksOptions) {
  const transitions = mergeTransitions(
    PAYMENT_TRANSITIONS,
    extension?.transitions,
  )
  const lock = periodLock?.forResource<Payment>({
    resource: PAYMENTS,
    dateField: "date",
    actions: transitions.map((transition) => transition.id),
  })
  /** Дата сторно: сьогодні, а в закритому періоді — перший відкритий день. */
  const openDay = (companyId: string | null | undefined): CalendarDate => {
    const now = today ?? todayIn()
    const lockedThrough = periodLock?.lockedThrough(companyId ?? null)
    const firstOpen = lockedThrough ? addDays(lockedThrough, 1) : null
    return firstOpen && firstOpen > now ? firstOpen : now
  }
  const payments = createResourceHandlers<Payment>({
    resource: PAYMENTS,
    baseUrl,
    schema: paymentSchemaFor(extension),
    // Свіжий засів на кожне скидання моків: записи змінюються на місці (дії).
    data: () =>
      withMockValues(
        withTransitionSamples(
          paymentFixtures(invoices.seed(), { locale, today, rates }).payments,
          extension?.statuses,
          extension?.transitions,
        ),
        extension?.fields,
      ),
    searchFields: ["number", "clientName", "reference"],
    titleField: "number",
    label: PAYMENTS_RESOURCES[0]?.label,
    fieldLabels: FIELD_LABELS,
    auditValue: { allocations: allocationsText },
    deniedActions: (actor, payment) => {
      const denied = {
        ...lock?.deniedActions(actor, payment),
        ...documentDeniedActions(payment),
        ...deniedActions?.(actor, payment),
      }
      return Object.keys(denied).length ? denied : undefined
    },
  })
  const paymentNumbering = numbering.forResource({
    resource: PAYMENTS,
    db: payments.db,
  })
  /** Оплачене за рахунками: оплати, що діють. */
  const paid = () => paidByInvoice(payments.db.all())
  /** Рахунки оплати змінили борг: моки рахунків перераховують їхній статус. */
  const settle = (payment: Payment) => {
    for (const { invoiceId } of payment.allocations) invoices.settle(invoiceId)
  }
  /** Повтори за ключем ідемпотентності: компанія й `requestId` → `id` оплати. */
  const handled = new Map<string, string>()
  const url = `${baseUrl}/${PAYMENTS}`

  /** Сценарій, сесія, компанія запиту й право `sales-payments:<дія>`, або відповідь-відмова. */
  async function guard(request: Request, action: string) {
    const early = await applyScenario(scenarioFor(PAYMENTS))
    if (early) return early
    const user = currentMockUser()
    if (!user) return unauthenticated()
    const access = mockRequestPermissions(request, user)
    if (access instanceof Response) return access
    const rules = payments.db.accessOf(user, access.permissions)
    if (!mockGrantsRecords(rules, action))
      return errorResponse(403, {
        code: "forbidden",
        message: `Missing permission ${PAYMENTS}:${action}`,
      })
    return { user, companyId: access.companyId, rules }
  }

  const register = http.post(url, async ({ request }) => {
    // Після перевірок — жодного `await`: повтор із тим самим ключем бачить першу оплату, а не створює другу.
    const raw: unknown = await request.json().catch(() => undefined)
    const access = await guard(request, "create")
    if (access instanceof Response) return access
    const { user, companyId, rules } = access
    const requestId = requestIdOf(raw)
    const onceKey = `${companyId ?? "-"}/${requestId ?? ""}`
    const repeated = requestId
      ? payments.db.all().find((payment) => payment.id === handled.get(onceKey))
      : undefined
    if (repeated)
      return json(withMockDeniedActions(rules, payments.db.card(repeated)))
    const built = paymentFromRequest(raw, invoices.all(), companyId)
    if ("fieldErrors" in built) return validation(built.fieldErrors)
    const write = { user, companyId }
    const refused = lock?.validateWrite(built.body, write)
    if (refused) return validation(refused)
    const { request: fields } = built
    // Номер, статус, версію, зв'язки сторно й компанію веде сервер: з тіла запиту їх не беремо.
    const body = {
      ...withoutServerFields(built.body, SERVER_FIELDS),
      date: fields.date,
      number: paymentNumbering.assign(built.body, companyId),
      status: RECEIVED_STATUS,
      docStatus: "submitted",
      exchange: paymentExchange(
        {
          companyId,
          currency: fields.currency,
          date: fields.date,
          amount: fields.amount,
        },
        rates,
      ),
    }
    const inserted = payments.db.insert(body, companyId, user)
    if ("fieldErrors" in inserted) return validation(inserted.fieldErrors)
    handled.set(onceKey, inserted.record.id)
    lock?.afterWrite(inserted.record, write)
    settle(inserted.record)
    return json(
      withMockDeniedActions(rules, payments.db.card(inserted.record)),
      {
        status: 201,
      },
    )
  })

  const openInvoices = http.get(
    `${url}/${OPEN_INVOICES_PATH}`,
    async ({ request }) => {
      const access = await guard(request, "create")
      if (access instanceof Response) return access
      if (scenarioFor(PAYMENTS) === "empty") return json({ data: [], total: 0 })
      const { page, perPage, filter } = fromSearchParams(
        new URL(request.url).searchParams,
      )
      const clientId = filter.clientId
      if (typeof clientId !== "string" || !clientId)
        return validation({ clientId: "required" })
      const open = openInvoicesOf(invoices.all(), clientId, access.companyId)
      const start = (page - 1) * perPage
      return json({
        data: open.slice(start, start + perPage),
        total: open.length,
      })
    },
  )

  const paymentTransitions = createTransitionHandlers<Payment>({
    resource: PAYMENTS,
    baseUrl,
    db: payments.db,
    transitions,
    // Сторно — проведена оплата з тим самим рознесенням, сума з мінусом; курс — першої оплати.
    reverse: (payment) => ({
      ...withoutServerFields(payment, SERVER_FIELDS),
      date: openDay(payment.companyId),
      amount: -payment.amount,
      exchange: payment.exchange
        ? {
            ...payment.exchange,
            baseTotal:
              payment.exchange.baseTotal === null
                ? null
                : -payment.exchange.baseTotal || 0,
          }
        : null,
      status: REVERSAL_STATUS,
    }),
    // Колега в сценарії `conflict` дописує призначення.
    conflictChange: (payment) => ({
      reference: `${payment.reference ?? ""} ✓`.trim(),
    }),
    numbering: paymentNumbering,
    afterTransition: (payment, action, actor) => {
      lock?.afterTransition(payment, action, actor)
      settle(payment)
    },
  })

  return {
    // Реєстрація, відкриті рахунки й дії — перед ресурсом: запит не має дійти до обробників запису.
    handlers: [
      register,
      openInvoices,
      ...paymentTransitions,
      ...payments.handlers,
    ] satisfies HttpHandler[],
    db: payments.db,
    /** Оплачене за рахунком: оплати, що діють (для `createInvoicesMocks({ payments })`). */
    paidTotal: (invoiceId: string) => paid().get(invoiceId) ?? 0,
    /** Джерело потоку документів: оплата — «на підставі» кожного свого рахунку. */
    flowSource: paymentsFlowSource(payments.db, invoices.resource),
  }
}
