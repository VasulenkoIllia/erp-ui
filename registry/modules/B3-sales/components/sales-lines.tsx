import { useMemo } from "react"

import {
  DocumentSavedLines,
  useDocumentDetail,
  type DocumentLinesState,
} from "@/components/erp/document-lines-section"
import type { ExtensionField } from "@/lib/extension-fields"

import {
  salesDetailSchemaFor,
  type SalesDocument,
  type SalesDocumentDetail,
} from "../contract"
import { useSalesModule } from "../module-context"
import type { SalesDocumentKind } from "../sales-kinds"
import { useSalesT } from "../use-sales-t"

/** Поля розширення рядка документа продажу (`lineFields`, ADR-0086). */
export function useSalesLineFields<D extends SalesDocument, Due extends string>(
  kind: SalesDocumentKind<D, Due>,
) {
  const { extension } = useSalesModule()
  return kind.extensionOf(extension)?.lineFields
}

/** Схема рядків і підсумків із полями розширення рядка; стабільна, поки поля ті самі. */
export function useSalesDetailSchema(
  lineFields: readonly ExtensionField[] | undefined,
) {
  return useMemo(() => salesDetailSchemaFor(lineFields), [lineFields])
}

/**
 * Рядки й підсумки документа продажу з відповіді картки: у рядку списку їх немає (`undefined` — ще не
 * прийшли), зіпсовані — помилка даних, а шапку однаково видно.
 */
export function useSalesDetail(
  record: unknown,
  lineFields?: readonly ExtensionField[],
) {
  return useDocumentDetail(record, useSalesDetailSchema(lineFields), "B3-sales")
}

export type SalesLinesState = DocumentLinesState

/** Рядки збереженого документа продажу лише для читання (UI05, ADR-0059). */
export function SalesLines<D extends SalesDocument, Due extends string>({
  kind,
  document,
  state,
}: {
  kind: SalesDocumentKind<D, Due>
  document: SalesDocument & Partial<SalesDocumentDetail>
  state: SalesLinesState
}) {
  const t = useSalesT()
  const lineFields = useSalesLineFields(kind)
  const detail = useSalesDetail(document, lineFields)
  return (
    <DocumentSavedLines
      detail={detail}
      document={document}
      state={state}
      invalidTitle={t(`${kind.keys.record}.linesInvalid`)}
      lineFields={lineFields}
    />
  )
}
