/**
 * Модуль B3 «Пропозиції й замовлення» (SPEC §14, §17; ADR-0020, ADR-0025, ADR-0065, ADR-0067) — точка
 * входу: розділи «Пропозиції» й «Замовлення».
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
import {
  ORDERS,
  QUOTES,
  SALES_RESOURCES,
  type SalesResource,
} from "./resources"

export type {
  OrderActionId,
  OrderColumnId,
  OrderFieldId,
  OrderFilterId,
  OrderFormFieldId,
  OrderSectionId,
  OrdersExtension,
  OrderTabId,
  QuoteActionId,
  QuoteColumnId,
  QuoteFieldId,
  QuoteFilterId,
  QuoteFormFieldId,
  QuoteSectionId,
  QuotesExtension,
  QuoteTabId,
  SalesDocumentExtension,
  SalesDocumentIds,
  SalesExtension,
  SalesMessages,
  SalesMockExtension,
} from "./extension"
export type { SalesClients, SalesPaths } from "./module-context"
export type { SalesResource } from "./resources"
// Типи для файлу розширення й компонентів слотів проекту: не з внутрішніх файлів модуля.
export type {
  Order,
  OrderCard,
  OrderDetail,
  OrderStatus,
  OrderTransitionId,
  Quote,
  QuoteCard,
  QuoteDetail,
  QuoteStatus,
  QuoteTransitionId,
  SalesDocument,
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
   * Клієнти пропозицій і замовлень: ресурс із назвою (за замовчуванням `organizations` модуля B1) і адреса картки
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

// Пропозиції й замовлення — ті самі чанки: сторінки спільні, різниця — в описі документа.
const listPage = () => import("./pages/sales-list-page")
const recordPage = () => import("./pages/sales-record-page")
const formPage = () => import("./pages/sales-form-page")
const printPage = () => import("./pages/sales-print-page")

const PAGES = {
  quotes: lazyWithPreload(() => listPage().then((m) => m.QuotesListPage)),
  quote: lazyWithPreload(() => recordPage().then((m) => m.QuotePage)),
  quoteForm: lazyWithPreload(() => formPage().then((m) => m.QuoteFormPage)),
  quotePrint: lazyWithPreload(() => printPage().then((m) => m.QuotePrintPage)),
  orders: lazyWithPreload(() => listPage().then((m) => m.OrdersListPage)),
  order: lazyWithPreload(() => recordPage().then((m) => m.OrderPage)),
  orderForm: lazyWithPreload(() => formPage().then((m) => m.OrderFormPage)),
  orderPrint: lazyWithPreload(() => printPage().then((m) => m.OrderPrintPage)),
} satisfies Record<string, PreloadableComponent<object>>

const NO_EXTENSION: SalesExtension = {}

/** Сторінки одного документа: список, картка, форма й друк. */
interface DocumentPages {
  readonly list: PreloadableComponent<object>
  readonly record: PreloadableComponent<object>
  readonly form: PreloadableComponent<object>
  readonly print: PreloadableComponent<object>
}

/** Сторінка документа за адресою під `list` (`…/quotes`): список, нова, зміна, друк чи картка. */
function pageAt(
  path: string,
  list: string,
  create: string,
  pages: DocumentPages,
) {
  if (path === list) return pages.list
  const inside = path.startsWith(`${list}/`)
  if (path === create || (inside && path.endsWith("/edit"))) return pages.form
  if (inside && path.endsWith("/print")) return pages.print
  return inside ? pages.record : null
}

/** Чанк сторінки за адресою: список, форма, друк чи картка пропозиції або замовлення. */
function preloadFor(paths: SalesPaths) {
  return (pathname: string) => {
    const path = pathname.split(/[?#]/)[0] ?? ""
    const target =
      pageAt(path, paths.quotes, paths.newQuote, {
        list: PAGES.quotes,
        record: PAGES.quote,
        form: PAGES.quoteForm,
        print: PAGES.quotePrint,
      }) ??
      pageAt(path, paths.orders, paths.newOrder, {
        list: PAGES.orders,
        record: PAGES.order,
        form: PAGES.orderForm,
        print: PAGES.orderPrint,
      })
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
    { path: paths.newQuote, element: page(PAGES.quoteForm) },
    { path: `${paths.quotes}/:id`, element: page(PAGES.quote) },
    { path: `${paths.quotes}/:id/edit`, element: page(PAGES.quoteForm) },
    { path: `${paths.quotes}/:id/print`, element: page(PAGES.quotePrint) },
    { path: paths.orders, element: page(PAGES.orders) },
    { path: paths.newOrder, element: page(PAGES.orderForm) },
    { path: `${paths.orders}/:id`, element: page(PAGES.order) },
    { path: `${paths.orders}/:id/edit`, element: page(PAGES.orderForm) },
    { path: `${paths.orders}/:id/print`, element: page(PAGES.orderPrint) },
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
    {
      id: "B3-orders",
      label: { uk: "Замовлення", en: "Orders" },
      href: paths.orders,
      icon: MODULE_ICONS.B3,
      access: { resource: ORDERS, action: "read" },
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
