/**
 * Модуль B3 «Пропозиції й замовлення» (SPEC §14, §17; ADR-0020, ADR-0025, ADR-0065) — точка входу.
 * Перша частина — пропозиції; замовлення додає крок `B3b`.
 *
 *   const salesModule = createSalesModule({
 *     basePath: "/sales",
 *     extension: salesExtension,
 *     clients: { resource: "organizations", labelField: "name", href: contactsModule.paths.organization },
 *   })
 *   <Routes>{salesModule.routes.map(…)}</Routes>  // чи useRoutes(salesModule.routes)
 *
 * Фабрика повертає маршрути React Router зі сторінками модуля (лінивими чанками, `Suspense` і межа
 * помилок — у застосунку), пункти навігації, ресурси для прав і моків і `preload` за адресою. Без
 * розширення модуль такий, як у демо кіта. Файли модуля в проекті не правляться: зміни під клієнта —
 * у файлі розширення (`src/extensions/B3-sales.ts`). Моки — окремо, `./mocks` (`createSalesMocks`),
 * щоб MSW не потрапив у застосунок.
 */
import type { LucideIcon } from "lucide-react"
import type { RaRecord } from "ra-core"
import { createElement, type ComponentType } from "react"
import { Navigate, type RouteObject } from "react-router"

import type { DocumentLineItem } from "@/components/erp/document-line-fields"
import type { LocalizedText } from "@/lib/auth"
import { MODULE_ICONS } from "@/lib/icons"
import { lazyWithPreload, type PreloadableComponent } from "@/lib/lazy"

import type { SalesExtension } from "./extension"
import {
  SalesModuleContext,
  salesPaths,
  type SalesClients,
  type SalesModuleContextValue,
  type SalesPaths,
} from "./module-context"
import { QUOTES, SALES_RESOURCES, type SalesResource } from "./resources"

export type {
  QuoteActionId,
  QuoteColumnId,
  QuoteFieldId,
  QuoteFilterId,
  QuoteFormFieldId,
  QuoteSectionId,
  QuotesExtension,
  QuoteTabId,
  SalesExtension,
  SalesMessages,
  SalesMockExtension,
} from "./extension"
export type { SalesClients, SalesPaths } from "./module-context"
export type { SalesResource } from "./resources"
// Типи для файлу розширення й компонентів слотів проекту: не з внутрішніх файлів модуля.
export type {
  Quote,
  QuoteCard,
  QuoteDetail,
  QuoteStatus,
  QuoteTransitionId,
} from "./contract"
export type { ExtensionField } from "@/lib/extension-fields"

export const SALES_MODULE_ID = "B3"

export interface SalesNavItem {
  readonly id: string
  /** Підпис мовою інтерфейсу — `localizedText(label, language)` з `@/lib/auth`. */
  readonly label: LocalizedText
  readonly href: string
  readonly icon: LucideIcon
  /** Пункт видно лише з правом читання ресурсу. */
  readonly access: { readonly resource: string; readonly action: string }
}

export interface SalesModule {
  readonly id: typeof SALES_MODULE_ID
  readonly paths: SalesPaths
  readonly routes: RouteObject[]
  readonly nav: readonly SalesNavItem[]
  /** Ресурси модуля: права (`<ресурс>:<дія>`), журнал аудиту, токени API, сценарії моків. */
  readonly resources: readonly SalesResource[]
  /** Завантажити чанк сторінки модуля за адресою заздалегідь (наведення, фокус на посиланні). */
  readonly preload: (pathname: string) => void
}

export interface SalesModuleOptions<TItem extends RaRecord = RaRecord> {
  /** Початок адрес модуля: `""` — `/quotes`; `"/sales"` — `/sales/quotes`. */
  readonly basePath?: string
  /** Розширення проекту (ADR-0020). */
  readonly extension?: SalesExtension
  /**
   * Клієнти пропозицій: ресурс із назвою (за замовчуванням `organizations` модуля B1) і адреса картки
   * клієнта (`contactsModule.paths.organization`). Модуль не імпортує інший модуль: лише назви ресурсів
   * і шляхи.
   */
  readonly clients?: SalesClients
  /** Вибір товару чи послуги в рядку з ресурсу проекту (`products`); без нього — вільний текст. */
  readonly lineItem?: DocumentLineItem<TItem>
}

const DEFAULT_CLIENTS: SalesClients = {
  resource: "organizations",
  labelField: "name",
  descriptionField: "code",
}

const PAGES = {
  quotes: lazyWithPreload(() =>
    import("./pages/quotes-list-page").then((m) => m.QuotesListPage),
  ),
  quote: lazyWithPreload(() =>
    import("./pages/quote-page").then((m) => m.QuotePage),
  ),
  form: lazyWithPreload(() =>
    import("./pages/quote-form-page").then((m) => m.QuoteFormPage),
  ),
  print: lazyWithPreload(() =>
    import("./pages/quote-print-page").then((m) => m.QuotePrintPage),
  ),
} satisfies Record<string, PreloadableComponent<object>>

const NO_EXTENSION: SalesExtension = {}

/** Чанк сторінки за адресою: список, форма, друк чи картка пропозиції. */
function preloadFor(paths: SalesPaths) {
  return (pathname: string) => {
    const path = pathname.split(/[?#]/)[0] ?? ""
    const inside = path.startsWith(`${paths.quotes}/`)
    const target =
      path === paths.quotes
        ? PAGES.quotes
        : path === paths.newQuote || (inside && path.endsWith("/edit"))
          ? PAGES.form
          : inside && path.endsWith("/print")
            ? PAGES.print
            : inside
              ? PAGES.quote
              : null
    void target?.preload()
  }
}

export function createSalesModule<TItem extends RaRecord = RaRecord>({
  basePath = "",
  extension = NO_EXTENSION,
  clients = DEFAULT_CLIENTS,
  lineItem,
}: SalesModuleOptions<TItem> = {}): SalesModule {
  const paths = salesPaths(basePath)
  const preload = preloadFor(paths)
  const context: SalesModuleContextValue = {
    extension,
    paths,
    clients,
    // Редактор рядків лише повертає вибраний запис ресурсу `lineItem.resource` у ці самі функції.
    lineItem: lineItem as DocumentLineItem<RaRecord> | undefined,
    preload,
  }
  const page = (Page: ComponentType) =>
    createElement(
      SalesModuleContext.Provider,
      { value: context },
      createElement(Page),
    )
  const routes: RouteObject[] = [
    { path: paths.quotes, element: page(PAGES.quotes) },
    { path: paths.newQuote, element: page(PAGES.form) },
    { path: `${paths.quotes}/:id`, element: page(PAGES.quote) },
    { path: `${paths.quotes}/:id/edit`, element: page(PAGES.form) },
    { path: `${paths.quotes}/:id/print`, element: page(PAGES.print) },
  ]
  // Адреса самого модуля (`/sales`) — список пропозицій.
  if (basePath.replace(/\/+$/, ""))
    routes.push({
      path: basePath,
      element: createElement(Navigate, { to: paths.quotes, replace: true }),
    })
  const nav: SalesNavItem[] = [
    {
      id: "B3-quotes",
      label: { uk: "Пропозиції", en: "Quotes" },
      href: paths.quotes,
      icon: MODULE_ICONS.B3,
      access: { resource: QUOTES, action: "read" },
    },
  ]
  return {
    id: SALES_MODULE_ID,
    paths,
    routes,
    nav,
    resources: SALES_RESOURCES,
    preload,
  }
}
