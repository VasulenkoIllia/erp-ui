/**
 * Модуль A1 «Компанія й валюти» (SPEC §14, §17; ADR-0020, ADR-0025, ADR-0043) — точка входу.
 *
 *   const companyModule = createCompanyModule({ basePath: "/settings", extension: companyExtension })
 *   <Routes>{companyModule.routes.map(…)}</Routes>  // чи useRoutes(companyModule.routes)
 *
 * Фабрика повертає маршрути React Router зі сторінками модуля (лінивими чанками, `Suspense` і межа
 * помилок — у застосунку): картка компанії, валюти, курси; пункти навігації з правом, яке їм потрібне,
 * ресурси для прав і моків і `preload` за адресою. Без розширення модуль такий, як у демо кіта. Файли
 * модуля в проекті не правляться: зміни під клієнта — у файлі розширення
 * (`src/extensions/A1-company.ts`). Моки — окремо, `./mocks` (`createCompanyMocks`), щоб MSW не
 * потрапив у застосунок.
 */
import { CoinsIcon, TrendingUpIcon, type LucideIcon } from "lucide-react"
import { createElement, type ComponentType } from "react"
import { Navigate, type RouteObject } from "react-router"

import type { LocalizedText } from "@/lib/auth"
import { MODULE_ICONS } from "@/lib/icons"
import { lazyWithPreload, type PreloadableComponent } from "@/lib/lazy"

import type { CompanyExtension } from "./extension"
import {
  CompanyModuleContext,
  companyPaths,
  type CompanyModuleContextValue,
  type CompanyPaths,
} from "./module-context"
import {
  COMPANY_RESOURCES,
  CURRENCIES,
  EXCHANGE_RATES,
  type CompanyResource,
} from "./resources"

export type {
  CompanyCardExtension,
  CompanyExtension,
  CompanyMessages,
  CompanyMockExtension,
  CompanySectionId,
  CurrenciesExtension,
  CurrencyColumnId,
  CurrencyIds,
  RateColumnId,
  RateFilterId,
  RateFormFieldId,
  RateIds,
  RatesExtension,
} from "./extension"
export type { CompanyPaths } from "./module-context"
export type { CompanyResource } from "./resources"
// Типи для файлу розширення й компонентів слотів проекту: не з внутрішніх файлів модуля.
export type { Currency, ExchangeRate } from "./contract"
export type { CompanyProfile } from "@/lib/company"
export type { ExtensionField } from "@/lib/extension-fields"

export const COMPANY_MODULE_ID = "A1"

export interface CompanyNavItem {
  readonly id: string
  /** Підпис мовою інтерфейсу — `localizedText(label, language)` з `@/lib/auth`. */
  readonly label: LocalizedText
  readonly href: string
  readonly icon: LucideIcon
  /**
   * Право, без якого пункт ховають (`<ресурс>:<дія>`, як `useCanAccess`): сторінка однаково покаже
   * «Немає доступу». Без нього — пункт для всіх.
   */
  readonly access?: { readonly resource: string; readonly action: string }
}

export interface CompanyModule {
  readonly id: typeof COMPANY_MODULE_ID
  readonly paths: CompanyPaths
  readonly routes: RouteObject[]
  readonly nav: readonly CompanyNavItem[]
  /** Ресурси модуля: права (`<ресурс>:<дія>`), журнал аудиту, токени API, сценарії моків. */
  readonly resources: readonly CompanyResource[]
  /** Завантажити чанк сторінки модуля за адресою заздалегідь (наведення, фокус на посиланні). */
  readonly preload: (pathname: string) => void
}

export interface CompanyModuleOptions {
  /** Початок адрес модуля: `""` — `/company`; `"/settings"` — `/settings/company`. */
  readonly basePath?: string
  /** Розширення проекту (ADR-0020). */
  readonly extension?: CompanyExtension
}

const PAGES = {
  company: lazyWithPreload(() =>
    import("./pages/company-page").then((m) => m.CompanyPage),
  ),
  currencies: lazyWithPreload(() =>
    import("./pages/currencies-page").then((m) => m.CurrenciesPage),
  ),
  rates: lazyWithPreload(() =>
    import("./pages/rates-page").then((m) => m.RatesPage),
  ),
} satisfies Record<string, PreloadableComponent<object>>

const NO_EXTENSION: CompanyExtension = {}

/** Чанк сторінки за адресою. */
function preloadFor(paths: CompanyPaths) {
  return (pathname: string) => {
    const path = pathname.split(/[?#]/)[0] ?? ""
    const target =
      path === paths.company
        ? PAGES.company
        : path === paths.currencies
          ? PAGES.currencies
          : path === paths.rates
            ? PAGES.rates
            : null
    void target?.preload()
  }
}

export function createCompanyModule({
  basePath = "",
  extension = NO_EXTENSION,
}: CompanyModuleOptions = {}): CompanyModule {
  const paths = companyPaths(basePath)
  const preload = preloadFor(paths)
  const context: CompanyModuleContextValue = { extension, paths, preload }
  const page = (Page: ComponentType) =>
    createElement(
      CompanyModuleContext.Provider,
      { value: context },
      createElement(Page),
    )
  // Одна валюта чи курси в іншій системі — без сторінок і пунктів (`currencies.page: false`).
  const hasCurrencies = extension.currencies?.page !== false
  const routes: RouteObject[] = [
    { path: paths.company, element: page(PAGES.company) },
    ...(hasCurrencies
      ? [
          { path: paths.currencies, element: page(PAGES.currencies) },
          { path: paths.rates, element: page(PAGES.rates) },
        ]
      : []),
  ]
  // Адреса самого модуля (`/settings`) — картка компанії.
  if (basePath.replace(/\/+$/, ""))
    routes.push({
      path: basePath,
      element: createElement(Navigate, { to: paths.company, replace: true }),
    })
  const nav: CompanyNavItem[] = [
    {
      id: "A1-company",
      label: { uk: "Компанія", en: "Company" },
      href: paths.company,
      icon: MODULE_ICONS.A1,
    },
    ...(hasCurrencies
      ? [
          {
            id: "A1-currencies",
            label: { uk: "Валюти", en: "Currencies" },
            href: paths.currencies,
            icon: CoinsIcon,
            access: { resource: CURRENCIES, action: "read" },
          },
          {
            id: "A1-rates",
            label: { uk: "Курси валют", en: "Exchange rates" },
            href: paths.rates,
            icon: TrendingUpIcon,
            access: { resource: EXCHANGE_RATES, action: "read" },
          },
        ]
      : []),
  ]
  return {
    id: COMPANY_MODULE_ID,
    paths,
    routes,
    nav,
    resources: COMPANY_RESOURCES,
    preload,
  }
}
