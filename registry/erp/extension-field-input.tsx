import * as React from "react"
import {
  Controller,
  type Control,
  type FieldValues,
  type RefCallBack,
} from "react-hook-form"
import type { z } from "zod"

import { useDateIssueText, DateInput } from "@/registry/erp/date-input"
import { FormField, type FormControlProps } from "@/registry/erp/form"
import { FormSelect, type FormSelectItem } from "@/registry/erp/form-select"
import { NumberInput } from "@/registry/erp/number-input"
import { RecordPicker } from "@/registry/erp/record-picker"
import type {
  RecordFormItem,
  RecordFormItemChange,
} from "@/registry/erp/record-form"
import { localizedText, type LocalizedText } from "@/registry/lib/auth"
import {
  listFilterOf,
  useExtensionFields,
  type ExtensionField,
  type ExtensionFieldValue,
} from "@/registry/lib/extension-fields"
import {
  extensionFormFields,
  extensionFormSchema,
  extensionFormValues,
  extensionPayload,
  type ExtensionFormChanges,
  type ExtensionFormValue,
} from "@/registry/lib/extension-form"
import { mapKeyedChanges, type KeyedChanges } from "@/registry/lib/extensions"
import { useErpUiT, useLanguage } from "@/registry/lib/i18n"
import { recordOptionTexts } from "@/registry/lib/record-label"
import { Checkbox } from "@/registry/ui/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"

/**
 * Поля розширення у формі модуля (ADR-0020, п. 2; ADR-0026).
 *
 * - Поле вводу кіта за типом: текст — `Input`, число — `NumberInput` (`decimals`), дата — `DateInput`,
 *   список — `Select` (у необов'язковому є «Не вказано»), так/ні — прапорець із підписом праворуч,
 *   запис із довідника — `RecordPicker` з пошуком на сервері (у необов'язковому є «Очистити»).
 * - `useExtensionForm(fields, changes)` — поля у формі за `form.add`, схеми з текстами мовою
 *   інтерфейсу, значення форми з запису, значення для запиту й зміни списку полів форми модуля:
 *   нові поля (`RecordFormItem`) і підпис чи підказка поля модуля без заміни (`change`).
 */

type InputField = Exclude<ExtensionField, { type: "boolean" }>

interface ExtensionFieldInputProps extends FormControlProps {
  field: InputField
  name: string
  value: unknown
  onValueChange: (value: ExtensionFormValue) => void
  onBlur: () => void
  ref?: RefCallBack
}

/** Поле вводу для поля розширення (крім так/ні): `ref` — для фокуса на полі з помилкою. */
function ExtensionFieldInput({
  field,
  name,
  value,
  onValueChange,
  onBlur,
  ref,
  ...control
}: ExtensionFieldInputProps) {
  switch (field.type) {
    case "text":
      return (
        <Input
          {...control}
          ref={ref}
          name={name}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => {
            onValueChange(event.target.value)
          }}
          onBlur={onBlur}
        />
      )
    case "number":
      return (
        <NumberInput
          {...control}
          ref={ref}
          name={name}
          value={typeof value === "number" ? value : null}
          onValueChange={onValueChange}
          onBlur={onBlur}
          decimalScale={field.decimals ?? 0}
          allowNegative
        />
      )
    case "date":
      return (
        <DateInput
          {...control}
          ref={ref}
          name={name}
          value={typeof value === "string" ? value : ""}
          onValueChange={onValueChange}
          onBlur={onBlur}
        />
      )
    case "options":
      return (
        <OptionsInput
          {...control}
          field={field}
          value={typeof value === "string" ? value : null}
          onValueChange={onValueChange}
          onBlur={onBlur}
          ref={ref}
        />
      )
    case "record":
      return (
        <RecordInput
          {...control}
          field={field}
          value={typeof value === "string" && value ? value : null}
          onValueChange={onValueChange}
          onBlur={onBlur}
          ref={ref}
        />
      )
  }
}

/** Запис із довідника сервера: підпис і другий рядок — поля запису з опису поля. */
function RecordInput({
  field,
  ...props
}: Omit<ExtensionFieldInputProps, "name" | "field" | "value"> & {
  field: Extract<ExtensionField, { type: "record" }>
  value: string | null
}) {
  const { language } = useLanguage()
  return (
    <RecordPicker
      {...props}
      resource={field.resource}
      label={localizedText(field.label, language) ?? field.id}
      {...recordOptionTexts(field.labelField, field.descriptionField)}
      filter={field.filter && listFilterOf(field.filter)}
      required={field.required}
      clearable={!field.required}
    />
  )
}

function OptionsInput({
  field,
  ...props
}: Omit<ExtensionFieldInputProps, "name" | "field" | "value"> & {
  field: Extract<ExtensionField, { type: "options" }>
  value: string | null
}) {
  const t = useErpUiT()
  const { language } = useLanguage()
  const items: FormSelectItem<string | null>[] = [
    ...(field.required ? [] : [{ value: null, label: t("recordForm.notSet") }]),
    ...field.options.map((option) => ({
      value: option.value,
      label: localizedText(option.label, language) ?? option.value,
    })),
  ]
  return (
    <FormSelect {...props} items={items} placeholder={t("recordForm.notSet")} />
  )
}

/** Так/ні — прапорець із підписом праворуч (`Field orientation="horizontal"`). */
export function BooleanFormField({
  control,
  name,
  label,
  description,
  readOnly,
  className,
}: {
  control: Control
  name: string
  label: string
  description?: string
  readOnly?: boolean
  className?: string
}) {
  const id = React.useId()
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Field
          orientation="horizontal"
          data-field-name={name}
          className={className}
        >
          <Checkbox
            id={id}
            ref={field.ref}
            checked={field.value === true}
            onCheckedChange={(checked) => {
              field.onChange(checked)
            }}
            onBlur={field.onBlur}
            readOnly={readOnly}
            // Base UI ставить `id` на приховане поле, а не на сам прапорець: назва — через aria.
            aria-labelledby={`${id}-label`}
            aria-describedby={description ? `${id}-hint` : undefined}
          />
          <FieldContent>
            <FieldLabel id={`${id}-label`} htmlFor={id} className="font-normal">
              {label}
            </FieldLabel>
            {description ? (
              <FieldDescription id={`${id}-hint`}>
                {description}
              </FieldDescription>
            ) : null}
          </FieldContent>
        </Field>
      )}
    />
  )
}

export interface ExtensionFormApi<K extends string> {
  /** Поля розширення у формі, у порядку `form.add`. */
  readonly fields: readonly ExtensionField[]
  /** Схеми полів для `z.object({ ...поля модуля, ...shape })`. */
  readonly shape: Record<string, z.ZodType>
  /** Значення форми з запису; без запису (створення) — порожні. */
  readonly values: (record?: unknown) => Record<string, ExtensionFormValue>
  /** Значення для запиту: лише ключі з `keys`, порожнє — `null`. */
  readonly payload: (
    values: Readonly<Record<string, unknown>>,
    keys: readonly string[],
  ) => Record<string, ExtensionFieldValue>
  /** Зміни списку полів форми модуля для `applyKeyedChanges`: нові поля, підписи без заміни. */
  readonly items: <TValues extends FieldValues>(
    control: Control<TValues>,
    options?: { readOnly?: boolean },
  ) => KeyedChanges<RecordFormItem, K, RecordFormItemChange> | undefined
}

/**
 * Поля розширення для форми модуля. `fields` і `changes` — стабільні між рендерами (константи файлу
 * розширення): від них залежить схема форми.
 */
export function useExtensionForm<K extends string>(
  allFields: readonly ExtensionField[] | undefined,
  changes: ExtensionFormChanges<K> | undefined,
): ExtensionFormApi<K> {
  const t = useErpUiT()
  const { language } = useLanguage()
  const dateIssue = useDateIssueText()
  const { display } = useExtensionFields(allFields)
  return React.useMemo(() => {
    const fields = extensionFormFields(allFields, changes)
    const label = (value: LocalizedText | undefined) =>
      value && (localizedText(value, language) ?? undefined)
    const shape = extensionFormSchema(fields, {
      required: t("validation.required"),
      dateIssue: (value) => dateIssue(value),
    })
    const itemOf = (
      id: string,
      control: Control<FieldValues>,
      readOnly: boolean | undefined,
    ): RecordFormItem => {
      const field = fields.find((candidate) => candidate.id === id)
      if (!field)
        throw new Error(`erp-ui: extension field "${id}" is not declared`)
      return {
        id,
        label: label(field.label) ?? id,
        description: label(
          changes?.add?.find((item) => item.id === id)?.description,
        ),
        wide: changes?.add?.find((item) => item.id === id)?.wide,
        // Як у списку й картці: «Так», «Ні», підпис варіанта, дата мовою інтерфейсу, запис — підпис
        // із сервера.
        text: (value) => display(field, value === "" ? null : value),
        render: (props) =>
          field.type === "boolean" ? (
            <BooleanFormField
              {...props}
              control={control}
              name={id}
              readOnly={readOnly}
            />
          ) : (
            <FormField
              {...props}
              control={control}
              name={id}
              readOnly={readOnly}
              render={({ field: input, control: aria }) => (
                <ExtensionFieldInput
                  {...aria}
                  field={field}
                  name={input.name}
                  value={input.value as unknown}
                  onValueChange={input.onChange}
                  onBlur={input.onBlur}
                  ref={input.ref}
                />
              )}
            />
          ),
      }
    }
    return {
      fields,
      shape,
      values: (record) => extensionFormValues(fields, record),
      payload: (values, keys) => extensionPayload(fields, values, keys),
      items: (control, options) =>
        mapKeyedChanges(
          changes,
          // Поля розширення — ключі поза типом значень модуля: контроль форми без її типу.
          (item) =>
            itemOf(
              item.id,
              control as unknown as Control<FieldValues>,
              options?.readOnly,
            ),
          (change) => ({
            id: change.id,
            label: label(change.label),
            description: label(change.description),
          }),
        ),
    }
  }, [allFields, changes, language, t, dateIssue, display])
}
