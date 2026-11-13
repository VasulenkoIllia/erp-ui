import { useGetList } from "ra-core"
import { useEffect, useMemo } from "react"
import { useWatch, type UseFormReturn } from "react-hook-form"

import type { FormSelectItem } from "@/components/erp/form-select"
import { useCompanyId } from "@/hooks/use-company"
import { useCompanyProfile } from "@/hooks/use-company-profile"
import { useHasPermission } from "@/hooks/use-me"
import { DEFAULT_BASE_CURRENCY, type CompanyProfile } from "@/lib/company"
import { companyScope } from "@/lib/company-scope"
import { currencyName } from "@/lib/currencies"
import { useLanguage } from "@/lib/i18n"

import { useInvoicesModule } from "../module-context"
import type { InvoiceFormValues } from "./invoice-form-items"

/** Валют компанії менше за цю межу: перелік не обрізається. */
const CURRENCY_LIMIT = 200

/**
 * Базова валюта компанії для форми: профіль сторінки, а без нього — спільний кеш профілю. Поки профілю
 * немає (вантажиться чи не прийшов) — `undefined`: форма не вгадує базову й не показує хибної підказки.
 */
export function useBaseCurrency(
  company: CompanyProfile | undefined,
): string | undefined {
  const profile = useCompanyProfile(!company)
  const loaded = company ?? profile.data
  return loaded && (loaded.baseCurrency ?? DEFAULT_BASE_CURRENCY)
}

/**
 * Валюта у формі (поле, «Скасувати зміни», запис колеги) — у стан схеми: інші знаки суми рядків. Після
 * спроби зберегти рядки перевіряються одразу, а не лише на наступному «Зберегти».
 */
export function useFormCurrencySync(
  form: UseFormReturn<InvoiceFormValues>,
  schemaCurrency: string,
  setSchemaCurrency: (currency: string) => void,
) {
  const currency = useWatch({ control: form.control, name: "currency" })
  if (currency !== schemaCurrency) setSchemaCurrency(currency)
  useEffect(() => {
    if (form.formState.isSubmitted) void form.trigger("lines")
  }, [schemaCurrency, form])
}

interface CurrencyRecord {
  readonly id: string
  readonly code: string
  readonly active?: boolean
}

export interface InvoiceCurrencyChoice {
  /** Варіанти поля: базова, активні валюти компанії й валюта самого рахунку. */
  readonly items: readonly FormSelectItem<string>[]
  /** Перелік валют компанії не прийшов: у виборі лише базова й валюта рахунку. */
  readonly failed: boolean
}

/** Валюти компанії з ресурсу `currencies` фабрики: без опції чи права читати валюти запиту немає. */
function useCompanyCurrencies() {
  const { currencies } = useInvoicesModule()
  const companyId = useCompanyId()
  const resource = currencies?.resource ?? ""
  const canRead = useHasPermission(resource, "read")
  return useGetList<CurrencyRecord>(
    resource,
    {
      pagination: { page: 1, perPage: CURRENCY_LIMIT },
      sort: { field: "code", order: "ASC" },
      meta: companyScope(companyId),
    },
    { enabled: Boolean(currencies) && canRead },
  )
}

/** «USD · долар США»: код і назва мовою інтерфейсу. */
const currencyItems = (
  codes: readonly (string | undefined)[],
  locale: string,
) =>
  [...new Set(codes.filter((code): code is string => Boolean(code)))].map(
    (code) => ({
      value: code,
      label: `${code} · ${currencyName(code, locale)}`,
    }),
  )

/**
 * Валюти рахунку (ADR-0071) з ресурсу валют компанії (`currencies` фабрики): базова валюта першою, далі
 * активні за кодом. Вимкнена валюта лишається лише в рахунку, де вона вже стоїть. Без права читати валюти
 * — лише базова: валюта рахунку не зникає з поля.
 */
export function useInvoiceCurrencyChoice(
  base: string | undefined,
  current: string,
): InvoiceCurrencyChoice {
  const { locale } = useLanguage()
  const { data, error } = useCompanyCurrencies()
  return useMemo(() => {
    const active = (data ?? [])
      .filter((currency) => currency.active !== false)
      .map((currency) => currency.code)
    return {
      items: currencyItems([base, ...active, current], locale),
      failed: Boolean(error),
    }
  }, [data, error, base, current, locale])
}

/**
 * Фільтр «Валюта» списку рахунків і звіту старіння (ADR-0084): базова валюта першою, далі всі валюти
 * компанії за кодом, і вимкнені — рахунки в них лишились. Без опції `currencies` фабрики фільтра немає:
 * усі рахунки в базовій валюті.
 */
export function useCurrencyFilter(label: string) {
  const { currencies } = useInvoicesModule()
  const { locale } = useLanguage()
  const base = useBaseCurrency(undefined)
  const { data } = useCompanyCurrencies()
  return useMemo(
    () =>
      currencies
        ? {
            kind: "options" as const,
            id: "currency" as const,
            field: "currency",
            label,
            options: currencyItems(
              [base, ...(data ?? []).map((currency) => currency.code)],
              locale,
            ),
          }
        : null,
    [currencies, label, base, data, locale],
  )
}
