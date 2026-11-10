import type { RaRecord } from "ra-core"
import { createContext, useContext } from "react"

import type { DocumentLineItem } from "@/components/erp/document-line-fields"
import type { PartyDetails } from "@/lib/document-parties"

import type { InvoicesExtension } from "./extension"

/** Адреси сторінок модуля від `basePath` фабрики. */
export interface InvoicesPaths {
  readonly invoices: string
  readonly invoice: (id: string) => string
  readonly newInvoice: string
  readonly editInvoice: (id: string) => string
  /** Друк: окрема сторінка з одним аркушем (ADR-0062). */
  readonly printInvoice: (id: string) => string
}

/**
 * Адреси модуля без фабрики: їх бере модуль B3 (`createSalesModule({ invoices })`), щоб фабрики не
 * залежали одна від одної.
 */
export function invoicesPaths(basePath: string): InvoicesPaths {
  const base = basePath.replace(/\/+$/, "")
  const invoice = (id: string) => `${base}/invoices/${encodeURIComponent(id)}`
  return {
    invoices: `${base}/invoices`,
    invoice,
    newInvoice: `${base}/invoices/new`,
    editInvoice: (id) => `${invoice(id)}/edit`,
    printInvoice: (id) => `${invoice(id)}/print`,
  }
}

/** Клієнт рахунку: ресурс, з якого його вибирають, картка й реквізити покупця. */
export interface InvoiceClients {
  /** Ресурс API клієнтів: `organizations` модуля B1 чи свій ресурс проекту. */
  readonly resource: string
  /** Поле назви клієнта в записі ресурсу. */
  readonly labelField: string
  /** Другий рядок варіанта вибору: код ЄДРПОУ, місто. */
  readonly descriptionField?: string
  /** Адреса картки клієнта; без неї назва в рахунку — текст, а не посилання. */
  readonly href?: (id: string) => string
  /**
   * Реквізити покупця з запису клієнта (ADR-0068): ними заповнюються порожні поля сторони. Без функції —
   * лише назва клієнта.
   */
  readonly party?: (record: RaRecord) => Partial<PartyDetails>
}

/**
 * Валюти рахунку (ADR-0071): ресурс валют компанії з полями `code` (ISO 4217) і `active`, як `currencies`
 * модуля A1. Базова валюта компанії є у виборі завжди, вимкнена валюта — лише в рахунку, де вона вже стоїть.
 */
export interface InvoiceCurrencies {
  readonly resource: string
}

/**
 * Документи модуля B3, з яких виставляють рахунки (ADR-0070): адреси карток для потоку документів. Модуль
 * B3 не імпортується — лише адреси (`salesModule.paths`).
 */
export interface InvoiceSources {
  readonly order?: (id: string) => string
  readonly quote?: (id: string) => string
}

export interface InvoicesModuleContextValue {
  readonly extension: InvoicesExtension
  readonly paths: InvoicesPaths
  readonly clients: InvoiceClients
  readonly sources: InvoiceSources
  /** Валюти рахунку; без них рахунок у базовій валюті компанії, поля «Валюта» у формі немає. */
  readonly currencies?: InvoiceCurrencies | undefined
  /** Вибір товару чи послуги в рядку з ресурсу проекту; без нього — рядок вільним текстом. */
  readonly lineItem?: DocumentLineItem<RaRecord> | undefined
  /** Прогріти чанк сторінки модуля за адресою (наведення чи фокус на посиланні, ADR-0009). */
  readonly preload: (pathname: string) => void
}

/** Розширення й адреси для сторінок модуля: їх дає фабрика в маршрутах. */
export const InvoicesModuleContext =
  createContext<InvoicesModuleContextValue | null>(null)

export function useInvoicesModule(): InvoicesModuleContextValue {
  const value = useContext(InvoicesModuleContext)
  if (!value)
    throw new Error(
      "K2-invoices: page rendered outside routes of createInvoicesModule()",
    )
  return value
}
