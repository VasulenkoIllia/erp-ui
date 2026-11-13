import { createModuleContext, type ModuleContextValue } from "@/lib/module"

import type { CompanyExtension } from "./extension"

/** Адреси сторінок модуля від `basePath` фабрики. */
export interface CompanyPaths {
  readonly company: string
  readonly currencies: string
  readonly rates: string
  /** Майстер першого запуску (ADR-0044): після реєстрації — `afterSignUp` у `createAuthRoutes`. */
  readonly setup: string
}

/** Параметр адреси таблиці курсів з вибраною валютою: перехід зі списку валют. */
export const RATE_CURRENCY_PARAM = "currency"

export function companyPaths(basePath: string): CompanyPaths {
  const base = basePath.replace(/\/+$/, "")
  return {
    company: `${base}/company`,
    currencies: `${base}/currencies`,
    rates: `${base}/exchange-rates`,
    setup: `${base}/setup`,
  }
}

export interface CompanyModuleContextValue extends ModuleContextValue<
  CompanyExtension,
  CompanyPaths
> {
  /** Куди веде майстер першого запуску після завершення чи пропуску. */
  readonly afterSetup: string
}

/** Розширення й адреси для сторінок модуля: їх дає фабрика в маршрутах. */
export const [CompanyModuleContext, useCompanyModule] =
  createModuleContext<CompanyModuleContextValue>(
    "A1-company",
    "createCompanyModule",
  )
