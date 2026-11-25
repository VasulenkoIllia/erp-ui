import type * as React from "react"

import type { FormControlProps } from "@/registry/lib/form-control"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/registry/ui/select"

/** Значення варіанта: рядок, число (id з бази) чи null («не вибрано»). */
export type FormSelectValue = string | number | null

export interface FormSelectItem<TValue extends FormSelectValue> {
  value: TValue
  label: string
}

/**
 * Доступна назва списку: `id` під `<label>` (так дає `FormField`), а без форми — `aria-label` чи
 * `aria-labelledby`. Без жодного з них список без назви, тож тип вимагає одне.
 */
type FormSelectName =
  { id: string } | { "aria-label": string } | { "aria-labelledby": string }

type FormSelectProps<TValue extends FormSelectValue> =
  FormSelectFields<TValue> & FormSelectName

interface FormSelectFields<TValue extends FormSelectValue> extends Omit<
  Partial<FormControlProps>,
  "id"
> {
  id?: string
  "aria-label"?: string
  "aria-labelledby"?: string
  items: readonly FormSelectItem<TValue>[]
  value: TValue
  onValueChange: (value: TValue) => void
  /** Поле покинуто: список закрили (для react-hook-form, `mode: "onTouched"`). */
  onBlur?: () => void
  ref?: React.Ref<HTMLButtonElement>
  placeholder?: string
}

/**
 * Вибір одного значення з короткого списку для `FormField` (тип, статус, варіант поля розширення).
 * Список забирає фокус, тож «покинуто» — коли його закрили, а не коли відкрили: інакше помилка
 * обов'язкового поля з'являлась би посеред вибору. `ref` — на кнопку поля (фокус на помилці).
 *
 * Без форми — теж: `<FormSelect aria-label="Постачальник" items={…} value={id} onValueChange={setId} />`.
 * Значення — рядок чи число (id з бази) без перетворень: що в `items`, те й прийде в `onValueChange`.
 * Файл не тягне ні react-hook-form, ні ra-core (ADR-0099).
 */
export function FormSelect<TValue extends FormSelectValue>({
  items,
  value,
  onValueChange,
  onBlur,
  ref,
  placeholder,
  readOnly,
  disabled,
  ...aria
}: FormSelectProps<TValue>) {
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) => {
        onValueChange(next as TValue)
      }}
      onOpenChange={(open) => {
        if (!open) onBlur?.()
      }}
      readOnly={readOnly}
      disabled={disabled}
    >
      <SelectTrigger {...aria} ref={ref} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem
            key={`${typeof item.value}:${String(item.value)}`}
            value={item.value}
          >
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
