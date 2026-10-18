import { zodResolver } from "@hookform/resolvers/zod"
import { useId, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { FormField, keepFieldFocus } from "@/registry/erp/form"
import {
  MultiSelect,
  type MultiSelectOption,
} from "@/registry/erp/multi-select"
import { Button } from "@/registry/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/registry/ui/field"

import { Section } from "./Section"

/**
 * Мультивибір із довідника (UI40, ADR-0027) на сторінці «Вибір і реквізити»: поле у формі з
 * перевіркою й стани поля та довідника. Довідник — у пам'яті: стани задає сама сторінка.
 */

const usePageT = () => useTranslation("demo", { keyPrefix: "pickersPage" }).t

const TAGS = [
  "key",
  "vip",
  "new",
  "wholesale",
  "retail",
  "partner",
  "supplier",
  "public",
  "export",
  "seasonal",
] as const

/** Ключ тегу, якого вже немає в довіднику. */
const ARCHIVED_TAG = "tag-archived"
const NO_OPTIONS: readonly MultiSelectOption[] = []
const LOAD_ERROR = new Error("demo: tags failed to load")

function useTagOptions(): readonly MultiSelectOption[] {
  const t = usePageT()
  return useMemo(
    () => TAGS.map((tag) => ({ value: tag, label: t(`multi.options.${tag}`) })),
    [t],
  )
}

export function MultiSelectSections() {
  return (
    <>
      <MultiFormSection />
      <MultiStatesSection />
    </>
  )
}

function MultiFormSection() {
  const t = usePageT()
  const options = useTagOptions()
  const [saved, setSaved] = useState<string | null>(null)
  const schema = useMemo(
    () =>
      z.object({
        tags: z.array(z.string()).min(1, t("multi.tagsRequired")),
      }),
    [t],
  )
  const form = useForm({
    mode: "onTouched",
    resolver: zodResolver(schema),
    defaultValues: { tags: [] as string[] },
  })
  const submit = form.handleSubmit(({ tags }) => {
    const labels = tags.map(
      (tag) => options.find((option) => option.value === tag)?.label ?? tag,
    )
    setSaved(t("multi.saved", { tags: labels.join(", ") }))
  })
  return (
    <Section title={t("multi.title")} description={t("multi.lead")}>
      <form
        noValidate
        onSubmit={(event) => void submit(event)}
        className="max-w-xl space-y-4"
      >
        <FieldGroup>
          <FormField
            control={form.control}
            name="tags"
            label={t("multi.tags")}
            description={t("multi.tagsHint")}
            render={({ field, control }) => (
              <MultiSelect
                {...control}
                ref={field.ref}
                options={options}
                label={t("multi.tags")}
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                clearable
                required
              />
            )}
          />
        </FieldGroup>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" onMouseDown={keepFieldFocus}>
            {t("multi.submit")}
          </Button>
          <p role="status" className="text-sm text-muted-foreground">
            {saved}
          </p>
        </div>
      </form>
    </Section>
  )
}

/** Поле демо з підписом і підказкою; значення живе в самому полі. */
function MultiExample({
  label,
  hint,
  options,
  initial = [],
  error,
  loadError,
  onRetry,
  readOnly,
  disabled,
}: {
  label: string
  hint?: string
  options: readonly MultiSelectOption[] | undefined
  initial?: readonly string[]
  error?: string
  loadError?: unknown
  onRetry?: () => void
  readOnly?: boolean
  disabled?: boolean
}) {
  const id = useId()
  const [value, setValue] = useState(initial)
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <MultiSelect
        id={id}
        options={options}
        label={label}
        value={value}
        onValueChange={setValue}
        error={loadError}
        onRetry={onRetry}
        readOnly={readOnly}
        disabled={disabled}
        clearable
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-msg`}
      />
      {error ? (
        <FieldError id={`${id}-msg`}>{error}</FieldError>
      ) : (
        <FieldDescription id={`${id}-msg`}>{hint}</FieldDescription>
      )}
    </Field>
  )
}

/** Довідник не завантажився: «Спробувати ще» вантажить його. */
function FailedListExample({
  options,
}: {
  options: readonly MultiSelectOption[]
}) {
  const t = usePageT()
  const [failed, setFailed] = useState(true)
  return (
    <MultiExample
      label={t("multiStates.failed")}
      hint={t("multiStates.failedHint")}
      options={failed ? undefined : options}
      loadError={failed ? LOAD_ERROR : undefined}
      onRetry={() => {
        setFailed(false)
      }}
    />
  )
}

function MultiStatesSection() {
  const t = usePageT()
  const options = useTagOptions()
  return (
    <Section title={t("multiStates.title")} description={t("multiStates.lead")}>
      <div className="@container">
        <div className="grid gap-4 @2xl:grid-cols-2">
          <MultiExample
            label={t("states.empty")}
            hint={t("states.emptyHint")}
            options={options}
          />
          <MultiExample
            label={t("states.filled")}
            hint={t("multiStates.filledHint")}
            options={options}
            initial={["vip", "wholesale"]}
          />
          <MultiExample
            label={t("multiStates.many")}
            hint={t("multiStates.manyHint")}
            options={options}
            initial={TAGS}
          />
          <MultiExample
            label={t("states.invalid")}
            options={options}
            error={t("multi.tagsRequired")}
          />
          <MultiExample
            label={t("states.readOnly")}
            hint={t("states.readOnlyHint")}
            options={options}
            initial={["key", "partner"]}
            readOnly
          />
          <MultiExample
            label={t("states.disabled")}
            hint={t("states.disabledHint")}
            options={options}
            initial={["retail"]}
            disabled
          />
          <MultiExample
            label={t("multiStates.missing")}
            hint={t("multiStates.missingHint")}
            options={options}
            initial={["vip", ARCHIVED_TAG]}
          />
          <MultiExample
            label={t("multiStates.loading")}
            hint={t("multiStates.loadingHint")}
            options={undefined}
            initial={["vip"]}
          />
          <FailedListExample options={options} />
          <MultiExample
            label={t("multiStates.emptyList")}
            hint={t("multiStates.emptyListHint")}
            options={NO_OPTIONS}
          />
        </div>
      </div>
    </Section>
  )
}
