/**
 * Модуль K4 «Оплати» (SPEC §14, §17; ADR-0020, ADR-0025, ADR-0073, ADR-0083) — точка входу: розділ «Оплати» з
 * реєстрацією оплати клієнта за рахунками модуля K2 і розділ «Повернення» — гроші, повернуті клієнту за
 * рахунками з переплатою.
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
import { ACTION_ICONS, MODULE_ICONS } from "@/lib/icons"
import { lazyWithPreload, type PreloadableComponent } from "@/lib/lazy"
import {
  createModule,
  type ErpModule,
  type ModuleNavItemWithAccess,
} from "@/lib/module"

import type { PaymentsExtension } from "./extension"
import {
  PaymentsModuleContext,
  paymentsPaths,
  type PaymentClients,
  type PaymentInvoicesLink,
  type PaymentsPaths,
} from "./module-context"
import {
  PAYMENTS,
  PAYMENTS_RESOURCES,
  REFUNDS,
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
  RefundIds,
  RefundsExtension,
} from "./extension"
export {
  paymentsPaths,
  type PaymentClients,
  type PaymentInvoicesLink,
  type PaymentSourceInvoice,
  type PaymentsPaths,
} from "./module-context"
export type { PaymentsResource } from "./resources"
// Типи для файлу розширення й компонентів слотів проекту: не з внутрішніх файлів модуля.
export type {
  OpenInvoice,
  OverpaidInvoice,
  Payment,
  PaymentAllocation,
  PaymentMethod,
  PaymentStatus,
  PaymentTransitionId,
  Refund,
  RefundStatus,
  RefundTransitionId,
} from "./contract"
export type { ExtensionField } from "@/lib/extension-fields"

export const PAYMENTS_MODULE_ID = "K4"

/** Пункт видно лише з правом читання ресурсу. */
export type PaymentsNavItem = ModuleNavItemWithAccess

export type PaymentsModule = ErpModule<
  typeof PAYMENTS_MODULE_ID,
  PaymentsPaths,
  PaymentsNavItem,
  PaymentsResource
>

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
  refunds: lazyWithPreload(() =>
    import("./pages/payment-list-page").then((m) => m.RefundsListPage),
  ),
  refund: lazyWithPreload(() =>
    import("./pages/payment-record-page").then((m) => m.RefundPage),
  ),
  refundForm: lazyWithPreload(() =>
    import("./pages/payment-form-page").then((m) => m.RefundFormPage),
  ),
} satisfies Record<string, PreloadableComponent<object>>

const NO_EXTENSION: PaymentsExtension = {}

export function createPaymentsModule({
  basePath = "",
  extension = NO_EXTENSION,
  clients = DEFAULT_CLIENTS,
  invoices = DEFAULT_INVOICES,
}: PaymentsModuleOptions = {}): PaymentsModule {
  const paths = paymentsPaths(basePath)
  return createModule({
    id: PAYMENTS_MODULE_ID,
    basePath,
    paths,
    pages: [
      { path: paths.payments, page: PAGES.list },
      { path: paths.newPayment(), page: PAGES.form },
      { path: `${paths.payments}/:id`, page: PAGES.record },
      { path: paths.refunds, page: PAGES.refunds },
      { path: paths.newRefund(), page: PAGES.refundForm },
      { path: `${paths.refunds}/:id`, page: PAGES.refund },
    ],
    // Адреса самого модуля (`/finance`) — список оплат.
    home: paths.payments,
    nav: [
      {
        id: "K4-payments",
        label: { uk: "Оплати", en: "Payments" },
        href: paths.payments,
        icon: MODULE_ICONS.K4,
        access: { resource: PAYMENTS, action: "read" },
      },
      {
        id: "K4-refunds",
        label: { uk: "Повернення", en: "Refunds" },
        href: paths.refunds,
        icon: ACTION_ICONS.refund,
        access: { resource: REFUNDS, action: "read" },
      },
    ],
    resources: PAYMENTS_RESOURCES,
    context: PaymentsModuleContext,
    value: { extension, paths, clients, invoices },
  })
}
