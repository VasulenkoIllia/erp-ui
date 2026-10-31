import { useMemo } from "react"
import { z } from "zod"

import { BooleanFormField } from "@/components/erp/extension-field-input"
import { FormField } from "@/components/erp/form"
import { NumberInput } from "@/components/erp/number-input"
import type { RecordFormItem } from "@/components/erp/record-form"
import { useErpUiT } from "@/lib/i18n"
import { keyValueRecord, keyValueRows, type KeyValueRow } from "@/lib/key-value"

import { PERCENT_DECIMALS, TAXES, taxSchemaFor, type Tax } from "../contract"
import type { TaxFormFieldId } from "../extension"
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

/** Податок у діалозі (ADR-0047): назва, ставка, чи податок уже в ціні, зовнішні коди. */
interface TaxFormValues {
  name: string
  rate: number | null
  included: boolean
  externalCodes: KeyValueRow[]
  [extensionField: string]: unknown
}

const EMPTY: TaxFormValues = {
  name: "",
  rate: null,
  included: false,
  externalCodes: [],
}

const fromEntry = (tax: Tax): TaxFormValues => ({
  name: tax.name,
  rate: tax.rate,
  included: tax.included,
  externalCodes: keyValueRows(tax.externalCodes),
})

const toRequest = (values: TaxFormValues) => ({
  ...values,
  externalCodes: keyValueRecord(values.externalCodes),
})

export function TaxFormDialog({
  entry,
  onClose,
  finalFocus,
}: DictionaryFormProps<Tax>) {
  const t = useDictionariesT()
  const kitT = useErpUiT()
  const { extension } = useDictionariesModule()
  const entryShape = useEntryShape()
  const shape = useMemo(
    () => ({
      ...entryShape,
      rate: z
        .number()
        .nullable()
        .refine((value) => value !== null, kitT("validation.required"))
        .refine(
          (value) => value === null || (value >= 0 && value <= 100),
          t("taxes.form.rateRange"),
        ),
      included: z.boolean(),
    }),
    [entryShape, kitT, t],
  )
  const recordSchema = useMemo(
    () => taxSchemaFor(extension.taxes),
    [extension.taxes],
  )
  const form = useDictionaryForm<TaxFormValues, Tax, TaxFormFieldId>({
    resource: TAXES,
    strings: "taxes",
    entry,
    extension: extension.taxes,
    recordSchema,
    shape,
    empty: EMPTY,
    fromEntry,
    toRequest,
    onClose,
  })
  const { control } = form.state.form
  const items: (RecordFormItem & { id: TaxFormFieldId })[] = [
    useNameItem(control),
    {
      id: "rate",
      label: t("taxes.form.rate"),
      render: (props) => (
        <FormField
          {...props}
          control={control}
          name="rate"
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
      ),
    },
    {
      id: "included",
      label: t("taxes.form.included"),
      render: ({ label, className }) => (
        <BooleanFormField
          control={control as never}
          name="included"
          label={label}
          className={className}
        />
      ),
    },
    useExternalCodesItem(control),
  ]
  return (
    <DictionaryFormDialog
      form={form}
      strings="taxes"
      entry={entry}
      items={items}
      onClose={onClose}
      finalFocus={finalFocus}
    />
  )
}
