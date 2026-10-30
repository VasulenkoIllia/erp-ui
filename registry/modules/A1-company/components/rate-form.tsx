import { useCallback, useMemo, type RefObject } from "react"
import { toast } from "sonner"
import { z } from "zod"

import { DateInput } from "@/components/erp/date-input"
import { useExtensionForm } from "@/components/erp/extension-field-input"
import { FormField } from "@/components/erp/form"
import { FormSelect } from "@/components/erp/form-select"
import { NumberInput } from "@/components/erp/number-input"
import {
  RecordFormDialog,
  type RecordFormItem,
} from "@/components/erp/record-form"
import { useRecordForm } from "@/hooks/use-record-form"
import { isCalendarDate, todayIn } from "@/lib/dates"
import { applyKeyedChanges } from "@/lib/extensions"
import { useFormat } from "@/lib/format"
import { useErpUiT } from "@/lib/i18n"

import {
  EXCHANGE_RATES,
  RATE_DECIMALS,
  rateSchemaFor,
  type ExchangeRate,
} from "../contract"
import type { RateFormFieldId } from "../extension"
import { useCompanyModule } from "../module-context"
import { useCompanyT } from "../use-company-t"

/**
 * Курс валюти в діалозі (ADR-0026, ADR-0043): валюта, дата, скільки базової валюти за 1 одиницю.
 * Створення — `POST` без `source`: джерело ставить сервер. Один курс на валюту й дату: 422 `duplicate`
 * — біля дати.
 */
interface RateFormValues {
  currency: string
  date: string
  rate: number | null
  [extensionField: string]: unknown
}

export function RateFormDialog({
  rate,
  currencies,
  base,
  onClose,
  onSaved,
  finalFocus,
}: {
  /** Курс для зміни; без нього — новий. */
  rate?: ExchangeRate
  /** Коди, для яких можна додати курс. */
  currencies: readonly string[]
  /** Базова валюта: підпис поля курсу. */
  base: string
  onClose: () => void
  onSaved: () => void
  finalFocus?: RefObject<HTMLElement | null>
}) {
  const t = useCompanyT()
  const kitT = useErpUiT()
  const { timeZone } = useFormat()
  const { extension } = useCompanyModule()
  const ext = useExtensionForm<RateFormFieldId>(
    extension.rates?.fields,
    extension.rates?.form,
  )
  const recordSchema = useMemo(
    () => rateSchemaFor(extension.rates),
    [extension.rates],
  )
  const toValues = useCallback(
    (record: ExchangeRate): RateFormValues => ({
      currency: record.currency,
      date: record.date,
      rate: record.rate,
      ...ext.values(record),
    }),
    [ext],
  )
  const schema = useMemo(
    () =>
      z.object({
        currency: z.string().min(1, kitT("validation.required")),
        date: z.string().refine(isCalendarDate, kitT("validation.required")),
        rate: z
          .number()
          .nullable()
          .refine((value) => value !== null, kitT("validation.required"))
          .refine(
            (value) => value === null || value > 0,
            t("rates.form.tooLow"),
          ),
        ...ext.shape,
      }),
    [kitT, t, ext.shape],
  )
  const state = useRecordForm<RateFormValues, ExchangeRate>({
    resource: EXCHANGE_RATES,
    record: rate,
    schema,
    defaultValues: rate
      ? toValues(rate)
      : {
          currency: currencies[0] ?? "",
          date: todayIn(timeZone),
          rate: null,
          ...ext.values(),
        },
    recordSchema,
    toPayload: (values, keys) =>
      Object.fromEntries(keys.map((key) => [key, values[key]])),
    toValues,
    onSaved: (saved) => {
      toast.success(
        t(rate ? "rates.form.saved" : "rates.form.created", {
          currency: saved.currency,
        }),
      )
      onSaved()
    },
    onUnchanged: onClose,
  })
  const currency = state.form.watch("currency")
  const items: (RecordFormItem & { id: RateFormFieldId })[] = [
    {
      id: "currency",
      label: t("rates.form.currency"),
      render: (props) => (
        <FormField
          {...props}
          control={state.form.control}
          name="currency"
          render={({ field, control }) => (
            <FormSelect
              {...control}
              ref={field.ref}
              items={(rate ? [rate.currency] : currencies).map((code) => ({
                value: code,
                label: code,
              }))}
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
      ),
    },
    {
      id: "date",
      label: t("rates.form.date"),
      render: (props) => (
        <FormField
          {...props}
          control={state.form.control}
          name="date"
          render={({ field, control }) => (
            <DateInput
              {...control}
              ref={field.ref}
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
      ),
    },
    {
      id: "rate",
      label: t("rates.form.rate", { currency, base }),
      wide: true,
      render: (props) => (
        <FormField
          {...props}
          control={state.form.control}
          name="rate"
          render={({ field, control }) => (
            <NumberInput
              {...control}
              ref={field.ref}
              decimalScale={RATE_DECIMALS}
              unit={base}
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
      ),
    },
  ]
  return (
    <RecordFormDialog
      onClose={onClose}
      title={t(rate ? "rates.form.editTitle" : "rates.form.createTitle")}
      submitLabel={kitT(rate ? "recordForm.save" : "recordForm.create")}
      state={state}
      items={applyKeyedChanges(items, ext.items(state.form.control))}
      finalFocus={finalFocus}
    />
  )
}
