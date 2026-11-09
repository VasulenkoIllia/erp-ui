import { useEffect, useMemo } from "react"
import { useForm } from "react-hook-form"

import { DocumentLinesEditor } from "@/components/erp/document-lines-editor"
import type { DocumentLinesValues } from "@/components/erp/document-lines-schema"
import { PageState, SectionSkeleton } from "@/components/erp/page-state"
import { errorStateKind } from "@/lib/api"

import {
  salesDetailSchema,
  type SalesDocument,
  type SalesDocumentDetail,
} from "../contract"
import type { SalesKindBase } from "../sales-kinds"
import { useSalesT } from "../use-sales-t"

const NO_OPTIONS: readonly never[] = []

/**
 * Рядки й підсумки з відповіді картки: у рядку списку їх немає (`undefined` — ще не прийшли), зіпсовані —
 * помилка даних, а шапку однаково видно.
 */
export function useSalesDetail(record: unknown) {
  const parsed = useMemo(
    () =>
      typeof record === "object" && record !== null && "lines" in record
        ? salesDetailSchema.safeParse(record)
        : undefined,
    [record],
  )
  const error = parsed?.error
  useEffect(() => {
    if (error) console.error("B3-sales: document lines response", error)
  }, [error])
  return parsed
}

export interface SalesLinesState {
  readonly isPending: boolean
  /** Збій запиту картки, коли шапка вже є з кешу списку. */
  readonly failure: unknown
  readonly onRetry: () => void
}

/**
 * Рядки збереженого документа лише для читання (UI05, ADR-0059): суми — сервера (`savedTotals` і
 * `totals` рядків), від 12 рядків — пошук і «До підсумків», як у формі.
 */
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
  if (!detail?.success) {
    if (!detail && state.isPending) return <SectionSkeleton rows={4} />
    // Немає відповіді картки — помилка запиту; є, але рядки не за контрактом — помилка даних.
    return !detail ? (
      <PageState
        kind={state.failure ? errorStateKind(state.failure) : "error"}
        headingLevel={3}
        onRetry={state.onRetry}
      />
    ) : (
      <PageState
        kind="error"
        headingLevel={3}
        title={t(`${kind.keys.record}.linesInvalid`)}
        onRetry={state.onRetry}
      />
    )
  }
  return <SavedLines document={document} detail={detail.data} />
}

function SavedLines({
  document,
  detail,
}: {
  document: SalesDocument
  detail: SalesDocumentDetail
}) {
  // Форма лише тримає значення для редактора рядків: збережений документ не редагується тут.
  const form = useForm<DocumentLinesValues>({
    values: {
      lines: detail.lines,
      discountPercent: document.discountPercent,
      discountAmount: document.discountAmount,
    },
  })
  return (
    <DocumentLinesEditor
      form={form}
      currency={document.currency}
      units={NO_OPTIONS}
      taxes={NO_OPTIONS}
      readOnly
      savedTotals={detail.totals}
    />
  )
}
