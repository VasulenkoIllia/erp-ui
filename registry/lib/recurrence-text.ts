/**
 * Правило повтору людською мовою (UI41, ADR-0104): «Щомісяця 5-го, 10 разів», «Кожні 2 тижні в понеділок і
 * п'ятницю о 09:00, до 31.03.2027 включно». Для редактора `erp/recurrence-editor` і для показу повтору в списку чи на
 * картці. Окремим реченням — день, який повтор пропускає (31-ше, 29 лютого).
 *
 * - Час — з першого повторення; пояс правила названо, коли він не пояс користувача (назви-псевдоніми одного поясу,
 *   "Europe/Kyiv" і "Europe/Kiev", — той самий пояс).
 * - Дні тижня — від понеділка; понеділок–п'ятниця — «по буднях».
 */
import { useCallback } from "react"

import { useFormat } from "@/registry/lib/format"
import { useErpUiT, type ErpUiTranslate } from "@/registry/lib/i18n"
import { ukRecurrence } from "@/registry/lib/i18n-uk-recurrence"
import { isTimeZone } from "@/registry/lib/dates"
import {
  LAST_DAY_OF_MONTH,
  recurrenceSkip,
  recurrenceStartParts,
  yearDayDate,
  type RecurrenceContext,
  type RecurrenceFrequency,
  type RecurrenceRule,
  type RecurrenceWeekday,
} from "@/registry/lib/recurrence"

export interface RecurrenceText {
  summary: string
  /** День, який повтор пропускає, реченням; null — не пропускає. */
  skip: string | null
}

const WORKDAYS: readonly RecurrenceWeekday[] = ["MO", "TU", "WE", "TH", "FR"]

function weekdaysText(
  t: ErpUiTranslate,
  locale: string,
  weekdays: readonly RecurrenceWeekday[],
): string {
  if (
    weekdays.length === WORKDAYS.length &&
    WORKDAYS.every((day) => weekdays.includes(day))
  )
    return t("recurrence.summary.workdays")
  const [first, ...rest] = weekdays
  return new Intl.ListFormat(locale, { type: "conjunction" }).format([
    t(`recurrence.summary.on.${first}`),
    ...rest.map((day) => t(`recurrence.summary.day.${day}`)),
  ])
}

/** Без часу й кінця: «Кожні 2 тижні в понеділок». */
function frequencyText(
  t: ErpUiTranslate,
  format: ReturnType<typeof useFormat>,
  rule: RecurrenceRule,
): string {
  const every = rule.interval > 1
  const key = (name: RecurrenceFrequency) =>
    every
      ? (`recurrence.summary.${name}Every` as const)
      : (`recurrence.summary.${name}` as const)
  const count = rule.interval
  if (rule.frequency === "daily") return t(key("daily"), { count })
  if (rule.frequency === "weekly")
    return t(key("weekly"), {
      count,
      days: weekdaysText(t, format.locale, rule.weekdays),
    })
  if (rule.frequency === "monthly")
    return t(key("monthly"), {
      count,
      day:
        rule.monthDay === LAST_DAY_OF_MONTH
          ? t("recurrence.summary.lastDay")
          : t("recurrence.summary.monthDay", { day: rule.monthDay }),
    })
  return t(key("yearly"), {
    count,
    date: format.date(yearDayDate(rule.month, rule.monthDay), "dayMonth"),
  })
}

/** Назва поясу, якою його називає Intl: псевдоніми одного поясу дають ту саму. */
function canonicalZone(zone: string | undefined): string | null {
  if (zone !== undefined && !isTimeZone(zone)) return null
  return new Intl.DateTimeFormat("en", { timeZone: zone }).resolvedOptions()
    .timeZone
}

/** Чи людина бачить час у поясі правила: пояс профілю, без нього — пристрою. */
function isViewerZone(zone: string, viewer: string | undefined): boolean {
  const canonical = canonicalZone(zone)
  return canonical !== null && canonical === canonicalZone(viewer)
}

export type RecurrenceDescribe = (
  rule: RecurrenceRule,
  context: RecurrenceContext,
) => RecurrenceText

/** Текст правила; `context` — перше повторення й пояс значення `Recurrence`. */
export function useRecurrenceText(): RecurrenceDescribe {
  const t = useErpUiT(ukRecurrence)
  const format = useFormat()
  return useCallback(
    (rule, { start, timeZone }) => {
      let summary = frequencyText(t, format, rule)
      const startParts = recurrenceStartParts(start)
      const time = startParts?.time
      if (time) {
        summary = t("recurrence.summary.time", { summary, time })
        if (!isViewerZone(timeZone, format.timeZone))
          summary = t("recurrence.summary.zone", { summary, zone: timeZone })
      }
      if (rule.count !== undefined)
        summary = t("recurrence.summary.count", { summary, count: rule.count })
      else if (rule.until !== undefined)
        summary = t("recurrence.summary.until", {
          summary,
          date: format.date(rule.until, "date"),
        })
      const skip = startParts ? recurrenceSkip(rule, startParts.date) : null
      return { summary, skip: skip ? t(`recurrence.skip.${skip}`) : null }
    },
    [t, format],
  )
}
