import * as React from "react"

import { currencyCodes, currencyName } from "@/registry/lib/currencies"
import { useErpUiT, useLanguage } from "@/registry/lib/i18n"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/registry/ui/combobox"

/**
 * Вибір валюти ISO 4217 з пошуком за кодом і назвою (PF02, ADR-0043): «USD · Долар США». Перелік — з
 * браузера; `exclude` прибирає те, що вибрати не можна (валюта вже є в компанії).
 */
interface CurrencyOption {
  value: string
  label: string
}

export function CurrencySelect({
  id,
  value,
  onValueChange,
  onBlur,
  exclude,
  className,
  ref,
  ...aria
}: {
  id?: string
  value: string
  onValueChange: (value: string) => void
  onBlur?: () => void
  exclude?: readonly string[]
  className?: string
  ref?: React.Ref<HTMLInputElement>
  "aria-invalid"?: boolean
  "aria-describedby"?: string
}) {
  const t = useErpUiT()
  const { locale } = useLanguage()
  const options = React.useMemo(
    () =>
      currencyCodes()
        .filter((code) => code === value || !exclude?.includes(code))
        .map((code) => ({
          value: code,
          label: `${code} · ${currencyName(code, locale)}`,
        })),
    [exclude, locale, value],
  )
  const selected = options.find((option) => option.value === value) ?? null
  return (
    <Combobox
      items={options}
      value={selected}
      itemToStringLabel={(option: CurrencyOption) => option.label}
      isItemEqualToValue={(a: CurrencyOption, b: CurrencyOption) =>
        a.value === b.value
      }
      onValueChange={(option: CurrencyOption | null) => {
        if (option) onValueChange(option.value)
      }}
    >
      <ComboboxInput
        ref={ref}
        id={id}
        className={className}
        placeholder={t("currency.placeholder")}
        onBlur={onBlur}
        {...aria}
      />
      <ComboboxContent>
        <ComboboxEmpty>{t("currency.empty")}</ComboboxEmpty>
        <ComboboxList>
          {(option: CurrencyOption) => (
            <ComboboxItem key={option.value} value={option}>
              {option.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
