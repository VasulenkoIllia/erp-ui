import { useFormState, type Control, type FieldValues } from "react-hook-form"

import { FormField } from "@/components/erp/form"
import { MultiSelect } from "@/components/erp/multi-select"
import type { RecordFormItem } from "@/components/erp/record-form"

import { useSegmentOptions } from "./segments"

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id) => b.includes(id))

/**
 * Поле «Сегменти» форм організації й контакту (ADR-0027): кілька значень із довідника сегментів
 * компанії; у порівнянні при конфлікті — назви сегментів через кому.
 */
export function useSegmentItem<TValues extends FieldValues>(
  control: Control<TValues>,
  label: string,
): RecordFormItem & { id: "segments" } {
  const segments = useSegmentOptions()
  const anyControl = control as unknown as Control<FieldValues>
  const saved =
    (useFormState({ control: anyControl }).defaultValues?.segments as
      readonly string[] | undefined) ?? []
  const nameOf = (id: string) =>
    segments.options?.find((option) => option.value === id)?.label ?? id
  return {
    id: "segments",
    label,
    wide: true,
    text: (value) =>
      Array.isArray(value) && value.length
        ? value.map((id) => nameOf(String(id))).join(", ")
        : null,
    render: (props) => (
      <FormField
        {...props}
        control={anyControl}
        name="segments"
        render={({ field, control: aria }) => (
          <MultiSelect
            {...aria}
            ref={field.ref}
            options={segments.options}
            error={segments.error}
            onRetry={segments.retry}
            label={props.label}
            value={(field.value as string[] | undefined) ?? []}
            // Зняли й знову вибрали: мультивибір ставить значення в кінець, а порядок — не зміна.
            onValueChange={(next) => {
              field.onChange(sameSet(next, saved) ? [...saved] : next)
            }}
            onBlur={field.onBlur}
            clearable
          />
        )}
      />
    ),
  }
}
