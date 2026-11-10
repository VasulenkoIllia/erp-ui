import { useAuthenticated } from "ra-core"
import { useParams } from "react-router"

import { PageSkeleton } from "@/components/erp/page-state"
import { Alert, AlertDescription } from "@/components/ui/alert"

import { DocumentPrint } from "../components/document-print"
import { invoicePaymentQr } from "../components/invoice-payment"
import { InvoiceSheet, invoiceSheetTitle } from "../components/invoice-sheet"
import type { Invoice, InvoiceDetail } from "../contract"
import { INVOICE_KIND } from "../invoice-kind"
import { useInvoicesT } from "../use-invoices-t"

/**
 * Друк рахунку (PF08, ADR-0062, ADR-0070): аркуш A4 мовою документа на спільній сторінці друку модуля.
 * Виставлений рахунок без QR-коду оплати (реквізити постачальника неповні, валюта не гривня) — пояснення
 * над аркушем, на папір воно не йде.
 */
export function InvoicePrintPage() {
  const { id = "" } = useParams()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  return isPending ? (
    <PageSkeleton rows={6} />
  ) : (
    <DocumentPrint<Invoice>
      key={id}
      kind={INVOICE_KIND}
      id={id}
      sheetTitle={invoiceSheetTitle}
      notice={(invoice, detail) => (
        <QrNotice invoice={invoice} detail={detail} />
      )}
      sheet={(invoice, detail, company) => (
        <InvoiceSheet invoice={invoice} detail={detail} company={company} />
      )}
    />
  )
}

function QrNotice({
  invoice,
  detail,
}: {
  invoice: Invoice
  detail: InvoiceDetail
}) {
  const t = useInvoicesT()
  const qr = invoicePaymentQr(invoice, detail.totals)
  if (!qr || qr.ok) return null
  return (
    <Alert data-print="hide" data-slot="invoice-qr-missing">
      <AlertDescription>
        {/* Рахунок у валюті без QR — так і має бути (ADR-0071): реквізити вписують у рахунок, а не в профіль. */}
        {qr.issue === "currency"
          ? t("invoice.qr.foreignCurrency", { currency: invoice.currency })
          : t("invoice.qr.missing", {
              reason: t(`invoice.qr.issues.${qr.issue}`),
            })}
      </AlertDescription>
    </Alert>
  )
}
