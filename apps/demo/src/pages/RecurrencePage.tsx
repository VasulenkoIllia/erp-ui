import { zodResolver } from "@hookform/resolvers/zod"
import { useMemo, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { z } from "zod"

import { DateInput, TimeInput } from "@/registry/erp/date-input"
import { FormField, keepFieldFocus } from "@/registry/erp/form-field"
import {
  RecurrenceEditor,
  useRecurrenceMessages,
} from "@/registry/erp/recurrence-editor"
import { RecurrenceSummary } from "@/registry/erp/recurrence-summary"
import { isCalendarDate, isTime } from "@/registry/lib/dates"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  formatRecurrenceRule,
  type Recurrence,
} from "@/registry/lib/recurrence"
import {
  isRecurrenceUntilBeforeStart,
  recurrenceDraft,
  recurrenceDraftSchema,
  recurrenceFromDraft,
} from "@/registry/lib/recurrence-draft"
import { Button } from "@/registry/ui/button"
import { useDemoTranslation } from "@/i18n"
import { ukRecurrencePage } from "@/i18n/pages"

import { PageHeader } from "./PageHeader"
import {
  COMPANY_ZONE,
  RECURRENCE_CASES,
  RECURRENCE_SAMPLES,
  type RecurrenceCase,
} from "./recurrence-model"
import { Section } from "./Section"

/** Поле чернетки повтору у формі сторінки. */
const RECURRENCE_FIELD = "recurrence"
const UNTIL_FIELD = `${RECURRENCE_FIELD}.until` as const

function usePageT() {
  return useDemoTranslation([ukRecurrencePage], {
    keyPrefix: "recurrencePage",
  }).t
}

function useFormSchema(withTime: boolean) {
  const kitT = useErpUiT()
  const messages = useRecurrenceMessages()
  return useMemo(() => {
    const required = kitT("validation.required")
    return z
      .object({
        date: z.string().refine(isCalendarDate, required),
        time: withTime ? z.string().refine(isTime, required) : z.string(),
        recurrence: recurrenceDraftSchema(messages),
      })
      .superRefine((values, context) => {
        const start = startOf(values, withTime)
        if (isRecurrenceUntilBeforeStart(values.recurrence, start))
          context.addIssue({
            code: "custom",
            path: [RECURRENCE_FIELD, "until"],
            message: messages.untilBeforeStart(start),
          })
      })
  }, [kitT, messages, withTime])
}

type Values = z.input<ReturnType<typeof useFormSchema>>

const startOf = (values: Pick<Values, "date" | "time">, withTime: boolean) =>
  withTime ? `${values.date}T${values.time}` : values.date

function RecurrenceForm({ example }: { example: RecurrenceCase }) {
  const t = usePageT()
  const withTime = example.start.includes("T")
  const schema = useFormSchema(withTime)
  const [date, time = ""] = example.start.split("T")
  const [sent, setSent] = useState<Recurrence | null | undefined>()
  const form = useForm<Values>({
    mode: "onTouched",
    resolver: zodResolver(schema),
    defaultValues: {
      date,
      time,
      recurrence: recurrenceDraft(example.recurrence, example.start),
    },
  })
  const { control } = form
  const [shownDate, shownTime] = useWatch({ control, name: ["date", "time"] })
  // Помилка «не раніше за перший день» стоїть біля дня кінця: виправили перший день — перевіряємо й її.
  const recheckUntil = () => {
    if (form.getFieldState(UNTIL_FIELD).invalid) void form.trigger(UNTIL_FIELD)
  }
  const start = startOf({ date: shownDate, time: shownTime }, withTime)
  const submit = form.handleSubmit((values) => {
    const context = {
      start: startOf(values, withTime),
      timeZone: example.timeZone,
    }
    const value = recurrenceFromDraft(values.recurrence, context)
    setSent(value)
    // Те, що отримав би сервер, читається назад у редактор.
    form.reset({ ...values, recurrence: recurrenceDraft(value, context.start) })
  })
  return (
    <form
      data-testid={`recurrence-${example.id}`}
      className="@container space-y-4"
      noValidate
      onSubmit={(event) => {
        void submit(event)
      }}
    >
      <div className="grid gap-4 @lg:grid-cols-2">
        <FormField
          control={control}
          name="date"
          label={t("fields.date")}
          readOnly={example.readOnly}
          render={({ field, control: aria }) => (
            <DateInput
              {...aria}
              ref={field.ref}
              value={field.value}
              onValueChange={(value) => {
                field.onChange(value)
                recheckUntil()
              }}
              onBlur={field.onBlur}
            />
          )}
        />
        {withTime ? (
          <FormField
            control={control}
            name="time"
            label={t("fields.time", { zone: example.timeZone })}
            render={({ field, control: aria }) => (
              <TimeInput
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
      <RecurrenceEditor
        control={control}
        name={RECURRENCE_FIELD}
        start={start}
        timeZone={example.timeZone}
        label={t("fields.recurrence")}
        readOnly={example.readOnly}
      />
      {example.readOnly ? null : (
        <Button type="submit" onMouseDown={keepFieldFocus}>
          {t("save")}
        </Button>
      )}
      {/* Регіон є до відправки: скрінрідер озвучує текст, що в ньому з'явився. */}
      <div className="space-y-1 text-sm" role="status">
        {sent === undefined ? null : (
          <>
            <p>{t("sent")}</p>
            <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs">
              {JSON.stringify(sent)}
            </pre>
          </>
        )}
      </div>
    </form>
  )
}

function SamplesSection() {
  const t = usePageT()
  return (
    <Section title={t("samples.title")} description={t("samples.description")}>
      <ul className="@container grid gap-4">
        {RECURRENCE_SAMPLES.map((sample) => (
          <li key={sample.id} className="grid gap-1">
            <code className="text-xs break-all text-muted-foreground">
              {formatRecurrenceRule(sample.rule, {
                start: sample.start,
                timeZone: COMPANY_ZONE,
              })}
            </code>
            <RecurrenceSummary
              rule={sample.rule}
              context={{ start: sample.start, timeZone: COMPANY_ZONE }}
            />
          </li>
        ))}
      </ul>
    </Section>
  )
}

export function RecurrencePage() {
  const t = usePageT()
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} lead={t("lead")} />
      {RECURRENCE_CASES.map((example) => (
        <Section
          key={example.id}
          title={t(`cases.${example.id}.title`)}
          description={t(`cases.${example.id}.description`)}
        >
          <RecurrenceForm example={example} />
        </Section>
      ))}
      <SamplesSection />
    </div>
  )
}
