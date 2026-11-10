/**
 * Модуль K2 «Рахунки клієнтам» (SPEC §14, §17; ADR-0020, ADR-0025, ADR-0070, ADR-0072) — точка входу:
 * розділи «Рахунки клієнтам» і «Кредит-ноти» (кредит-ноту створює дія виставленого рахунку).
 *
 *   const invoicesModule = createInvoicesModule({
 *     basePath: "/finance",
 *     extension: invoicesExtension,
 *     clients: { resource: "organizations", labelField: "name", href: contactsModule.paths.organization },
 *     sources: { order: salesModule.paths.order, quote: salesModule.paths.quote },
 *     currencies: { resource: "currencies" },
 *   })
 *   <Routes>{invoicesModule.routes.map(…)}</Routes>  // чи useRoutes(invoicesModule.routes)
 *
 * Фабрика повертає маршрути React Router зі сторінками модуля (лінивими чанками, `Suspense` і межа
 * помилок — у застосунку), пункти навігації, ресурси для прав і моків і `preload` за адресою. Без
 * розширення модуль такий, як у демо кіта. Файли модуля в проекті не правляться: зміни під клієнта —
 * у файлі розширення (`src/extensions/K2-invoices.ts`). Моки — окремо, `./mocks` (`createInvoicesMocks`),
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

import type { InvoicesExtension } from "./extension"
import {
  InvoicesModuleContext,
  invoicesPaths,
  type InvoiceClients,
  type InvoiceCurrencies,
  type InvoicesModuleContextValue,
  type InvoiceSources,
  type InvoicesPaths,
} from "./module-context"
import {
  CREDIT_NOTES,
  INVOICES,
  INVOICES_RESOURCES,
  type InvoicesResource,
} from "./resources"

export type {
  CreditNoteActionId,
  CreditNoteColumnId,
  CreditNoteDocumentExtension,
  CreditNoteFieldId,
  CreditNoteFilterId,
  CreditNoteFormFieldId,
  CreditNoteIds,
  CreditNoteSectionId,
  CreditNoteTabId,
  InvoiceActionId,
  InvoiceColumnId,
  InvoiceDocumentExtension,
  InvoiceFieldId,
  InvoiceFilterId,
  InvoiceFormFieldId,
  InvoiceIds,
  InvoicesExtension,
  InvoiceSectionId,
  InvoicesMessages,
  InvoicesMockExtension,
  InvoiceTabId,
} from "./extension"
export {
  invoicesPaths,
  type InvoiceClients,
  type InvoiceCurrencies,
  type InvoiceSources,
  type InvoicesPaths,
} from "./module-context"
export type { InvoicesResource } from "./resources"
// Типи для файлу розширення й компонентів слотів проекту: не з внутрішніх файлів модуля.
export type {
  CreditNote,
  CreditNoteCard,
  CreditNoteDetail,
  CreditNoteStatus,
  CreditNoteTransitionId,
  Invoice,
  InvoiceCard,
  InvoiceDetail,
  InvoiceStatus,
  InvoiceTransitionId,
} from "./contract"
export type { ExtensionField } from "@/lib/extension-fields"

export const INVOICES_MODULE_ID = "K2"

export interface InvoicesNavItem {
  readonly id: string
  /** Підпис мовою інтерфейсу — `localizedText(label, language)` з `@/lib/auth`. */
  readonly label: LocalizedText
  readonly href: string
  readonly icon: LucideIcon
  /** Пункт видно лише з правом читання ресурсу. */
  readonly access: { readonly resource: string; readonly action: string }
}

export interface InvoicesModule {
  readonly id: typeof INVOICES_MODULE_ID
  readonly paths: InvoicesPaths
  readonly routes: RouteObject[]
  readonly nav: readonly InvoicesNavItem[]
  /** Ресурси модуля: права (`<ресурс>:<дія>`), журнал аудиту, токени API, сценарії моків. */
  readonly resources: readonly InvoicesResource[]
  /** Завантажити чанк сторінки модуля за адресою заздалегідь (наведення, фокус на посиланні). */
  readonly preload: (pathname: string) => void
}

export interface InvoicesModuleOptions<TItem extends RaRecord = RaRecord> {
  /** Початок адрес модуля: `""` — `/invoices`; `"/finance"` — `/finance/invoices`. */
  readonly basePath?: string
  /** Розширення проекту (ADR-0020). */
  readonly extension?: InvoicesExtension
  /**
   * Клієнти рахунків: ресурс із назвою (за замовчуванням `organizations` модуля B1), адреса картки
   * клієнта (`contactsModule.paths.organization`) і реквізити покупця з запису (`party`). Модуль не
   * імпортує інший модуль: лише назви ресурсів і шляхи.
   */
  readonly clients?: InvoiceClients
  /** Адреси карток пропозицій і замовлень модуля B3 для потоку документів (`salesModule.paths`). */
  readonly sources?: InvoiceSources
  /**
   * Валюти рахунку (ADR-0071): ресурс валют компанії (`currencies` модуля A1). Без опції рахунок у базовій
   * валюті компанії й поля «Валюта» у формі немає; з нею рахунок у валюті показує суму в базовій поруч.
   */
  readonly currencies?: InvoiceCurrencies
  /** Вибір товару чи послуги в рядку з ресурсу проекту (`products`); без нього — вільний текст. */
  readonly lineItem?: DocumentLineItem<TItem>
}

const DEFAULT_CLIENTS: InvoiceClients = {
  resource: "organizations",
  labelField: "name",
  descriptionField: "code",
}

const PAGES = {
  list: lazyWithPreload(() =>
    import("./pages/invoice-list-page").then((m) => m.InvoicesListPage),
  ),
  record: lazyWithPreload(() =>
    import("./pages/invoice-record-page").then((m) => m.InvoicePage),
  ),
  form: lazyWithPreload(() =>
    import("./pages/invoice-form-page").then((m) => m.InvoiceFormPage),
  ),
  print: lazyWithPreload(() =>
    import("./pages/invoice-print-page").then((m) => m.InvoicePrintPage),
  ),
  creditNotes: lazyWithPreload(() =>
    import("./pages/credit-note-list-page").then((m) => m.CreditNotesListPage),
  ),
  creditNote: lazyWithPreload(() =>
    import("./pages/credit-note-record-page").then((m) => m.CreditNotePage),
  ),
  creditNoteForm: lazyWithPreload(() =>
    import("./pages/credit-note-form-page").then((m) => m.CreditNoteFormPage),
  ),
  creditNotePrint: lazyWithPreload(() =>
    import("./pages/credit-note-print-page").then((m) => m.CreditNotePrintPage),
  ),
} satisfies Record<string, PreloadableComponent<object>>

const NO_EXTENSION: InvoicesExtension = {}
const NO_SOURCES: InvoiceSources = {}

/** Чанк сторінки кредит-ноти за адресою: список, зміна, друк чи картка. */
function creditNotePage(paths: InvoicesPaths, path: string) {
  if (path === paths.creditNotes) return PAGES.creditNotes
  if (!path.startsWith(`${paths.creditNotes}/`)) return null
  return path.endsWith("/edit")
    ? PAGES.creditNoteForm
    : path.endsWith("/print")
      ? PAGES.creditNotePrint
      : PAGES.creditNote
}

/** Чанк сторінки за адресою: список, нова, зміна, друк чи картка рахунку чи кредит-ноти. */
function preloadFor(paths: InvoicesPaths) {
  return (pathname: string) => {
    const path = pathname.split(/[?#]/)[0] ?? ""
    const inside = path.startsWith(`${paths.invoices}/`)
    const target =
      path === paths.invoices
        ? PAGES.list
        : path === paths.newInvoice || (inside && path.endsWith("/edit"))
          ? PAGES.form
          : inside && path.endsWith("/print")
            ? PAGES.print
            : inside
              ? PAGES.record
              : creditNotePage(paths, path)
    void target?.preload()
  }
}

export function createInvoicesModule<TItem extends RaRecord = RaRecord>({
  basePath = "",
  extension = NO_EXTENSION,
  clients = DEFAULT_CLIENTS,
  sources = NO_SOURCES,
  currencies,
  lineItem,
}: InvoicesModuleOptions<TItem> = {}): InvoicesModule {
  const paths = invoicesPaths(basePath)
  const preload = preloadFor(paths)
  const context: InvoicesModuleContextValue = {
    extension,
    paths,
    clients,
    sources,
    currencies,
    // Редактор рядків лише повертає вибраний запис ресурсу `lineItem.resource` у ці самі функції.
    lineItem: lineItem as DocumentLineItem<RaRecord> | undefined,
    preload,
  }
  const page = (Page: ComponentType) =>
    createElement(
      InvoicesModuleContext.Provider,
      { value: context },
      createElement(Page),
    )
  const routes: RouteObject[] = [
    { path: paths.invoices, element: page(PAGES.list) },
    { path: paths.newInvoice, element: page(PAGES.form) },
    { path: `${paths.invoices}/:id`, element: page(PAGES.record) },
    { path: `${paths.invoices}/:id/edit`, element: page(PAGES.form) },
    { path: `${paths.invoices}/:id/print`, element: page(PAGES.print) },
    { path: paths.creditNotes, element: page(PAGES.creditNotes) },
    { path: `${paths.creditNotes}/:id`, element: page(PAGES.creditNote) },
    {
      path: `${paths.creditNotes}/:id/edit`,
      element: page(PAGES.creditNoteForm),
    },
    {
      path: `${paths.creditNotes}/:id/print`,
      element: page(PAGES.creditNotePrint),
    },
  ]
  // Адреса самого модуля (`/finance`) — список рахунків.
  if (basePath.replace(/\/+$/, ""))
    routes.push({
      path: basePath,
      element: createElement(Navigate, { to: paths.invoices, replace: true }),
    })
  const nav: InvoicesNavItem[] = [
    {
      id: "K2-invoices",
      label: { uk: "Рахунки клієнтам", en: "Customer invoices" },
      href: paths.invoices,
      icon: MODULE_ICONS.K2,
      access: { resource: INVOICES, action: "read" },
    },
    {
      id: "K2-credit-notes",
      label: { uk: "Кредит-ноти", en: "Credit notes" },
      href: paths.creditNotes,
      icon: MODULE_ICONS.K2,
      access: { resource: CREDIT_NOTES, action: "read" },
    },
  ]
  return {
    id: INVOICES_MODULE_ID,
    paths,
    routes,
    nav,
    resources: INVOICES_RESOURCES,
    preload,
  }
}
