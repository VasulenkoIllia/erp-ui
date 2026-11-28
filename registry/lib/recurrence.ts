/**
 * Повтори (UI41, ADR-0104): правило — підмножина RRULE з RFC 5545, той самий рядок, яким обмінюються календарі й
 * який розгортають бібліотеки сервера будь-якою мовою. Без бібліотеки в кіті.
 *
 * - Значення на сервері — `Recurrence`: перше повторення `start` (календарна дата "2026-12-05" чи дата з часом на
 *   годиннику поясу "2026-12-05T09:00"), правило `rule` без префікса "RRULE:" і пояс IANA `timeZone`. Для бібліотеки
 *   сервера це `DTSTART;VALUE=DATE:20261205` чи `DTSTART;TZID=<timeZone>:20261205T090000` і `RRULE:<rule>`.
 * - Пояс — у правилі: 09:00 на годиннику поясу лишається 09:00 і після переходу на зимовий час.
 * - Наступні дати рахує й зберігає сервер. Кіт рахує кілька найближчих для перевірки в редакторі й для моків.
 * - Повторення — дні не раніше за `start`, що підходять під правило; сам `start` — лише якщо підходить (як
 *   python-dateutil і rrule.js). `COUNT` рахує саме їх. Дня, якого в місяці немає (31-ше у квітні, 29 лютого в
 *   невисокосний рік), повтор пропускає, як RFC 5545.
 * - Підмножина: `FREQ` DAILY, WEEKLY, MONTHLY, YEARLY; `INTERVAL`; `BYDAY` щотижня (дні без номера); `BYMONTHDAY`
 *   щомісяця (одне число, -1 — останній день) і щороку з `BYMONTH` (один місяць); `UNTIL` або `COUNT`; `WKST=MO`.
 *   Інше правило `parseRecurrenceRule` не читає (`null`): редактор його не змінює й не губить. Читання поблажливе
 *   (регістр, пробіли, префікс "RRULE:"), запит (`recurrenceSchema`) — лише рядок, як його пише `formatRecurrenceRule`.
 * - `UNTIL` — день кінця включно в поясі правила: для `start` без часу — дата (`UNTIL=20261231`), з часом — кінець
 *   дня в UTC (`UNTIL=20261231T215959Z`), як вимагає RFC 5545. Читається з точністю до дня.
 */
import { z } from "zod"

import {
  addDays,
  calendarDateOf,
  daysBetween,
  daysInMonth,
  endOfDayIn,
  instantIn,
  isCalendarDate,
  isoWeekday,
  isTime,
  todayIn,
  type CalendarDate,
} from "@/registry/lib/dates"
import { isTimeZone } from "@/registry/lib/time-zone"

export const RECURRENCE_WEEKDAYS = [
  "MO",
  "TU",
  "WE",
  "TH",
  "FR",
  "SA",
  "SU",
] as const
export type RecurrenceWeekday = (typeof RECURRENCE_WEEKDAYS)[number]

export const RECURRENCE_FREQUENCIES = [
  "daily",
  "weekly",
  "monthly",
  "yearly",
] as const
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number]

/** Межі, які показує редактор: повтор раз на сто років чи тисячу разів у задачі — помилка введення. */
export const RECURRENCE_INTERVAL_MAX = 99
export const RECURRENCE_COUNT_MAX = 999
/** `BYMONTHDAY=-1`: останній день місяця. */
export const LAST_DAY_OF_MONTH = -1

/** Значення повтору в записі (задача, рахунок, подія). */
export interface Recurrence {
  start: string
  rule: string
  timeZone: string
}

/** Перше повторення й пояс: усе, що правилу треба знати поза рядком. */
export type RecurrenceContext = Pick<Recurrence, "start" | "timeZone">

/** Кінець: без кінця, кількість чи день кінця включно в поясі правила. */
export type RecurrenceRuleEnd =
  | { readonly count?: never; readonly until?: never }
  | { readonly count: number; readonly until?: never }
  | { readonly until: CalendarDate; readonly count?: never }

/** Частота з її частинами. */
export type RecurrencePattern =
  | { readonly frequency: "daily" }
  | {
      readonly frequency: "weekly"
      /** Від понеділка, без повторів. */
      readonly weekdays: readonly [RecurrenceWeekday, ...RecurrenceWeekday[]]
    }
  | {
      readonly frequency: "monthly"
      /** 1–31 чи `LAST_DAY_OF_MONTH`. */
      readonly monthDay: number
    }
  | {
      readonly frequency: "yearly"
      readonly month: number
      readonly monthDay: number
    }

/** Правило підмножини, розібране для редактора й розрахунку. */
export type RecurrenceRule = RecurrencePattern &
  RecurrenceRuleEnd & { readonly interval: number }

/** Повторення: день у поясі правила й мить ISO 8601 (UTC), коли перше повторення з часом. */
export interface RecurrenceOccurrence {
  readonly date: CalendarDate
  readonly at: string | null
}

export interface OccurrenceOptions {
  /** Скільки повторень повернути, не більше `OCCURRENCES_MAX`. */
  limit: number
  /** Не раніше за цей день (типово — перший день): найближчі від сьогодні. `COUNT` рахує від першого дня. */
  from?: CalendarDate
}

/** День, який повтор пропускає: текст редактора називає його. */
export type RecurrenceSkip =
  "shortMonths" | "february" | "februaryNonLeap" | "leapYears"

/** Код помилки `recurrenceSchema` у `message`. */
export type RecurrenceIssue =
  "invalid_start" | "invalid_time_zone" | "unsupported" | "until_before_start"

const START = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?$/
const FREQUENCY_CODES: Partial<Record<string, RecurrenceFrequency>> = {
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
  YEARLY: "yearly",
}
const KNOWN_PARTS = new Set([
  "FREQ",
  "INTERVAL",
  "BYDAY",
  "BYMONTHDAY",
  "BYMONTH",
  "UNTIL",
  "COUNT",
  "WKST",
])
const POSITIVE = /^[1-9]\d*$/
const UNTIL_VALUE = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?$/
/** Рядок правила в запиті — як його пише `formatRecurrenceRule`: великі літери, без пробілів і префікса. */
const RULE_TEXT = /^[A-Z0-9=;,-]+$/
const RULE_MAX_LENGTH = 500
/** Високосний рік: у ньому найбільше днів кожного місяця, тож «29 лютого» показується з нього. */
const LEAP_YEAR = 2028
/** Невисокосний рік: у ньому лютий найкоротший. */
const COMMON_YEAR = 2027
/** Останній рік календарних дат (`YYYY`). */
const YEAR_MAX = 9999
/** Назва поясу IANA: кожна частина з великої літери ("Europe/Kyiv", "UTC"); "+02:00" і "europe/kyiv" — ні. */
const ZONE_NAME = /^[A-Z][A-Za-z0-9_+-]*(?:\/[A-Z][A-Za-z0-9_+-]*)*$/
/** Найбільше повторень за виклик: серію розгортає сервер, кіт — кілька найближчих. */
const OCCURRENCES_MAX = 1000
/** Запобіжник: правило, далеке від `from` чи без днів, не крутить цикл без кінця; повертає знайдене. */
const MAX_PERIODS = 50_000

const isWeekday = (value: string): value is RecurrenceWeekday =>
  (RECURRENCE_WEEKDAYS as readonly string[]).includes(value)

const isNonEmpty = <T>(list: readonly T[]): list is readonly [T, ...T[]] =>
  list.length > 0

/** Дні від понеділка без повторів. */
function orderedWeekdays(days: readonly string[]): RecurrenceWeekday[] {
  return RECURRENCE_WEEKDAYS.filter((day) => days.includes(day))
}

const inRange = (value: number, min: number, max: number) =>
  Number.isInteger(value) && value >= min && value <= max

/** Найбільше днів у місяці (1–12) будь-якого року: щороку 29 лютого буває, 31 квітня — ні. */
export function maxDaysInMonth(month: number): number {
  return daysInMonth(LEAP_YEAR, month)
}

/** Дата високосного року з місяцем і днем — для показу «29 лютого» й назви місяця. */
export function yearDayDate(month: number, monthDay: number): CalendarDate {
  return calendarDateOf(LEAP_YEAR, month, monthDay)
}

/** День тижня календарної дати кодом RRULE. */
export function recurrenceWeekday(value: CalendarDate): RecurrenceWeekday {
  return RECURRENCE_WEEKDAYS[isoWeekday(value) - 1]
}

/** Дата й час першого повторення; null — рядок не `start`. */
export function recurrenceStartParts(
  start: string,
): { date: CalendarDate; time: string | null } | null {
  const match = START.exec(start)
  if (!match || !isCalendarDate(match[1])) return null
  if (match[2] !== undefined && !isTime(match[2])) return null
  return { date: match[1], time: match[2] ?? null }
}

function dateParts(value: CalendarDate): [number, number, number] {
  return value.split("-").map(Number) as [number, number, number]
}

/** Рядок "KEY=VALUE;…" → пари; повтор частини, порожня частина чи порожнє значення — null. */
function ruleParts(text: string): Map<string, string> | null {
  const body = text.trim().replace(/^RRULE:/i, "")
  if (!body) return null
  const result = new Map<string, string>()
  for (const part of body.split(";")) {
    const [key, value, ...rest] = part.split("=")
    const name = key.trim().toUpperCase()
    const content = value?.trim().toUpperCase()
    if (!name || !content || rest.length || result.has(name)) return null
    result.set(name, content)
  }
  return result
}

function positive(value: string, max: number): number | null {
  if (!POSITIVE.test(value)) return null
  const number = Number(value)
  return number <= max ? number : null
}

/** `UNTIL` → день кінця в поясі правила. */
function untilDate(value: string, timeZone: string): CalendarDate | null {
  const match = UNTIL_VALUE.exec(value)
  if (!match) return null
  const date = `${match[1]}-${match[2]}-${match[3]}`
  const time = match[4] === undefined ? null : `${match[4]}:${match[5]}`
  if (!isCalendarDate(date)) return null
  if (time === null) return date
  if (!isTime(time) || Number(match[6]) > 59) return null
  // Без «Z» — час на годиннику поясу правила, тобто той самий день.
  if (!match[7]) return date
  return todayIn(timeZone, new Date(`${date}T${time}:${match[6]}Z`))
}

function weekdayList(
  value: string,
): readonly [RecurrenceWeekday, ...RecurrenceWeekday[]] | null {
  const days = value.split(",")
  if (!days.every(isWeekday)) return null
  const ordered = orderedWeekdays(days)
  return isNonEmpty(ordered) ? ordered : null
}

/** Частота з її частинами; null — правило поза підмножиною. Частини, яких немає, — з першого дня. */
function patternOf(
  frequency: RecurrenceFrequency,
  parts: Map<string, string>,
  start: CalendarDate,
): RecurrencePattern | null {
  const [, startMonth, startDay] = dateParts(start)
  const byDay = parts.get("BYDAY")
  const byMonthDay = parts.get("BYMONTHDAY")
  const byMonth = parts.get("BYMONTH")
  if (frequency === "daily")
    return byDay === undefined &&
      byMonthDay === undefined &&
      byMonth === undefined
      ? { frequency }
      : null
  if (frequency === "weekly") {
    if (byMonthDay !== undefined || byMonth !== undefined) return null
    const weekdays =
      byDay === undefined
        ? ([recurrenceWeekday(start)] as const)
        : weekdayList(byDay)
    return weekdays ? { frequency, weekdays } : null
  }
  if (byDay !== undefined) return null
  if (frequency === "monthly") {
    if (byMonth !== undefined) return null
    if (byMonthDay === String(LAST_DAY_OF_MONTH))
      return { frequency, monthDay: LAST_DAY_OF_MONTH }
    const monthDay =
      byMonthDay === undefined ? startDay : positive(byMonthDay, 31)
    return monthDay ? { frequency, monthDay } : null
  }
  // Щороку день без місяця — це день кожного місяця року: поза підмножиною.
  if (byMonthDay !== undefined && byMonth === undefined) return null
  const month = byMonth === undefined ? startMonth : positive(byMonth, 12)
  const monthDay =
    byMonthDay === undefined ? startDay : positive(byMonthDay, 31)
  if (!month || !monthDay || monthDay > maxDaysInMonth(month)) return null
  return { frequency, month, monthDay }
}

function endOf(
  parts: Map<string, string>,
  timeZone: string,
): RecurrenceRuleEnd | null {
  const until = parts.get("UNTIL")
  const count = parts.get("COUNT")
  if (until !== undefined && count !== undefined) return null
  if (count !== undefined) {
    const value = positive(count, RECURRENCE_COUNT_MAX)
    return value ? { count: value } : null
  }
  if (until !== undefined) {
    const value = untilDate(until, timeZone)
    return value ? { until: value } : null
  }
  return {}
}

/** Рядок правила → підмножина; null — правило поза нею, `start` чи пояс хибні. */
export function parseRecurrenceRule(
  text: string,
  { start, timeZone }: RecurrenceContext,
): RecurrenceRule | null {
  const startParts = recurrenceStartParts(start)
  const parts = ruleParts(text)
  if (!startParts || !parts || !isTimeZone(timeZone)) return null
  if ([...parts.keys()].some((key) => !KNOWN_PARTS.has(key))) return null
  const frequency = FREQUENCY_CODES[parts.get("FREQ") ?? ""]
  if (!frequency) return null
  const intervalText = parts.get("INTERVAL")
  const interval =
    intervalText === undefined
      ? 1
      : positive(intervalText, RECURRENCE_INTERVAL_MAX)
  if (!interval) return null
  // Початок тижня змінює дні лише для «кожні N тижнів».
  const weekStart = parts.get("WKST")
  if (weekStart !== undefined && !isWeekday(weekStart)) return null
  if (
    weekStart !== undefined &&
    weekStart !== "MO" &&
    frequency === "weekly" &&
    interval > 1
  )
    return null
  const pattern = patternOf(frequency, parts, startParts.date)
  const end = endOf(parts, timeZone)
  return pattern && end ? { ...pattern, ...end, interval } : null
}

/** Чи правило в межах підмножини: тип не стереже чисел і днів. */
function isRuleInRange(rule: RecurrenceRule): boolean {
  if (!inRange(rule.interval, 1, RECURRENCE_INTERVAL_MAX)) return false
  if (rule.count !== undefined && !inRange(rule.count, 1, RECURRENCE_COUNT_MAX))
    return false
  if (rule.until !== undefined && !isCalendarDate(rule.until)) return false
  if (rule.frequency === "weekly")
    return rule.weekdays.length > 0 && rule.weekdays.every(isWeekday)
  if (rule.frequency === "monthly")
    return rule.monthDay === LAST_DAY_OF_MONTH || inRange(rule.monthDay, 1, 31)
  if (rule.frequency === "yearly")
    return (
      inRange(rule.month, 1, 12) &&
      inRange(rule.monthDay, 1, maxDaysInMonth(rule.month))
    )
  return true
}

function untilText(
  until: CalendarDate,
  { start, timeZone }: RecurrenceContext,
): string {
  if (!recurrenceStartParts(start)?.time) return until.replaceAll("-", "")
  // Кінець дня в поясі правила, до секунди, у UTC: 20261231T215959Z.
  return endOfDayIn(until, timeZone)
    .toISOString()
    .replace(/\.\d{3}/, "")
    .replace(/[-:]/g, "")
}

/**
 * Підмножина → рядок правила: частини завжди явні й у тому самому порядку, дні тижня — від понеділка, тож правило
 * не залежить від `start`. Правило поза межами (інтервал 0, 31 квітня) — помилка програми: `RangeError`.
 */
export function formatRecurrenceRule(
  rule: RecurrenceRule,
  context: RecurrenceContext,
): string {
  if (!isRuleInRange(rule))
    throw new RangeError("Правило повтору поза підмножиною")
  const parts = [`FREQ=${rule.frequency.toUpperCase()}`]
  if (rule.interval > 1) parts.push(`INTERVAL=${String(rule.interval)}`)
  if (rule.frequency === "weekly")
    parts.push(`BYDAY=${orderedWeekdays(rule.weekdays).join(",")}`)
  if (rule.frequency === "yearly") parts.push(`BYMONTH=${String(rule.month)}`)
  if (rule.frequency === "monthly" || rule.frequency === "yearly")
    parts.push(`BYMONTHDAY=${String(rule.monthDay)}`)
  if (rule.count !== undefined) parts.push(`COUNT=${String(rule.count)}`)
  else if (rule.until !== undefined)
    parts.push(`UNTIL=${untilText(rule.until, context)}`)
  return parts.join(";")
}

/**
 * Дні періоду `index` (0 — період `start`) за порядком; дні, яких у місяці немає, пропущено. null — період після
 * 9999 року: календарних дат там немає, серія скінчилась.
 */
function periodDays(
  rule: RecurrenceRule,
  start: CalendarDate,
  index: number,
): CalendarDate[] | null {
  const step = index * rule.interval
  const [year, month] = dateParts(start)
  if (rule.frequency === "daily") {
    const day = addDays(start, step)
    return isCalendarDate(day) ? [day] : null
  }
  if (rule.frequency === "weekly") {
    const monday = addDays(start, 1 - isoWeekday(start) + step * 7)
    if (!isCalendarDate(monday)) return null
    return orderedWeekdays(rule.weekdays).map((day) =>
      addDays(monday, RECURRENCE_WEEKDAYS.indexOf(day)),
    )
  }
  if (rule.frequency === "monthly") {
    const months = month - 1 + step
    const y = year + Math.floor(months / 12)
    const m = (months % 12) + 1
    if (y > YEAR_MAX) return null
    const last = daysInMonth(y, m)
    const day = rule.monthDay === LAST_DAY_OF_MONTH ? last : rule.monthDay
    return day <= last ? [calendarDateOf(y, m, day)] : []
  }
  const y = year + step
  if (y > YEAR_MAX) return null
  return rule.monthDay <= daysInMonth(y, rule.month)
    ? [calendarDateOf(y, rule.month, rule.monthDay)]
    : []
}

/** Перший період, у якому можуть бути дні не раніше за `from`: без `COUNT` попередні не треба й перебирати. */
function firstPeriod(
  rule: RecurrenceRule,
  start: CalendarDate,
  from: CalendarDate,
): number {
  if (rule.count !== undefined || from <= start) return 0
  const [startYear, startMonth] = dateParts(start)
  const [fromYear, fromMonth] = dateParts(from)
  const periods =
    rule.frequency === "daily"
      ? daysBetween(start, from)
      : rule.frequency === "weekly"
        ? Math.floor((daysBetween(start, from) + isoWeekday(start) - 1) / 7)
        : rule.frequency === "monthly"
          ? (fromYear - startYear) * 12 + fromMonth - startMonth
          : fromYear - startYear
  return Math.floor(periods / rule.interval)
}

/** Дні повторень за порядком, не раніше за `from`; після 9999 року — кінець. */
function occurrenceDates(
  rule: RecurrenceRule,
  start: CalendarDate,
  { limit, from = start }: OccurrenceOptions,
): CalendarDate[] {
  const result: CalendarDate[] = []
  const wanted = Math.min(limit, OCCURRENCES_MAX)
  if (!(wanted >= 1) || !isRuleInRange(rule)) return result
  let counted = 0
  const first = firstPeriod(rule, start, from)
  for (let index = first; index < first + MAX_PERIODS; index += 1) {
    const days = periodDays(rule, start, index)
    if (!days) return result
    for (const day of days) {
      if (!isCalendarDate(day)) return result
      if (day < start) continue
      if (rule.until !== undefined && day > rule.until) return result
      counted += 1
      if (rule.count !== undefined && counted > rule.count) return result
      if (day >= from) result.push(day)
      if (result.length >= wanted) return result
    }
  }
  return result
}

/**
 * Повторення розібраного правила за порядком, не раніше за `from`: день у поясі правила й мить, коли перше
 * повторення з часом (за годинником поясу правила). Хибний `start` чи пояс — порожньо.
 */
export function ruleOccurrences(
  rule: RecurrenceRule,
  { start, timeZone }: RecurrenceContext,
  options: OccurrenceOptions,
): RecurrenceOccurrence[] {
  const parts = recurrenceStartParts(start)
  if (!parts || !isTimeZone(timeZone)) return []
  const { time } = parts
  return occurrenceDates(rule, parts.date, options).map((date) => ({
    date,
    at: time === null ? null : instantIn(date, time, timeZone).toISOString(),
  }))
}

/** Найближчі повторення значення з сервера; правило поза підмножиною — порожньо. */
export function recurrenceOccurrences(
  recurrence: Recurrence,
  options: OccurrenceOptions,
): RecurrenceOccurrence[] {
  const rule = parseRecurrenceRule(recurrence.rule, recurrence)
  return rule ? ruleOccurrences(rule, recurrence, options) : []
}

/**
 * День, який повтор пропускає: 31-ше, 30-те в лютому, 29 лютого. Лише в місяцях, на які повтор припадає від
 * першого дня: «кожні 2 місяці 30-го» від січня лютого не зачіпає.
 */
export function recurrenceSkip(
  rule: RecurrenceRule,
  start: CalendarDate,
): RecurrenceSkip | null {
  if (rule.frequency === "yearly")
    return rule.month === 2 && rule.monthDay === 29 ? "leapYears" : null
  if (rule.frequency !== "monthly") return null
  const [, startMonth] = dateParts(start)
  const lacking = new Set<number>()
  for (let step = 0; step < 12; step += 1) {
    const month = ((startMonth - 1 + step * rule.interval) % 12) + 1
    if (daysInMonth(COMMON_YEAR, month) < rule.monthDay) lacking.add(month)
  }
  if ([...lacking].some((month) => month !== 2)) return "shortMonths"
  if (!lacking.has(2)) return null
  return rule.monthDay === 29 ? "februaryNonLeap" : "february"
}

const issue = (code: RecurrenceIssue) => code

/**
 * Перевірка значення повтору в запиті: `start`, пояс, рядок правила з підмножини, як його пише
 * `formatRecurrenceRule`, і день кінця не раніше за перший день. Код помилки — `RecurrenceIssue` у `message`.
 */
export const recurrenceSchema = z
  .object({
    start: z
      .string()
      .refine(
        (value) => recurrenceStartParts(value) !== null,
        issue("invalid_start"),
      ),
    rule: z
      .string()
      .max(RULE_MAX_LENGTH, issue("unsupported"))
      .regex(RULE_TEXT, issue("unsupported")),
    timeZone: z
      .string()
      .refine(
        (zone) => ZONE_NAME.test(zone) && isTimeZone(zone),
        issue("invalid_time_zone"),
      ),
  })
  .superRefine((value, context) => {
    const start = recurrenceStartParts(value.start)
    if (!start || !isTimeZone(value.timeZone) || !RULE_TEXT.test(value.rule))
      return // Помилку поля вже дала його перевірка.
    const rule = parseRecurrenceRule(value.rule, value)
    if (!rule)
      context.addIssue({
        code: "custom",
        path: ["rule"],
        message: issue("unsupported"),
      })
    else if (rule.until !== undefined && rule.until < start.date)
      context.addIssue({
        code: "custom",
        path: ["rule"],
        message: issue("until_before_start"),
      })
  }) satisfies z.ZodType<Recurrence>
