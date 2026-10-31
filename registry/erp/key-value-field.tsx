import type {
  ArrayPath,
  Control,
  FieldArray,
  FieldPath,
  FieldValues,
  PathValue,
} from "react-hook-form"

import { FormField } from "@/registry/erp/form"
import { RepeatingRows } from "@/registry/erp/repeating-rows"
import { useErpUiT } from "@/registry/lib/i18n"
import { KEY_VALUE_MAX_ROWS, type KeyValueRow } from "@/registry/lib/key-value"
import { Input } from "@/registry/ui/input"

/**
 * Поле «ключ–значення» (UI42, ADR-0047): умови пропозиції, коди значення в інших системах. Рядки —
 * `erp/repeating-rows`; у формі значення — масив `{ key, value }`, перевірка й перетворення на об'єкт
 * запиту — `lib/key-value` (`keyValueSchema`, `keyValueRows`, `keyValueRecord`).
 */
export interface KeyValueFieldProps<
  TValues extends FieldValues,
  TName extends ArrayPath<TValues>,
  TTransformed extends FieldValues = TValues,
> {
  control: Control<TValues, unknown, TTransformed>
  /** Лише поле з рядками `KeyValueRow[]`: інше дістало б чужі рядки без помилки компілятора. */
  name: PathValue<TValues, TName> extends readonly KeyValueRow[] ? TName : never
  label: React.ReactNode
  description?: React.ReactNode
  /** Підпис колонки ключа: «Система». */
  keyLabel?: string
  /** Підпис колонки значення: «Код». */
  valueLabel?: string
  addLabel?: string
  empty?: React.ReactNode
  maxRows?: number
  readOnly?: boolean
  className?: string
}

const newRow = (): KeyValueRow => ({ key: "", value: "" })

function KeyValueField<
  TValues extends FieldValues,
  TName extends ArrayPath<TValues>,
  TTransformed extends FieldValues = TValues,
>({
  control,
  name: rawName,
  label,
  description,
  keyLabel,
  valueLabel,
  addLabel,
  empty,
  maxRows = KEY_VALUE_MAX_ROWS,
  readOnly = false,
  className,
}: KeyValueFieldProps<TValues, TName, TTransformed>) {
  const t = useErpUiT()
  const name = rawName as TName
  const cell = (index: number, part: keyof KeyValueRow) =>
    `${name}.${index}.${part}` as FieldPath<TValues>
  return (
    <RepeatingRows
      control={control}
      name={name}
      label={label}
      description={description}
      rowLabel={(index) => t("keyValue.row", { index: index + 1 })}
      addLabel={addLabel ?? t("keyValue.add")}
      newRow={newRow as () => FieldArray<TValues, TName>}
      empty={empty ?? t("keyValue.empty")}
      maxRows={maxRows}
      readOnly={readOnly}
      className={className}
      rowClassName="@lg:grid-cols-2"
      renderRow={({ index }) => (
        <>
          <FormField
            control={control}
            name={cell(index, "key")}
            label={keyLabel ?? t("keyValue.key")}
            readOnly={readOnly}
            render={({ field, control: aria }) => (
              <Input {...field} {...aria} autoComplete="off" />
            )}
          />
          <FormField
            control={control}
            name={cell(index, "value")}
            label={valueLabel ?? t("keyValue.value")}
            readOnly={readOnly}
            render={({ field, control: aria }) => (
              <Input {...field} {...aria} autoComplete="off" />
            )}
          />
        </>
      )}
    />
  )
}

export { KeyValueField }
