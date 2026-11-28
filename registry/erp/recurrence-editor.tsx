import * as React from "react"
import {
  useWatch,
  type Control,
  type FieldPath,
  type FieldValues,
  type PathValue,
} from "react-hook-form"

import { DateInput, useDateIssueText } from "@/registry/erp/date-input"
import { FormField } from "@/registry/erp/form-field"
import { FormSelect, type FormSelectItem } from "@/registry/erp/form-select"
import { NumberInput } from "@/registry/erp/number-input"
import { RecurrenceSummary } from "@/registry/erp/recurrence-summary"
import { RecurrenceWeekdays } from "@/registry/erp/recurrence-weekdays"
import { calendarDateToDate } from "@/registry/lib/dates"
import type { FormControlProps } from "@/registry/lib/form-control"
import { useFormat } from "@/registry/lib/format"
import { useLanguage, useErpUiT } from "@/registry/lib/i18n"
import { ukRecurrence } from "@/registry/lib/i18n-uk-recurrence"
import {
  LAST_DAY_OF_MONTH,
  maxDaysInMonth,
  RECURRENCE_COUNT_MAX,
  RECURRENCE_INTERVAL_MAX,
  recurrenceStartParts,
  yearDayDate,
} from "@/registry/lib/recurrence"
import {
  RECURRENCE_ENDS,
  recurrenceDraft,
  recurrenceRuleOfDraft,
  type RecurrenceDraft,
  type RecurrenceDraftFrequency,
  type RecurrenceMessages,
} from "@/registry/lib/recurrence-draft"
import { cn } from "@/registry/lib/utils"
import { FieldDescription, FieldLegend, FieldSet } from "@/registry/ui/field"

/**
 * Редактор повтору (UI41, ADR-0104): щодня, щотижня в обрані дні, щомісяця в число чи останній день, щороку, кожні N,
 * до дати чи N разів; під полями — правило реченням, пропущені дні й найближчі повторення. Змінили поле й зробили
 * паузу — скрінрідер чує правило.
 *
 * - Значення у формі — `RecurrenceDraft` з `lib/recurrence-draft` (`recurrenceDraft` з сервера, `recurrenceFromDraft` на
 *   сервер); перевірка — `recurrenceDraftSchema`, день кінця раніше за перший — `isRecurrenceUntilBeforeStart` у
 *   `superRefine` форми. Правило поза підмножиною показано текстом і лишається, поки людина не вибере інше.
 * - `start` — поле першого дня форми (дата чи дата з часом), `timeZone` — пояс правила: пояс компанії, без нього —
 *   користувача.
 * - Лише читання — правило реченням без полів.
 * - Форма тримає чернетку цілою: `defaultValues` з `recurrenceDraft`, без `shouldUnregister`.
 */
export interface RecurrenceEditorProps<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
  TTransformed extends FieldValues = TValues,
> {
  control: Control<TValues, unknown, TTransformed>
  /** Лише поле з `RecurrenceDraft`: інше дістало б чужі поля без помилки компілятора. */
  name: PathValue<TValues, TName> extends RecurrenceDraft ? TName : never
  start: string
  timeZone: string
  label: React.ReactNode
  description?: React.ReactNode
  readOnly?: boolean
  className?: string
}

/** Тексти помилок полів повтору й дня кінця раніше за перший день (`superRefine` форми). */
export interface RecurrenceFormMessages extends RecurrenceMessages {
  readonly untilBeforeStart: (start: string) => string
}

/**
 * Тексти помилок полів повтору мовою інтерфейсу: `recurrenceDraftSchema(messages)` і `untilBeforeStart(start)` для
 * `superRefine` форми з `isRecurrenceUntilBeforeStart`. Схему будуйте в `useMemo` форми.
 */
function useRecurrenceMessages(): RecurrenceFormMessages {
  const t = useErpUiT(ukRecurrence)
  const dateIssue = useDateIssueText()
  const format = useFormat()
  return React.useMemo(
    () => ({
      frequency: t("recurrence.errors.frequency"),
      interval: t("recurrence.errors.interval", {
        max: RECURRENCE_INTERVAL_MAX,
      }),
      weekdays: t("recurrence.errors.weekdays"),
      monthDay: t("recurrence.errors.monthDay"),
      until: (value: string) => dateIssue(value) ?? t("validation.required"),
      count: t("recurrence.errors.count", { max: RECURRENCE_COUNT_MAX }),
      untilBeforeStart: (start: string) => {
        const date = recurrenceStartParts(start)?.date
        return t("recurrence.errors.untilBeforeStart", {
          date: date ? format.date(date, "date") : start,
        })
      },
    }),
    [t, dateIssue, format],
  )
}

const YEAR_MONTHS = Array.from({ length: 12 }, (_, index) => index + 1)

function useItems(draft: RecurrenceDraft) {
  const t = useErpUiT(ukRecurrence)
  const { locale } = useLanguage()
  return React.useMemo(() => {
    const frequencies: FormSelectItem<RecurrenceDraftFrequency>[] = (
      ["none", "daily", "weekly", "monthly", "yearly"] as const
    ).map((value) => ({ value, label: t(`recurrence.frequency.${value}`) }))
    if (draft.frequency === "custom")
      frequencies.push({
        value: "custom",
        label: t("recurrence.frequency.custom"),
      })
    const days = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        value: index + 1,
        label: String(index + 1),
      }))
    const monthName = new Intl.DateTimeFormat(locale, { month: "long" })
    return {
      frequencies,
      monthDays: [
        ...days(31),
        { value: LAST_DAY_OF_MONTH, label: t("recurrence.monthDay.last") },
      ],
      yearDays: days(maxDaysInMonth(draft.month)),
      months: YEAR_MONTHS.map((month) => ({
        value: month,
        label: monthName.format(calendarDateToDate(yearDayDate(month, 1))),
      })),
      ends: RECURRENCE_ENDS.map((value) => ({
        value,
        label: t(`recurrence.end.${value}`),
      })),
    }
  }, [t, locale, draft.frequency, draft.month])
}

/**
 * Число щороку, яке є в місяці: «останній день» зі щомісячного повтору чи 31-ше після переходу на лютий стає
 * найбільшим числом місяця одразу, а не помилкою після відправки.
 */
function YearDaySelect({
  aria,
  ref,
  items,
  month,
  value,
  onChange,
  onBlur,
}: {
  aria: FormControlProps
  ref: React.Ref<HTMLButtonElement>
  items: readonly FormSelectItem<number>[]
  month: number
  value: number
  onChange: (value: number) => void
  onBlur: () => void
}) {
  const max = maxDaysInMonth(month)
  const fitted = value === LAST_DAY_OF_MONTH || value > max ? max : value
  React.useEffect(() => {
    if (fitted !== value) onChange(fitted)
  }, [fitted, value, onChange])
  return (
    <FormSelect
      {...aria}
      ref={ref}
      items={items}
      value={fitted}
      onValueChange={onChange}
      onBlur={onBlur}
    />
  )
}

function RecurrenceEditor<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
  TTransformed extends FieldValues = TValues,
>({
  control,
  name: rawName,
  start,
  timeZone,
  label,
  description,
  readOnly = false,
  className,
}: RecurrenceEditorProps<TValues, TName, TTransformed>) {
  const t = useErpUiT(ukRecurrence)
  const descriptionId = React.useId()
  const name = rawName as TName
  const path = (part: keyof RecurrenceDraft) =>
    `${name}.${part}` as FieldPath<TValues>
  const watched = useWatch({ control, name }) as RecurrenceDraft | undefined
  // Без `defaultValues` повтору (дані прийдуть через `reset`) — поля з першого дня.
  const fallback = React.useMemo(() => recurrenceDraft(null, start), [start])
  const draft = watched ?? fallback
  const items = useItems(draft)
  const rule = React.useMemo(() => recurrenceRuleOfDraft(draft), [draft])
  const { frequency } = draft
  const repeats = frequency !== "none" && frequency !== "custom"
  const select = <TValue extends string | number>(
    part: keyof RecurrenceDraft,
    fieldLabel: string,
    options: readonly FormSelectItem<TValue>[],
  ) => (
    <FormField
      control={control}
      name={path(part)}
      label={fieldLabel}
      render={({ field, control: aria }) => (
        <FormSelect
          {...aria}
          ref={field.ref}
          items={options}
          value={field.value}
          onValueChange={field.onChange}
          onBlur={field.onBlur}
        />
      )}
    />
  )
  return (
    <FieldSet
      data-slot="recurrence-editor"
      aria-describedby={description ? descriptionId : undefined}
      className={cn("@container/recurrence min-w-0", className)}
    >
      <FieldLegend>{label}</FieldLegend>
      {description ? (
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
      ) : null}
      {readOnly ? null : (
        <div className="grid gap-4 @md/recurrence:grid-cols-2">
          {select(
            "frequency",
            t("recurrence.frequency.label"),
            items.frequencies,
          )}
          {repeats ? (
            <FormField
              control={control}
              name={path("interval")}
              label={t("recurrence.interval.label")}
              render={({ field, control: aria }) => (
                <NumberInput
                  {...aria}
                  ref={field.ref}
                  value={field.value}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                  unit={t(`recurrence.interval.${frequency}`, {
                    count: draft.interval ?? 0,
                  })}
                />
              )}
            />
          ) : null}
          {frequency === "weekly" ? (
            <RecurrenceWeekdays
              control={control}
              name={path("weekdays")}
              className="@md/recurrence:col-span-2"
            />
          ) : null}
          {frequency === "monthly"
            ? select(
                "monthDay",
                t("recurrence.monthDay.label"),
                items.monthDays,
              )
            : null}
          {frequency === "yearly" ? (
            <>
              {select("month", t("recurrence.month.label"), items.months)}
              <FormField
                control={control}
                name={path("monthDay")}
                label={t("recurrence.monthDay.label")}
                render={({ field, control: aria }) => (
                  <YearDaySelect
                    aria={aria}
                    ref={field.ref}
                    items={items.yearDays}
                    month={draft.month}
                    value={draft.monthDay}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                )}
              />
            </>
          ) : null}
          {repeats
            ? select("end", t("recurrence.end.label"), items.ends)
            : null}
          {repeats && draft.end === "until" ? (
            <FormField
              control={control}
              name={path("until")}
              label={t("recurrence.until.label")}
              render={({ field, control: aria }) => (
                <DateInput
                  {...aria}
                  ref={field.ref}
                  value={field.value}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                  min={recurrenceStartParts(start)?.date}
                />
              )}
            />
          ) : null}
          {repeats && draft.end === "count" ? (
            <FormField
              control={control}
              name={path("count")}
              label={t("recurrence.count.label")}
              render={({ field, control: aria }) => (
                <NumberInput
                  {...aria}
                  ref={field.ref}
                  value={field.value}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            />
          ) : null}
        </div>
      )}
      {frequency === "custom" ? (
        <p className="text-sm">
          {t("recurrence.custom.text", { rule: draft.custom })}
          {readOnly ? null : ` ${t("recurrence.custom.hint")}`}
        </p>
      ) : null}
      {readOnly && frequency === "none" ? (
        <p className="text-sm">{t("recurrence.frequency.none")}</p>
      ) : null}
      {repeats ? (
        <RecurrenceSummary
          rule={rule}
          context={{ start, timeZone }}
          preview={readOnly ? 0 : undefined}
          announceKey={readOnly ? undefined : JSON.stringify([draft, start])}
        />
      ) : null}
    </FieldSet>
  )
}

export { RecurrenceEditor, useRecurrenceMessages }
