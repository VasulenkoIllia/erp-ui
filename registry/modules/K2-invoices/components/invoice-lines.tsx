import { useMemo } from "react"

import {
  DocumentSavedLines,
  useDocumentDetail,
  type DocumentLinesState,
} from "@/components/erp/document-lines-section"
import type { ExtensionField } from "@/lib/extension-fields"

import {
  invoiceDetailSchemaFor,
  type InvoiceDetail,
  type K2Document,
} from "../contract"
import type { K2DocumentKind } from "../document-kind"
import { useInvoicesModule } from "../module-context"
import { useInvoicesT } from "../use-invoices-t"

/** Поля розширення рядка документа (`lineFields`, ADR-0086): лише в рахунку. */
export function useInvoiceLineFields(kind: K2DocumentKind) {
  const { extension } = useInvoicesModule()
  return kind.extensionOf(extension)?.lineFields
}

/** Схема рядків і підсумків із полями розширення рядка; стабільна, поки поля ті самі. */
export function useInvoiceDetailSchema(
  lineFields: readonly ExtensionField[] | undefined,
) {
  return useMemo(() => invoiceDetailSchemaFor(lineFields), [lineFields])
}

/** Рядки й підсумки рахунку (і кредит-ноти на картці й аркуші: та сама схема рядків). */
export function useInvoiceDetail(
  record: unknown,
  lineFields?: readonly ExtensionField[],
) {
  return useDocumentDetail(
    record,
    useInvoiceDetailSchema(lineFields),
    "K2-invoices",
  )
}

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
  const lineFields = useInvoiceLineFields(kind)
  const detail = useInvoiceDetail(invoice, lineFields)
  return (
    <DocumentSavedLines
      detail={detail}
      document={invoice}
      state={state}
      invalidTitle={t(`${kind.key}.linesInvalid`)}
      lineFields={lineFields}
    />
  )
}
