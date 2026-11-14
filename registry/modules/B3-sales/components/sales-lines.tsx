import {
  DocumentSavedLines,
  useDocumentDetail,
  type DocumentLinesState,
} from "@/components/erp/document-lines-section"

import {
  salesDetailSchema,
  type SalesDocument,
  type SalesDocumentDetail,
} from "../contract"
import type { SalesKindBase } from "../sales-kinds"
import { useSalesT } from "../use-sales-t"

/**
 * Рядки й підсумки документа продажу з відповіді картки: у рядку списку їх немає (`undefined` — ще не
 * прийшли), зіпсовані — помилка даних, а шапку однаково видно.
 */
export const useSalesDetail = (record: unknown) =>
  useDocumentDetail(record, salesDetailSchema, "B3-sales")

export type SalesLinesState = DocumentLinesState

/** Рядки збереженого документа продажу лише для читання (UI05, ADR-0059). */
export function SalesLines({
  kind,
  document,
  state,
}: {
  kind: SalesKindBase
  document: SalesDocument & Partial<SalesDocumentDetail>
  state: SalesLinesState
}) {
  const t = useSalesT()
  const detail = useSalesDetail(document)
  return (
    <DocumentSavedLines
      detail={detail}
      document={document}
      state={state}
      invalidTitle={t(`${kind.keys.record}.linesInvalid`)}
    />
  )
}
