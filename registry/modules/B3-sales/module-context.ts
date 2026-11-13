import type { RaRecord } from "ra-core"

import type { DocumentLineItem } from "@/components/erp/document-line-fields"
import { createModuleContext, type ModuleContextValue } from "@/lib/module"

import type { SalesExtension } from "./extension"

/** Адреси сторінок модуля від `basePath` фабрики. */
export interface SalesPaths {
  readonly quotes: string
  readonly quote: (id: string) => string
  readonly newQuote: string
  readonly editQuote: (id: string) => string
  /** Друк: окрема сторінка з одним аркушем (ADR-0062). */
  readonly printQuote: (id: string) => string
  readonly orders: string
  readonly order: (id: string) => string
  readonly newOrder: string
  readonly editOrder: (id: string) => string
  readonly printOrder: (id: string) => string
  /** Картка рахунку модуля K2 (`invoices` фабрики); без неї «Виставити рахунок» немає. */
  readonly invoice?: (id: string) => string
}

/** Рахунки модуля K2 у проекті (ADR-0070): модуль не імпортується, лише адреса картки рахунку. */
export interface SalesInvoices {
  /** Картка рахунку: `invoicesPaths(basePath).invoice` модуля K2. */
  readonly href: (id: string) => string
}

export function salesPaths(
  basePath: string,
  invoices?: SalesInvoices,
): SalesPaths {
  const base = basePath.replace(/\/+$/, "")
  const quote = (id: string) => `${base}/quotes/${encodeURIComponent(id)}`
  const order = (id: string) => `${base}/orders/${encodeURIComponent(id)}`
  return {
    quotes: `${base}/quotes`,
    quote,
    newQuote: `${base}/quotes/new`,
    editQuote: (id) => `${quote(id)}/edit`,
    printQuote: (id) => `${quote(id)}/print`,
    orders: `${base}/orders`,
    order,
    newOrder: `${base}/orders/new`,
    editOrder: (id) => `${order(id)}/edit`,
    printOrder: (id) => `${order(id)}/print`,
    ...(invoices ? { invoice: invoices.href } : {}),
  }
}

/** Клієнт документа: ресурс, з якого його вибирають, і картка клієнта, якщо вона є в проекті. */
export interface SalesClients {
  /** Ресурс API клієнтів: `organizations` модуля B1 чи свій ресурс проекту. */
  readonly resource: string
  /** Поле назви клієнта в записі ресурсу. */
  readonly labelField: string
  /** Другий рядок варіанта вибору: код ЄДРПОУ, місто. */
  readonly descriptionField?: string
  /** Адреса картки клієнта; без неї назва в пропозиції — текст, а не посилання. */
  readonly href?: (id: string) => string
}

export interface SalesModuleContextValue extends ModuleContextValue<
  SalesExtension,
  SalesPaths
> {
  readonly clients: SalesClients
  /** Вибір товару чи послуги в рядку з ресурсу проекту; без нього — рядок вільним текстом. */
  readonly lineItem?: DocumentLineItem<RaRecord> | undefined
}

/** Розширення й адреси для сторінок модуля: їх дає фабрика в маршрутах. */
export const [SalesModuleContext, useSalesModule] =
  createModuleContext<SalesModuleContextValue>("B3-sales", "createSalesModule")
