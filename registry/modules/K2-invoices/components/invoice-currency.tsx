import { useGetList } from "ra-core"
import { useMemo } from "react"

import type { FormSelectItem } from "@/components/erp/form-select"
import { useCompanyId } from "@/hooks/use-company"
import { useCompanyProfile } from "@/hooks/use-company-profile"
import { useHasPermission } from "@/hooks/use-me"
import type { CompanyProfile } from "@/lib/company"
import { companyScope } from "@/lib/company-scope"
import { currencyName } from "@/lib/currencies"
import { useLanguage } from "@/lib/i18n"

import { useInvoicesModule } from "../module-context"

/** Валют компанії менше за цю межу: перелік не обрізається. */
const CURRENCY_LIMIT = 200
/** Компанія без базової валюти (профіль ще не налаштовано): гривня, як у модулі A1. */
const FALLBACK_CURRENCY = "UAH"

/** Базова валюта компанії для форми: профіль сторінки, а без нього — спільний кеш профілю. */
export function useBaseCurrency(company: CompanyProfile | undefined): string {
  const profile = useCompanyProfile(!company)
  return (company ?? profile.data)?.baseCurrency ?? FALLBACK_CURRENCY
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

/**
 * Валюти рахунку (ADR-0071) з ресурсу валют компанії (`currencies` фабрики): базова валюта першою, далі
 * активні за кодом. Вимкнена валюта лишається лише в рахунку, де вона вже стоїть. Без права читати валюти
 * — лише базова: валюта рахунку не зникає з поля.
 */
export function useInvoiceCurrencyChoice(
  base: string,
  current: string,
): InvoiceCurrencyChoice {
  const { currencies } = useInvoicesModule()
  const { locale } = useLanguage()
  const companyId = useCompanyId()
  const resource = currencies?.resource ?? ""
  const canRead = useHasPermission(resource, "read")
  const { data, error } = useGetList<CurrencyRecord>(
    resource,
    {
      pagination: { page: 1, perPage: CURRENCY_LIMIT },
      sort: { field: "code", order: "ASC" },
      meta: companyScope(companyId),
    },
    { enabled: Boolean(currencies) && canRead },
  )
  return useMemo(() => {
    const active = (data ?? [])
      .filter((currency) => currency.active !== false)
      .map((currency) => currency.code)
    const codes = [...new Set([base, ...active, current].filter(Boolean))]
    return {
      items: codes.map((code) => ({
        value: code,
        label: `${code} · ${currencyName(code, locale)}`,
      })),
      failed: Boolean(error),
    }
  }, [data, error, base, current, locale])
}
