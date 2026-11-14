import type { RaRecord } from "ra-core"
import type { Control, FieldValues, UseFormReturn } from "react-hook-form"

import {
  DiscountField,
  setLinesValue,
} from "@/registry/erp/document-discount-field"
import type { DocumentLinesValues } from "@/registry/erp/document-lines-schema"
import { ExtensionFormInput } from "@/registry/erp/extension-field-input"
import { FormField } from "@/registry/erp/form"
import { FormSelect, type FormSelectItem } from "@/registry/erp/form-select"
import { DecimalInput } from "@/registry/erp/number-input"
import { RecordPicker } from "@/registry/erp/record-picker"
import {
  PRICE_DECIMALS_MAX,
  QUANTITY_DECIMALS_MAX,
  type DocumentLine,
  type DocumentLineTax,
  type DocumentLineUnit,
} from "@/registry/lib/document-lines"
import {
  lineDiscountOf,
  NO_DISCOUNT,
  type Totals,
} from "@/registry/lib/document-totals"
import { localizedText } from "@/registry/lib/auth"
import type { ExtensionField } from "@/registry/lib/extension-fields"
import { cn } from "@/registry/lib/utils"
import { currencyLabel, useFormat } from "@/registry/lib/format"
import { useErpUiT, useLanguage } from "@/registry/lib/i18n"
import type { ListFilter } from "@/registry/lib/list-state"
import { FieldTitle } from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"

/**
 * Поля одного рядка `erp/document-lines-editor` (UI05, ADR-0059) і поле знижки, спільне з підсумками.
 *
 * - Порядок полів — порядок колонок таблиці й полів картки: назва (і вибір запису), кількість,
 *   одиниця, ціна, знижка, податок, сума. Фокус іде в тому самому порядку, що й на екрані.
 * - Одиниця й податок — знімок значення довідника. Значення, якого вже немає серед варіантів
 *   (вимкнене чи зі старою ставкою), лишається вибраним під своєю назвою.
 * - Знижка — `erp/document-discount-field`.
 * - Поля розширення рядка (`lineFields`, ADR-0086) — під назвою в тій самій клітинці: колонки таблиці
 *   ті самі, а підпис поля видимий і на широкому екрані, де решта підписів — назви колонок у шапці.
 * - Частина редактора: форма — `DocumentLinesValues`.
 */

/** Що підставити в рядок із вибраного запису; поля без значення лишаються, як були. */
export type DocumentLineItemPatch = Partial<
  Pick<DocumentLine, "name" | "price" | "unit" | "tax">
>

/** Вибір запису для рядка: товар чи послуга з ресурсу, який назве проект. */
export interface DocumentLineItem<T extends RaRecord> {
  /** Ресурс API: `products`. */
  resource: string
  /** Назва поля; за замовчуванням «Товар чи послуга». */
  label?: string
  optionLabel: (record: T) => string
  optionDescription?: (record: T) => string | undefined
  filter?: ListFilter
  /** Назва, ціна, одиниця й податок із запису. */
  toLine: (record: T) => DocumentLineItemPatch
}

type LinesForm = UseFormReturn<DocumentLinesValues>

const NONE = "none"
const CURRENT = "current"

/** Варіанти знімка: «немає», довідник і поточне значення, якого в довіднику вже немає. */
function snapshotItems<T extends { id: string | null; name: string }>(
  options: readonly (T & { id: string })[],
  current: T | null,
  isSame: (option: T, snapshot: T) => boolean,
  noneLabel: string,
) {
  const known = current
    ? options.find((option) => isSame(option, current))
    : undefined
  const items: FormSelectItem<string>[] = [
    { value: NONE, label: noneLabel },
    ...options.map((option) => ({ value: option.id, label: option.name })),
  ]
  if (current && !known) items.push({ value: CURRENT, label: current.name })
  const value = current ? (known?.id ?? CURRENT) : NONE
  const pick = (key: string) =>
    key === NONE
      ? null
      : key === CURRENT
        ? current
        : (options.find((option) => option.id === key) ?? null)
  return { items, value, pick }
}

const sameUnit = (option: DocumentLineUnit, unit: DocumentLineUnit) =>
  option.id === unit.id
const sameTax = (option: DocumentLineTax, tax: DocumentLineTax) =>
  option.id === tax.id &&
  option.rate === tax.rate &&
  option.included === tax.included

/** Значення з довідника — лише поля знімка: решта полів довідника в документ не йде. */
const unitSnapshot = (unit: DocumentLineUnit | null) =>
  unit && { id: unit.id, name: unit.name }
const taxSnapshot = (tax: DocumentLineTax | null) =>
  tax && { id: tax.id, name: tax.name, rate: tax.rate, included: tax.included }

/** Назва, ціна, одиниця й податок із вибраного запису; одиниця й податок — лише поля знімка. */
function applyItem(
  form: LinesForm,
  index: number,
  patch: DocumentLineItemPatch,
) {
  const { name, price, unit, tax } = patch
  if (name !== undefined) setLinesValue(form, `lines.${index}.name`, name)
  if (price !== undefined) setLinesValue(form, `lines.${index}.price`, price)
  if (unit !== undefined)
    setLinesValue(form, `lines.${index}.unit`, unitSnapshot(unit))
  if (tax !== undefined)
    setLinesValue(form, `lines.${index}.tax`, taxSnapshot(tax))
}

/** Підпис поля розширення рядка не ховається в таблиці (`laterLabels` у `erp/repeating-row-actions`). */
const LINE_FIELD_LABEL = "**:data-[slot=field-label]:not-sr-only!"

export interface DocumentLineFieldsProps<T extends RaRecord> {
  form: LinesForm
  index: number
  rowLabel: string
  line: DocumentLine | undefined
  /** Суми рядка з попереднього розрахунку; немає — рядок ще не порахувати. */
  totals: Totals | undefined
  currency: string
  units: readonly (DocumentLineUnit & { id: string })[]
  taxes: readonly DocumentLineTax[]
  item?: DocumentLineItem<T>
  lineFields?: readonly ExtensionField[] | undefined
  readOnly: boolean
}

/** Клітинка, що на телефоні займає весь рядок картки. */
const WIDE_CELL = "col-span-2 @md:col-span-1"

export function DocumentLineFields<T extends RaRecord>({
  form,
  index,
  rowLabel,
  line,
  totals,
  currency,
  units,
  taxes,
  item,
  lineFields,
  readOnly,
}: DocumentLineFieldsProps<T>) {
  const t = useErpUiT()
  const { locale, language } = useLanguage()
  const path = <K extends keyof DocumentLine>(key: K) =>
    `lines.${index}.${key}` as const
  const unit = snapshotItems(
    units,
    line?.unit ?? null,
    sameUnit,
    t("documentLines.noUnit"),
  )
  const tax = snapshotItems(
    taxes,
    line?.tax ?? null,
    sameTax,
    t("documentLines.noTax"),
  )
  return (
    <>
      <div className="col-span-2 grid min-w-0 gap-2 @md:col-span-3 @4xl:col-span-1">
        {item ? (
          <FormField
            control={form.control}
            name={path("itemId")}
            label={item.label ?? t("documentLines.item")}
            readOnly={readOnly}
            render={({ field, control }) => (
              <RecordPicker<T>
                {...control}
                ref={field.ref}
                resource={item.resource}
                label={item.label ?? t("documentLines.item")}
                value={field.value}
                optionLabel={item.optionLabel}
                optionDescription={item.optionDescription}
                filter={item.filter}
                placeholder={t("documentLines.itemPlaceholder")}
                clearable
                onValueChange={(id, record) => {
                  field.onChange(id)
                  if (record) applyItem(form, index, item.toLine(record))
                }}
                onBlur={field.onBlur}
              />
            )}
          />
        ) : null}
        <FormField
          control={form.control}
          name={path("name")}
          label={t("documentLines.name")}
          readOnly={readOnly}
          render={({ field, control }) => (
            <Input
              {...control}
              {...field}
              value={field.value}
              autoComplete="off"
            />
          )}
        />
        {lineFields?.map((extra) => {
          const label = localizedText(extra.label, language) ?? extra.id
          return (
            <ExtensionFormInput
              key={extra.id}
              field={extra}
              // Поля розширення — ключі поза типом рядка: контроль форми без її типу.
              control={form.control as unknown as Control<FieldValues>}
              name={`lines.${String(index)}.${extra.id}`}
              label={label}
              readOnly={readOnly}
              // Підпис видимий і в таблиці (там підписи полів рядка лише для скрінрідера, а назви колонок —
              // у шапці): полів у клітинці «Назва» може бути кілька, і без підпису значення не впізнати.
              className={LINE_FIELD_LABEL}
            />
          )
        })}
      </div>
      <FormField
        control={form.control}
        name={path("quantity")}
        label={t("documentLines.quantity")}
        readOnly={readOnly}
        render={({ field, control }) => (
          <DecimalInput
            {...control}
            ref={field.ref}
            decimalScale={QUANTITY_DECIMALS_MAX}
            value={field.value}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
          />
        )}
      />
      <FormField
        control={form.control}
        name={path("unit")}
        label={t("documentLines.unit")}
        readOnly={readOnly}
        render={({ field, control }) => (
          <FormSelect
            {...control}
            ref={field.ref}
            items={unit.items}
            value={unit.value}
            onValueChange={(key) => {
              field.onChange(unitSnapshot(unit.pick(key)))
            }}
            onBlur={field.onBlur}
          />
        )}
      />
      <FormField
        control={form.control}
        name={path("price")}
        label={t("documentLines.price")}
        readOnly={readOnly}
        className={WIDE_CELL}
        render={({ field, control }) => (
          <DecimalInput
            {...control}
            ref={field.ref}
            decimalScale={PRICE_DECIMALS_MAX}
            unit={currencyLabel(currency, locale)}
            value={field.value}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
          />
        )}
      />
      <DiscountField
        form={form}
        percentName={path("discountPercent")}
        amountName={path("discountAmount")}
        discount={line ?? NO_DISCOUNT}
        label={t("documentLines.discount")}
        kindLabel={t("documentLines.discountKind", { row: rowLabel })}
        currency={currency}
        readOnly={readOnly}
        className={WIDE_CELL}
      />
      <FormField
        control={form.control}
        name={path("tax")}
        label={t("documentLines.tax")}
        readOnly={readOnly}
        render={({ field, control }) => (
          <FormSelect
            {...control}
            ref={field.ref}
            items={tax.items}
            value={tax.value}
            onValueChange={(key) => {
              field.onChange(taxSnapshot(tax.pick(key)))
            }}
            onBlur={field.onBlur}
          />
        )}
      />
      <LineSum
        label={t("documentLines.sum")}
        sum={totals ? lineSumOf(totals) : null}
        currency={currency}
      />
    </>
  )
}

/** Колонка «Сума»: кількість × ціна мінус знижка рядка, без частки знижки документа. */
export const lineSumOf = (totals: Totals) =>
  totals.amount - lineDiscountOf(totals)

/**
 * Сума рядка чи розділу: рахується, а не вводиться, тож підпис і значення без поля, скрінрідер читає їх
 * підряд. null — ще не пораховано.
 */
export function LineSum({
  label,
  sum,
  currency,
  className,
}: {
  label: string
  sum: number | null
  currency: string
  className?: string
}) {
  const t = useErpUiT()
  const format = useFormat()
  return (
    <div
      className={cn("flex min-w-0 flex-col gap-2 @4xl:items-end", className)}
    >
      <FieldTitle className="leading-snug">{label}</FieldTitle>
      <span className="flex h-control items-center text-sm tabular-nums">
        {sum === null ? (
          <>
            <span aria-hidden>—</span>
            <span className="sr-only">{t("documentLines.noSum")}</span>
          </>
        ) : (
          format.money({ amount: sum, currency })
        )}
      </span>
    </div>
  )
}
