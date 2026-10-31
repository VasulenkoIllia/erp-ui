import { useMemo } from "react"
import { z } from "zod"

import { FormField } from "@/components/erp/form"
import { NumberInput } from "@/components/erp/number-input"
import type { RecordFormItem } from "@/components/erp/record-form"
import { Input } from "@/components/ui/input"
import { useErpUiT } from "@/lib/i18n"
import { keyValueRecord, keyValueRows, type KeyValueRow } from "@/lib/key-value"

import {
  SHORT_NAME_MAX,
  UNIT_DECIMALS_MAX,
  UNITS,
  unitSchemaFor,
  type Unit,
} from "../contract"
import type { UnitFormFieldId } from "../extension"
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

/** Одиниця виміру в діалозі (ADR-0047): назва, скорочення, знаки після коми, зовнішні коди. */
interface UnitFormValues {
  name: string
  shortName: string
  decimals: number | null
  externalCodes: KeyValueRow[]
  [extensionField: string]: unknown
}

const EMPTY: UnitFormValues = {
  name: "",
  shortName: "",
  decimals: 0,
  externalCodes: [],
}

const fromEntry = (unit: Unit): UnitFormValues => ({
  name: unit.name,
  shortName: unit.shortName,
  decimals: unit.decimals,
  externalCodes: keyValueRows(unit.externalCodes),
})

const toRequest = (values: UnitFormValues) => ({
  ...values,
  externalCodes: keyValueRecord(values.externalCodes),
})

export function UnitFormDialog({
  entry,
  onClose,
  finalFocus,
}: DictionaryFormProps<Unit>) {
  const t = useDictionariesT()
  const kitT = useErpUiT()
  const { extension } = useDictionariesModule()
  const entryShape = useEntryShape()
  const shape = useMemo(() => {
    const required = kitT("validation.required")
    return {
      ...entryShape,
      shortName: z
        .string()
        .trim()
        .min(1, required)
        .max(SHORT_NAME_MAX, t("common.form.tooLong", { max: SHORT_NAME_MAX })),
      decimals: z
        .number()
        .nullable()
        .refine((value) => value !== null, required)
        .refine(
          (value) =>
            value === null || (value >= 0 && value <= UNIT_DECIMALS_MAX),
          t("units.form.decimalsRange", { max: UNIT_DECIMALS_MAX }),
        ),
    }
  }, [entryShape, kitT, t])
  const recordSchema = useMemo(
    () => unitSchemaFor(extension.units),
    [extension.units],
  )
  const form = useDictionaryForm<UnitFormValues, Unit, UnitFormFieldId>({
    resource: UNITS,
    strings: "units",
    entry,
    extension: extension.units,
    recordSchema,
    shape,
    empty: EMPTY,
    fromEntry,
    toRequest,
    onClose,
  })
  const { control } = form.state.form
  const items: (RecordFormItem & { id: UnitFormFieldId })[] = [
    useNameItem(control),
    {
      id: "shortName",
      label: t("units.form.shortName"),
      description: t("units.form.shortNameHint"),
      render: (props) => (
        <FormField
          {...props}
          control={control}
          name="shortName"
          render={({ field, control: aria }) => (
            <Input
              {...field}
              {...aria}
              value={field.value}
              autoComplete="off"
            />
          )}
        />
      ),
    },
    {
      id: "decimals",
      label: t("units.form.decimals"),
      description: t("units.form.decimalsHint"),
      render: (props) => (
        <FormField
          {...props}
          control={control}
          name="decimals"
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
      ),
    },
    useExternalCodesItem(control),
  ]
  return (
    <DictionaryFormDialog
      form={form}
      strings="units"
      entry={entry}
      items={items}
      onClose={onClose}
      finalFocus={finalFocus}
    />
  )
}
