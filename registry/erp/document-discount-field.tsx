import * as React from "react"
import type { FieldPath, FieldPathValue, UseFormReturn } from "react-hook-form"

import type { DocumentLinesValues } from "@/registry/erp/document-lines-schema"
import { FormField } from "@/registry/erp/form"
import { DecimalInput, NumberInput } from "@/registry/erp/number-input"
import type { TotalsDiscount } from "@/registry/lib/document-totals"
import {
  currencyDigits,
  currencyLabel,
  decimalToMinor,
  minorToDecimal,
} from "@/registry/lib/format"
import { useErpUiT, useLanguage } from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"
import { Field, FieldTitle } from "@/registry/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/registry/ui/select"

/**
 * Знижка рядка чи документа в `erp/document-lines-editor` (UI05, ADR-0059): відсотком або сумою, одне з
 * двох (рішення власника 02.11.2026). Перемикач «%» / «₴» поруч із полем обнуляє обидва значення.
 *
 * - Вид знижки — за значенням; нуль лишає вид, у якому людина знижку стерла чи вибрала.
 * - Сума — мінорні одиниці числом: цілих розрядів поле дає стільки, щоб число лишалося безпечним цілим.
 * - Частина редактора: форма — `DocumentLinesValues`.
 */

type LinesForm = UseFormReturn<DocumentLinesValues>
type LinesPath = FieldPath<DocumentLinesValues>
/** Поле знижки документа чи рядка. */
type DiscountPath<K extends keyof TotalsDiscount> = K | `lines.${number}.${K}`

type DiscountKind = "percent" | "amount"

/** Стільки цілих розрядів мінорних одиниць завжди менше за `Number.MAX_SAFE_INTEGER`. */
const SAFE_INTEGER_DIGITS = 15

/** Зміна поля не тим полем, що його показує: перевіряємо лише те, що вже має помилку. */
export function setLinesValue<TName extends LinesPath>(
  form: LinesForm,
  name: TName,
  value: FieldPathValue<DocumentLinesValues, TName>,
) {
  form.setValue(name, value, {
    shouldDirty: true,
    // Живий стан поля: `formState` форми оновлюється, лише коли хост читає `errors`.
    shouldValidate: Boolean(form.getFieldState(name).error),
  })
}

const kindOfValue = (discount: TotalsDiscount): DiscountKind | null =>
  discount.discountAmount > 0
    ? "amount"
    : discount.discountPercent > 0
      ? "percent"
      : null

interface DiscountFieldProps {
  form: LinesForm
  percentName: DiscountPath<"discountPercent">
  amountName: DiscountPath<"discountAmount">
  /** Поточні значення полів: з них видно вид знижки. */
  discount: TotalsDiscount
  label: React.ReactNode
  kindLabel: string
  currency: string
  readOnly: boolean
  className?: string
}

/** Знижка рядка чи документа: поле й перемикач «%» / «₴». Друге значення завжди нуль. */
export function DiscountField({
  form,
  percentName,
  amountName,
  discount,
  label,
  kindLabel,
  currency,
  readOnly,
  className,
}: DiscountFieldProps) {
  const t = useErpUiT()
  const { locale } = useLanguage()
  const digits = currencyDigits(currency)
  const valueKind = kindOfValue(discount)
  const [chosen, setChosen] = React.useState<DiscountKind>(
    valueKind ?? "percent",
  )
  // Стерта сума не стає відсотком: поле під фокусом не зникає.
  if (valueKind && valueKind !== chosen) setChosen(valueKind)
  const kind = valueKind ?? chosen
  const kinds = [
    { value: "percent", label: "%" },
    { value: "amount", label: currencyLabel(currency, locale) },
  ] as const
  const fieldLabel = (
    <>
      {label}
      <span className="sr-only">, {t(`documentLines.${kind}`)}</span>
    </>
  )
  return (
    <div className={cn("flex min-w-0 items-start gap-1 self-start", className)}>
      {kind === "percent" ? (
        <FormField
          key={kind}
          control={form.control}
          name={percentName}
          label={fieldLabel}
          readOnly={readOnly}
          className="min-w-0 flex-1"
          render={({ field, control }) => (
            <NumberInput
              {...control}
              ref={field.ref}
              decimalScale={2}
              placeholder="0"
              value={field.value === 0 ? null : field.value}
              onValueChange={(value) => {
                field.onChange(value ?? 0)
              }}
              onBlur={field.onBlur}
            />
          )}
        />
      ) : (
        <FormField
          key={kind}
          control={form.control}
          name={amountName}
          label={fieldLabel}
          readOnly={readOnly}
          className="min-w-0 flex-1"
          render={({ field, control }) => (
            <DecimalInput
              {...control}
              ref={field.ref}
              decimalScale={digits}
              maxIntegerDigits={SAFE_INTEGER_DIGITS - digits}
              placeholder="0"
              // Зіпсоване значення із запису не валить форму: помилку покаже схема.
              value={
                Number.isSafeInteger(field.value) && field.value !== 0
                  ? minorToDecimal(field.value, digits)
                  : ""
              }
              onValueChange={(value) => {
                field.onChange(
                  value ? Number(decimalToMinor(value, digits)) : 0,
                )
              }}
              onBlur={field.onBlur}
            />
          )}
        />
      )}
      {/* Порожній підпис тієї ж висоти: перемикач стоїть на рівні поля, а не його помилки. */}
      <Field className="w-auto shrink-0">
        <FieldTitle aria-hidden className="invisible">
          {" "}
        </FieldTitle>
        <Select
          items={kinds}
          value={kind}
          readOnly={readOnly}
          onValueChange={(next) => {
            if (next === kind) return
            setLinesValue(form, percentName, 0)
            setLinesValue(form, amountName, 0)
            setChosen(next as DiscountKind)
          }}
        >
          <SelectTrigger aria-label={kindLabel} className="min-w-16">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {kinds.map((item) => (
              <SelectItem
                key={item.value}
                value={item.value}
                aria-label={t(`documentLines.${item.value}`)}
              >
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </div>
  )
}
