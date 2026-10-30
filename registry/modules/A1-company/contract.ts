/**
 * Контракт модуля A1 «Компанія й валюти» (SPEC §14, §17; ADR-0002, ADR-0043).
 *
 * Компанія — контракт `lib/company`: `GET`/`PATCH /company` (реквізити й локалізація), логотип і
 * печатка, філії. Модуль додає два ресурси (`/api/v1/<ресурс>`, плоскі параметри списку, відповідь
 * `{ data, total }`), усе в межах компанії запиту (`X-Company-Id`):
 *
 * - `currencies` — валюти, якими працює компанія, крім базової. `code` — ISO 4217, не повторюється в
 *   компанії (422 `code: duplicate`). `POST` з `{ code }`: нова валюта активна. `PATCH` з
 *   `{ active, version }`: видаляти валюти не можна, вимкнена валюта лишається в старих документах.
 *   `latestRate` і `latestRateDate` рахує сервер з `exchange-rates`.
 * - `exchange-rates` — курси: скільки базової валюти за 1 одиницю `currency` на дату `date`
 *   (`YYYY-MM-DD`, без часу). Один курс на валюту й дату (422 `date: duplicate`). `source` ставить
 *   сервер: `manual` — ввела людина, `nbu` — завантажив сервер проекту, інший код — показуємо як є.
 *   Фільтри: `currency`, `date_gte`, `date_lte`, `source`; сортування `date`, `currency`, `rate`.
 * - Курс із зовнішнього джерела людина не змінює: сервер мітить його `deniedActions`
 *   (`{ update: "source", delete: "source" }`, ADR-0037) і відповідає 403.
 * - Права — `<ресурс>:<дія>`: `currencies` (`read`, `create`, `update`), `exchange-rates` (`read`,
 *   `create`, `update`, `delete`).
 *
 * Зміна базової валюти не перераховує курсів: це рішення бекенду проекту.
 *
 * Поля розширення проекту (ADR-0020) входять у схему курсу через `rateSchemaFor` і `rateSchemaFor`:
 * без них zod відкинув би нові поля відповіді.
 */
import { z } from "zod"

import { recordBaseSchema } from "@/lib/api"
import { isCalendarDate } from "@/lib/dates"
import { extendSchema, type ExtensionField } from "@/lib/extension-fields"

export {
  COMPANY,
  COMPANY_RESOURCES,
  CURRENCIES,
  EXCHANGE_RATES,
} from "./resources"

/** Джерела курсу зі своїм підписом; інший код сервера показуємо як є. */
export const RATE_SOURCES = ["manual", "nbu"] as const
export type RateSource = (typeof RATE_SOURCES)[number]
export const MANUAL_RATE_SOURCE: RateSource = "manual"
/** Код заборони в `deniedActions` курсу із зовнішнього джерела. */
export const RATE_SOURCE_DENIAL = "source"

/** Знаків після коми в курсі: НБУ публікує чотири, запас для малих валют. */
export const RATE_DECIMALS = 6

const currencyCode = z.string().regex(/^[A-Z]{3}$/, "invalid")
/** Запис належить компанії запиту. */
const recordShape = { companyId: z.string().nullable().optional() }

export const currencySchema = recordBaseSchema.extend({
  ...recordShape,
  code: currencyCode,
  active: z.boolean().default(true),
  latestRate: z.number().positive().nullable().optional(),
  latestRateDate: z.string().nullable().optional(),
})
export type Currency = z.infer<typeof currencySchema>

export const exchangeRateSchema = recordBaseSchema.extend({
  ...recordShape,
  currency: currencyCode,
  date: z.string().refine(isCalendarDate, "invalid"),
  rate: z.number().positive("invalid"),
  source: z.string().default(MANUAL_RATE_SOURCE),
})
export type ExchangeRate = z.infer<typeof exchangeRateSchema>

export interface RateSchemaExtension {
  readonly fields?: readonly ExtensionField[]
}

export const rateSchemaFor = (extension?: RateSchemaExtension) =>
  extendSchema(exchangeRateSchema, extension?.fields)
