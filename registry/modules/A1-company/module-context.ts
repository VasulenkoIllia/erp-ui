import { createContext, useContext } from "react"

import type { CompanyExtension } from "./extension"

/** Адреси сторінок модуля від `basePath` фабрики. */
export interface CompanyPaths {
  readonly company: string
  readonly currencies: string
  readonly rates: string
}

/** Параметр адреси таблиці курсів з вибраною валютою: перехід зі списку валют. */
export const RATE_CURRENCY_PARAM = "currency"

export function companyPaths(basePath: string): CompanyPaths {
  const base = basePath.replace(/\/+$/, "")
  return {
    company: `${base}/company`,
    currencies: `${base}/currencies`,
    rates: `${base}/exchange-rates`,
  }
}

export interface CompanyModuleContextValue {
  readonly extension: CompanyExtension
  readonly paths: CompanyPaths
  /** Прогріти чанк сторінки модуля за адресою (наведення чи фокус на посиланні, ADR-0009). */
  readonly preload: (pathname: string) => void
}

/** Розширення й адреси для сторінок модуля: їх дає фабрика в маршрутах. */
export const CompanyModuleContext =
  createContext<CompanyModuleContextValue | null>(null)

export function useCompanyModule(): CompanyModuleContextValue {
  const value = useContext(CompanyModuleContext)
  if (!value)
    throw new Error(
      "A1-company: page rendered outside routes of createCompanyModule()",
    )
  return value
}
