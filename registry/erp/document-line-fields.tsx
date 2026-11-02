import * as React from "react"
import type { RaRecord } from "ra-core"
import { get, type FieldPath, type UseFormReturn } from "react-hook-form"

import type { DocumentLinesValues } from "@/registry/erp/document-lines-schema"
import { FormField } from "@/registry/erp/form"
import { FormSelect, type FormSelectItem } from "@/registry/erp/form-select"
import { DecimalInput, NumberInput } from "@/registry/erp/number-input"
import { RecordPicker } from "@/registry/erp/record-picker"
import {
  PRICE_DECIMALS_MAX,
  QUANTITY_DECIMALS_MAX,
  type DocumentLine,
  type DocumentLineTax,
  type DocumentLineUnit,
} from "@/registry/lib/document-lines"
import type { Totals } from "@/registry/lib/document-totals"
import {
  currencyDigits,
  currencyLabel,
  decimalToMinor,
  minorToDecimal,
  useFormat,
} from "@/registry/lib/format"
import { useErpUiT, useLanguage } from "@/registry/lib/i18n"
import type { ListFilter } from "@/registry/lib/list-state"
import { cn } from "@/registry/lib/utils"
import { FieldTitle } from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/registry/ui/select"

/**
 * Поля одного рядка `erp/document-lines-editor` (UI05, ADR-0059) і поле знижки, спільне з підсумками.
 *
 * - Порядок полів — порядок колонок таблиці й полів картки: назва (і вибір запису), кількість,
 *   одиниця, ціна, знижка, податок, сума. Фокус іде в тому самому порядку, що й на екрані.
 * - Одиниця й податок — знімок значення довідника. Значення, якого вже немає серед варіантів
 *   (вимкнене чи зі старою ставкою), лишається вибраним під своєю назвою.
 * - Знижка — відсотком або сумою, одне з двох (рішення власника 02.11.2026): перемикач «%» / «₴»
 *   поруч із полем обнуляє обидва значення.
 */

export type DiscountKind = "percent" | "amount"

/** Що підставити в рядок із вибраного запису. */
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
type LinesPath = FieldPath<DocumentLinesValues>

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

/** Зміна поля не тим полем, що його показує: перевіряємо лише те, що вже має помилку. */
function setField(form: LinesForm, name: LinesPath, value: unknown) {
  form.setValue(name, value as never, {
    shouldDirty: true,
    shouldValidate: Boolean(get(form.formState.errors, name)),
  })
}

interface DiscountFieldProps {
  form: LinesForm
  percentName: LinesPath
  amountName: LinesPath
  label: React.ReactNode
  kindLabel: string
  currency: string
  kind: DiscountKind
  onKindChange: (kind: DiscountKind) => void
  readOnly: boolean
  className?: string
}

/** Знижка рядка чи документа: поле й перемикач «%» / «₴». Друге значення завжди нуль. */
export function DiscountField({
  form,
  percentName,
  amountName,
  label,
  kindLabel,
  currency,
  kind,
  onKindChange,
  readOnly,
  className,
}: DiscountFieldProps) {
  const t = useErpUiT()
  const { locale } = useLanguage()
  const digits = currencyDigits(currency)
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
    <div className={cn("flex min-w-0 items-end gap-1 self-start", className)}>
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
              value={field.value === 0 ? null : (field.value as number)}
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
              placeholder="0"
              value={
                field.value === 0
                  ? ""
                  : minorToDecimal(field.value as number, digits)
              }
              onValueChange={(value) => {
                // Понад межу безпечного цілого — bigint; число поза межею відхилить схема.
                field.onChange(
                  value ? Number(decimalToMinor(value, digits)) : 0,
                )
              }}
              onBlur={field.onBlur}
            />
          )}
        />
      )}
      <Select
        items={kinds}
        value={kind}
        readOnly={readOnly}
        onValueChange={(next) => {
          if (next === kind) return
          setField(form, percentName, 0)
          setField(form, amountName, 0)
          onKindChange(next as DiscountKind)
        }}
      >
        <SelectTrigger aria-label={kindLabel} className="w-16 shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {kinds.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

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
  discountKind: DiscountKind
  onDiscountKind: (kind: DiscountKind) => void
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
  discountKind,
  onDiscountKind,
  readOnly,
}: DocumentLineFieldsProps<T>) {
  const t = useErpUiT()
  const format = useFormat()
  const { locale } = useLanguage()
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
  const sum = totals
    ? totals.amount - totals.discount + totals.documentDiscount
    : null
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
                  if (!record) return
                  const patch = item.toLine(record)
                  for (const [key, value] of Object.entries(patch))
                    setField(
                      form,
                      path(key as keyof DocumentLineItemPatch),
                      value,
                    )
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
        label={t("documentLines.discount")}
        kindLabel={t("documentLines.discountKind", { row: rowLabel })}
        currency={currency}
        kind={discountKind}
        onKindChange={onDiscountKind}
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
      {/* Сума рахується, а не вводиться: підпис і значення без поля, скрінрідер читає їх підряд. */}
      <div className="flex min-w-0 flex-col gap-2 @4xl:items-end">
        <FieldTitle className="leading-snug">
          {t("documentLines.sum")}
        </FieldTitle>
        <span className="flex h-control items-center text-sm tabular-nums">
          {sum === null ? "—" : format.money({ amount: sum, currency })}
        </span>
      </div>
    </>
  )
}
