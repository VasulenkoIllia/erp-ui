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
  /** Кредит-ноти (ADR-0072): список, картка, зміна чернетки й друк; нову створює дія рахунку. */
  readonly creditNotes: string
  readonly creditNote: (id: string) => string
  readonly editCreditNote: (id: string) => string
  readonly printCreditNote: (id: string) => string
  /** Борги клієнтів за кошиками днів (ADR-0084): сторінка є лише з оплатами модуля K4. */
  readonly debts: string
}

/**
 * Адреси модуля без фабрики: їх бере модуль B3 (`createSalesModule({ invoices })`), щоб фабрики не
 * залежали одна від одної.
 */
export function invoicesPaths(basePath: string): InvoicesPaths {
  const base = basePath.replace(/\/+$/, "")
  const invoice = (id: string) => `${base}/invoices/${encodeURIComponent(id)}`
  const creditNote = (id: string) =>
    `${base}/credit-notes/${encodeURIComponent(id)}`
  return {
    invoices: `${base}/invoices`,
    invoice,
    newInvoice: `${base}/invoices/new`,
    editInvoice: (id) => `${invoice(id)}/edit`,
    printInvoice: (id) => `${invoice(id)}/print`,
    creditNotes: `${base}/credit-notes`,
    creditNote,
    editCreditNote: (id) => `${creditNote(id)}/edit`,
    printCreditNote: (id) => `${creditNote(id)}/print`,
    debts: `${base}/client-debts`,
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
 * «Борги клієнтів» — старіння боргу (ADR-0084): `buckets` — межі кошиків, днів після «Сплатити до» (за
 * замовчуванням `[30, 60, 90]`). Сторінка є лише з оплатами модуля K4 і цією опцією: бекенд має дати
 * `GET /sales-invoices/aging`.
 */
export interface InvoiceAging {
  readonly buckets?: readonly number[]
}

/**
 * Документи модуля B3, з яких виставляють рахунки (ADR-0070): адреси карток для потоку документів. Модуль
 * B3 не імпортується — лише адреси (`salesModule.paths`).
 */
export interface InvoiceSources {
  readonly order?: (id: string) => string
  readonly quote?: (id: string) => string
}

/** Рахунок, з картки якого реєструють оплату чи повернення. */
export interface PaymentFromInvoice {
  readonly clientId: string
  readonly invoiceId: string
}

/**
 * Документ модуля K4 для рахунку: ресурс для права дії й потоку документів, адреса нового документа з
 * клієнтом і рахунком, адреса картки.
 */
export interface InvoiceMoneyDocuments {
  readonly resource: string
  readonly register: (invoice: PaymentFromInvoice) => string
  readonly href?: (id: string) => string
}

/**
 * Оплати рахунку (модуль K4, ADR-0073): ресурс для права «Зареєструвати оплату» й потоку документів,
 * адреса нової оплати з клієнтом і рахунком, адреса картки оплати. `refunds` — повернення переплати
 * (ADR-0083): «Повернути переплату» на картці рахунку з переплатою. Модуль K4 не імпортується — лише
 * назви ресурсів і адреси (`paymentsModule.paths`).
 */
export interface InvoicePayments extends InvoiceMoneyDocuments {
  readonly refunds?: InvoiceMoneyDocuments
}

export interface InvoicesModuleContextValue {
  readonly extension: InvoicesExtension
  readonly paths: InvoicesPaths
  readonly clients: InvoiceClients
  readonly sources: InvoiceSources
  /** Валюти рахунку; без них рахунок у базовій валюті компанії, поля «Валюта» у формі немає. */
  readonly currencies?: InvoiceCurrencies | undefined
  /** Оплати модуля K4; без них на картці немає «Зареєструвати оплату». */
  readonly payments?: InvoicePayments | undefined
  /** Межі кошиків звіту «Борги клієнтів», днів прострочки (ADR-0084): з опції `aging` чи за замовчуванням. */
  readonly agingBuckets: readonly number[]
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
