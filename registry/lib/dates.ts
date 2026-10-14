/**
 * Календарні дати, періоди й час для полів вводу (UI39, SPEC §11, ADR-0015).
 *
 * - Календарна дата — рядок "2026-10-13" без часу й поясу: дати документів, терміни, дні народження.
 *   Так її повертають поля дати й так вона йде в API (ADR-0002); показ — `formatDate` з `lib/format`.
 * - Момент часу (подія, «створено о…») — мітка ISO 8601 з поясом; показується в поясі користувача
 *   (`lib/user-timezone`).
 * - «Сьогодні» рахується в поясі користувача: о 00:30 у Києві вже нова дата, хоч у UTC — ще вчора.
 * - Введення з клавіатури — у форматі мови інтерфейсу: «13.10.2026» (uk), «13/10/2026» (en-GB).
 * - Тиждень — з понеділка (ISO 8601).
 */

/** Календарна дата "YYYY-MM-DD". */
export type CalendarDate = string

/** Період із двох календарних дат включно. */
export interface DateRange {
  from: CalendarDate
  to: CalendarDate
}

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/
const DAY_MS = 86_400_000

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0")
}

/** Рік, місяць (1–12), день — без перевірки. */
function parts(value: CalendarDate): [number, number, number] {
  const m = CALENDAR_DATE.exec(value)
  if (!m) throw new RangeError(`Некоректна календарна дата: ${value}`)
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

function fromParts(year: number, month: number, day: number): CalendarDate {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`
}

/**
 * Північ UTC заданого дня. Не `Date.UTC`: той читає роки 0–99 як 1900–1999 («0026» → 1926).
 * Місяць і день поза межами переносяться, як у `Date.UTC`.
 */
function utcDate(year: number, monthIndex: number, day: number): Date {
  const date = new Date(0)
  date.setUTCFullYear(year, monthIndex, day)
  return date
}

/** Дата UTC — для арифметики без переходів на літній час. */
function toUtc(value: CalendarDate): Date {
  const [year, month, day] = parts(value)
  return utcDate(year, month - 1, day)
}

function fromUtc(date: Date): CalendarDate {
  return fromParts(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  )
}

/** Чи рядок — справжня календарна дата ("2026-02-30" — ні). */
export function isCalendarDate(value: unknown): value is CalendarDate {
  if (typeof value !== "string" || !CALENDAR_DATE.test(value)) return false
  const [year, month, day] = parts(value)
  return year >= 1 && fromUtc(toUtc(value)) === fromParts(year, month, day)
}

/** Дата з календаря (локальна північ, як її дає react-day-picker) → календарна дата. */
export function toCalendarDate(date: Date): CalendarDate {
  return fromParts(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

/** Календарна дата → локальна північ для react-day-picker. */
export function calendarDateToDate(value: CalendarDate): Date {
  const [year, month, day] = parts(value)
  const date = new Date(0)
  date.setFullYear(year, month - 1, day)
  date.setHours(0, 0, 0, 0)
  return date
}

/** Сьогоднішня дата в заданому поясі (за замовчуванням — пояс пристрою). */
export function todayIn(
  timeZone?: string,
  now: Date = new Date(),
): CalendarDate {
  const fields = new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    ...(timeZone ? { timeZone } : {}),
  }).formatToParts(now)
  const get = (type: "year" | "month" | "day") =>
    Number(fields.find((field) => field.type === type)?.value)
  return fromParts(get("year"), get("month"), get("day"))
}

export function addDays(value: CalendarDate, days: number): CalendarDate {
  return fromUtc(new Date(toUtc(value).getTime() + days * DAY_MS))
}

/** Перший день місяця, зсунутого на `months`. */
function monthStart(value: CalendarDate, months = 0): CalendarDate {
  const [year, month] = parts(value)
  return fromUtc(utcDate(year, month - 1 + months, 1))
}

/** Порівняння дат: від'ємне, нуль, додатне — як для `sort`. */
export function compareCalendarDates(a: CalendarDate, b: CalendarDate): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Понеділок тижня, що містить дату. */
function weekStart(value: CalendarDate): CalendarDate {
  const weekday = toUtc(value).getUTCDay() || 7
  return addDays(value, 1 - weekday)
}

/** Пресети періодів для фільтрів і звітів (UI39). */
export const PERIOD_PRESETS = [
  "today",
  "yesterday",
  "thisWeek",
  "lastWeek",
  "last7Days",
  "last30Days",
  "thisMonth",
  "lastMonth",
  "thisQuarter",
  "lastQuarter",
  "thisYear",
  "lastYear",
] as const
export type PeriodPreset = (typeof PERIOD_PRESETS)[number]

/** Період пресету відносно «сьогодні» (`todayIn(userTimeZone)`). */
export function periodRange(
  preset: PeriodPreset,
  today: CalendarDate,
): DateRange {
  const [year, month] = parts(today)
  const quarterStart = fromParts(year, Math.floor((month - 1) / 3) * 3 + 1, 1)
  switch (preset) {
    case "today":
      return { from: today, to: today }
    case "yesterday": {
      const day = addDays(today, -1)
      return { from: day, to: day }
    }
    case "thisWeek": {
      const from = weekStart(today)
      return { from, to: addDays(from, 6) }
    }
    case "lastWeek": {
      const from = addDays(weekStart(today), -7)
      return { from, to: addDays(from, 6) }
    }
    case "last7Days":
      return { from: addDays(today, -6), to: today }
    case "last30Days":
      return { from: addDays(today, -29), to: today }
    case "thisMonth":
      return { from: monthStart(today), to: addDays(monthStart(today, 1), -1) }
    case "lastMonth":
      return { from: monthStart(today, -1), to: addDays(monthStart(today), -1) }
    case "thisQuarter":
      return {
        from: quarterStart,
        to: addDays(monthStart(quarterStart, 3), -1),
      }
    case "lastQuarter":
      return {
        from: monthStart(quarterStart, -3),
        to: addDays(quarterStart, -1),
      }
    case "thisYear":
      return { from: fromParts(year, 1, 1), to: fromParts(year, 12, 31) }
    case "lastYear":
      return {
        from: fromParts(year - 1, 1, 1),
        to: fromParts(year - 1, 12, 31),
      }
  }
}

export interface DateInputFormat {
  /** Роздільник: "." (uk), "/" (en-GB). */
  separator: string
  /** Порядок частин у введенні. */
  order: ("day" | "month" | "year")[]
}

const inputFormats = new Map<string, DateInputFormat>()

/** Формат введення дати для локалі — з Intl, без ручних шаблонів (SPEC §11). */
export function dateInputFormat(locale: string): DateInputFormat {
  let found = inputFormats.get(locale)
  if (!found) {
    const dateParts = new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC",
    }).formatToParts(new Date(Date.UTC(2026, 9, 13)))
    const order = dateParts
      .map((part) => part.type)
      .filter(
        (type): type is "day" | "month" | "year" =>
          type === "day" || type === "month" || type === "year",
      )
    const separator =
      dateParts.find((part) => part.type === "literal")?.value.trim() || "."
    found = { separator, order }
    inputFormats.set(locale, found)
  }
  return found
}

const PART_LENGTH = { day: 2, month: 2, year: 4 } as const

/** Цифри введення (до 8) → текст із роздільниками: "13102026" → "13.10.2026". */
export function maskDateDigits(digits: string, locale: string): string {
  const { separator, order } = dateInputFormat(locale)
  let rest = digits.slice(0, 8)
  const chunks: string[] = []
  for (const part of order) {
    if (!rest) break
    chunks.push(rest.slice(0, PART_LENGTH[part]))
    rest = rest.slice(PART_LENGTH[part])
  }
  return chunks.join(separator)
}

/** Календарна дата → текст поля: "2026-10-13" → "13.10.2026". */
export function formatDateInput(value: CalendarDate, locale: string): string {
  const [year, month, day] = parts(value)
  const values = { day: pad(day), month: pad(month), year: pad(year, 4) }
  const { separator, order } = dateInputFormat(locale)
  return order.map((part) => values[part]).join(separator)
}

/** Текст поля → календарна дата або null, якщо дата неповна чи не існує ("31.02.2026"). */
export function parseDateInput(
  text: string,
  locale: string,
): CalendarDate | null {
  const digits = text.replace(/\D/g, "")
  if (digits.length !== 8) return null
  const { order } = dateInputFormat(locale)
  const values: Record<string, number> = {}
  let offset = 0
  for (const part of order) {
    values[part] = Number(digits.slice(offset, offset + PART_LENGTH[part]))
    offset += PART_LENGTH[part]
  }
  const result = fromParts(values.year, values.month, values.day)
  return isCalendarDate(result) ? result : null
}

/** Що не так зі значенням поля дати: неповне введення, неіснуюча дата, поза межами. */
export type DateIssue = "incomplete" | "invalid" | "min" | "max"

/**
 * Перевірка значення `DateInput` для форми; порожнє поле — не помилка (обов'язковість вирішує
 * схема). Тексти — `validation.date.<issue>` у рядках кіта.
 */
export function dateIssue(
  value: string,
  { min, max }: { min?: CalendarDate; max?: CalendarDate } = {},
): DateIssue | null {
  if (!value) return null
  const digits = value.replace(/\D/g, "").length
  if (!isCalendarDate(value)) return digits < 8 ? "incomplete" : "invalid"
  if (min && compareCalendarDates(value, min) < 0) return "min"
  if (max && compareCalendarDates(value, max) > 0) return "max"
  return null
}

/** Чи рядок — час "HH:mm" у 24-годинному форматі. */
export function isTime(value: unknown): value is string {
  return typeof value === "string" && TIME.test(value)
}

/** Цифри введення часу (до 4) → "14:30". */
export function maskTimeDigits(digits: string): string {
  const value = digits.slice(0, 4)
  return value.length > 2 ? `${value.slice(0, 2)}:${value.slice(2)}` : value
}
