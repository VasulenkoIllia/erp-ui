"use client"

import * as React from "react"
import { NumericFormat, type NumberFormatValues } from "react-number-format"

import {
  currencyDigits,
  currencyLabel,
  decimalToMinor,
  minorToDecimal,
  numberSeparators,
  type Money,
} from "@/registry/lib/format"
import { useLanguage } from "@/registry/lib/i18n"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/registry/ui/input-group"

/**
 * Поля числа й суми (UI21 — основа, SPEC §11, ADR-0015).
 *
 * - Розряди й дріб — як у мові інтерфейсу: «48 600,50» (uk), «48,600.50» (en-GB). Кома й крапка з
 *   клавіатури — дробова частина, якщо символ не є роздільником розрядів (у en-GB кома — розряди);
 *   зайві знаки після коми не вводяться; цілих розрядів — не більше 15.
 * - `MoneyInput` — сума в цілих мінорних одиницях (`Money`, SPEC §17): копійки без похибок float;
 *   знаків після коми стільки, скільки у валюти (UAH 2, JPY 0). Валюта — підписом у полі: «₴», «USD».
 * - `NumberInput` — кількість, відсоток, ціна за одиницю: `number | null`, одиниця — підписом (`unit`).
 * - Порожнє поле — `null`. Межі (мінімум, максимум) перевіряє форма (SPEC §8.3), а не поле.
 * - `ref` веде на `<input>`: react-hook-form фокусує поле з помилкою.
 * - Валюта чи одиниця — в описі поля (`aria-describedby`), тож скрінрідер її називає.
 */

type InputProps = Omit<
  React.ComponentProps<"input">,
  "value" | "defaultValue" | "onChange" | "type" | "min" | "max" | "step"
>

/** Пропси, що стосуються групи (рамка, ширина), а не самого поля. */
interface GroupProps {
  className?: string
  /** Дозволити від'ємні значення (за замовчуванням — ні). */
  allowNegative?: boolean
}

/** Цілих розрядів не більше: до трильйонів — межа суми прописом і запас для будь-якого документа. */
const MAX_INTEGER_DIGITS = 15

/**
 * Текст, який вводить користувач, поки зовнішнє значення йому відповідає: інакше форма, що
 * нормалізує значення (48600 → "48600.00"), рухала б каретку під час введення.
 */
function useDraft<T>(
  value: T,
  toText: (value: T) => string,
  fromText: (text: string) => T,
  same: (a: T, b: T) => boolean,
) {
  const [draft, setDraft] = React.useState(() => toText(value))
  const matches = () => {
    try {
      return same(fromText(draft), value)
    } catch (error) {
      // Чернетка не читається з новою точністю (валюту змінили на JPY, а введено «100,50»):
      // показуємо значення ззовні — це не збій.
      if (error instanceof RangeError) return false
      throw error
    }
  }
  const shown = matches() ? draft : toText(value)
  return [shown, setDraft] as const
}

function useNumericProps(
  decimalScale: number | undefined,
  allowNegative: boolean,
) {
  const { locale } = useLanguage()
  const { group, decimal } = numberSeparators(locale)
  return {
    thousandSeparator: group,
    decimalSeparator: decimal,
    allowedDecimalSeparators: [",", "."].filter((char) => char !== group),
    decimalScale,
    valueIsNumericString: true,
    isAllowed: ({ value }: NumberFormatValues) =>
      (value.replace("-", "").split(".")[0] ?? "").length <= MAX_INTEGER_DIGITS,
    // Цифрова клавіатура iOS не має мінуса.
    inputMode: allowNegative
      ? ("text" as const)
      : decimalScale === 0
        ? ("numeric" as const)
        : ("decimal" as const),
    autoComplete: "off",
  }
}

/** Опис поля з підписом валюти чи одиниці попереду. */
const describedBy = (unitId: string | undefined, fromForm?: string) =>
  [unitId, fromForm].filter(Boolean).join(" ") || undefined

/** Введення без жодної цифри ("", "-", ",") — ще не число. */
const isIncomplete = (text: string) => !/\d/.test(text)

type MoneyInputProps = InputProps &
  GroupProps & {
    /** Код валюти ISO 4217. */
    currency: string
    value: Money | null
    onValueChange: (value: Money | null) => void
  }

function MoneyInput({
  currency,
  value,
  onValueChange,
  className,
  allowNegative = false,
  ref,
  ...props
}: MoneyInputProps) {
  const { locale } = useLanguage()
  const unitId = React.useId()
  const code = currency.toUpperCase()
  const digits = currencyDigits(code)
  const numeric = useNumericProps(digits, allowNegative)
  const amountOf = (text: string) =>
    isIncomplete(text) ? null : decimalToMinor(text, digits)
  const [shown, setDraft] = useDraft(
    value?.amount ?? null,
    (amount) => (amount === null ? "" : minorToDecimal(amount, digits)),
    amountOf,
    // 4860050 і 4860050n — та сама сума.
    (a, b) => (a === null || b === null ? a === b : BigInt(a) === BigInt(b)),
  )
  return (
    <InputGroup className={className}>
      <NumericFormat
        {...numeric}
        {...props}
        // react-number-format перезаписує `ref` своїм — передаємо через getInputRef.
        getInputRef={ref}
        aria-describedby={describedBy(unitId, props["aria-describedby"])}
        customInput={InputGroupInput}
        className="tabular-nums"
        value={shown}
        allowNegative={allowNegative}
        onValueChange={(values: NumberFormatValues, { event }) => {
          // Зміна ззовні (форма скинула значення) — не правка користувача.
          if (!event) return
          setDraft(values.value)
          const amount = amountOf(values.value)
          onValueChange(amount === null ? null : { amount, currency: code })
        }}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupText id={unitId}>
          {currencyLabel(code, locale)}
        </InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  )
}

type NumberInputProps = InputProps &
  GroupProps & {
    value: number | null
    onValueChange: (value: number | null) => void
    /** Знаків після коми; за замовчуванням — цілі числа. */
    decimalScale?: number
    /** Одиниця після числа: «шт.», «%», «кг». */
    unit?: string
  }

function NumberInput({
  value,
  onValueChange,
  decimalScale = 0,
  unit,
  className,
  allowNegative = false,
  ref,
  ...props
}: NumberInputProps) {
  const unitId = React.useId()
  const numeric = useNumericProps(decimalScale, allowNegative)
  const [shown, setDraft] = useDraft(
    value,
    (number) => (number === null ? "" : String(number)),
    (text) => (isIncomplete(text) ? null : Number(text)),
    (a, b) => a === b,
  )
  return (
    <InputGroup className={className}>
      <NumericFormat
        {...numeric}
        {...props}
        getInputRef={ref}
        aria-describedby={describedBy(
          unit ? unitId : undefined,
          props["aria-describedby"],
        )}
        customInput={InputGroupInput}
        className="tabular-nums"
        value={shown}
        allowNegative={allowNegative}
        onValueChange={(values: NumberFormatValues, { event }) => {
          // Зміна ззовні (форма скинула значення) — не правка користувача.
          if (!event) return
          setDraft(values.value)
          onValueChange(values.floatValue ?? null)
        }}
      />
      {unit ? (
        <InputGroupAddon align="inline-end">
          <InputGroupText id={unitId}>{unit}</InputGroupText>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  )
}

export { MoneyInput, NumberInput, type MoneyInputProps, type NumberInputProps }
