/**
 * Засів моків модуля K4 (ADR-0073): курс оплати на її дату, оплати засіву від рахунків засіву застосунку й
 * засів серії номерів. Частина `mocks.ts`: застосунок бере `paymentsNumberingSeeds` звідти.
 */
import {
  documentExchangeOf,
  type DocumentExchange,
  type ExchangeRateOn,
} from "@/lib/currency-conversion"
import type { CalendarDate } from "@/lib/dates"
import type {
  MockNumberingCounterSeed,
  MockNumberingSeriesSeed,
} from "@/lib/mock-numbering"

import { PAYMENTS, type Payment } from "./contract"
import {
  createPaymentFixtures,
  PAYMENT_NUMBER_TEMPLATE,
  type FixtureLocale,
} from "./fixtures"
import type { PaymentInvoiceSource } from "./mock-payments"

/** Курси для моків оплат: базова валюта компанії й курс на дату чи останній перед нею (моки модуля A1). */
export interface PaymentMockRates {
  readonly baseCurrency: (companyId: string | null) => string
  readonly rateOn: (
    companyId: string | null,
    currency: string,
    date: CalendarDate,
  ) => ExchangeRateOn | null
}

/** Опції засіву: ті самі, що в `createPaymentsMocks`. */
export interface PaymentSeedOptions {
  readonly locale?: FixtureLocale | undefined
  /** Сьогодні: від нього дати засіву. Тести ставлять сталу дату. */
  readonly today?: CalendarDate | undefined
  /** Курси компанії (ADR-0071): без них оплата у валюті не має суми в базовій валюті. */
  readonly rates?: PaymentMockRates | undefined
}

/** Курс оплати на її дату, як його віддає сервер; без курсів моків — `null`. */
export function paymentExchange(
  payment: Pick<Payment, "companyId" | "currency" | "date" | "amount">,
  rates: PaymentMockRates | undefined,
): DocumentExchange | null {
  if (!rates) return null
  const companyId = payment.companyId ?? null
  return documentExchangeOf(
    { currency: payment.currency, total: payment.amount },
    rates.baseCurrency(companyId),
    rates.rateOn(companyId, payment.currency, payment.date),
  )
}

/** Засів оплат від рахунків засіву застосунку: ті самі опції, що й у `createPaymentsMocks`. */
export function paymentFixtures(
  invoices: readonly PaymentInvoiceSource[],
  { locale, today, rates }: PaymentSeedOptions,
) {
  return createPaymentFixtures(invoices, {
    ...(locale ? { locale } : {}),
    ...(today ? { today } : {}),
    ...(rates
      ? {
          baseCurrency: rates.baseCurrency,
          exchange: (payment) => paymentExchange(payment, rates),
        }
      : {}),
  })
}

/**
 * Засів серії `sales-payments` для `createNumberingMocks` (ADR-0058): шаблон мовою даних у кожній компанії й
 * лічильники, які засів уже видав. `invoices` — рахунки засіву застосунку (`invoicePaymentSeed` моків K2).
 */
export function paymentsNumberingSeeds({
  invoices,
  companies = [null],
  ...options
}: PaymentSeedOptions & {
  readonly invoices: readonly PaymentInvoiceSource[]
  readonly companies?: readonly (string | null)[]
}): {
  series: MockNumberingSeriesSeed[]
  counters: MockNumberingCounterSeed[]
} {
  const template = PAYMENT_NUMBER_TEMPLATE[options.locale ?? "uk"]
  return {
    series: companies.map((companyId) => ({
      companyId,
      resource: PAYMENTS,
      template,
    })),
    counters: paymentFixtures(invoices, options).counters,
  }
}
