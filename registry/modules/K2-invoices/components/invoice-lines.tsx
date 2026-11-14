import {
  DocumentSavedLines,
  useDocumentDetail,
  type DocumentLinesState,
} from "@/components/erp/document-lines-section"

import {
  invoiceDetailSchema,
  type InvoiceDetail,
  type K2Document,
} from "../contract"
import type { K2DocumentKind } from "../document-kind"
import { useInvoicesT } from "../use-invoices-t"

/** Рядки й підсумки рахунку (і кредит-ноти на картці й аркуші: та сама схема рядків). */
export const useInvoiceDetail = (record: unknown) =>
  useDocumentDetail(record, invoiceDetailSchema, "K2-invoices")

export type InvoiceLinesState = DocumentLinesState

/**
 * Рядки збереженого документа лише для читання (UI05, ADR-0059). Рядки кредит-ноти — лише товари, тож та
 * сама схема рядків рахунку.
 */
export function InvoiceLines({
  kind,
  invoice,
  state,
}: {
  kind: K2DocumentKind
  invoice: K2Document & Partial<InvoiceDetail>
  state: InvoiceLinesState
}) {
  const t = useInvoicesT()
  const detail = useInvoiceDetail(invoice)
  return (
    <DocumentSavedLines
      detail={detail}
      document={invoice}
      state={state}
      invalidTitle={t(`${kind.key}.linesInvalid`)}
    />
  )
}
