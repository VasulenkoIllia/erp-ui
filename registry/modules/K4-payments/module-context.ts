import type { RaRecord } from "ra-core"
import { createContext, useContext } from "react"

import type { PaymentsExtension } from "./extension"

/** Параметри адреси нової оплати чи повернення: клієнт і рахунок, з картки якого документ створюють. */
export const NEW_PAYMENT_PARAMS = {
  client: "client",
  invoice: "invoice",
} as const

/** Рахунок, з картки якого створюють оплату чи повернення. */
export interface PaymentSourceInvoice {
  readonly clientId: string
  readonly invoiceId: string
}

/** Адреси сторінок модуля від `basePath` фабрики. */
export interface PaymentsPaths {
  readonly payments: string
  readonly payment: (id: string) => string
  /** Нова оплата; з рахунком — клієнт і цей рахунок уже вибрано, сума — його борг. */
  readonly newPayment: (from?: PaymentSourceInvoice) => string
  /** Повернення клієнтам (ADR-0083): список, картка й нове. */
  readonly refunds: string
  readonly refund: (id: string) => string
  /** Нове повернення; з рахунком — клієнт і цей рахунок уже вибрано, сума — його переплата. */
  readonly newRefund: (from?: PaymentSourceInvoice) => string
}

/** Адреса нового документа в списку `list`: з рахунком — його клієнт і `id` у параметрах. */
const newIn = (list: string) => (from?: PaymentSourceInvoice) =>
  from
    ? `${list}/new?${new URLSearchParams({
        [NEW_PAYMENT_PARAMS.client]: from.clientId,
        [NEW_PAYMENT_PARAMS.invoice]: from.invoiceId,
      }).toString()}`
    : `${list}/new`

/**
 * Адреси модуля без фабрики: їх бере модуль K2 (`createInvoicesModule({ payments })`), щоб фабрики не
 * залежали одна від одної.
 */
export function paymentsPaths(basePath: string): PaymentsPaths {
  const base = basePath.replace(/\/+$/, "")
  const payments = `${base}/payments`
  const refunds = `${base}/refunds`
  return {
    payments,
    payment: (id) => `${payments}/${encodeURIComponent(id)}`,
    newPayment: newIn(payments),
    refunds,
    refund: (id) => `${refunds}/${encodeURIComponent(id)}`,
    newRefund: newIn(refunds),
  }
}

/** Клієнт оплати: ресурс, з якого його вибирають, і картка клієнта. */
export interface PaymentClients {
  /** Ресурс API клієнтів: `organizations` модуля B1 чи свій ресурс проекту. */
  readonly resource: string
  /** Поле назви клієнта в записі ресурсу. */
  readonly labelField: string
  /** Другий рядок варіанта вибору: код ЄДРПОУ, місто. */
  readonly descriptionField?: string
  /** Адреса картки клієнта; без неї назва в оплаті — текст, а не посилання. */
  readonly href?: (id: string) => string
}

/**
 * Рахунки, за якими платять (модуль K2): ресурс для потоку документів і адреса картки рахунку. Модуль K2
 * не імпортується — лише назва ресурсу й адреса (`invoicesModule.paths.invoice`).
 */
export interface PaymentInvoicesLink {
  readonly resource: string
  readonly href?: (id: string) => string
}

export interface PaymentsModuleContextValue {
  readonly extension: PaymentsExtension
  readonly paths: PaymentsPaths
  readonly clients: PaymentClients
  readonly invoices: PaymentInvoicesLink
  /** Прогріти чанк сторінки модуля за адресою (наведення чи фокус на посиланні, ADR-0009). */
  readonly preload: (pathname: string) => void
}

/** Розширення й адреси для сторінок модуля: їх дає фабрика в маршрутах. */
export const PaymentsModuleContext =
  createContext<PaymentsModuleContextValue | null>(null)

export function usePaymentsModule(): PaymentsModuleContextValue {
  const value = useContext(PaymentsModuleContext)
  if (!value)
    throw new Error(
      "K4-payments: page rendered outside routes of createPaymentsModule()",
    )
  return value
}

/** Назва клієнта з запису ресурсу клієнтів: поле назви чи `id`. */
export function clientLabelOf(clients: PaymentClients) {
  return (record: RaRecord): string => {
    const value: unknown = record[clients.labelField]
    return typeof value === "string" && value ? value : String(record.id)
  }
}
