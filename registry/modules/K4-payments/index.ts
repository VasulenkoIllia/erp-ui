/**
 * Модуль K4 «Оплати» (SPEC §14, §17; ADR-0020, ADR-0025, ADR-0073) — точка входу: розділ «Оплати» з
 * реєстрацією оплати клієнта за рахунками модуля K2.
 *
 *   const paymentsModule = createPaymentsModule({
 *     basePath: "/finance",
 *     extension: paymentsExtension,
 *     clients: { resource: "organizations", labelField: "name", href: contactsModule.paths.organization },
 *     invoices: { resource: "sales-invoices", href: invoicesModule.paths.invoice },
 *   })
 *   <Routes>{paymentsModule.routes.map(…)}</Routes>  // чи useRoutes(paymentsModule.routes)
 *
 * Фабрика повертає маршрути React Router зі сторінками модуля (лінивими чанками, `Suspense` і межа помилок —
 * у застосунку), пункт навігації, ресурси для прав і моків і `preload` за адресою. Без розширення модуль
 * такий, як у демо кіта. Файли модуля в проекті не правляться: зміни під клієнта — у файлі розширення
 * (`src/extensions/K4-payments.ts`). Моки — окремо, `./mocks` (`createPaymentsMocks`), щоб MSW не потрапив
 * у застосунок.
 */
import type { LucideIcon } from "lucide-react"
import { createElement, type ComponentType } from "react"
import { Navigate, type RouteObject } from "react-router"

import type { LocalizedText } from "@/lib/auth"
import { MODULE_ICONS } from "@/lib/icons"
import { lazyWithPreload, type PreloadableComponent } from "@/lib/lazy"

import type { PaymentsExtension } from "./extension"
import {
  PaymentsModuleContext,
  paymentsPaths,
  type PaymentClients,
  type PaymentInvoicesLink,
  type PaymentsModuleContextValue,
  type PaymentsPaths,
} from "./module-context"
import {
  PAYMENTS,
  PAYMENTS_RESOURCES,
  type PaymentsResource,
} from "./resources"

export type {
  PaymentColumnId,
  PaymentFieldId,
  PaymentFilterId,
  PaymentFormFieldId,
  PaymentIds,
  PaymentMethodOption,
  PaymentsExtension,
  PaymentSectionId,
  PaymentsMessages,
  PaymentsMockExtension,
  PaymentTabId,
} from "./extension"
export {
  paymentsPaths,
  type PaymentClients,
  type PaymentInvoicesLink,
  type PaymentsPaths,
} from "./module-context"
export type { PaymentsResource } from "./resources"
// Типи для файлу розширення й компонентів слотів проекту: не з внутрішніх файлів модуля.
export type {
  OpenInvoice,
  Payment,
  PaymentAllocation,
  PaymentMethod,
  PaymentStatus,
  PaymentTransitionId,
} from "./contract"
export type { ExtensionField } from "@/lib/extension-fields"

export const PAYMENTS_MODULE_ID = "K4"

export interface PaymentsNavItem {
  readonly id: string
  /** Підпис мовою інтерфейсу — `localizedText(label, language)` з `@/lib/auth`. */
  readonly label: LocalizedText
  readonly href: string
  readonly icon: LucideIcon
  /** Пункт видно лише з правом читання ресурсу. */
  readonly access: { readonly resource: string; readonly action: string }
}

export interface PaymentsModule {
  readonly id: typeof PAYMENTS_MODULE_ID
  readonly paths: PaymentsPaths
  readonly routes: RouteObject[]
  readonly nav: readonly PaymentsNavItem[]
  /** Ресурси модуля: права (`<ресурс>:<дія>`), журнал аудиту, токени API, сценарії моків. */
  readonly resources: readonly PaymentsResource[]
  /** Завантажити чанк сторінки модуля за адресою заздалегідь (наведення, фокус на посиланні). */
  readonly preload: (pathname: string) => void
}

export interface PaymentsModuleOptions {
  /** Початок адрес модуля: `""` — `/payments`; `"/finance"` — `/finance/payments`. */
  readonly basePath?: string
  /** Розширення проекту (ADR-0020). */
  readonly extension?: PaymentsExtension
  /**
   * Клієнти оплат: ресурс із назвою (за замовчуванням `organizations` модуля B1) і адреса картки клієнта
   * (`contactsModule.paths.organization`). Модуль не імпортує інший модуль: лише назви ресурсів і шляхи.
   */
  readonly clients?: PaymentClients
  /**
   * Рахунки, за якими платять (модуль K2): ресурс (за замовчуванням `sales-invoices`) і адреса картки
   * рахунку (`invoicesModule.paths.invoice`).
   */
  readonly invoices?: PaymentInvoicesLink
}

const DEFAULT_CLIENTS: PaymentClients = {
  resource: "organizations",
  labelField: "name",
  descriptionField: "code",
}
const DEFAULT_INVOICES: PaymentInvoicesLink = { resource: "sales-invoices" }

const PAGES = {
  list: lazyWithPreload(() =>
    import("./pages/payment-list-page").then((m) => m.PaymentsListPage),
  ),
  record: lazyWithPreload(() =>
    import("./pages/payment-record-page").then((m) => m.PaymentPage),
  ),
  form: lazyWithPreload(() =>
    import("./pages/payment-form-page").then((m) => m.PaymentFormPage),
  ),
} satisfies Record<string, PreloadableComponent<object>>

const NO_EXTENSION: PaymentsExtension = {}

/** Чанк сторінки за адресою: список, нова оплата чи картка. */
function preloadFor(paths: PaymentsPaths) {
  const newPath = paths.newPayment()
  return (pathname: string) => {
    const path = pathname.split(/[?#]/)[0] ?? ""
    const target =
      path === paths.payments
        ? PAGES.list
        : path === newPath
          ? PAGES.form
          : path.startsWith(`${paths.payments}/`)
            ? PAGES.record
            : null
    void target?.preload()
  }
}

export function createPaymentsModule({
  basePath = "",
  extension = NO_EXTENSION,
  clients = DEFAULT_CLIENTS,
  invoices = DEFAULT_INVOICES,
}: PaymentsModuleOptions = {}): PaymentsModule {
  const paths = paymentsPaths(basePath)
  const preload = preloadFor(paths)
  const context: PaymentsModuleContextValue = {
    extension,
    paths,
    clients,
    invoices,
    preload,
  }
  const page = (Page: ComponentType) =>
    createElement(
      PaymentsModuleContext.Provider,
      { value: context },
      createElement(Page),
    )
  const routes: RouteObject[] = [
    { path: paths.payments, element: page(PAGES.list) },
    { path: paths.newPayment(), element: page(PAGES.form) },
    { path: `${paths.payments}/:id`, element: page(PAGES.record) },
  ]
  // Адреса самого модуля (`/finance`) — список оплат.
  if (basePath.replace(/\/+$/, ""))
    routes.push({
      path: basePath,
      element: createElement(Navigate, { to: paths.payments, replace: true }),
    })
  const nav: PaymentsNavItem[] = [
    {
      id: "K4-payments",
      label: { uk: "Оплати", en: "Payments" },
      href: paths.payments,
      icon: MODULE_ICONS.K4,
      access: { resource: PAYMENTS, action: "read" },
    },
  ]
  return {
    id: PAYMENTS_MODULE_ID,
    paths,
    routes,
    nav,
    resources: PAYMENTS_RESOURCES,
    preload,
  }
}
