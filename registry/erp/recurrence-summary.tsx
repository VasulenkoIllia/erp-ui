import * as React from "react"

import { useSettledAnnouncement } from "@/registry/hooks/use-settled-announcement"
import { todayIn } from "@/registry/lib/dates"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import { ukRecurrence } from "@/registry/lib/i18n-uk-recurrence"
import {
  recurrenceStartParts,
  ruleOccurrences,
  type RecurrenceContext,
  type RecurrenceOccurrence,
  type RecurrenceRule,
} from "@/registry/lib/recurrence"
import { useRecurrenceText } from "@/registry/lib/recurrence-text"
import { isTimeZone } from "@/registry/lib/time-zone"
import { cn } from "@/registry/lib/utils"

/**
 * Повтор реченням (UI41, ADR-0104): правило, день, який повтор пропускає, перший день поза правилом і кілька
 * найближчих повторень. Частина `erp/recurrence-editor`; окремо — на картці чи в перегляді, де повтор лише показують.
 * Без `announceKey` текст не озвучується сам: у списку таких блоків десятки.
 */
export interface RecurrenceSummaryProps {
  /** null — поля ще не заповнено: блок лишається на місці з підказкою. */
  rule: RecurrenceRule | null
  /** Перше повторення й пояс значення `Recurrence`. */
  context: RecurrenceContext
  /** Скільки найближчих повторень показати; 0 — без них. */
  preview?: number
  /**
   * Те, що змінює людина (поля редактора): змінилось і людина зробила паузу — текст звучить для скрінрідера. Без
   * нього — мовчки (картка, список).
   */
  announceKey?: string
  className?: string
}

/** Найближчі повторення в редакторі: досить, щоб побачити крок і пропуск, і не забагато для телефона. */
const DEFAULT_PREVIEW = 3

interface SummaryDates {
  /** Перше повторення від першого дня; null — правило не дає жодного. */
  first: RecurrenceOccurrence | null
  /** Найближчі від зараз: мить, що вже минула сьогодні, — ні. */
  upcoming: RecurrenceOccurrence[]
}

/** Перше й найближчі повторення; null — перший день чи пояс не заповнено, рахувати нічого. */
function summaryDates(
  rule: RecurrenceRule,
  context: RecurrenceContext,
  preview: number,
  now: Date,
): SummaryDates | null {
  const start = recurrenceStartParts(context.start)
  if (!start || !isTimeZone(context.timeZone)) return null
  const first = ruleOccurrences(rule, context, { limit: 1 }).at(0) ?? null
  if (!first || !preview) return { first, upcoming: [] }
  const today = todayIn(context.timeZone, now)
  const upcoming = ruleOccurrences(rule, context, {
    limit: preview + 1,
    from: today > start.date ? today : start.date,
  })
    .filter((item) => item.at === null || Date.parse(item.at) >= now.getTime())
    .slice(0, preview)
  return { first, upcoming }
}

/** Повторення з часом — у поясі користувача (учасник з іншого поясу бачить свій час). */
function useOccurrenceLabel() {
  const format = useFormat()
  return React.useCallback(
    ({ date, at }: RecurrenceOccurrence) =>
      at === null
        ? format.date(date, "medium")
        : `${format.date(at, "medium")}, ${format.date(at, "time")}`,
    [format],
  )
}

function RecurrenceSummary({
  rule,
  context,
  preview = DEFAULT_PREVIEW,
  announceKey = "",
  className,
}: RecurrenceSummaryProps) {
  const t = useErpUiT(ukRecurrence)
  const format = useFormat()
  const describe = useRecurrenceText()
  const label = useOccurrenceLabel()
  const nextId = React.useId()
  const { start, timeZone } = context
  // Сьогодні змінюється раз на день: перелік не рахується наново на кожен рендер форми.
  const today = isTimeZone(timeZone) ? todayIn(timeZone) : null
  const dates = React.useMemo(
    () =>
      rule && today
        ? summaryDates(rule, { start, timeZone }, preview, new Date())
        : null,
    [rule, start, timeZone, preview, today],
  )
  const text = rule ? describe(rule, context) : null
  const startDate = recurrenceStartParts(start)?.date
  const status = (): string | null => {
    if (!dates) return t("recurrence.startMissing")
    if (!dates.first) return t("recurrence.noOccurrences")
    if (startDate && dates.first.date !== startDate)
      return t("recurrence.startMismatch", {
        start: format.date(startDate, "medium"),
        first: label(dates.first),
      })
    return preview && !dates.upcoming.length ? t("recurrence.finished") : null
  }
  const notes = text ? [text.skip, status()] : [t("recurrence.incomplete")]
  useSettledAnnouncement(
    announceKey,
    [text?.summary, ...notes].filter(Boolean).join(" "),
  )
  return (
    <div
      data-slot="recurrence-summary"
      className={cn("grid gap-2 rounded-lg bg-muted p-3 text-sm", className)}
    >
      <div className="grid gap-1">
        {text ? <p className="font-medium">{text.summary}</p> : null}
        {notes.map((note) => (note ? <p key={note}>{note}</p> : null))}
      </div>
      {dates?.upcoming.length ? (
        <div className="grid gap-1">
          <p id={nextId} className="text-muted-foreground">
            {t("recurrence.next")}
          </p>
          {/* role="list": Safari без нього не читає список із list-style: none. */}
          {/* eslint-disable-next-line jsx-a11y-x/no-redundant-roles -- див. коментар вище */}
          <ul
            role="list"
            aria-labelledby={nextId}
            className="flex flex-wrap gap-x-4 gap-y-1"
          >
            {dates.upcoming.map((item) => (
              <li key={item.at ?? item.date}>
                <time dateTime={item.at ?? item.date}>{label(item)}</time>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

export { RecurrenceSummary }
