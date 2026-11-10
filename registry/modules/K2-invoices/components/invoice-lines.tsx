import { useEffect, useMemo } from "react"
import { useForm } from "react-hook-form"
import type { z } from "zod"

import { DocumentLinesEditor } from "@/components/erp/document-lines-editor"
import type { DocumentLinesValues } from "@/components/erp/document-lines-schema"
import { PageState, SectionSkeleton } from "@/components/erp/page-state"
import { errorStateKind } from "@/lib/api"

import {
  invoiceDetailSchema,
  type InvoiceDetail,
  type K2Document,
} from "../contract"
import type { K2DocumentKind } from "../document-kind"
import { useInvoicesT } from "../use-invoices-t"

const NO_OPTIONS: readonly never[] = []

/**
 * Рядки й підсумки з відповіді картки: у рядку списку їх немає (`undefined` — ще не прийшли), зіпсовані —
 * помилка даних, а шапку однаково видно.
 */
export function useDocumentDetail<S extends z.ZodType>(
  record: unknown,
  schema: S,
) {
  const parsed = useMemo(
    () =>
      typeof record === "object" && record !== null && "lines" in record
        ? schema.safeParse(record)
        : undefined,
    [record, schema],
  )
  const error = parsed?.error
  useEffect(() => {
    if (error) console.error("K2-invoices: document lines response", error)
  }, [error])
  return parsed
}

/** Рядки й підсумки рахунку (і кредит-ноти на картці й аркуші: та сама схема рядків). */
export const useInvoiceDetail = (record: unknown) =>
  useDocumentDetail(record, invoiceDetailSchema)

export interface InvoiceLinesState {
  readonly isPending: boolean
  /** Збій запиту картки, коли шапка вже є з кешу списку. */
  readonly failure: unknown
  readonly onRetry: () => void
}

/**
 * Рядки збереженого документа лише для читання (UI05, ADR-0059): суми — сервера (`savedTotals` і `totals`
 * рядків), від 12 рядків — пошук і «До підсумків», як у формі. Рядки кредит-ноти — лише товари, тож та
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
        title={t(`${kind.key}.linesInvalid`)}
        onRetry={state.onRetry}
      />
    )
  }
  return <SavedLines invoice={invoice} detail={detail.data} />
}

function SavedLines({
  invoice,
  detail,
}: {
  invoice: K2Document
  detail: InvoiceDetail
}) {
  // Форма лише тримає значення для редактора рядків: збережений документ не редагується тут.
  const form = useForm<DocumentLinesValues>({
    values: {
      lines: detail.lines,
      discountPercent: invoice.discountPercent,
      discountAmount: invoice.discountAmount,
    },
  })
  return (
    <DocumentLinesEditor
      form={form}
      currency={invoice.currency}
      units={NO_OPTIONS}
      taxes={NO_OPTIONS}
      readOnly
      savedTotals={detail.totals}
    />
  )
}
