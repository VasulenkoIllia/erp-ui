import { useEffect, useMemo } from "react"
import { useForm } from "react-hook-form"

import { DocumentLinesEditor } from "@/components/erp/document-lines-editor"
import type { DocumentLinesValues } from "@/components/erp/document-lines-schema"
import { PageState, SectionSkeleton } from "@/components/erp/page-state"
import { errorStateKind } from "@/lib/api"

import {
  invoiceDetailSchema,
  type Invoice,
  type InvoiceDetail,
} from "../contract"
import { useInvoicesT } from "../use-invoices-t"

const NO_OPTIONS: readonly never[] = []

/**
 * Рядки й підсумки з відповіді картки: у рядку списку їх немає (`undefined` — ще не прийшли), зіпсовані —
 * помилка даних, а шапку однаково видно.
 */
export function useInvoiceDetail(record: unknown) {
  const parsed = useMemo(
    () =>
      typeof record === "object" && record !== null && "lines" in record
        ? invoiceDetailSchema.safeParse(record)
        : undefined,
    [record],
  )
  const error = parsed?.error
  useEffect(() => {
    if (error) console.error("K2-invoices: invoice lines response", error)
  }, [error])
  return parsed
}

export interface InvoiceLinesState {
  readonly isPending: boolean
  /** Збій запиту картки, коли шапка вже є з кешу списку. */
  readonly failure: unknown
  readonly onRetry: () => void
}

/**
 * Рядки збереженого рахунку лише для читання (UI05, ADR-0059): суми — сервера (`savedTotals` і `totals`
 * рядків), від 12 рядків — пошук і «До підсумків», як у формі.
 */
export function InvoiceLines({
  invoice,
  state,
}: {
  invoice: Invoice & Partial<InvoiceDetail>
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
        title={t("invoice.linesInvalid")}
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
  invoice: Invoice
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
