/**
 * Рахунок модуля K2 для сторінок і компонентів (ADR-0070): тони й підписи статусів, основний шлях етапів,
 * свої підписи й підтвердження дій, адреси сторінок. Наступний документ модуля (кредит-нота K2b) стане
 * поруч своїм описом.
 */
import type { StatusTone } from "@/lib/statuses"

import { INVOICE_STATUSES, type InvoiceStatus } from "./contract"
import type { InvoicesPaths } from "./module-context"
import type { InvoicesKey } from "./use-invoices-t"

/** Параметр адреси нової форми з документом, який копіюють: `…/new?copy=<id>`. */
export const COPY_PARAM = "copy"

/** Адреси сторінок рахунку від `basePath` фабрики. */
export interface InvoiceDocumentPaths {
  readonly list: string
  readonly record: (id: string) => string
  readonly create: string
  /** Нова форма, заповнена рахунком `id` («Копіювати»). */
  readonly copy: (id: string) => string
  readonly edit: (id: string) => string
  readonly print: (id: string) => string
}

export function invoiceDocumentPaths(
  paths: InvoicesPaths,
): InvoiceDocumentPaths {
  return {
    list: paths.invoices,
    record: paths.invoice,
    create: paths.newInvoice,
    copy: (id) =>
      `${paths.newInvoice}?${new URLSearchParams({ [COPY_PARAM]: id }).toString()}`,
    edit: paths.editInvoice,
    print: paths.printInvoice,
  }
}

const TONES: Record<InvoiceStatus, StatusTone> = {
  draft: "neutral",
  issued: "info",
  cancelled: "destructive",
  reversed: "warning",
  reversal: "neutral",
}

/** Статуси рахунку з тоном і ключем підпису. */
export const INVOICE_STATUS_ITEMS = INVOICE_STATUSES.map((id) => ({
  id,
  tone: TONES[id],
  label: `invoice.statuses.${id}` as const,
}))

/** Основний шлях для смуги етапів; решта статусів — бейджем. */
export const INVOICE_MAIN_PATH: readonly string[] = ["draft", "issued"]

/** Дії зі своїм підписом модуля; решта — підписи кіта (`documentActions.<дія>`). */
export const INVOICE_ACTION_LABELS: Readonly<
  Partial<Record<string, InvoicesKey>>
> = { submit: "invoice.actions.submit" }

/** Дії зі своїми текстами підтвердження: «Виставити рахунок?» замість «Провести документ?». */
export const INVOICE_CONFIRMS: Readonly<
  Partial<Record<string, "invoice.confirm.submit">>
> = { submit: "invoice.confirm.submit" }
