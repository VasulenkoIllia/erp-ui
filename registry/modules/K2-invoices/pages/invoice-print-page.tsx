import { useAuthenticated } from "ra-core"
import { useParams } from "react-router"

import { PageSkeleton } from "@/components/erp/page-state"
import { PrintPreview, printPreviewState } from "@/components/erp/print-preview"
import { BackToList } from "@/components/erp/record-link"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useCardRecord } from "@/hooks/use-card-record"
import { useCompanyProfile } from "@/hooks/use-company-profile"
import { usePageHeading } from "@/hooks/use-page-heading"
import { toLanguage, useLanguage } from "@/lib/i18n"

import { useInvoiceTitle } from "../components/invoice-display"
import { useInvoiceDetail } from "../components/invoice-lines"
import { invoicePaymentQr } from "../components/invoice-payment"
import { InvoiceSheet, invoiceSheetTitle } from "../components/invoice-sheet"
import { INVOICES, type Invoice, type InvoiceDetail } from "../contract"
import { invoiceDocumentPaths } from "../invoice-kind"
import { useInvoicesModule } from "../module-context"
import { useInvoicesT } from "../use-invoices-t"

/**
 * Друк рахунку (PF08, ADR-0062, ADR-0070): окрема сторінка картки з одним аркушем A4 мовою документа
 * (`company.language`), «Друкувати» — діалог друку браузера, PDF — «Зберегти як PDF». Виставлений рахунок
 * без QR-коду оплати (реквізити постачальника неповні, валюта не гривня) — пояснення над аркушем, на папір
 * воно не йде.
 */
export function InvoicePrintPage() {
  const { id = "" } = useParams()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  return isPending ? (
    <PageSkeleton rows={6} />
  ) : (
    <InvoicePrint key={id} id={id} />
  )
}

function InvoicePrint({ id }: { id: string }) {
  const t = useInvoicesT()
  const titleOf = useInvoiceTitle()
  const ui = useLanguage()
  const { paths } = useInvoicesModule()
  const card = useCardRecord<Invoice & Partial<InvoiceDetail>>(INVOICES, id)
  const company = useCompanyProfile()
  const invoice = card.record
  const detail = useInvoiceDetail(invoice)
  const language = company.data?.language ?? ui.language
  const isReady = Boolean(invoice && detail?.success && company.data)
  // Рядки не за контрактом чи картка без рядків — помилка даних, а не вічне завантаження.
  const invalid =
    detail?.error ??
    (invoice && !detail && !card.isFetching ? new Error("no lines") : undefined)
  const state = printPreviewState(
    card.pageError ?? card.failure ?? invalid ?? company.error,
    !isReady,
  )
  // Вкладка й фокус після переходу — як на картці: «Друк: Рахунок РХ-2026-0001».
  const pageTitle = t("invoice.printTitle", {
    title: invoice ? titleOf(invoice) : t("invoice.title"),
  })
  const heading = usePageHeading(
    pageTitle,
    !card.isPending || card.pageError !== undefined,
  )
  const qr =
    invoice && detail?.success
      ? invoicePaymentQr(invoice, detail.data.totals)
      : null
  return (
    <div className="space-y-4">
      <h1 ref={heading} tabIndex={-1} className="sr-only">
        {pageTitle}
      </h1>
      {qr && !qr.ok ? (
        <Alert data-print="hide" data-slot="invoice-qr-missing">
          <AlertDescription>
            {/* Рахунок у валюті без QR — так і має бути (ADR-0071): реквізити вписують у рахунок, а не в профіль. */}
            {qr.issue === "currency" && invoice
              ? t("invoice.qr.foreignCurrency", { currency: invoice.currency })
              : t("invoice.qr.missing", {
                  reason: t(`invoice.qr.issues.${qr.issue}`),
                })}
          </AlertDescription>
        </Alert>
      ) : null}
      <PrintPreview
        title={
          invoice
            ? `${invoiceSheetTitle(invoice, toLanguage(language))} ${invoice.number ?? ""}`.trim()
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
            to={invoiceDocumentPaths(paths).record(id)}
            label={t("invoiceForm.back")}
          />
        }
      >
        {invoice && detail?.success && company.data ? (
          <InvoiceSheet
            invoice={invoice}
            detail={detail.data}
            company={company.data}
          />
        ) : null}
      </PrintPreview>
    </div>
  )
}
