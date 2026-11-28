import * as React from "react"
import type { Control, FieldPath, FieldValues } from "react-hook-form"

import { useFieldController } from "@/registry/hooks/use-field-controller"
import { useErpUiT } from "@/registry/lib/i18n"
import { ukRecurrence } from "@/registry/lib/i18n-uk-recurrence"
import {
  RECURRENCE_WEEKDAYS,
  type RecurrenceWeekday,
} from "@/registry/lib/recurrence"
import { Button } from "@/registry/ui/button"
import { Field, FieldError, FieldTitle } from "@/registry/ui/field"

/**
 * Дні тижня повтору (частина `erp/recurrence-editor`, UI41, ADR-0104): сім кнопок-перемикачів від понеділка
 * (`aria-pressed`). Назва кнопки починається з видимого скорочення («Пн, понеділок»), тож голосове керування
 * знаходить її за тим, що видно. Без жодного дня — помилка біля групи з перевірки форми.
 */
export interface RecurrenceWeekdaysProps<
  TValues extends FieldValues,
  TTransformed extends FieldValues = TValues,
> {
  control: Control<TValues, unknown, TTransformed>
  /** Поле з `RecurrenceWeekday[]` (`weekdays` чернетки повтору). */
  name: FieldPath<TValues>
  className?: string
}

function RecurrenceWeekdays<
  TValues extends FieldValues,
  TTransformed extends FieldValues = TValues,
>({
  control,
  name,
  className,
}: RecurrenceWeekdaysProps<TValues, TTransformed>) {
  const t = useErpUiT(ukRecurrence)
  const id = React.useId()
  const { field, fieldState } = useFieldController({ control, name })
  const chosen = (field.value ?? []) as RecurrenceWeekday[]
  const errorId = fieldState.invalid ? `${id}-error` : undefined
  const toggle = (day: RecurrenceWeekday) => {
    const next = chosen.includes(day)
      ? chosen.filter((item) => item !== day)
      : RECURRENCE_WEEKDAYS.filter(
          (item) => item === day || chosen.includes(item),
        )
    field.onChange(next)
    field.onBlur()
  }
  return (
    <Field
      data-invalid={fieldState.invalid ? true : undefined}
      data-field-name={name}
      className={className}
    >
      <FieldTitle id={`${id}-label`}>
        {t("recurrence.weekdays.label")}
      </FieldTitle>
      <div
        role="group"
        aria-labelledby={`${id}-label`}
        aria-describedby={errorId}
        className="grid max-w-sm grid-cols-7 gap-1"
      >
        {RECURRENCE_WEEKDAYS.map((day, index) => (
          <Button
            key={day}
            ref={index === 0 ? field.ref : undefined}
            type="button"
            variant={chosen.includes(day) ? "default" : "outline"}
            aria-pressed={chosen.includes(day)}
            // Після невдалої відправки фокус тут: помилку чути й без опису групи.
            aria-describedby={index === 0 ? errorId : undefined}
            // Назва явно: зі схованої частини браузери складають її по-різному («Нд , неділя» в Chromium).
            aria-label={`${t(`recurrence.weekdays.short.${day}`)}, ${t(`recurrence.weekdays.long.${day}`)}`}
            className="min-w-0 px-0"
            onClick={() => {
              toggle(day)
            }}
          >
            {t(`recurrence.weekdays.short.${day}`)}
          </Button>
        ))}
      </div>
      {fieldState.invalid ? (
        <FieldError id={errorId}>{fieldState.error?.message}</FieldError>
      ) : null}
    </Field>
  )
}

export { RecurrenceWeekdays }
