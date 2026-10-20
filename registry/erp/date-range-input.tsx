import * as React from "react"
import { CalendarRangeIcon } from "lucide-react"

import {
  calendarBounds,
  DateInput,
  useCalendarFocus,
  useDateIssueText,
  useDatePattern,
} from "@/registry/erp/date-input"
import {
  calendarDateToDate,
  compareCalendarDates,
  isCalendarDate,
  PERIOD_PRESETS,
  periodRange,
  toCalendarDate,
  todayIn,
  type CalendarDate,
  type DateRange,
  type PeriodPreset,
} from "@/registry/lib/dates"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"
import { Button } from "@/registry/ui/button"
import { Calendar } from "@/registry/ui/calendar"
import { Field, FieldError, FieldLabel } from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/registry/ui/popover"

/**
 * Період для фільтрів і звітів (UI39, ADR-0015): пресети («Цей місяць», «Минулий квартал»…),
 * календар діапазону й два поля з клавіатури.
 *
 * - `value` — { from, to } календарних дат включно або null («Будь-який період»).
 * - Пресет застосовується одразу; вибір у календарі чи введення — кнопкою «Готово»
 *   (як «Застосувати» у фільтрах, SPEC §9). Помилка введення лишається в поповері.
 * - «Сьогодні» й пресети — у поясі користувача; `min`/`max` обрізають пресети й перевіряють введені
 *   дати, пресет повністю поза межами вимкнено.
 * - Лише читання — поле з текстом періоду, у фокусі й для скрінрідера (SPEC §8.3).
 */

type DateRangeInputProps = {
  value: DateRange | null
  onValueChange: (value: DateRange | null) => void
  id?: string
  className?: string
  disabled?: boolean
  readOnly?: boolean
  min?: CalendarDate
  max?: CalendarDate
  /** Пресети у списку; за замовчуванням — усі (`PERIOD_PRESETS`). */
  presets?: readonly PeriodPreset[]
  /** Текст, коли період не вибрано; за замовчуванням «Будь-який період». */
  placeholder?: string
  "aria-invalid"?: boolean
  "aria-describedby"?: string
}

interface Draft {
  from: string
  to: string
}

/** Період у межах `min`/`max`; null — період повністю поза ними. */
function clampRange(
  range: DateRange,
  min?: CalendarDate,
  max?: CalendarDate,
): DateRange | null {
  const from =
    min && compareCalendarDates(range.from, min) < 0 ? min : range.from
  const to = max && compareCalendarDates(range.to, max) > 0 ? max : range.to
  return compareCalendarDates(from, to) > 0 ? null : { from, to }
}

const sameRange = (a: DateRange | null, b: DateRange | null) =>
  Boolean(a && b && a.from === b.from && a.to === b.to)

function DateRangeInput({
  value,
  onValueChange,
  id,
  className,
  disabled,
  readOnly,
  min,
  max,
  presets = PERIOD_PRESETS,
  placeholder,
  ...aria
}: DateRangeInputProps) {
  const t = useErpUiT()
  const format = useFormat()
  const pattern = useDatePattern()
  const issueText = useDateIssueText()
  const focus = useCalendarFocus()
  const ids = React.useId()
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState<Draft>({ from: "", to: "" })
  const [issue, setIssue] = React.useState<string | null>(null)
  const [chosen, setChosen] = React.useState<PeriodPreset | null>(null)
  const today = todayIn(format.timeZone)
  const presetRange = (preset: PeriodPreset) =>
    clampRange(periodRange(preset, today), min, max)
  // Кілька пресетів можуть дати той самий період (у неділю «Цей тиждень» = «Останні 7 днів»):
  // підсвічуємо той, що вибрали.
  const active =
    chosen && sameRange(presetRange(chosen), value)
      ? chosen
      : (presets.find((preset) => sameRange(presetRange(preset), value)) ??
        null)
  const text = value
    ? format.dateRange(value.from, value.to, "medium")
    : (placeholder ?? t("dates.rangeAny"))

  if (readOnly)
    return (
      <Input id={id} className={className} readOnly value={text} {...aria} />
    )

  const apply = (
    next: DateRange | null,
    preset: PeriodPreset | null = null,
  ) => {
    setChosen(preset)
    onValueChange(next)
    setOpen(false)
  }
  /** Помилка кінця періоду: порожньо, неповно, неіснуюча дата чи поза межами. */
  const endIssue = (text: string) =>
    text
      ? issueText(text, { min, max })
      : t("validation.date.incomplete", { format: pattern })
  const from = isCalendarDate(draft.from) ? draft.from : null
  const to = isCalendarDate(draft.to) ? draft.to : null

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setDraft({ from: value?.from ?? "", to: value?.to ?? "" })
          setIssue(null)
        }
        setOpen(next)
      }}
    >
      <PopoverTrigger
        render={
          <Button
            id={id}
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-full justify-start font-normal",
              !value && "text-muted-foreground",
              className,
            )}
            {...aria}
            // Підпис поля (<label>) стає іменем кнопки, тож сам період — в описі.
            aria-describedby={[`${ids}-value`, aria["aria-describedby"]]
              .filter(Boolean)
              .join(" ")}
          />
        }
      >
        <CalendarRangeIcon aria-hidden />
        <span id={`${ids}-value`} className="truncate">
          {text}
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        // Пресети — колонкою зліва від календаря, коли є місце: так поповер не вищий за екран планшета.
        className="max-h-(--available-height) w-auto gap-3 overflow-y-auto sm:flex-row"
        aria-label={t("dates.period")}
        {...focus}
      >
        <div
          role="group"
          aria-label={t("dates.rangePresets")}
          className="flex max-w-80 flex-wrap gap-1.5 sm:w-40 sm:flex-col sm:flex-nowrap"
        >
          {presets.map((preset) => {
            const range = presetRange(preset)
            return (
              <Button
                key={preset}
                size="sm"
                variant={preset === active ? "secondary" : "outline"}
                aria-pressed={preset === active}
                disabled={!range}
                className="sm:justify-start"
                onClick={() => {
                  if (range) apply(range, preset)
                }}
              >
                {t(`dates.presets.${preset}`)}
              </Button>
            )
          })}
        </div>
        <div className="flex flex-col gap-3">
          <Calendar
            mode="range"
            resetOnSelect
            aria-label={t("dates.rangeCalendar")}
            className="p-0"
            selected={
              from
                ? {
                    from: calendarDateToDate(from),
                    to: to ? calendarDateToDate(to) : undefined,
                  }
                : undefined
            }
            defaultMonth={calendarDateToDate(from ?? value?.from ?? today)}
            today={calendarDateToDate(today)}
            startMonth={min ? calendarDateToDate(min) : undefined}
            endMonth={max ? calendarDateToDate(max) : undefined}
            disabled={calendarBounds(min, max)}
            onSelect={(range) => {
              setIssue(null)
              setDraft({
                from: range?.from ? toCalendarDate(range.from) : "",
                to: range?.to ? toCalendarDate(range.to) : "",
              })
            }}
          />
          <div className="grid max-w-80 grid-cols-2 gap-2">
            {(["from", "to"] as const).map((end) => (
              <Field key={end} className="gap-1">
                <FieldLabel htmlFor={`${ids}-${end}`}>
                  {t(end === "from" ? "dates.rangeFrom" : "dates.rangeTo")}
                </FieldLabel>
                <DateInput
                  id={`${ids}-${end}`}
                  withCalendar={false}
                  min={min}
                  max={max}
                  value={draft[end]}
                  aria-invalid={issue ? true : undefined}
                  aria-describedby={issue ? `${ids}-issue` : undefined}
                  onValueChange={(next) => {
                    setIssue(null)
                    setDraft((current) => ({ ...current, [end]: next }))
                  }}
                />
              </Field>
            ))}
          </div>
          {issue ? (
            <FieldError id={`${ids}-issue`} className="max-w-80">
              {issue}
            </FieldError>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                apply(null)
              }}
            >
              {t("common.clear")}
            </Button>
            <Button
              onClick={() => {
                if (!draft.from && !draft.to) {
                  apply(null)
                  return
                }
                const found =
                  endIssue(draft.from) ??
                  endIssue(draft.to) ??
                  (from && to && compareCalendarDates(from, to) > 0
                    ? t("validation.date.order")
                    : null)
                if (found) {
                  setIssue(found)
                  return
                }
                apply(from && to ? { from, to } : null)
              }}
            >
              {t("dates.done")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { DateRangeInput, type DateRangeInputProps }
