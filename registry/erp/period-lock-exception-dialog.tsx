import { useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useWatch, type UseFormReturn } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { DateInput, useDateIssueText } from "@/registry/erp/date-input"
import { FormField } from "@/registry/erp/form"
import { FormSelect } from "@/registry/erp/form-select"
import {
  RecordFormDialog,
  type RecordFormItem,
  type RecordFormItemProps,
} from "@/registry/erp/record-form"
import { RecordPicker } from "@/registry/erp/record-picker"
import { useRecordForm } from "@/registry/hooks/use-record-form"
import {
  addDays,
  endOfDayIn,
  todayIn,
  type CalendarDate,
} from "@/registry/lib/dates"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT, type ErpUiKey } from "@/registry/lib/i18n"
import {
  PERIOD_LOCK,
  PERIOD_LOCK_EXCEPTION_MAX_DAYS,
  PERIOD_LOCK_EXCEPTIONS,
  PERIOD_LOCK_REASON_MAX_LENGTH,
  periodLockExceptionSchema,
  type PeriodLockException,
} from "@/registry/lib/period-lock"
import { useUserTimeZone } from "@/registry/lib/user-timezone"
import { Textarea } from "@/registry/ui/textarea"

/**
 * «Дати виняток» закритого періоду (PF13, ADR-0069), частина `erp/period-lock-exceptions`: кому (людина
 * компанії з `users`), на скільки (година, до кінця дня, до кінця вибраного дня не далі ніж за тиждень) і
 * причина — обов'язкова, йде в журнал (рішення власника 09.11.2026).
 *
 * - Час винятку рахується в мить відправки: «на годину» — від натискання, а не від відкриття діалогу.
 * - Помилки 422 сервера — біля поля: людина вже має виняток чи її немає в компанії, час минув чи задалеко.
 */
const DURATIONS = ["hour", "day", "date"] as const
type Duration = (typeof DURATIONS)[number]

interface ExceptionValues {
  userId: string
  duration: Duration
  untilDate: string
  reason: string
}

const EMPTY: ExceptionValues = {
  userId: "",
  duration: "hour",
  untilDate: "",
  reason: "",
}

const HOUR_MS = 3_600_000

/**
 * Кінець винятку (ISO) у мить відправки. Кінець дня — у поясі людини, тому що в ньому ж «сьогодні» й
 * межі календаря: інакше «до кінця дня» в іншому поясі браузера сервер вважав би минулим чи задалеким.
 */
function untilOf(
  values: ExceptionValues,
  now: Date,
  timeZone: string | undefined,
): string {
  if (values.duration === "hour")
    return new Date(now.getTime() + HOUR_MS).toISOString()
  const day =
    values.duration === "day" ? todayIn(timeZone, now) : values.untilDate
  return endOfDayIn(day, timeZone).toISOString()
}

interface TeamMember {
  readonly id: string
  readonly name?: string
}

const memberName = (member: TeamMember) => member.name ?? member.id

const LABELS: Readonly<Record<keyof ExceptionValues, ErpUiKey>> = {
  userId: "periodLock.exceptions.user",
  duration: "periodLock.exceptions.duration",
  untilDate: "periodLock.exceptions.untilDate",
  reason: "periodLock.exceptions.reason",
}

function useExceptionSchema(today: CalendarDate, last: CalendarDate) {
  const t = useErpUiT()
  const dateIssue = useDateIssueText()
  return React.useMemo(
    () =>
      z
        .object({
          userId: z.string().min(1, { error: t("validation.required") }),
          duration: z.enum(DURATIONS),
          untilDate: z.string(),
          reason: z
            .string()
            .trim()
            .min(1, { error: t("validation.required") })
            .max(PERIOD_LOCK_REASON_MAX_LENGTH, {
              error: t("recordForm.serverErrors.tooLong"),
            }),
        })
        .superRefine((values, context) => {
          if (values.duration !== "date") return
          const issue = values.untilDate
            ? dateIssue(values.untilDate, { min: today, max: last })
            : t("validation.required")
          if (issue)
            context.addIssue({
              code: "custom",
              path: ["untilDate"],
              message: issue,
            })
        }),
    [t, dateIssue, today, last],
  )
}

export interface PeriodLockExceptionDialogProps {
  readonly onClose: () => void
  /** Кнопка, що відкрила діалог: фокус повертається на неї. */
  readonly finalFocus?: React.RefObject<HTMLElement | null>
}

export function PeriodLockExceptionDialog({
  onClose,
  finalFocus,
}: PeriodLockExceptionDialogProps) {
  const t = useErpUiT()
  const format = useFormat()
  const timeZone = useUserTimeZone()
  const today = todayIn(timeZone)
  const last = addDays(today, PERIOD_LOCK_EXCEPTION_MAX_DAYS - 1)
  const schema = useExceptionSchema(today, last)
  const queryClient = useQueryClient()
  /** Поле для помилки `until` сервера: дата, коли її вибрано, інакше тривалість. */
  const durationRef = React.useRef<Duration>(EMPTY.duration)
  const state = useRecordForm<ExceptionValues, PeriodLockException>({
    resource: PERIOD_LOCK_EXCEPTIONS,
    schema,
    defaultValues: EMPTY,
    recordSchema: periodLockExceptionSchema,
    toPayload: (values) => ({
      userId: values.userId,
      until: untilOf(values, new Date(), timeZone),
      reason: values.reason.trim(),
    }),
    fieldOfServerError: (field) =>
      field === "until"
        ? durationRef.current === "date"
          ? "untilDate"
          : "duration"
        : field,
    serverErrorText: (field, code) => {
      if (field === "userId" && (code === "duplicate" || code === "not_found"))
        return t(`periodLock.exceptions.errors.${code}`)
      if (
        field === "until" &&
        (code === "past" || code === "too_far" || code === "invalid")
      )
        return t(`periodLock.exceptions.errors.${code}`, {
          days: PERIOD_LOCK_EXCEPTION_MAX_DAYS,
        })
      return undefined
    },
    toValues: () => EMPTY,
    onSaved: (exception) => {
      // Виняток міг бути свій: смуга й поле дати мають його побачити.
      void queryClient.invalidateQueries({ queryKey: [PERIOD_LOCK] })
      toast.success(
        t("periodLock.exceptions.granted", {
          name: exception.userName,
          until: format.date(exception.until, "dateTime"),
        }),
      )
      onClose()
    },
  })
  const duration = useWatch({ control: state.form.control, name: "duration" })
  // Помилка сервера приходить після рендера з поточною тривалістю.
  React.useEffect(() => {
    durationRef.current = duration
  }, [duration])
  const items = useExceptionItems(state.form, duration, today, last)
  return (
    <RecordFormDialog
      onClose={onClose}
      title={t("periodLock.exceptions.grantTitle")}
      description={t("periodLock.exceptions.grantDescription")}
      submitLabel={t("periodLock.exceptions.grant")}
      state={state}
      items={items}
      finalFocus={finalFocus}
    />
  )
}

/** Поля діалогу: «До кінця дня» — лише для тривалості «До дати». */
function useExceptionItems(
  form: UseFormReturn<ExceptionValues>,
  duration: Duration,
  today: CalendarDate,
  last: CalendarDate,
): RecordFormItem[] {
  const t = useErpUiT()
  const format = useFormat()
  const [userName, setUserName] = React.useState("")
  const { control } = form
  const field = (
    id: keyof ExceptionValues,
    render: RecordFormItem["render"],
    wide = false,
  ): RecordFormItem => ({
    id,
    label: t(LABELS[id]),
    ...(id === "reason"
      ? { description: t("periodLock.exceptions.reasonHint") }
      : id === "untilDate"
        ? {
            description: t("periodLock.exceptions.untilDateHint", {
              date: format.date(last, "date"),
            }),
          }
        : {}),
    wide,
    render,
  })
  return [
    field("userId", (props: RecordFormItemProps) => (
      <FormField
        {...props}
        control={control}
        name="userId"
        render={({ field: input, control: aria }) => (
          <RecordPicker<TeamMember>
            {...aria}
            resource="users"
            label={props.label}
            optionLabel={memberName}
            missingLabel={userName || t("periodLock.exceptions.userMissing")}
            value={input.value || null}
            onValueChange={(id, record) => {
              input.onChange(id ?? "")
              if (record) setUserName(memberName(record))
            }}
            onBlur={input.onBlur}
            ref={input.ref}
          />
        )}
      />
    )),
    field("duration", (props: RecordFormItemProps) => (
      <FormField
        {...props}
        control={control}
        name="duration"
        render={({ field: input, control: aria }) => (
          <FormSelect<Duration>
            {...aria}
            ref={input.ref}
            items={DURATIONS.map((value) => ({
              value,
              label: t(`periodLock.exceptions.durations.${value}`),
            }))}
            value={input.value}
            onValueChange={input.onChange}
            onBlur={input.onBlur}
          />
        )}
      />
    )),
    ...(duration === "date"
      ? [
          field("untilDate", (props: RecordFormItemProps) => (
            <FormField
              {...props}
              control={control}
              name="untilDate"
              render={({ field: input, control: aria }) => (
                <DateInput
                  {...aria}
                  ref={input.ref}
                  value={input.value}
                  onValueChange={input.onChange}
                  onBlur={input.onBlur}
                  min={today}
                  max={last}
                />
              )}
            />
          )),
        ]
      : []),
    field(
      "reason",
      (props: RecordFormItemProps) => (
        <FormField
          {...props}
          control={control}
          name="reason"
          render={({ field: input, control: aria }) => (
            <Textarea
              {...aria}
              ref={input.ref}
              name={input.name}
              value={input.value}
              maxLength={PERIOD_LOCK_REASON_MAX_LENGTH}
              rows={2}
              onChange={input.onChange}
              onBlur={input.onBlur}
            />
          )}
        />
      ),
      true,
    ),
  ]
}
