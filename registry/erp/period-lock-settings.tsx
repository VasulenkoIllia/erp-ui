import * as React from "react"
import { useWatch, type Control, type UseFormReturn } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { DateInput, useDateIssueText } from "@/registry/erp/date-input"
import { FiscalYearList } from "@/registry/erp/fiscal-year-list"
import { FormField, keepFieldFocus } from "@/registry/erp/form"
import { PageState, SectionSkeleton } from "@/registry/erp/page-state"
import type { RecordFormItem } from "@/registry/erp/record-form"
import { RecordFormPage } from "@/registry/erp/record-form-page"
import { useCompanyId } from "@/registry/hooks/use-company"
import { useHasPermission } from "@/registry/hooks/use-me"
import { usePeriodLock } from "@/registry/hooks/use-period-lock"
import { useRecordForm } from "@/registry/hooks/use-record-form"
import { errorStateKind } from "@/registry/lib/api"
import {
  addDays,
  isCalendarDate,
  todayIn,
  type CalendarDate,
} from "@/registry/lib/dates"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  isLockDateTooLate,
  PERIOD_LOCK,
  PERIOD_LOCK_REASON_MAX_LENGTH,
  periodLockSchema,
  previousMonthEnd,
  reopensPeriod,
  type PeriodLock,
} from "@/registry/lib/period-lock"
import { useUserTimeZone } from "@/registry/lib/user-timezone"
import { Alert, AlertDescription } from "@/registry/ui/alert"
import { Button } from "@/registry/ui/button"
import { Textarea } from "@/registry/ui/textarea"

/**
 * Налаштування закритих періодів компанії (PF13, ADR-0069): дата «Закрито по», причина, коли період
 * відкривають знову (рішення власника 09.11.2026), і роки компанії (`erp/fiscal-year-list`).
 *
 * - Без `period-lock:update` — лише перегляд з поясненням; читати може кожен у компанії.
 * - Дата — лише минулий день: сьогодні лишається відкритим, тож сторно й нові документи мають куди лягти.
 *   Перевірка та сама, що в сервера, і код 422 сервера звучить тим самим текстом.
 * - Поле причини з'являється, лише коли нова дата відкриває вже закритий період.
 * - «Закрити жовтень 2026» ставить у поле кінець минулого місяця: зберігає людина.
 * - Стани: завантаження, помилка й офлайн із повтором, бекенд без закритих періодів.
 */
export interface PeriodLockSettingsProps {
  /** Рівень заголовків станів і років: 2 — під h1 сторінки, 3 — у розділі під h2. */
  readonly headingLevel?: 2 | 3
}

export function PeriodLockSettings({
  headingLevel = 2,
}: PeriodLockSettingsProps) {
  const t = useErpUiT()
  const format = useFormat()
  const companyId = useCompanyId()
  const canUpdate = useHasPermission(PERIOD_LOCK, "update")
  const state = usePeriodLock()
  if (state.isPending) return <SectionSkeleton rows={4} />
  if (state.isUnsupported)
    return (
      <PageState
        kind="empty"
        title={t("periodLock.unsupported")}
        headingLevel={headingLevel}
        className="min-h-40"
      />
    )
  const { lock } = state
  if (!lock)
    return (
      <PageState
        kind={state.isOffline ? "offline" : errorStateKind(state.error)}
        headingLevel={headingLevel}
        onRetry={state.refetch}
        className="min-h-40"
      />
    )
  return (
    <div data-slot="period-lock-settings" className="@container grid gap-6">
      <p className="text-sm">
        {lock.lockedThrough
          ? t("periodLock.statusClosed", {
              date: format.date(lock.lockedThrough, "date"),
            })
          : t("periodLock.statusOpen")}
      </p>
      {canUpdate ? null : (
        <Alert role={undefined}>
          <AlertDescription>{t("periodLock.readOnly")}</AlertDescription>
        </Alert>
      )}
      <PeriodLockForm key={companyId ?? ""} lock={lock} readOnly={!canUpdate} />
      <FiscalYearList
        lock={lock}
        readOnly={!canUpdate}
        headingLevel={headingLevel}
      />
    </div>
  )
}

interface LockValues {
  lockedThrough: string
  reason: string
}

const toValues = (lock: PeriodLock): LockValues => ({
  lockedThrough: lock.lockedThrough ?? "",
  reason: "",
})

/** Дата з поля: порожнє — закритих періодів немає. */
const lockDateOf = (value: string): CalendarDate | null => value || null

/** Схема форми: дата — минулий день, причина — коли період відкривають знову. */
function usePeriodLockSchema(saved: CalendarDate | null, today: CalendarDate) {
  const t = useErpUiT()
  const dateIssue = useDateIssueText()
  return React.useMemo(
    () =>
      z
        .object({ lockedThrough: z.string(), reason: z.string() })
        .superRefine((values, context) => {
          const issue = values.lockedThrough
            ? dateIssue(values.lockedThrough)
            : null
          if (issue)
            context.addIssue({
              code: "custom",
              path: ["lockedThrough"],
              message: issue,
            })
          else if (
            isCalendarDate(values.lockedThrough) &&
            isLockDateTooLate(values.lockedThrough, today)
          )
            context.addIssue({
              code: "custom",
              path: ["lockedThrough"],
              message: t("periodLock.future"),
            })
          // Причину видно й перевіряють, лише поки період відкривають: схована не заважає збереженню.
          if (!reopensPeriod(saved, lockDateOf(values.lockedThrough))) return
          const reason = values.reason.trim()
          if (!reason)
            context.addIssue({
              code: "custom",
              path: ["reason"],
              message: t("validation.required"),
            })
          else if (reason.length > PERIOD_LOCK_REASON_MAX_LENGTH)
            context.addIssue({
              code: "custom",
              path: ["reason"],
              message: t("recordForm.serverErrors.tooLong"),
            })
        }),
    [saved, today, t, dateIssue],
  )
}

function PeriodLockForm({
  lock,
  readOnly,
}: {
  lock: PeriodLock
  readOnly: boolean
}) {
  const t = useErpUiT()
  const today = todayIn(useUserTimeZone())
  const schema = usePeriodLockSchema(lock.lockedThrough, today)
  const state = useRecordForm<LockValues, PeriodLock>({
    resource: PERIOD_LOCK,
    record: lock,
    followRecord: true,
    schema,
    defaultValues: toValues(lock),
    recordSchema: periodLockSchema,
    toPayload: (values) => {
      const lockedThrough = lockDateOf(values.lockedThrough)
      // Причина йде в журнал лише з відкриттям: введену й сховану (дату повернули) не надсилаємо.
      return reopensPeriod(lock.lockedThrough, lockedThrough)
        ? { lockedThrough, reason: values.reason.trim() }
        : { lockedThrough }
    },
    serverErrorText: (field, code) =>
      field === "lockedThrough" && code === "future"
        ? t("periodLock.future")
        : undefined,
    toValues,
    onSaved: () => {
      toast.success(t("periodLock.saved"))
    },
  })
  const { form } = state
  const next = useWatch({ control: form.control, name: "lockedThrough" })
  const reopening = reopensPeriod(lock.lockedThrough, lockDateOf(next))
  const items: RecordFormItem[] = [
    {
      id: "lockedThrough",
      label: t("periodLock.lockedThrough"),
      description: t("periodLock.lockedThroughHint"),
      render: (props) => (
        <FormField
          {...props}
          control={form.control}
          name="lockedThrough"
          readOnly={readOnly}
          render={({ field, control }) => (
            <div className="grid justify-items-start gap-2">
              <DateInput
                {...control}
                ref={field.ref}
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                max={addDays(today, -1)}
              />
              {readOnly ? null : (
                <CloseMonthButton form={form} saved={lock} today={today} />
              )}
            </div>
          )}
        />
      ),
    },
    ...(reopening
      ? [
          {
            id: "reason",
            label: t("periodLock.reason"),
            description: t("periodLock.reasonHint"),
            wide: true,
            render: (props) => (
              <ReasonField
                {...props}
                control={form.control}
                readOnly={readOnly}
              />
            ),
          } satisfies RecordFormItem,
        ]
      : []),
  ]
  return <RecordFormPage state={state} items={items} readOnly={readOnly} />
}

/** «Закрити жовтень 2026»: кінець минулого місяця в полі, якщо він ще не закритий. */
function CloseMonthButton({
  form,
  saved,
  today,
}: {
  form: UseFormReturn<LockValues>
  saved: PeriodLock
  today: CalendarDate
}) {
  const t = useErpUiT()
  const format = useFormat()
  const monthEnd = previousMonthEnd(today)
  if (saved.lockedThrough !== null && saved.lockedThrough >= monthEnd)
    return null
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onMouseDown={keepFieldFocus}
      onClick={() => {
        form.setValue("lockedThrough", monthEnd, {
          shouldDirty: true,
          shouldValidate: true,
        })
      }}
    >
      {t("periodLock.closeMonth", {
        month: format.date(monthEnd, "monthYear"),
      })}
    </Button>
  )
}

function ReasonField({
  control,
  readOnly,
  label,
  description,
  className,
}: {
  control: Control<LockValues>
  readOnly: boolean
  label: string
  description?: string
  className?: string
}) {
  return (
    <FormField
      control={control}
      name="reason"
      label={label}
      description={description}
      readOnly={readOnly}
      className={className}
      render={({ field, control: aria }) => (
        <Textarea
          {...aria}
          ref={field.ref}
          name={field.name}
          value={field.value}
          maxLength={PERIOD_LOCK_REASON_MAX_LENGTH}
          rows={2}
          onChange={field.onChange}
          onBlur={field.onBlur}
        />
      )}
    />
  )
}
