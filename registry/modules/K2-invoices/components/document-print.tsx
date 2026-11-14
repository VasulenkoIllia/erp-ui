import type { ReactNode } from "react"

import { PrintPreview, printPreviewState } from "@/components/erp/print-preview"
import { BackToList } from "@/components/erp/record-link"
import { useCardRecord } from "@/hooks/use-card-record"
import { useCompanyProfile } from "@/hooks/use-company-profile"
import { usePageHeading } from "@/hooks/use-page-heading"
import type { CompanyProfile } from "@/lib/company"
import { toLanguage, useLanguage } from "@/lib/i18n"

import type { InvoiceDetail, K2Document } from "../contract"
import type { K2DocumentKind } from "../document-kind"
import { useInvoicesModule } from "../module-context"
import {
  useInvoicesSheetT,
  useInvoicesT,
  type InvoicesSheetT,
} from "../use-invoices-t"
import { useDocumentTitle } from "./invoice-display"
import { useInvoiceDetail, useInvoiceLineFields } from "./invoice-lines"

interface DocumentPrintProps<D extends K2Document> {
  readonly kind: K2DocumentKind
  readonly id: string
  /** Назва аркуша рядками модуля мовою документа: заголовок PDF і вкладки друку. */
  readonly sheetTitle: (document: D, t: InvoicesSheetT) => string
  /** Пояснення над аркушем (на папір не йде), коли воно потрібне. */
  readonly notice?: (document: D, detail: InvoiceDetail) => ReactNode
  readonly sheet: (
    document: D,
    detail: InvoiceDetail,
    company: CompanyProfile,
  ) => ReactNode
}

/**
 * Сторінка друку документа модуля (PF08, ADR-0062): один аркуш A4 мовою документа (`company.language`),
 * «Друкувати» — діалог друку браузера, PDF — «Зберегти як PDF». Вкладка й фокус після переходу — як на
 * картці: «Друк: Рахунок РХ-2026-0001». Рядки не за контрактом чи картка без рядків — помилка даних, а не
 * вічне завантаження.
 */
export function DocumentPrint<D extends K2Document>({
  kind,
  id,
  sheetTitle,
  notice,
  sheet,
}: DocumentPrintProps<D>) {
  const t = useInvoicesT()
  const titleOf = useDocumentTitle(kind)
  const ui = useLanguage()
  const { paths } = useInvoicesModule()
  const card = useCardRecord<D & Partial<InvoiceDetail>>(kind.resource, id)
  const company = useCompanyProfile()
  const document = card.record
  const detail = useInvoiceDetail(document, useInvoiceLineFields(kind))
  const language = company.data?.language ?? ui.language
  // Тексти аркуша — рядки модуля мовою документа: поки їх немає, аркуш чекає, а не блимає іншою мовою.
  const sheetT = useInvoicesSheetT(toLanguage(language))
  // Аркуш — лише з картки, свіжої з сервера: суми до сплати й QR-код оплати не беруться зі збереженої в
  // браузері, яку картка показує на мить, доки не прийде відповідь (ADR-0083).
  const isReady = Boolean(
    document &&
    detail?.success &&
    company.data &&
    card.isFresh &&
    !sheetT.isLoading,
  )
  const invalid =
    detail?.error ??
    (document && !detail && !card.isFetching
      ? new Error("no lines")
      : undefined)
  const state = printPreviewState(
    card.pageError ?? card.failure ?? invalid ?? company.error,
    !isReady,
  )
  const pageTitle = t(`${kind.key}.printTitle`, {
    title: document ? titleOf(document) : t(`${kind.key}.title`),
  })
  const heading = usePageHeading(
    pageTitle,
    !card.isPending || card.pageError !== undefined,
  )
  return (
    <div className="space-y-4">
      <h1 ref={heading} tabIndex={-1} className="sr-only">
        {pageTitle}
      </h1>
      {isReady && document && detail?.success
        ? notice?.(document, detail.data)
        : null}
      <PrintPreview
        title={
          document
            ? `${sheetTitle(document, sheetT.t)} ${document.number ?? ""}`.trim()
            : ""
        }
        language={language}
        state={state}
        onRetry={() => {
          card.retry()
          void company.refetch()
        }}
        actions={
          <BackToList
            to={kind.pathsOf(paths).record(id)}
            label={t(`${kind.key}Form.back`)}
          />
        }
      >
        {isReady && document && detail?.success && company.data
          ? sheet(document, detail.data, company.data)
          : null}
      </PrintPreview>
    </div>
  )
}
