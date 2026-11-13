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
import type { RaRecord } from "ra-core"

import type { DocumentLineItem } from "@/components/erp/document-line-fields"
import { MODULE_ICONS } from "@/lib/icons"
import { lazyWithPreload, type PreloadableComponent } from "@/lib/lazy"
import {
  createModule,
  type ErpModule,
  type ModuleNavItemWithAccess,
} from "@/lib/module"

import type { SalesExtension } from "./extension"
import {
  SalesModuleContext,
  salesPaths,
  type SalesClients,
  type SalesInvoices,
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
export type { SalesClients, SalesInvoices, SalesPaths } from "./module-context"
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

/** Пункт видно лише з правом читання ресурсу. */
export type SalesNavItem = ModuleNavItemWithAccess

export type SalesModule = ErpModule<
  typeof SALES_MODULE_ID,
  SalesPaths,
  SalesNavItem,
  SalesResource
>

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
  /**
   * Рахунки модуля K2 (ADR-0070): «Виставити рахунок» із замовлення, посилання й потік. Без них дії
   * немає. Адреса — `invoicesPaths(basePath).invoice` модуля K2, щоб фабрики не залежали одна від одної.
   */
  readonly invoices?: SalesInvoices
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

export function createSalesModule<TItem extends RaRecord = RaRecord>({
  basePath = "",
  extension = NO_EXTENSION,
  clients = DEFAULT_CLIENTS,
  lineItem,
  invoices,
}: SalesModuleOptions<TItem> = {}): SalesModule {
  const paths = salesPaths(basePath, invoices)
  return createModule({
    id: SALES_MODULE_ID,
    basePath,
    paths,
    pages: [
      { path: paths.quotes, page: PAGES.quotes },
      { path: paths.newQuote, page: PAGES.quoteForm },
      { path: `${paths.quotes}/:id`, page: PAGES.quote },
      { path: `${paths.quotes}/:id/edit`, page: PAGES.quoteForm },
      { path: `${paths.quotes}/:id/print`, page: PAGES.quotePrint },
      { path: paths.orders, page: PAGES.orders },
      { path: paths.newOrder, page: PAGES.orderForm },
      { path: `${paths.orders}/:id`, page: PAGES.order },
      { path: `${paths.orders}/:id/edit`, page: PAGES.orderForm },
      { path: `${paths.orders}/:id/print`, page: PAGES.orderPrint },
    ],
    // Адреса самого модуля (`/sales`) — список пропозицій.
    home: paths.quotes,
    nav: [
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
    ],
    resources: SALES_RESOURCES,
    context: SalesModuleContext,
    value: {
      extension,
      paths,
      clients,
      // Редактор рядків лише повертає вибраний запис ресурсу `lineItem.resource` у ці самі функції.
      lineItem: lineItem as DocumentLineItem<RaRecord> | undefined,
    },
  })
}
