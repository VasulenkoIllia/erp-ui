/**
 * Моки модуля K4 на MSW (ADR-0002, ADR-0003, ADR-0073, ADR-0083): оплати клієнтів за рахунками застосунку й
 * повернення переплати. Сценарії `success`, `error`, `empty`, `slow`, `conflict`, `forbidden`, `offline` —
 * ресурсів `sales-payments` і `sales-refunds` (`lib/mock-scenarios`, панель розробника), права —
 * `<ресурс>:<дія>`.
 *
 *   const seeds = paymentsNumberingSeeds({ invoices: invoicePaymentSeed(invoiceFixtures), companies })
 *   const numbering = createNumberingMocks({ series: [...seeds.series], counters: [...seeds.counters] })
 *   const invoices = createInvoicesMocks({ ..., payments: {
 *     paidTotal: (id) => payments.paidTotal(id), refundedTotal: (id) => payments.refundedTotal(id) } })
 *   const payments = createPaymentsMocks({ invoices: invoices.forPayments, numbering, periodLock, rates })
 *   const flow = createDocumentFlowHandlers({ sources: [...invoices.flowSources, ...payments.flowSources] })
 *   setupWorker(...platform, ...numbering.handlers, ...flow, ...invoices.handlers, ...payments.handlers)
 *
 * - Реєстрація (`POST /sales-payments`) — одразу проведена оплата з номером серії `sales-payments`. Після
 *   останнього очікування обробник нічого не чекає: два одночасні запити з тим самим `requestId` дають одну
 *   оплату, другий отримує її ж (200).
 * - Повернення (`POST /sales-refunds`) — те саме на рахунки з переплатою, кожному не більше за переплату;
 *   засів — половина переплати першого рахунку з переплатою в кожній компанії.
 * - Рахунки дає застосунок (`invoices`, моки модуля K2): модулі не імпортують один одного. Після кожної зміни
 *   оплат і повернень моки рахунків перераховують статус рахунку (`settle`): «Оплачено» ставить сервер.
 * - Обліковий документ (PF13): з `periodLock` дата в закритому періоді — 422 `period_locked`, «Скасувати» на
 *   оплаті закритого періоду заборонено; сторно датується сьогодні чи першим відкритим днем.
 * - Оплата у валюті (ADR-0071): з `rates` сервер рахує `exchange` на дату оплати; сторно бере курс першої.
 */
import { API_PREFIX } from "@/lib/api"
import type { CalendarDate } from "@/lib/dates"
import { withMockValues, type ExtensionField } from "@/lib/extension-fields"
import { withTransitionSamples } from "@/lib/mock-documents"
import type { NumberingMocks } from "@/lib/mock-numbering"
import type { MockDeniedRule } from "@/lib/mock-scope"
import {
  mergeTransitions,
  type ExtensionStatusChanges,
  type ExtensionTransitionChanges,
} from "@/lib/statuses"

import {
  OPEN_INVOICES_PATH,
  OVERPAID_INVOICES_PATH,
  PAYMENT_TRANSITIONS,
  paymentSchemaFor,
  PAYMENTS,
  PAYMENTS_RESOURCES,
  RECEIVED_STATUS,
  REFUND_TRANSITIONS,
  REFUNDED_STATUS,
  refundSchemaFor,
  REFUNDS,
  type Payment,
} from "./contract"
import type { PaymentsMockExtension } from "./extension"
import type { FixtureLocale } from "./fixtures"
import {
  createMoneyDocumentMocks,
  type MoneyDocumentMocksContext,
  type PeriodLockMocks,
} from "./mock-money-documents"
import { paymentFixtures, type PaymentMockRates } from "./mock-fixtures"
import {
  openInvoicesOf,
  overpaidInvoicesOf,
  PAYMENT_RULE,
  REFUND_RULE,
  type PaymentInvoices,
} from "./mock-payments"

export {
  paymentsNumberingSeeds,
  type PaymentMockRates,
  type PaymentSeedOptions,
} from "./mock-fixtures"
export type { PaymentInvoices, PaymentInvoiceSource } from "./mock-payments"

export interface PaymentsMocksOptions {
  /** Рахунки застосунку (`createInvoicesMocks(...).forPayments`). */
  readonly invoices: PaymentInvoices
  /** Нумерація проекту з серіями `sales-payments` і `sales-refunds` (`paymentsNumberingSeeds`). */
  readonly numbering: Pick<NumberingMocks, "forResource">
  /** Поля, статуси й переходи розширення проекту — дані без компонентів. */
  readonly extension?: PaymentsMockExtension
  /** Початок адрес API, як у `createResourceHandlers` (за замовчуванням `/api/v1`). */
  readonly baseUrl?: string
  /** Свої заборони проекту на записі оплати (`deniedActions`, ADR-0037). */
  readonly deniedActions?: MockDeniedRule<Payment>
  /** Закриті періоди (PF13): без них оплати й повернення не знають про закриття. */
  readonly periodLock?: PeriodLockMocks
  /** Курси компанії (ADR-0071): без них документ у валюті не має суми в базовій валюті. */
  readonly rates?: PaymentMockRates
  readonly locale?: FixtureLocale
  /** Сьогодні: від нього дати засіву. Тести ставлять сталу дату. */
  readonly today?: CalendarDate
}

/** Засів із полями й статусами розширення: приклади переходів і значення полів. */
function seeded(
  documents: Payment[],
  extension:
    | {
        readonly fields?: readonly ExtensionField[] | undefined
        readonly statuses?: ExtensionStatusChanges | undefined
        readonly transitions?: ExtensionTransitionChanges | undefined
      }
    | undefined,
) {
  return withMockValues(
    withTransitionSamples(
      documents,
      extension?.statuses,
      extension?.transitions,
    ),
    extension?.fields,
  )
}

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
  const context: MoneyDocumentMocksContext = {
    invoices,
    numbering,
    baseUrl,
    periodLock,
    rates,
    today,
  }
  // Свіжий засів на кожне скидання моків: оплати й повернення — від того самого засіву рахунків.
  const fixtures = () =>
    paymentFixtures(invoices.seed(), { locale, today, rates })
  const payments = createMoneyDocumentMocks(
    {
      resource: PAYMENTS,
      label: PAYMENTS_RESOURCES[0]?.label,
      schema: paymentSchemaFor(extension),
      transitions: mergeTransitions(
        PAYMENT_TRANSITIONS,
        extension?.transitions,
      ),
      createdStatus: RECEIVED_STATUS,
      targetsPath: OPEN_INVOICES_PATH,
      rule: PAYMENT_RULE,
      targetRows: openInvoicesOf,
      data: () => seeded(fixtures().payments, extension),
      deniedActions,
    },
    context,
  )
  const refundsExtension = extension?.refunds
  const refunds = createMoneyDocumentMocks(
    {
      resource: REFUNDS,
      label: PAYMENTS_RESOURCES[1]?.label,
      schema: refundSchemaFor(refundsExtension),
      transitions: mergeTransitions(
        REFUND_TRANSITIONS,
        refundsExtension?.transitions,
      ),
      createdStatus: REFUNDED_STATUS,
      targetsPath: OVERPAID_INVOICES_PATH,
      rule: REFUND_RULE,
      targetRows: overpaidInvoicesOf,
      data: () => seeded(fixtures().refunds, refundsExtension),
    },
    context,
  )
  return {
    handlers: [...payments.handlers, ...refunds.handlers],
    db: payments.db,
    /** Сховище повернень (ADR-0083). */
    refundsDb: refunds.db,
    /** Оплачене за рахунком: оплати, що діють (для `createInvoicesMocks({ payments })`). */
    paidTotal: (invoiceId: string) => payments.byInvoice().get(invoiceId) ?? 0,
    /** Повернене за рахунком: повернення, що діють (для `createInvoicesMocks({ payments })`). */
    refundedTotal: (invoiceId: string) =>
      refunds.byInvoice().get(invoiceId) ?? 0,
    /** Джерело потоку документів: оплата — «на підставі» кожного свого рахунку. */
    flowSource: payments.flowSource,
    /** Джерела потоку: оплати й повернення (`createDocumentFlowHandlers({ sources })`). */
    flowSources: [payments.flowSource, refunds.flowSource],
  }
}
