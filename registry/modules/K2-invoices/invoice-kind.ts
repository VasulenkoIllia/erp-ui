/**
 * Рахунок модуля K2 для сторінок і компонентів (ADR-0070): статуси, граф дій зі своїми підписами й
 * підтвердженнями, етапи, адреси сторінок. Кредит-нота (ADR-0072) — поруч своїм описом
 * (`credit-note-kind.ts`), спільний тип — `document-kind.ts`.
 */
import {
  CREATE_CREDIT_NOTE,
  INVOICE_STATUSES,
  INVOICE_TRANSITIONS,
  INVOICES,
} from "./contract"
import { DOCUMENT_TONES, type K2DocumentKind } from "./document-kind"
import type { InvoicesPaths } from "./module-context"

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

/** Рахунок: «Виставити» зі своїм підтвердженням, «Кредит-нота» — документ на підставі (ADR-0072). */
export const INVOICE_KIND: K2DocumentKind = {
  resource: INVOICES,
  key: "invoice",
  statuses: INVOICE_STATUSES.map((id) => ({
    id,
    tone: DOCUMENT_TONES[id],
    label: `invoice.statuses.${id}`,
  })),
  transitions: INVOICE_TRANSITIONS,
  actionLabels: {
    submit: "invoice.actions.submit",
    [CREATE_CREDIT_NOTE]: "invoice.actions.creditNote",
  },
  confirms: { submit: "invoice.confirm.submit" },
  mainPath: ["draft", "issued", "paid"],
  pathsOf: invoiceDocumentPaths,
  extensionOf: (extension) => extension.invoices,
}
