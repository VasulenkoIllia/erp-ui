/**
 * Сума рахунку в базовій валюті в моках (ADR-0071): курс таблиці курсів компанії на дату рахунку. Таблицю
 * веде модуль A1 (`createCompanyMocks(...).rateOn`): модулі не імпортують один одного, зв'язок — у
 * застосунку.
 */
import {
  documentExchangeOf,
  type DocumentExchange,
  type ExchangeRateOn,
} from "@/lib/currency-conversion"
import type { CalendarDate } from "@/lib/dates"

import type { Invoice } from "./contract"

/** Курси для моків рахунків: базова валюта компанії й курс на дату чи останній перед нею. */
export interface InvoiceMockRates {
  readonly baseCurrency: (companyId: string | null) => string
  readonly rateOn: (
    companyId: string | null,
    currency: string,
    date: CalendarDate,
  ) => ExchangeRateOn | null
}

/** Перерахунок рахунку за курсом на його дату, як його віддає сервер; без курсів моків — `null`. */
export function invoiceExchange(
  invoice: Pick<Invoice, "companyId" | "currency" | "date" | "total">,
  rates: InvoiceMockRates | undefined,
): DocumentExchange | null {
  if (!rates) return null
  const companyId = invoice.companyId ?? null
  return documentExchangeOf(
    invoice,
    rates.baseCurrency(companyId),
    rates.rateOn(companyId, invoice.currency, invoice.date),
  )
}

/** Сторно — за курсом першого рахунку, сума в базовій валюті з мінусом, як і `total`. */
export function reversedExchange(
  exchange: DocumentExchange | null | undefined,
): DocumentExchange | null {
  if (!exchange) return null
  return {
    ...exchange,
    baseTotal: exchange.baseTotal === null ? null : -exchange.baseTotal,
  }
}
