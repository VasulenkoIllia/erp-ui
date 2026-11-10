/**
 * Сума документа в базовій валюті компанії (ADR-0071): довідка поруч із сумою документа, а не заміна. Курс
 * — таблиця курсів компанії (модуль A1): скільки базової валюти за 1 одиницю валюти документа на дату.
 *
 * - Рахує сервер: курс на дату документа, а коли на цю дату курсу немає — останній попередній, і його дату
 *   видно поруч. Поки документ чернетка, курс береться свіжий; проведення закріплює курс і суму, і
 *   виправлення курсу в таблиці їх уже не змінює. Сторно бере курс першого документа, сума з мінусом.
 * - Перерахунок — один раз, від підсумку документа з податком, а не від рядків: `total × курс`, округлення
 *   математичне (половина від нуля) до мінорної одиниці базової валюти. Рахуємо в BigInt, курс — до шести
 *   знаків після коми, як у таблиці курсів.
 * - `documentExchangeSchema` — блок контракту документа у валюті; документ у базовій валюті блоку не має
 *   (`null`). Курсу немає — `rate`, `rateDate` і `baseTotal` порожні, документ від цього не ламається.
 */
import { z } from "zod"

import { moneyAmountSchema } from "@/registry/lib/api"
import { isCalendarDate } from "@/registry/lib/dates"
import { currencyDigits } from "@/registry/lib/format"

/** Знаків курсу після коми: як у таблиці курсів компанії. */
export const EXCHANGE_RATE_DECIMALS = 6

const RATE_SCALE = 10n ** BigInt(EXCHANGE_RATE_DECIMALS)
const MAX_AMOUNT = BigInt(Number.MAX_SAFE_INTEGER)

/** Перерахунок документа у валюті, який веде сервер. */
export const documentExchangeSchema = z.object({
  /** Базова валюта компанії на момент перерахунку, ISO 4217. */
  baseCurrency: z.string().length(3),
  /** Скільки базової валюти за 1 одиницю валюти документа; `null` — курсу немає. */
  rate: z.number().positive().nullable(),
  /** Дата курсу в таблиці: дата документа чи остання перед нею. */
  rateDate: z.string().refine(isCalendarDate).nullable(),
  /** Підсумок документа в базовій валюті, мінорні одиниці; у сторно — з мінусом. */
  baseTotal: moneyAmountSchema.nullable(),
})
export type DocumentExchange = z.infer<typeof documentExchangeSchema>

/** Курс до шести знаків цілим числом мільйонних: 41.2534 → 41253400. */
function scaledRate(rate: number): bigint {
  const scaled = Math.round(rate * Number(RATE_SCALE))
  if (!(Number.isFinite(rate) && rate > 0 && scaled > 0))
    throw new RangeError(`Некоректний курс: ${String(rate)}`)
  return BigInt(scaled)
}

/**
 * Сума в мінорних одиницях `from` → мінорні одиниці `to` за курсом (скільки `to` за 1 одиницю `from`):
 * 100000 (1000,00 USD) × 41,2534 → 4125340 (41 253,40 ₴). Половина копійки — від нуля. Сума за межами
 * безпечного цілого — RangeError, а не втрачена точність.
 */
export function convertMinorAmount(
  amount: number,
  from: string,
  rate: number,
  to: string,
): number {
  if (!Number.isSafeInteger(amount))
    throw new RangeError(`Некоректна сума: ${String(amount)}`)
  const magnitude = BigInt(Math.abs(amount))
  const numerator =
    magnitude * scaledRate(rate) * 10n ** BigInt(currencyDigits(to))
  const divisor = RATE_SCALE * 10n ** BigInt(currencyDigits(from))
  const rounded = (2n * numerator + divisor) / (2n * divisor)
  if (rounded > MAX_AMOUNT)
    throw new RangeError(`Сума ${String(amount)} ${from} у ${to} завелика`)
  return Number(rounded) * Math.sign(amount) || 0
}

/** Курс таблиці, за яким перераховано документ. */
export interface ExchangeRateOn {
  readonly rate: number
  readonly date: string
}

/**
 * Перерахунок документа, як його віддає сервер: `null` — документ у базовій валюті; без курсу — блок із
 * порожніми курсом і сумою. Беруть моки модулів документів.
 */
export function documentExchangeOf(
  document: { readonly currency: string; readonly total: number },
  baseCurrency: string,
  rate: ExchangeRateOn | null,
): DocumentExchange | null {
  if (document.currency === baseCurrency) return null
  return {
    baseCurrency,
    rate: rate?.rate ?? null,
    rateDate: rate?.date ?? null,
    baseTotal: rate
      ? convertMinorAmount(
          document.total,
          document.currency,
          rate.rate,
          baseCurrency,
        )
      : null,
  }
}
