/**
 * Обробники MSW документа модуля K4 (ADR-0073, ADR-0083): оплата чи повернення. Частина `mocks.ts`:
 * застосунок бере `createPaymentsMocks`, а не цей файл.
 *
 * - Запис (`POST /<ресурс>`) — одразу проведений документ із номером серії ресурсу. Після останнього
 *   очікування обробник нічого не чекає: два одночасні запити з тим самим `requestId` дають один документ,
 *   другий отримує його ж (200).
 * - Рахунки форми (`GET /<ресурс>/<підресурс>?clientId=`) — за правилом документа: з боргом для оплати, з
 *   переплатою для повернення.
 * - Після кожної зміни моки рахунків перераховують статус рахунку (`settle`): «Оплачено» ставить сервер.
 * - Обліковий документ (PF13): дата в закритому періоді — 422 `period_locked`, «Скасувати» в закритому
 *   періоді заборонено; сторно датується сьогодні чи першим відкритим днем.
 */
import { http, type HttpHandler } from "msw/http"
import type { z } from "zod"

import { fromSearchParams } from "@/lib/api"
import type { LocalizedText } from "@/lib/auth"
import { addDays, todayIn, type CalendarDate } from "@/lib/dates"
import { validation } from "@/lib/mock-account-state"
import { mockRequestPermissions } from "@/lib/mock-company-roles"
import {
  LIFECYCLE_LINK_FIELDS,
  withoutServerFields,
} from "@/lib/mock-documents"
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
import type { StatusTransition } from "@/lib/statuses"

import { REVERSAL_STATUS, type Payment } from "./contract"
import { paymentExchange, type PaymentMockRates } from "./mock-fixtures"
import {
  paidByInvoice,
  paymentFromRequest,
  paymentsFlowSource,
  requestIdOf,
  type AllocationRule,
  type PaymentInvoices,
  type PaymentInvoiceSource,
} from "./mock-payments"

/** Закриті періоди застосунку: правила сервера для ресурсу й дата закриття компанії. */
export type PeriodLockMocks = Pick<
  ReturnType<typeof createPeriodLockMocks>,
  "forResource" | "lockedThrough"
>

/** Що спільне в оплат і повернень: рахунки застосунку, нумерація, адреси, закриття, курси, «сьогодні». */
export interface MoneyDocumentMocksContext {
  readonly invoices: PaymentInvoices
  readonly numbering: Pick<NumberingMocks, "forResource">
  readonly baseUrl: string
  readonly periodLock?: PeriodLockMocks | undefined
  readonly rates?: PaymentMockRates | undefined
  readonly today?: CalendarDate | undefined
}

/** Документ модуля для моків: ресурс, схема, граф, статус нового, рахунки форми й засів. */
export interface MoneyDocumentMockKind {
  readonly resource: string
  readonly label: LocalizedText | undefined
  readonly schema: z.ZodType<Payment>
  /** Граф зі змінами розширення проекту. */
  readonly transitions: readonly StatusTransition[]
  /** Статус нового документа: «Отримано» чи «Повернено». */
  readonly createdStatus: string
  /** Підресурс рахунків форми: `open-invoices` чи `overpaid-invoices`. */
  readonly targetsPath: string
  readonly rule: AllocationRule
  /** Рядки рахунків форми у форматі контракту. */
  readonly targetRows: (
    invoices: readonly PaymentInvoiceSource[],
    clientId: string,
    companyId: string | null,
  ) => readonly object[]
  /** Свіжий засів на кожне скидання моків: записи змінюються на місці (дії). */
  readonly data: () => Payment[]
  /** Свої заборони проекту на записі (`deniedActions`, ADR-0037). */
  readonly deniedActions?: MockDeniedRule<Payment> | undefined
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

/** Сторно — проведений документ із тим самим рознесенням, сума з мінусом; курс — першого. */
function reversalOf(payment: Payment, date: CalendarDate) {
  return {
    ...withoutServerFields(payment, SERVER_FIELDS),
    date,
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
  }
}

export function createMoneyDocumentMocks(
  kind: MoneyDocumentMockKind,
  context: MoneyDocumentMocksContext,
) {
  const { invoices, numbering, baseUrl, periodLock, rates, today } = context
  const lock = periodLock?.forResource<Payment>({
    resource: kind.resource,
    dateField: "date",
    actions: kind.transitions.map((transition) => transition.id),
  })
  /** Дата сторно: сьогодні, а в закритому періоді — перший відкритий день. */
  const openDay = (companyId: string | null | undefined): CalendarDate => {
    const now = today ?? todayIn()
    const lockedThrough = periodLock?.lockedThrough(companyId ?? null)
    const firstOpen = lockedThrough ? addDays(lockedThrough, 1) : null
    return firstOpen && firstOpen > now ? firstOpen : now
  }
  const documents = createResourceHandlers<Payment>({
    resource: kind.resource,
    baseUrl,
    schema: kind.schema,
    data: kind.data,
    searchFields: ["number", "clientName", "reference"],
    titleField: "number",
    label: kind.label,
    fieldLabels: FIELD_LABELS,
    auditValue: { allocations: allocationsText },
    deniedActions: (actor, payment) => {
      const denied = {
        ...lock?.deniedActions(actor, payment),
        ...documentDeniedActions(payment),
        ...kind.deniedActions?.(actor, payment),
      }
      return Object.keys(denied).length ? denied : undefined
    },
  })
  const series = numbering.forResource({
    resource: kind.resource,
    db: documents.db,
  })
  /** Рахунки документа змінили борг: моки рахунків перераховують їхній статус. */
  const settle = (payment: Payment) => {
    for (const { invoiceId } of payment.allocations) invoices.settle(invoiceId)
  }
  /** Повтори за ключем ідемпотентності: компанія й `requestId` → `id` документа. */
  const handled = new Map<string, string>()
  const url = `${baseUrl}/${kind.resource}`

  /** Сценарій, сесія, компанія запиту й право `<ресурс>:<дія>`, або відповідь-відмова. */
  async function guard(request: Request, action: string) {
    const early = await applyScenario(scenarioFor(kind.resource))
    if (early) return early
    const user = currentMockUser()
    if (!user) return unauthenticated()
    const access = mockRequestPermissions(request, user)
    if (access instanceof Response) return access
    const rules = documents.db.accessOf(user, access.permissions)
    if (!mockGrantsRecords(rules, action))
      return errorResponse(403, {
        code: "forbidden",
        message: `Missing permission ${kind.resource}:${action}`,
      })
    return { user, companyId: access.companyId, rules }
  }

  const register = http.post(url, async ({ request }) => {
    // Після перевірок — жодного `await`: повтор із тим самим ключем бачить перший документ, а не створює другий.
    const raw: unknown = await request.json().catch(() => undefined)
    const access = await guard(request, "create")
    if (access instanceof Response) return access
    const { user, companyId, rules } = access
    const requestId = requestIdOf(raw)
    const onceKey = `${companyId ?? "-"}/${requestId ?? ""}`
    const repeated = requestId
      ? documents.db
          .all()
          .find((payment) => payment.id === handled.get(onceKey))
      : undefined
    if (repeated)
      return json(withMockDeniedActions(rules, documents.db.card(repeated)))
    const built = paymentFromRequest(raw, invoices.all(), companyId, kind.rule)
    if ("fieldErrors" in built) return validation(built.fieldErrors)
    const write = { user, companyId }
    const refused = lock?.validateWrite(built.body, write)
    if (refused) return validation(refused)
    const { request: fields } = built
    // Номер, статус, версію, зв'язки сторно й компанію веде сервер: з тіла запиту їх не беремо.
    const body = {
      ...withoutServerFields(built.body, SERVER_FIELDS),
      date: fields.date,
      number: series.assign(built.body, companyId),
      status: kind.createdStatus,
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
    const inserted = documents.db.insert(body, companyId, user)
    if ("fieldErrors" in inserted) return validation(inserted.fieldErrors)
    handled.set(onceKey, inserted.record.id)
    lock?.afterWrite(inserted.record, write)
    settle(inserted.record)
    return json(
      withMockDeniedActions(rules, documents.db.card(inserted.record)),
      { status: 201 },
    )
  })

  const targets = http.get(
    `${url}/${kind.targetsPath}`,
    async ({ request }) => {
      const access = await guard(request, "create")
      if (access instanceof Response) return access
      if (scenarioFor(kind.resource) === "empty")
        return json({ data: [], total: 0 })
      const { page, perPage, filter } = fromSearchParams(
        new URL(request.url).searchParams,
      )
      const clientId = filter.clientId
      if (typeof clientId !== "string" || !clientId)
        return validation({ clientId: "required" })
      const rows = kind.targetRows(invoices.all(), clientId, access.companyId)
      const start = (page - 1) * perPage
      return json({
        data: rows.slice(start, start + perPage),
        total: rows.length,
      })
    },
  )

  const transitions = createTransitionHandlers<Payment>({
    resource: kind.resource,
    baseUrl,
    db: documents.db,
    transitions: kind.transitions,
    reverse: (payment) => reversalOf(payment, openDay(payment.companyId)),
    // Колега в сценарії `conflict` дописує призначення.
    conflictChange: (payment) => ({
      reference: `${payment.reference ?? ""} ✓`.trim(),
    }),
    numbering: series,
    afterTransition: (payment, action, actor) => {
      lock?.afterTransition(payment, action, actor)
      settle(payment)
    },
  })

  return {
    // Запис, рахунки форми й дії — перед ресурсом: запит не має дійти до обробників запису.
    handlers: [
      register,
      targets,
      ...transitions,
      ...documents.handlers,
    ] satisfies HttpHandler[],
    db: documents.db,
    /** Суми документів, що діють, за `id` рахунку. */
    byInvoice: () => paidByInvoice(documents.db.all()),
    /** Джерело потоку документів: документ — «на підставі» кожного свого рахунку. */
    flowSource: paymentsFlowSource(
      documents.db,
      invoices.resource,
      kind.resource,
    ),
  }
}
