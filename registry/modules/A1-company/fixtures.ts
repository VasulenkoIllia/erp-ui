/**
 * Демо-дані модуля A1 (SPEC §17): валюти й курси для кожної компанії. Курси — детермінований ряд
 * навколо реальних значень: USD і EUR ніби завантажив сервер з НБУ, PLN ввели вручну. Дати — відносно
 * сьогодні, щоб таблиця завжди мала свіжий курс. Вони ж — шаблон даних для першого запуску (PF12).
 */
import {
  MANUAL_RATE_SOURCE,
  type Currency,
  type ExchangeRate,
} from "./contract"

export interface CompanyFixtureOptions {
  /** Компанії застосунку; за замовчуванням — один спільний набір (`null`, застосунок без компаній). */
  readonly companies?: readonly (string | null)[]
}

export interface CompanyFixtures {
  readonly currencies: Currency[]
  readonly rates: ExchangeRate[]
}

const DAY_MS = 24 * 60 * 60 * 1000
const AUTO_RATE_DAYS = 30
const MANUAL_RATE_DAYS = 10

const SERIES = [
  { code: "USD", base: 41.25, source: "nbu", days: AUTO_RATE_DAYS },
  { code: "EUR", base: 48.1, source: "nbu", days: AUTO_RATE_DAYS },
  {
    code: "PLN",
    base: 11.3,
    source: MANUAL_RATE_SOURCE,
    days: MANUAL_RATE_DAYS,
  },
] as const
/** Вимкнена валюта без курсів: стан «немає курсу» в списку. */
const DISABLED_CODE = "GBP"

const dateOf = (today: Date, daysAgo: number) =>
  new Date(today.getTime() - daysAgo * DAY_MS).toISOString().slice(0, 10)

/** Коливання курсу в межах 1%, однакове від запуску до запуску. */
const rateOn = (base: number, day: number) =>
  Math.round(base * (1 + Math.sin(day / 3) * 0.01) * 10_000) / 10_000

export function createCompanyFixtures({
  companies = [null],
}: CompanyFixtureOptions = {}): CompanyFixtures {
  const today = new Date()
  const scope = (companyId: string | null) => companyId ?? "shared"
  const currencies: Currency[] = []
  const rates: ExchangeRate[] = []
  for (const companyId of companies) {
    for (const { code, base, source, days } of SERIES) {
      currencies.push({
        id: `currency-${scope(companyId)}-${code}`,
        version: 1,
        companyId,
        code,
        active: true,
        latestRate: rateOn(base, 0),
        latestRateDate: dateOf(today, 0),
      })
      for (let day = 0; day < days; day += 1) {
        const date = dateOf(today, day)
        rates.push({
          id: `rate-${scope(companyId)}-${code}-${date}`,
          version: 1,
          companyId,
          currency: code,
          date,
          rate: rateOn(base, day),
          source,
        })
      }
    }
    currencies.push({
      id: `currency-${scope(companyId)}-${DISABLED_CODE}`,
      version: 1,
      companyId,
      code: DISABLED_CODE,
      active: false,
      latestRate: null,
      latestRateDate: null,
    })
  }
  return { currencies, rates }
}
