/**
 * Моки модуля A1 на MSW (ADR-0002, ADR-0003, ADR-0043): валюти й курси компанії запиту. Сценарії
 * `success`, `error`, `empty`, `slow`, `conflict`, `forbidden`, `offline` — для кожного ресурсу окремо
 * (`lib/mock-scenarios`, панель розробника), права — `<ресурс>:<дія>`. Компанія — моки платформи
 * (`lib/mock-company`, ресурс сценаріїв `company`), модуль їх не дублює.
 *
 *   const company = createCompanyMocks({ extension: companyMockExtension, companies: ["zoriana"] })
 *   setupWorker(...platform, ...company.handlers)
 *
 * - Один курс на валюту й дату: `POST` і `PATCH` — 422 `date: duplicate`.
 * - Курс із зовнішнього джерела — `deniedActions` і 403 на зміну чи видалення (ADR-0037).
 * - `latestRate` і `latestRateDate` валюти веде мок: після кожної зміни курсів (подія шини) бере
 *   найновіший курс тієї ж валюти в тій самій компанії. Підписка — на весь час життя моків, як у A2.
 */
import { withMockValues } from "@/lib/extension-fields"
import { subscribeMockEvents } from "@/lib/mock-server"
import { createResourceHandlers } from "@/lib/mocks"

import {
  COMPANY_RESOURCES,
  CURRENCIES,
  currencySchema,
  EXCHANGE_RATES,
  MANUAL_RATE_SOURCE,
  RATE_SOURCE_DENIAL,
  rateSchemaFor,
  type Currency,
  type ExchangeRate,
} from "./contract"
import type { CompanyMockExtension } from "./extension"
import { createCompanyFixtures, type CompanyFixtureOptions } from "./fixtures"

export interface CompanyMocksOptions extends CompanyFixtureOptions {
  /** Поля розширення проекту — дані без компонентів. */
  readonly extension?: CompanyMockExtension
  /** Початок адрес API, як у `createResourceHandlers` (за замовчуванням `/api/v1`). */
  readonly baseUrl?: string
}

const labelOf = (name: string) =>
  COMPANY_RESOURCES.find((resource) => resource.name === name)?.label

/** Найновіший курс кожної валюти компанії: ключ — компанія й код. */
function latestRates(rates: readonly ExchangeRate[]) {
  const latest = new Map<string, ExchangeRate>()
  for (const rate of rates) {
    const key = `${rate.companyId ?? ""}:${rate.currency}`
    const current = latest.get(key)
    if (!current || rate.date > current.date) latest.set(key, rate)
  }
  return latest
}

export function createCompanyMocks({
  extension,
  baseUrl,
  companies,
}: CompanyMocksOptions = {}) {
  // Свіжі фікстури на кожне скидання: PATCH і подія курсів змінюють записи на місці.
  const fixtures = () => createCompanyFixtures({ companies })

  const currencies = createResourceHandlers<Currency>({
    resource: CURRENCIES,
    baseUrl,
    schema: currencySchema,
    data: () => fixtures().currencies,
    searchFields: ["code"],
    label: labelOf(CURRENCIES),
    fieldLabels: {
      code: { uk: "Код", en: "Code" },
      active: { uk: "Активна", en: "Active" },
    },
    unique: ["code"],
  })

  const rates = createResourceHandlers<ExchangeRate>({
    resource: EXCHANGE_RATES,
    baseUrl,
    schema: rateSchemaFor(extension?.rates),
    data: () => withMockValues(fixtures().rates, extension?.rates?.fields),
    searchFields: ["currency"],
    label: labelOf(EXCHANGE_RATES),
    titleField: "currency",
    fieldLabels: {
      currency: { uk: "Валюта", en: "Currency" },
      date: { uk: "Дата", en: "Date" },
      rate: { uk: "Курс", en: "Rate" },
    },
    unique: [["currency", "date"]],
    deniedActions: (_actor, rate) =>
      rate.source === MANUAL_RATE_SOURCE
        ? undefined
        : { update: RATE_SOURCE_DENIAL, delete: RATE_SOURCE_DENIAL },
  })

  subscribeMockEvents((event) => {
    if (!event.type.startsWith(`${EXCHANGE_RATES}.`)) return
    const latest = latestRates(rates.db.all())
    for (const currency of currencies.db.all()) {
      const rate = latest.get(`${currency.companyId ?? ""}:${currency.code}`)
      currency.latestRate = rate?.rate ?? null
      currency.latestRateDate = rate?.date ?? null
    }
  })

  return {
    handlers: [...currencies.handlers, ...rates.handlers],
    db: { currencies: currencies.db, rates: rates.db },
  }
}
