import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { NumberFormatBase, type NumberFormatValues } from "react-number-format"

import {
  calendarDateToDate,
  dateInputFormat,
  dateIssue,
  formatDateInput,
  isCalendarDate,
  maskDateDigits,
  maskTimeDigits,
  parseDateInput,
  toCalendarDate,
  todayIn,
  type CalendarDate,
} from "@/registry/lib/dates"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT, useLanguage } from "@/registry/lib/i18n"
import { Calendar } from "@/registry/ui/calendar"
import { Input } from "@/registry/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/registry/ui/input-group"
import { Popover, PopoverContent, PopoverTrigger } from "@/registry/ui/popover"

/**
 * Поле дати з клавіатури й календарем (UI39, SPEC §11, ADR-0015).
 *
 * - Вводяться лише цифри, роздільники стають самі: «13.10.2026» (uk), «13/10/2026» (en-GB).
 * - `value` — календарна дата "2026-10-13" або "" (порожньо). Неповне чи неіснуюче введення
 *   («13.1», «31.02.2026») передається як є, щоб перевірка форми показала помилку при виході
 *   з поля (SPEC §8.3): `isCalendarDate(value)` з `lib/dates` — так.
 * - Календар відкривається кнопкою поруч; «сьогодні» — у поясі користувача; `min`/`max` вимикають дні.
 * - Лише читання: поле лишається у фокусі, кнопки календаря немає (SPEC §8.3).
 * - `ref` веде на `<input>`: react-hook-form фокусує поле з помилкою.
 * - Текст помилки для форми — `useDateIssueText()`.
 */

type FieldInputProps = Omit<
  React.ComponentProps<"input">,
  "value" | "defaultValue" | "onChange" | "type" | "min" | "max"
>

type DateInputProps = FieldInputProps & {
  value: string
  onValueChange: (value: string) => void
  min?: CalendarDate
  max?: CalendarDate
  /** Кнопка календаря; вимикають, коли календар уже поруч (поля періоду в `DateRangeInput`). */
  withCalendar?: boolean
}

const onlyDigits = (text: string, limit: number) =>
  text.replace(/\D/g, "").slice(0, limit)

/** Підказка формату для поля й повідомлень: «дд.мм.рррр», «dd/mm/yyyy». */
function useDatePattern(): string {
  const t = useErpUiT()
  const { locale } = useLanguage()
  const { separator, order } = dateInputFormat(locale)
  return order.map((part) => t(`dates.${part}`)).join(separator)
}

/**
 * Текст помилки поля дати мовою інтерфейсу: «Введіть дату повністю: дд.мм.рррр», «Не раніше
 * 14.10.2026»; null — помилки немає. Порожнє поле — не помилка (обов'язковість вирішує схема).
 */
function useDateIssueText() {
  const t = useErpUiT()
  const format = useFormat()
  const pattern = useDatePattern()
  return React.useCallback(
    (
      value: string,
      { min, max }: { min?: CalendarDate; max?: CalendarDate } = {},
    ): string | null => {
      const issue = dateIssue(value, { min, max })
      if (!issue) return null
      const bound = issue === "min" ? min : issue === "max" ? max : undefined
      return t(`validation.date.${issue}`, {
        format: pattern,
        date: bound ? format.date(bound, "date") : "",
      })
    },
    [t, format, pattern],
  )
}

/**
 * Фокус у відкритому календарі — на вибраний день, інакше «сьогодні» (той, що має tabindex=0 у
 * сітці react-day-picker): клавіатура одразу працює зі стрілками, без кількох Tab.
 */
function useCalendarFocus() {
  const popup = React.useRef<HTMLDivElement>(null)
  const initialFocus = React.useCallback(
    () =>
      popup.current?.querySelector<HTMLElement>(
        "[data-slot=calendar] td button[tabindex='0']",
      ) ?? true,
    [],
  )
  return { ref: popup, initialFocus }
}

/** Обмеження календаря з `min`/`max`. */
function bounds(min?: CalendarDate, max?: CalendarDate) {
  return [
    ...(min ? [{ before: calendarDateToDate(min) }] : []),
    ...(max ? [{ after: calendarDateToDate(max) }] : []),
  ]
}

function DateInput({
  value,
  onValueChange,
  min,
  max,
  withCalendar = true,
  className,
  disabled,
  readOnly,
  ref,
  ...props
}: DateInputProps) {
  const t = useErpUiT()
  const { locale } = useLanguage()
  const { timeZone } = useFormat()
  const placeholder = useDatePattern()
  const [open, setOpen] = React.useState(false)
  const focus = useCalendarFocus()
  const selected = isCalendarDate(value) ? value : null
  const digits = selected
    ? onlyDigits(formatDateInput(selected, locale), 8)
    : onlyDigits(value, 8)
  const today = todayIn(timeZone)
  const month =
    selected ?? (max && today > max ? max : min && today < min ? min : today)

  return (
    <InputGroup className={className}>
      <NumberFormatBase
        {...props}
        // react-number-format перезаписує `ref` своїм — передаємо через getInputRef.
        getInputRef={ref}
        customInput={InputGroupInput}
        value={digits}
        valueIsNumericString
        format={(text: string) => maskDateDigits(text, locale)}
        removeFormatting={(text: string) => onlyDigits(text, 8)}
        onValueChange={(values: NumberFormatValues, { event }) => {
          // Зміна ззовні (форма скинула значення) — не правка користувача.
          if (!event) return
          if (!values.value) {
            onValueChange("")
            return
          }
          onValueChange(
            parseDateInput(values.formattedValue, locale) ??
              values.formattedValue,
          )
        }}
        placeholder={placeholder}
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        readOnly={readOnly}
      />
      {readOnly || !withCalendar ? null : (
        <InputGroupAddon align="inline-end">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
              render={
                <InputGroupButton
                  size="icon-xs"
                  aria-label={t("dates.openCalendar")}
                  disabled={disabled}
                />
              }
            >
              <CalendarIcon />
            </PopoverTrigger>
            <PopoverContent
              className="w-auto p-0"
              align="end"
              aria-label={t("dates.openCalendar")}
              {...focus}
            >
              <Calendar
                mode="single"
                selected={selected ? calendarDateToDate(selected) : undefined}
                defaultMonth={calendarDateToDate(month)}
                today={calendarDateToDate(today)}
                startMonth={min ? calendarDateToDate(min) : undefined}
                endMonth={max ? calendarDateToDate(max) : undefined}
                disabled={bounds(min, max)}
                onSelect={(date) => {
                  if (date) onValueChange(toCalendarDate(date))
                  setOpen(false)
                }}
              />
            </PopoverContent>
          </Popover>
        </InputGroupAddon>
      )}
    </InputGroup>
  )
}

type TimeInputProps = FieldInputProps & {
  /** "14:30", "" або неповне введення як є (перевірка — `isTime` з `lib/dates`). */
  value: string
  onValueChange: (value: string) => void
}

/** Поле часу 24 години: «14:30» (SPEC §11). */
function TimeInput({ value, onValueChange, ref, ...props }: TimeInputProps) {
  const t = useErpUiT()
  return (
    <NumberFormatBase
      placeholder={t("dates.timePlaceholder")}
      {...props}
      getInputRef={ref}
      customInput={Input}
      value={onlyDigits(value, 4)}
      valueIsNumericString
      format={maskTimeDigits}
      removeFormatting={(text: string) => onlyDigits(text, 4)}
      onValueChange={(values: NumberFormatValues, { event }) => {
        if (!event) return
        onValueChange(values.formattedValue)
      }}
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
    />
  )
}

export {
  DateInput,
  TimeInput,
  useDatePattern,
  useDateIssueText,
  bounds as calendarBounds,
  useCalendarFocus,
  type DateInputProps,
  type TimeInputProps,
}
