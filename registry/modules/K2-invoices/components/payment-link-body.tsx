import { CopyableValue } from "@/components/erp/copyable-value"
import { PageState } from "@/components/erp/page-state"
import { QrCode } from "@/components/erp/qr-code"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useCardRecord } from "@/hooks/use-card-record"
import { errorStateKind } from "@/lib/api"
import { useFormat } from "@/lib/format"

import { INVOICES, type Invoice, type InvoiceDetail } from "../contract"
import { useInvoicesT } from "../use-invoices-t"
import { invoicePaymentQr, sheetDebt } from "./invoice-payment"
import { useInvoiceDetail } from "./invoice-lines"
import { PaymentLinkSkeleton } from "./payment-link"

/** Вміст діалогу: свіжий рахунок із сервера, потім QR, сума й посилання чи причина, чому їх немає. */
export function PaymentLinkBody({ id }: { id: string }) {
  const t = useInvoicesT()
  const card = useCardRecord<Invoice & Partial<InvoiceDetail>>(INVOICES, id)
  const detail = useInvoiceDetail(card.record)
  // Свіжа картка без рядків — помилка даних, а не вічне завантаження (як на сторінці друку).
  const invalid =
    detail?.error ??
    (card.isFresh && card.record && !detail ? new Error("no lines") : undefined)
  const failure = card.pageError ?? card.failure ?? invalid
  if (failure !== undefined)
    return (
      <PageState
        kind={errorStateKind(failure)}
        title={t("invoice.paymentLink.failed")}
        onRetry={card.retry}
      />
    )
  if (!card.isFresh || !card.record || !detail?.success)
    return <PaymentLinkSkeleton />
  return (
    <PaymentLinkContent invoice={card.record} totals={detail.data.totals} />
  )
}

function PaymentLinkContent({
  invoice,
  totals,
}: {
  invoice: Invoice
  totals: InvoiceDetail["totals"]
}) {
  const t = useInvoicesT()
  const format = useFormat()
  const qr = invoicePaymentQr(invoice, totals)
  // Рахунок тим часом оплатили чи покрили кредит-нотою: платити нічого.
  if (!qr)
    return (
      <Alert>
        <AlertDescription>{t("invoice.paymentLink.settled")}</AlertDescription>
      </Alert>
    )
  if (!qr.ok)
    return (
      <Alert>
        <AlertDescription>
          {t("invoice.paymentLink.missing", {
            reason: t(`invoice.qr.issues.${qr.issue}`),
          })}
        </AlertDescription>
      </Alert>
    )
  const debt = sheetDebt(invoice, totals)
  return (
    <div className="grid justify-items-center gap-4">
      <QrCode
        value={qr.url}
        label={t("invoice.paymentLink.qrLabel", { number: invoice.number })}
      />
      <p className="text-base">
        {t("invoice.paymentLink.amount")}{" "}
        <span className="font-semibold tabular-nums">
          {format.money({ amount: debt, currency: invoice.currency })}
        </span>
      </p>
      <div className="grid w-full min-w-0 gap-1">
        <span className="text-sm text-muted-foreground">
          {t("invoice.paymentLink.link")}
        </span>
        <CopyableValue
          value={qr.url}
          kind="url"
          label={t("invoice.paymentLink.link")}
          className="break-all"
        />
      </div>
    </div>
  )
}
