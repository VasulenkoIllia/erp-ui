/**
 * Форматування чисел, сум і дат через Intl (SPEC §11). Жодних ручних шаблонів на кшталт "DD.MM.YYYY".
 *
 * - Функції чисті й приймають локаль явно: мова друкованих документів може відрізнятися від мови інтерфейсу.
 * - `useFormat()` — ті самі функції з локаллю поточної мови інтерфейсу.
 * - Гроші — цілі мінорні одиниці + код валюти (SPEC §17): { amount: 4860000, currency: "UAH" } → «48 600,00 ₴».
 *   Гривня — символом «₴», інші валюти — кодом: «1 200,00 USD» (рішення власника 13.10.2026).
 * - Дати — лише явні стилі (`DATE_STYLES`); рядок "2026-10-13" — календарна дата без зсуву часового поясу.
 *   «р.» після року не пишемо: «13 жовтня 2026», «жовтень 2026» (SPEC §11).
 * - Час — 24-годинний; тиждень — з понеділка, номери тижнів — ISO 8601.
 */
import { useMemo } from "react"

import { useLanguage } from "@/registry/lib/i18n"

export interface Money {
  /** Ціле число мінорних одиниць (копійок, центів). */
  amount: number | bigint
  /** Код валюти ISO 4217: UAH, USD, EUR, PLN… */
  currency: string
}

/** Значення дати: Date, мітка часу ISO 8601 ("2026-10-13T11:30:00Z") або календарна дата ("2026-10-13"). */
export type DateValue = Date | string | number

export const DATE_STYLES = {
  /** 13.10.2026 · 13/10/2026 */
  date: { day: "2-digit", month: "2-digit", year: "numeric" },
  /** 13 жовт. 2026 · 13 Oct 2026 */
  medium: { day: "numeric", month: "short", year: "numeric" },
  /** 13 жовтня 2026 · 13 October 2026 */
  long: { day: "numeric", month: "long", year: "numeric" },
  /** 13 жовтня · 13 October */
  dayMonth: { day: "numeric", month: "long" },
  /** Заголовок календаря, називний відмінок: жовтень 2026 · October 2026 */
  monthYear: { month: "long", year: "numeric" },
  /** вівторок, 13 жовтня · Tuesday 13 October */
  weekdayDayMonth: { weekday: "long", day: "numeric", month: "long" },
  /** 14:30 */
  time: { hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
  /** 13.10.2026, 14:30 · 13/10/2026, 14:30 */
  dateTime: {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>

export type DateStyle = keyof typeof DATE_STYLES

export interface DateOptions {
  /** Часовий пояс для міток часу, напр. "Europe/Kyiv". За замовчуванням — пояс пристрою. */
  timeZone?: string
}

const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>()

function numberFormat(locale: string, options: Intl.NumberFormatOptions) {
  const key = `n|${locale}|${JSON.stringify(options)}`
  let nf = cache.get(key) as Intl.NumberFormat | undefined
  if (!nf) {
    nf = new Intl.NumberFormat(locale, options)
    cache.set(key, nf)
  }
  return nf
}

function dateFormat(locale: string, options: Intl.DateTimeFormatOptions) {
  const key = `d|${locale}|${JSON.stringify(options)}`
  let df = cache.get(key) as Intl.DateTimeFormat | undefined
  if (!df) {
    df = new Intl.DateTimeFormat(locale, options)
    cache.set(key, df)
  }
  return df
}

export function formatNumber(
  value: number | bigint,
  locale: string,
  options: Intl.NumberFormatOptions = {},
): string {
  return numberFormat(locale, options).format(value)
}

/** Частка → відсотки: 0.2 → «20%». */
export function formatPercent(
  value: number,
  locale: string,
  options: Intl.NumberFormatOptions = {},
): string {
  return numberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
    ...options,
  }).format(value)
}

/** Кількість знаків після коми для валюти: UAH 2, JPY 0, KWD 3. */
export function currencyDigits(currency: string): number {
  return (
    numberFormat("en", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  )
}

/** Мінорні одиниці → точний десятковий рядок без похибок float: 4860050 → "48600.50". */
export function minorToDecimal(
  amount: number | bigint,
  digits: number,
): string {
  if (typeof amount === "number" && !Number.isSafeInteger(amount)) {
    throw new RangeError(
      `Сума має бути цілим числом мінорних одиниць, отримано ${String(amount)}`,
    )
  }
  const big = BigInt(amount)
  const negative = big < 0n
  const abs = (negative ? -big : big).toString().padStart(digits + 1, "0")
  const decimal =
    digits > 0 ? `${abs.slice(0, -digits)}.${abs.slice(-digits)}` : abs
  return negative ? `-${decimal}` : decimal
}

export function formatMoney(money: Money, locale: string): string {
  const currency = money.currency.toUpperCase()
  const nf = numberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: currency === "UAH" ? "narrowSymbol" : "code",
  })
  // Рядок форматується точно (Intl.NumberFormat v3): копійки великих сум не губляться.
  return nf.format(
    minorToDecimal(
      money.amount,
      currencyDigits(currency),
    ) as Intl.StringNumericLiteral,
  )
}

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Рядок/число/Date → Date і часовий пояс, у якому його показувати. */
function resolveDate(
  value: DateValue,
  timeZone: string | undefined,
): { date: Date; timeZone: string | undefined } {
  if (typeof value === "string") {
    const m = CALENDAR_DATE.exec(value)
    // Календарна дата (дата документа, дата народження) не зсувається часовим поясом.
    if (m)
      return {
        date: new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))),
        timeZone: "UTC",
      }
  }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime()))
    throw new RangeError(`Некоректна дата: ${String(value)}`)
  return { date, timeZone }
}

export function formatDate(
  value: DateValue,
  style: DateStyle,
  locale: string,
  { timeZone }: DateOptions = {},
): string {
  const resolved = resolveDate(value, timeZone)
  const zone = resolved.timeZone ? { timeZone: resolved.timeZone } : {}
  const options: Intl.DateTimeFormatOptions = DATE_STYLES[style]
  return dateFormat(locale, { ...options, ...zone })
    .formatToParts(resolved.date)
    .filter((part) => !(part.type === "literal" && part.value.trim() === "р."))
    .map((part) =>
      // Частина версій CLDR (зокрема в Chromium) ставить день тижня поруч із датою в знахідний
      // відмінок («неділю, 11 жовтня»); окремий день тижня завжди в називному — беремо його.
      part.type === "weekday" && options.weekday
        ? dateFormat(locale, { weekday: options.weekday, ...zone }).format(
            resolved.date,
          )
        : part.value,
    )
    .join("")
    .trim()
}

/** Рік, місяць і день моменту часу в заданому часовому поясі. */
function calendarParts(date: Date, timeZone: string | undefined) {
  const parts = dateFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value)
  return { year: get("year"), month: get("month"), day: get("day") }
}

/** Номер календарного дня (днів від 1970-01-01) у заданому часовому поясі. */
function dayNumber(date: Date, timeZone: string | undefined): number {
  const { year, month, day } = calendarParts(date, timeZone)
  return Date.UTC(year, month - 1, day) / 86_400_000
}

export interface RelativeOptions extends DateOptions {
  /** Момент відліку; за замовчуванням — зараз. */
  now?: Date
}

/**
 * Відносний час для стрічок і «Оновлено …»: «зараз», «5 хвилин тому», «3 години тому», «учора»,
 * «4 дні тому»; далі — дата («11 жовтня», в інший рік — «11 жовтня 2025»). Майбутнє — «через …».
 */
export function formatRelative(
  value: DateValue,
  locale: string,
  { now = new Date(), timeZone }: RelativeOptions = {},
): string {
  const { date } = resolveDate(value, timeZone)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
  const seconds = (date.getTime() - now.getTime()) / 1000
  const abs = Math.abs(seconds)
  if (abs < 60) return rtf.format(0, "second")
  if (abs < 3600) return rtf.format(Math.trunc(seconds / 60), "minute")
  const days = dayNumber(date, timeZone) - dayNumber(now, timeZone)
  if (days === 0) return rtf.format(Math.trunc(seconds / 3600), "hour")
  if (Math.abs(days) < 7) return rtf.format(days, "day")
  const sameYear =
    calendarParts(date, timeZone).year === calendarParts(now, timeZone).year
  return formatDate(date, sameYear ? "dayMonth" : "long", locale, { timeZone })
}

/** Тиждень за ISO 8601 (понеділок — перший день; 1-й тиждень містить перший четвер року). */
export function isoWeek(
  value: DateValue,
  options: DateOptions = {},
): {
  year: number
  week: number
} {
  const { date, timeZone } = resolveDate(value, options.timeZone)
  const day = dayNumber(date, timeZone)
  const utc = new Date(day * 86_400_000)
  const weekday = utc.getUTCDay() || 7
  // Четвер того самого тижня визначає рік тижня.
  utc.setUTCDate(utc.getUTCDate() + 4 - weekday)
  const year = utc.getUTCFullYear()
  const week = Math.ceil(
    ((utc.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7,
  )
  return { year, week }
}

/** Категорія множини для числа: uk 21 → "one", 22 → "few", 25 → "many". */
export function pluralCategory(
  count: number,
  locale: string,
): Intl.LDMLPluralRule {
  return new Intl.PluralRules(locale).select(count)
}

/** Форматери з локаллю поточної мови інтерфейсу. */
export function useFormat() {
  const { locale } = useLanguage()
  return useMemo(
    () => ({
      locale,
      number: (value: number | bigint, options?: Intl.NumberFormatOptions) =>
        formatNumber(value, locale, options),
      percent: (value: number, options?: Intl.NumberFormatOptions) =>
        formatPercent(value, locale, options),
      money: (money: Money) => formatMoney(money, locale),
      date: (value: DateValue, style: DateStyle, options?: DateOptions) =>
        formatDate(value, style, locale, options),
      relative: (value: DateValue, options?: RelativeOptions) =>
        formatRelative(value, locale, options),
    }),
    [locale],
  )
}
