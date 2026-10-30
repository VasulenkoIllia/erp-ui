import { useGetList } from "ra-core"
import { useMemo } from "react"

import { useCompanyId } from "@/hooks/use-company"
import { useHasPermission } from "@/hooks/use-me"
import { companyScope } from "@/lib/company-scope"

import { CURRENCIES, type Currency } from "../contract"
import { useCompanyT } from "../use-company-t"
import type { CompanyState } from "./use-company-state"

/** Кодів ISO 4217 менше за цю межу, тож перелік не обрізається. */
const CURRENCY_LIMIT = 200

/**
 * Коди валют компанії для форм і фільтрів, базова в них не входить. `unavailable` — чому переліку ще
 * немає: порожній перелік через збій не має виглядати як «валют немає». Перелік потребує
 * `currencies:read`: роль лише з курсами бачить причину, а не 403. Без базової валюти форми не
 * відкриваємо: її не можна було б виключити з вибору.
 */
export function useCurrencyCodes(company: CompanyState, enabled: boolean) {
  const t = useCompanyT()
  const { base, failure } = company
  const companyId = useCompanyId()
  const canRead = useHasPermission(CURRENCIES, "read")
  const { data, error, fetchStatus, isPending } = useGetList<Currency>(
    CURRENCIES,
    {
      pagination: { page: 1, perPage: CURRENCY_LIMIT },
      sort: { field: "code", order: "ASC" },
      meta: companyScope(companyId),
    },
    { enabled: enabled && canRead },
  )
  const codes = useMemo(() => {
    const rows = (data ?? []).filter((currency) => currency.code !== base)
    return {
      all: rows.map((currency) => currency.code),
      active: rows
        .filter((currency) => currency.active)
        .map((currency) => currency.code),
    }
  }, [data, base])
  const unavailable = !canRead
    ? t("currencies.listDenied")
    : error || failure || fetchStatus === "paused"
      ? t("currencies.listFailed")
      : isPending || !base
        ? t("currencies.listLoading")
        : undefined
  return { ...codes, unavailable }
}
