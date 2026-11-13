/**
 * Модуль A1 «Компанія й валюти» (SPEC §14, §17; ADR-0020, ADR-0025, ADR-0043) — точка входу.
 *
 *   const companyModule = createCompanyModule({ basePath: "/settings", extension: companyExtension })
 *   <Routes>{companyModule.routes.map(…)}</Routes>  // чи useRoutes(companyModule.routes)
 *
 * Фабрика повертає маршрути React Router зі сторінками модуля (лінивими чанками, `Suspense` і межа
 * помилок — у застосунку): картка компанії, валюти, курси; пункти навігації з правом, яке їм потрібне,
 * ресурси для прав і моків, `preload` за адресою й чек-лист `setupChecklist` для головної сторінки
 * проекту (ADR-0044). Без розширення модуль такий, як у демо кіта. Файли
 * модуля в проекті не правляться: зміни під клієнта — у файлі розширення
 * (`src/extensions/A1-company.ts`). Моки — окремо, `./mocks` (`createCompanyMocks`), щоб MSW не
 * потрапив у застосунок.
 */
import { CoinsIcon, TrendingUpIcon } from "lucide-react"
import { createElement, Suspense, type ReactElement } from "react"

import { ErrorBoundary } from "@/components/erp/error-boundary"
import { MODULE_ICONS } from "@/lib/icons"
import { lazyWithPreload, type PreloadableComponent } from "@/lib/lazy"
import { createModule, type ErpModule, type ModuleNavItem } from "@/lib/module"

import type { CompanyExtension } from "./extension"
import {
  CompanyModuleContext,
  companyPaths,
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
  SetupExtension,
  SetupItemId,
} from "./extension"
export type { CompanyPaths } from "./module-context"
export type { CompanyResource } from "./resources"
// Типи для файлу розширення й компонентів слотів проекту: не з внутрішніх файлів модуля.
export type { Currency, ExchangeRate } from "./contract"
export type { CompanyProfile } from "@/lib/company"
export type { ExtensionField } from "@/lib/extension-fields"

export const COMPANY_MODULE_ID = "A1"

export type CompanyNavItem = ModuleNavItem

export interface CompanyModule extends ErpModule<
  typeof COMPANY_MODULE_ID,
  CompanyPaths,
  CompanyNavItem,
  CompanyResource
> {
  /**
   * Чек-лист «Почніть роботу» (PF12, ADR-0044): поставте на головну сторінку проекту. Бачить той, хто
   * може змінювати компанію. Лінивий чанк, власні `Suspense` і межа помилок.
   */
  readonly setupChecklist: ReactElement
}

export interface CompanyModuleOptions {
  /** Початок адрес модуля: `""` — `/company`; `"/settings"` — `/settings/company`. */
  readonly basePath?: string
  /** Куди веде майстер першого запуску після завершення чи пропуску; за замовчуванням — картка компанії. */
  readonly afterSetup?: string
  /** Розширення проекту (ADR-0020). */
  readonly extension?: CompanyExtension
}

const SETUP_CHECKLIST = lazyWithPreload(() =>
  import("./components/company-setup-checklist").then(
    (m) => m.CompanySetupChecklist,
  ),
)

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
  setup: lazyWithPreload(() =>
    import("./pages/setup-page").then((m) => m.SetupPage),
  ),
} satisfies Record<string, PreloadableComponent<object>>

const NO_EXTENSION: CompanyExtension = {}

export function createCompanyModule({
  basePath = "",
  afterSetup,
  extension = NO_EXTENSION,
}: CompanyModuleOptions = {}): CompanyModule {
  const paths = companyPaths(basePath)
  const value = { extension, paths, afterSetup: afterSetup ?? paths.company }
  // Одна валюта чи курси в іншій системі — без сторінок і пунктів (`currencies.page: false`).
  const hasCurrencies = extension.currencies?.page !== false
  const hasWizard = extension.setup?.page !== false
  const companyModule = createModule({
    id: COMPANY_MODULE_ID,
    basePath,
    paths,
    pages: [
      { path: paths.company, page: PAGES.company },
      ...(hasWizard ? [{ path: paths.setup, page: PAGES.setup }] : []),
      ...(hasCurrencies
        ? [
            { path: paths.currencies, page: PAGES.currencies },
            { path: paths.rates, page: PAGES.rates },
          ]
        : []),
    ],
    // Адреса самого модуля (`/settings`) — картка компанії.
    home: paths.company,
    nav: [
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
    ],
    resources: COMPANY_RESOURCES,
    context: CompanyModuleContext,
    value,
  })
  return {
    ...companyModule,
    setupChecklist: createElement(
      ErrorBoundary,
      null,
      createElement(
        Suspense,
        { fallback: null },
        createElement(
          CompanyModuleContext.Provider,
          { value: { ...value, preload: companyModule.preload } },
          createElement(SETUP_CHECKLIST),
        ),
      ),
    ),
  }
}
