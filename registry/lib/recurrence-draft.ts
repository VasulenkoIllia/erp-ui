/**
 * Повтор у формі (UI41, ADR-0104): поля редактора `erp/recurrence-editor`, бо незаповнене поле існує лише, поки людина
 * вводить. На сервер іде `Recurrence` з `lib/recurrence` (`recurrenceFromDraft`), назад у форму — `recurrenceDraft`.
 *
 * - Чернетка тримає всі поля відразу (дні тижня, число, місяць), заповнені з першого дня: перемикання частоти їх не губить.
 * - Правило поза підмножиною — частота `custom`: редактор показує його текстом, а `recurrenceFromDraft` повертає як було.
 *   Порожнє правило з сервера — «Не повторювати».
 * - Перевірка біля поля — `recurrenceDraftSchema(messages)`, та сама, з якої `recurrenceRuleOfDraft` будує правило.
 *   День кінця раніше за перший день знає лише форма, де є обидва поля: `isRecurrenceUntilBeforeStart` у її
 *   `superRefine`, а зміна першого дня перевіряє й поле кінця (`deps` чи `trigger`).
 * - Форма тримає чернетку цілою: `defaultValues` з `recurrenceDraft`, без `shouldUnregister` (поля, яких зараз не
 *   видно, лишаються в значенні).
 */
import { z } from "zod"

import { isCalendarDate } from "@/registry/lib/dates"
import {
  formatRecurrenceRule,
  LAST_DAY_OF_MONTH,
  maxDaysInMonth,
  parseRecurrenceRule,
  RECURRENCE_COUNT_MAX,
  RECURRENCE_FREQUENCIES,
  RECURRENCE_INTERVAL_MAX,
  RECURRENCE_WEEKDAYS,
  recurrenceStartParts,
  recurrenceWeekday,
  type Recurrence,
  type RecurrenceContext,
  type RecurrenceFrequency,
  type RecurrencePattern,
  type RecurrenceRule,
  type RecurrenceRuleEnd,
  type RecurrenceWeekday,
} from "@/registry/lib/recurrence"

const DRAFT_FREQUENCIES = ["none", ...RECURRENCE_FREQUENCIES, "custom"] as const
export type RecurrenceDraftFrequency = (typeof DRAFT_FREQUENCIES)[number]

export const RECURRENCE_ENDS = ["never", "until", "count"] as const
type DraftEnd = (typeof RECURRENCE_ENDS)[number]

export interface RecurrenceDraft {
  frequency: RecurrenceDraftFrequency
  interval: number | null
  weekdays: RecurrenceWeekday[]
  /** 1–31 чи `LAST_DAY_OF_MONTH`. */
  monthDay: number
  month: number
  end: DraftEnd
  /** Календарна дата чи неповне введення поля дати. */
  until: string
  count: number | null
  /** Правило поза підмножиною (частота `custom`), інакше "". */
  custom: string
}

/** Скільки разів пропонує поле, коли людина вибирає «Кількість разів». */
const DEFAULT_COUNT = 10

/** Поля з першого дня: щотижня — його день, щомісяця — його число, щороку — його дата. */
function draftDefaults(start: string): RecurrenceDraft {
  const date = recurrenceStartParts(start)?.date
  const [, month, day] = date ? date.split("-").map(Number) : [0, 1, 1]
  return {
    frequency: "none",
    interval: 1,
    weekdays: [date ? recurrenceWeekday(date) : "MO"],
    monthDay: day,
    month,
    end: "never",
    until: "",
    count: DEFAULT_COUNT,
    custom: "",
  }
}

/**
 * Значення з сервера → поля форми. `start` — перший день із форми: з нього поля, коли повтору ще немає («Не
 * повторювати» з днем тижня й числом першого дня).
 */
export function recurrenceDraft(
  recurrence: Recurrence | null | undefined,
  start: string,
): RecurrenceDraft {
  const defaults = draftDefaults(recurrence?.start ?? start)
  if (!recurrence?.rule.trim()) return defaults
  const rule = parseRecurrenceRule(recurrence.rule, recurrence)
  if (!rule)
    return { ...defaults, frequency: "custom", custom: recurrence.rule }
  return {
    ...defaults,
    frequency: rule.frequency,
    interval: rule.interval,
    weekdays:
      rule.frequency === "weekly" ? [...rule.weekdays] : defaults.weekdays,
    monthDay:
      rule.frequency === "monthly" || rule.frequency === "yearly"
        ? rule.monthDay
        : defaults.monthDay,
    month: rule.frequency === "yearly" ? rule.month : defaults.month,
    end:
      rule.count !== undefined
        ? "count"
        : rule.until !== undefined
          ? "until"
          : "never",
    until: rule.until ?? "",
    count: rule.count ?? DEFAULT_COUNT,
  }
}

const isWhole = (value: number | null, max: number): value is number =>
  value !== null && Number.isInteger(value) && value >= 1 && value <= max

const isMonthDay = (day: number) =>
  day === LAST_DAY_OF_MONTH || isWhole(day, 31)

/** Чи день є в місяці хоч якогось року (щороку 29 лютого — так, 31 квітня — ні). */
const isYearDay = (month: number, day: number) =>
  isWhole(month, 12) && isWhole(day, maxDaysInMonth(month))

/** Поле чернетки, яке треба виправити. */
type DraftField =
  "frequency" | "interval" | "weekdays" | "monthDay" | "until" | "count"

function draftPattern(
  frequency: RecurrenceFrequency,
  draft: RecurrenceDraft,
): RecurrencePattern | null {
  if (frequency === "daily") return { frequency }
  if (frequency === "weekly") {
    const [first, ...rest] = RECURRENCE_WEEKDAYS.filter((day) =>
      draft.weekdays.includes(day),
    )
    return first ? { frequency, weekdays: [first, ...rest] } : null
  }
  if (frequency === "monthly")
    return isMonthDay(draft.monthDay)
      ? { frequency, monthDay: draft.monthDay }
      : null
  return isYearDay(draft.month, draft.monthDay)
    ? { frequency, month: draft.month, monthDay: draft.monthDay }
    : null
}

function draftEnd(draft: RecurrenceDraft): RecurrenceRuleEnd | null {
  if (draft.end === "count")
    return isWhole(draft.count, RECURRENCE_COUNT_MAX)
      ? { count: draft.count }
      : null
  if (draft.end === "until")
    return isCalendarDate(draft.until) ? { until: draft.until } : null
  return {}
}

/**
 * Одна перевірка полів для схеми й для правила: правило (null — повтору немає чи поля не заповнено) і поля, які треба
 * виправити.
 */
function checkDraft(draft: RecurrenceDraft): {
  rule: RecurrenceRule | null
  issues: DraftField[]
} {
  const { frequency } = draft
  if (frequency === "none") return { rule: null, issues: [] }
  if (frequency === "custom")
    return { rule: null, issues: draft.custom.trim() ? [] : ["frequency"] }
  const issues: DraftField[] = []
  const interval = isWhole(draft.interval, RECURRENCE_INTERVAL_MAX)
    ? draft.interval
    : null
  if (interval === null) issues.push("interval")
  const pattern = draftPattern(frequency, draft)
  if (!pattern) issues.push(frequency === "weekly" ? "weekdays" : "monthDay")
  const end = draftEnd(draft)
  if (!end) issues.push(draft.end === "count" ? "count" : "until")
  return {
    rule:
      interval !== null && pattern && end
        ? { ...pattern, ...end, interval }
        : null,
    issues,
  }
}

/** Поля → правило підмножини; null — повтору немає, правило поза підмножиною чи поля не заповнено. */
export function recurrenceRuleOfDraft(
  draft: RecurrenceDraft,
): RecurrenceRule | null {
  return checkDraft(draft).rule
}

/** Поля → значення для запиту; null — «Не повторювати». Неповні поля — помилка: спершу перевірка форми. */
export function recurrenceFromDraft(
  draft: RecurrenceDraft,
  context: RecurrenceContext,
): Recurrence | null {
  if (draft.frequency === "none") return null
  if (draft.frequency === "custom" && draft.custom.trim())
    return { ...context, rule: draft.custom }
  const rule = recurrenceRuleOfDraft(draft)
  if (!rule) throw new RangeError("Поля повтору не пройшли перевірку")
  return { ...context, rule: formatRecurrenceRule(rule, context) }
}

/** День кінця раніше за перший день: повтору не буде жодного разу. Для `superRefine` форми. */
export function isRecurrenceUntilBeforeStart(
  draft: RecurrenceDraft,
  start: string,
): boolean {
  const date = recurrenceStartParts(start)?.date
  return (
    draft.frequency !== "none" &&
    draft.frequency !== "custom" &&
    draft.end === "until" &&
    date !== undefined &&
    isCalendarDate(draft.until) &&
    draft.until < date
  )
}

/** Тексти помилок біля полів повтору (`useRecurrenceMessages` з редактора). */
export interface RecurrenceMessages {
  /** «Виберіть, як повторювати»: інше правило без тексту. */
  readonly frequency: string
  /** «Від 1 до 99». */
  readonly interval: string
  /** «Виберіть хоча б один день». */
  readonly weekdays: string
  /** «У цьому місяці немає такого числа». */
  readonly monthDay: string
  /** Текст помилки поля дати кінця: порожнє, неповне, неіснуюче. */
  readonly until: (value: string) => string
  /** «Від 1 до 999». */
  readonly count: string
}

const draftShape = z.object({
  frequency: z.enum(DRAFT_FREQUENCIES),
  interval: z.number().nullable(),
  weekdays: z.array(z.enum(RECURRENCE_WEEKDAYS)),
  monthDay: z.number(),
  month: z.number(),
  end: z.enum(RECURRENCE_ENDS),
  until: z.string(),
  count: z.number().nullable(),
  custom: z.string(),
}) satisfies z.ZodType<RecurrenceDraft>

/** Перевірка полів повтору: помилка стоїть біля поля, яке треба виправити. */
export function recurrenceDraftSchema(messages: RecurrenceMessages) {
  return draftShape.superRefine((draft, context) => {
    for (const field of checkDraft(draft).issues)
      context.addIssue({
        code: "custom",
        path: [field],
        message:
          field === "until" ? messages.until(draft.until) : messages[field],
      })
  })
}
