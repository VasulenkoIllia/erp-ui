import { useMemo, type RefObject } from "react"
import { toast } from "sonner"
import { z } from "zod"

import { CurrencySelect } from "@/components/erp/currency-select"
import { FormField } from "@/components/erp/form"
import {
  RecordFormDialog,
  type RecordFormItem,
} from "@/components/erp/record-form"
import { useRecordForm } from "@/hooks/use-record-form"
import { useErpUiT } from "@/lib/i18n"

import { CURRENCIES, currencySchema, type Currency } from "../contract"
import { useCompanyT } from "../use-company-t"

/**
 * Нова валюта компанії в діалозі (ADR-0026): код ISO 4217 з пошуком. Уже додані валюти й базову
 * вибрати не можна; сервер однаково перевіряє (422 `code: duplicate`). Вимкнути валюту — у рядку
 * списку, тож форма лише створює.
 */
type CurrencyFormValues = { code: string }

const toValues = (currency: Currency): CurrencyFormValues => ({
  code: currency.code,
})

export function CurrencyFormDialog({
  taken,
  onClose,
  onSaved,
  finalFocus,
}: {
  /** Коди, які вибрати не можна. */
  taken: readonly string[]
  onClose: () => void
  onSaved: () => void
  finalFocus?: RefObject<HTMLElement | null>
}) {
  const t = useCompanyT()
  const kitT = useErpUiT()
  const schema = useMemo(
    () => z.object({ code: z.string().min(1, kitT("validation.required")) }),
    [kitT],
  )
  const state = useRecordForm<CurrencyFormValues, Currency>({
    resource: CURRENCIES,
    schema,
    defaultValues: { code: "" },
    recordSchema: currencySchema,
    toPayload: (values) => values,
    toValues,
    onSaved: (saved) => {
      toast.success(t("currencies.form.created", { code: saved.code }))
      onSaved()
    },
  })
  const items: RecordFormItem[] = [
    {
      id: "code",
      label: t("currencies.form.code"),
      wide: true,
      render: (props) => (
        <FormField
          {...props}
          control={state.form.control}
          name="code"
          render={({ field, control }) => (
            <CurrencySelect
              id={control.id}
              className="w-full"
              ref={field.ref}
              exclude={taken}
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              aria-invalid={control["aria-invalid"]}
              aria-describedby={control["aria-describedby"]}
            />
          )}
        />
      ),
    },
  ]
  return (
    <RecordFormDialog
      onClose={onClose}
      title={t("currencies.form.title")}
      submitLabel={t("currencies.form.submit")}
      state={state}
      items={items}
      finalFocus={finalFocus}
    />
  )
}
