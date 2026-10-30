import type { ReactNode } from "react"

import { PageSkeleton, PageState } from "@/components/erp/page-state"
import { errorStateKind } from "@/lib/api"

import type { CompanyState } from "./use-company-state"

/**
 * Вміст сторінки, що рахує від базової валюти: без профілю компанії підпис «Курс, UAH» був би
 * вигадкою, тож поки профіль іде — скелетон, збій — стан помилки з повтором.
 */
export function BaseCurrencyGate({
  company,
  rows,
  children,
}: {
  company: CompanyState
  rows: number
  children: (base: string) => ReactNode
}) {
  if (company.base) return children(company.base)
  return company.failure ? (
    <PageState kind={errorStateKind(company.failure)} onRetry={company.retry} />
  ) : (
    <PageSkeleton rows={rows} />
  )
}
