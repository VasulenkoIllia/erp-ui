import { zodResolver } from "@hookform/resolvers/zod"
import { useId, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"

import { FormErrorSummary, FormField } from "@/registry/erp/form"
import { KeyValueField } from "@/registry/erp/key-value-field"
import { NumberInput } from "@/registry/erp/number-input"
import { RepeatingRows } from "@/registry/erp/repeating-rows"
import { SaveBar } from "@/registry/erp/save-bar"
import { useErpUiT } from "@/registry/lib/i18n"
import { keyValueSchema, type KeyValueRow } from "@/registry/lib/key-value"
import { Checkbox } from "@/registry/ui/checkbox"
import { Field, FieldLabel } from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"

import { Section } from "./Section"

const useSectionT = () =>
  useTranslation("demo", { keyPrefix: "formsPage.rows" }).t

const SAVE_DELAY_MS = 600
const STEPS_MIN = 1
const STEPS_MAX = 4

interface StepValues {
  title: string
  days: number | null
}

interface RowsValues {
  steps: StepValues[]
  terms: KeyValueRow[]
}

const wait = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

function useRowsSchema() {
  const t = useSectionT()
  const kitT = useErpUiT()
  return useMemo(() => {
    const required = kitT("validation.required")
    return z.object({
      steps: z
        .array(
          z.object({
            title: z.string().trim().min(1, required),
            days: z
              .number()
              .nullable()
              .refine((value) => value !== null, required),
          }),
        )
        .superRefine((steps, context) => {
          const days = steps.reduce((sum, step) => sum + (step.days ?? 0), 0)
          if (days > 30)
            context.addIssue({ code: "custom", message: t("tooLong") })
        }),
      terms: keyValueSchema({
        required,
        duplicate: kitT("keyValue.duplicate"),
        tooLong: kitT("keyValue.tooLong"),
      }),
    })
  }, [t, kitT])
}

/**
 * Повторювані рядки, «ключ–значення» й панель збереження однією формою (UI42, PF11; ADR-0047): кроки
 * з порядком і межами 1–4, умови парами, сума днів понад 30 — помилка всієї групи. Перемикач показує
 * режим лише для читання.
 */
function RowsForm({ readOnly }: { readOnly: boolean }) {
  const t = useSectionT()
  const kitT = useErpUiT()
  const schema = useRowsSchema()
  const form = useForm<RowsValues>({
    mode: "onTouched",
    shouldFocusError: false,
    resolver: zodResolver(schema),
    defaultValues: {
      steps: [
        { title: t("sample.draft"), days: 3 },
        { title: t("sample.approval"), days: 5 },
      ],
      terms: [{ key: t("sample.warrantyKey"), value: t("sample.warranty") }],
    },
  })
  const { isDirty, isSubmitting, errors, submitCount } = form.formState
  const save = form.handleSubmit(async (values) => {
    if (!isDirty) {
      toast.info(kitT("forms.noChanges"))
      return
    }
    await wait(SAVE_DELAY_MS)
    form.reset(values)
    toast.success(t("saved"))
  })
  return (
    <form
      noValidate
      data-testid="rows-form"
      className="grid gap-6"
      onSubmit={(event) => void save(event)}
    >
      {/* Без `UnsavedChangesGuard`: на сторінці він уже є у формі рахунку, а роутеру потрібен один. */}
      <FormErrorSummary
        errors={errors}
        labels={{ steps: t("steps"), terms: t("terms") }}
        submitCount={submitCount}
      />
      <RepeatingRows
        control={form.control}
        name="steps"
        label={t("steps")}
        description={t("stepsHint", { min: STEPS_MIN, max: STEPS_MAX })}
        rowLabel={(index) => t("step", { index: index + 1 })}
        addLabel={t("addStep")}
        newRow={() => ({ title: "", days: null })}
        minRows={STEPS_MIN}
        maxRows={STEPS_MAX}
        canReorder
        readOnly={readOnly}
        rowClassName="@lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
        renderRow={({ index }) => (
          <>
            <FormField
              control={form.control}
              name={`steps.${index}.title`}
              label={t("stepTitle")}
              readOnly={readOnly}
              render={({ field, control }) => (
                <Input {...field} {...control} autoComplete="off" />
              )}
            />
            <FormField
              control={form.control}
              name={`steps.${index}.days`}
              label={t("stepDays")}
              readOnly={readOnly}
              render={({ field, control }) => (
                <NumberInput
                  {...control}
                  ref={field.ref}
                  decimalScale={0}
                  value={field.value}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            />
          </>
        )}
      />
      <KeyValueField
        control={form.control}
        name="terms"
        label={t("terms")}
        description={t("termsHint")}
        keyLabel={t("termKey")}
        valueLabel={t("termValue")}
        readOnly={readOnly}
      />
      {readOnly ? null : (
        <SaveBar
          isDirty={isDirty}
          isSaving={isSubmitting}
          onDiscard={() => {
            form.reset()
          }}
        />
      )}
    </form>
  )
}

export function RepeatingRowsSection() {
  const t = useSectionT()
  const id = useId()
  const [readOnly, setReadOnly] = useState(false)
  return (
    <Section title={t("title")} description={t("description")}>
      <Field orientation="horizontal">
        <Checkbox
          aria-labelledby={id}
          checked={readOnly}
          onCheckedChange={setReadOnly}
        />
        <FieldLabel id={id} className="font-normal">
          {t("readOnly")}
        </FieldLabel>
      </Field>
      {/* Новий режим — нова форма: рядки перемальовуються разом із кнопками. */}
      <RowsForm key={String(readOnly)} readOnly={readOnly} />
    </Section>
  )
}
