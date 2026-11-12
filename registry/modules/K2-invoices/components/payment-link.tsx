import { CopyableValue } from "@/components/erp/copyable-value"
import { PageState } from "@/components/erp/page-state"
import { QrCode } from "@/components/erp/qr-code"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { useCardRecord } from "@/hooks/use-card-record"
import { errorStateKind } from "@/lib/api"
import { useFormat } from "@/lib/format"
import { ACTION_ICONS } from "@/lib/icons"
import { NBU_QR_CURRENCY } from "@/lib/payment-qr"

import { INVOICES, type Invoice, type InvoiceDetail } from "../contract"
import { useInvoicesT } from "../use-invoices-t"
import { invoicePaymentQr, sheetDebt } from "./invoice-payment"
import { useInvoiceDetail } from "./invoice-lines"
import { awaitsPayment } from "./register-payment"

const LinkIcon = ACTION_ICONS.paymentLink

/**
 * Посилання й QR-код можна дати лише рахунку, що чекає оплати, у гривнях: QR-код НБУ буває лише для гривні
 * (ADR-0070, ADR-0071).
 */
export const hasPaymentLink = (invoice: Invoice) =>
  awaitsPayment(invoice) && invoice.currency === NBU_QR_CURRENCY

/**
 * «Посилання на оплату» на картці рахунку (ADR-0083): діалог із QR-кодом НБУ й посиланням на борг рахунку —
 * та сама сума й призначення, що на аркуші (ADR-0074). Посилання копіюють і надсилають клієнту: банк відкриє
 * переказ із заповненими реквізитами й сумою. Відкритий діалог перечитує рахунок: QR і посилання — лише з
 * картки, свіжої з сервера, а не зі збереженої в браузері.
 */
export function PaymentLinkAction({ invoice }: { invoice: Invoice }) {
  const t = useInvoicesT()
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>
        <LinkIcon aria-hidden />
        {t("invoice.paymentLink.open")}
      </DialogTrigger>
      <DialogContent data-slot="invoice-payment-link">
        <DialogHeader>
          <DialogTitle>
            {t("invoice.paymentLink.title", { number: invoice.number })}
          </DialogTitle>
          <DialogDescription>
            {t("invoice.paymentLink.description")}
          </DialogDescription>
        </DialogHeader>
        <PaymentLinkBody id={invoice.id} />
      </DialogContent>
    </Dialog>
  )
}

/** Вміст діалогу: свіжий рахунок із сервера, потім QR, сума й посилання чи причина, чому їх немає. */
function PaymentLinkBody({ id }: { id: string }) {
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
    return (
      <div
        role="status"
        className="grid justify-items-center gap-3"
        aria-busy="true"
      >
        <Skeleton className="size-48" />
        <Skeleton className="h-9 w-full" />
        <span className="sr-only">{t("invoice.paymentLink.loading")}</span>
      </div>
    )
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
