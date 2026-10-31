import { useMemo } from "react"
import { useWatch, type Control } from "react-hook-form"
import { z } from "zod"

import { FormField } from "@/components/erp/form"
import { FormSelect } from "@/components/erp/form-select"
import { NumberInput } from "@/components/erp/number-input"
import type { RecordFormItem } from "@/components/erp/record-form"
import { RepeatingRows } from "@/components/erp/repeating-rows"
import { useFormat } from "@/lib/format"
import { useErpUiT } from "@/lib/i18n"
import { keyValueRecord, keyValueRows, type KeyValueRow } from "@/lib/key-value"
import { cn } from "@/lib/utils"

import {
  PAYMENT_BASES,
  PAYMENT_DAYS_MAX,
  PAYMENT_PARTS_MAX,
  PAYMENT_TERMS,
  partsRemainder,
  partsTotal,
  paymentTermSchemaFor,
  PERCENT_DECIMALS,
  type PaymentBase,
  type PaymentPart,
  type PaymentTerm,
} from "../contract"
import type { PaymentTermFormFieldId } from "../extension"
import { useDictionariesModule } from "../module-context"
import { useDictionariesT } from "../use-dictionaries-t"
import {
  DictionaryFormDialog,
  useDictionaryForm,
  useEntryShape,
  useExternalCodesItem,
  useNameItem,
} from "./dictionary-form"
import type { DictionaryFormProps } from "./dictionary-page"
import { partsText, percentText } from "./payment-parts"

/**
 * Умови оплати в діалозі (ADR-0047): частини оплати — повторювані рядки «відсоток, днів, від якої дати»,
 * порядок має значення. Сума видна під рядками під час вводу, а відправка з сумою не 100 — помилка групи
 * й у зведенні. Новий рядок одразу пропонує залишок до 100.
 */
interface PartValues {
  percent: number | null
  days: number | null
  base: PaymentBase
}

interface PaymentTermFormValues {
  name: string
  parts: PartValues[]
  externalCodes: KeyValueRow[]
  [extensionField: string]: unknown
}

const FULL_PERCENT = 100

const EMPTY: PaymentTermFormValues = {
  name: "",
  parts: [{ percent: FULL_PERCENT, days: 0, base: "invoice" }],
  externalCodes: [],
}

const fromEntry = (term: PaymentTerm): PaymentTermFormValues => ({
  name: term.name,
  parts: term.parts.map((part) => ({ ...part })),
  externalCodes: keyValueRows(term.externalCodes),
})

const toRequest = (values: PaymentTermFormValues) => ({
  ...values,
  externalCodes: keyValueRecord(values.externalCodes),
})

/** Сума частин під час вводу: людина бачить, скільки лишилось, ще до відправки. */
function PartsTotal({ control }: { control: Control<PaymentTermFormValues> }) {
  const t = useDictionariesT()
  const format = useFormat()
  const parts = useWatch({ control, name: "parts" })
  const total = partsTotal(parts)
  return (
    <p
      className={cn(
        "text-sm tabular-nums",
        total !== FULL_PERCENT && "text-muted-foreground",
      )}
    >
      {t("paymentTerms.form.total", { total: percentText(format, total) })}
    </p>
  )
}

function usePartsShape() {
  const t = useDictionariesT()
  const kitT = useErpUiT()
  const format = useFormat()
  return useMemo(() => {
    const required = kitT("validation.required")
    const part = z.object({
      percent: z
        .number()
        .nullable()
        .refine((value) => value !== null, required)
        .refine(
          (value) => value === null || (value > 0 && value <= FULL_PERCENT),
          t("paymentTerms.form.percentRange"),
        ),
      days: z
        .number()
        .nullable()
        .refine((value) => value !== null, required)
        .refine(
          (value) =>
            value === null || (value >= 0 && value <= PAYMENT_DAYS_MAX),
          t("paymentTerms.form.daysRange", { max: PAYMENT_DAYS_MAX }),
        ),
      base: z.enum(PAYMENT_BASES),
    })
    return z
      .array(part)
      .min(1, t("paymentTerms.form.partsRequired"))
      .superRefine((parts, context) => {
        const total = partsTotal(parts)
        if (total === FULL_PERCENT) return
        context.addIssue({
          code: "custom",
          message: t("paymentTerms.form.totalInvalid", {
            total: percentText(format, total),
          }),
        })
      })
  }, [t, kitT, format])
}

export function PaymentTermFormDialog({
  entry,
  onClose,
  finalFocus,
}: DictionaryFormProps<PaymentTerm>) {
  const t = useDictionariesT()
  const format = useFormat()
  const { extension } = useDictionariesModule()
  const entryShape = useEntryShape()
  const parts = usePartsShape()
  const shape = useMemo(() => ({ ...entryShape, parts }), [entryShape, parts])
  const recordSchema = useMemo(
    () => paymentTermSchemaFor(extension.paymentTerms),
    [extension.paymentTerms],
  )
  const form = useDictionaryForm<
    PaymentTermFormValues,
    PaymentTerm,
    PaymentTermFormFieldId
  >({
    resource: PAYMENT_TERMS,
    strings: "paymentTerms",
    entry,
    extension: extension.paymentTerms,
    recordSchema,
    shape,
    empty: EMPTY,
    fromEntry,
    toRequest,
    onClose,
  })
  const { control, getValues } = form.state.form
  const bases = PAYMENT_BASES.map((base) => ({
    value: base,
    label: t(`paymentTerms.form.bases.${base}`),
  }))
  const items: (RecordFormItem & { id: PaymentTermFormFieldId })[] = [
    useNameItem(control),
    {
      id: "parts",
      label: t("paymentTerms.form.parts"),
      description: t("paymentTerms.form.partsHint"),
      wide: true,
      text: (value) =>
        partsText((value as PaymentPart[] | undefined) ?? [], t, format),
      render: ({ label, description, className }) => (
        <div className={cn("grid gap-2", className)}>
          <RepeatingRows
            control={control as unknown as Control<{ parts: PartValues[] }>}
            name="parts"
            label={label}
            description={description}
            rowLabel={(index) =>
              t("paymentTerms.form.part", { index: index + 1 })
            }
            addLabel={t("paymentTerms.form.addPart")}
            newRow={() => ({
              percent: partsRemainder(getValues("parts")) || null,
              days: 0,
              base: "invoice" as const,
            })}
            minRows={1}
            maxRows={PAYMENT_PARTS_MAX}
            canReorder
            rowClassName="@lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)]"
            renderRow={({ index }) => (
              <>
                <FormField
                  control={control}
                  name={`parts.${index}.percent`}
                  label={t("paymentTerms.form.percent")}
                  render={({ field, control: aria }) => (
                    <NumberInput
                      {...aria}
                      ref={field.ref}
                      decimalScale={PERCENT_DECIMALS}
                      unit="%"
                      value={field.value}
                      onValueChange={field.onChange}
                      onBlur={field.onBlur}
                    />
                  )}
                />
                <FormField
                  control={control}
                  name={`parts.${index}.days`}
                  label={t("paymentTerms.form.days")}
                  render={({ field, control: aria }) => (
                    <NumberInput
                      {...aria}
                      ref={field.ref}
                      decimalScale={0}
                      value={field.value}
                      onValueChange={field.onChange}
                      onBlur={field.onBlur}
                    />
                  )}
                />
                <FormField
                  control={control}
                  name={`parts.${index}.base`}
                  label={t("paymentTerms.form.base")}
                  render={({ field, control: aria }) => (
                    <FormSelect
                      {...aria}
                      ref={field.ref}
                      items={bases}
                      value={field.value}
                      onValueChange={field.onChange}
                      onBlur={field.onBlur}
                    />
                  )}
                />
              </>
            )}
          />
          <PartsTotal control={control} />
        </div>
      ),
    },
    useExternalCodesItem(control),
  ]
  return (
    <DictionaryFormDialog
      form={form}
      strings="paymentTerms"
      entry={entry}
      items={items}
      onClose={onClose}
      finalFocus={finalFocus}
    />
  )
}
