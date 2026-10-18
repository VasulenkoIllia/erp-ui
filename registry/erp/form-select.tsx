"use client"

import type * as React from "react"

import type { FormControlProps } from "@/registry/erp/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/registry/ui/select"

export interface FormSelectItem<TValue extends string | null> {
  value: TValue
  label: string
}

interface FormSelectProps<
  TValue extends string | null,
> extends FormControlProps {
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
 */
export function FormSelect<TValue extends string | null>({
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
          <SelectItem key={item.value ?? ""} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
