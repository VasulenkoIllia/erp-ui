import type { RaRecord } from "ra-core"
import { createContext, useContext } from "react"

import type { DocumentLineItem } from "@/components/erp/document-line-fields"

import type { SalesExtension } from "./extension"

/** Адреси сторінок модуля від `basePath` фабрики. */
export interface SalesPaths {
  readonly quotes: string
  readonly quote: (id: string) => string
  readonly newQuote: string
  readonly editQuote: (id: string) => string
  /** Друк: окрема сторінка з одним аркушем (ADR-0062). */
  readonly printQuote: (id: string) => string
}

export function salesPaths(basePath: string): SalesPaths {
  const base = basePath.replace(/\/+$/, "")
  const quote = (id: string) => `${base}/quotes/${encodeURIComponent(id)}`
  return {
    quotes: `${base}/quotes`,
    quote,
    newQuote: `${base}/quotes/new`,
    editQuote: (id) => `${quote(id)}/edit`,
    printQuote: (id) => `${quote(id)}/print`,
  }
}

/** Клієнт пропозиції: ресурс, з якого його вибирають, і картка клієнта, якщо вона є в проекті. */
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

export interface SalesModuleContextValue {
  readonly extension: SalesExtension
  readonly paths: SalesPaths
  readonly clients: SalesClients
  /** Вибір товару чи послуги в рядку з ресурсу проекту; без нього — рядок вільним текстом. */
  readonly lineItem?: DocumentLineItem<RaRecord> | undefined
  /** Прогріти чанк сторінки модуля за адресою (наведення чи фокус на посиланні, ADR-0009). */
  readonly preload: (pathname: string) => void
}

/** Розширення й адреси для сторінок модуля: їх дає фабрика в маршрутах. */
export const SalesModuleContext = createContext<SalesModuleContextValue | null>(
  null,
)

export function useSalesModule(): SalesModuleContextValue {
  const value = useContext(SalesModuleContext)
  if (!value)
    throw new Error(
      "B3-sales: page rendered outside routes of createSalesModule()",
    )
  return value
}
