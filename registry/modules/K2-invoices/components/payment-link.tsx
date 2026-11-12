import * as React from "react"

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
import { ACTION_ICONS } from "@/lib/icons"
import { lazyWithPreload } from "@/lib/lazy"
import { NBU_QR_CURRENCY } from "@/lib/payment-qr"

import type { Invoice } from "../contract"
import { useInvoicesT } from "../use-invoices-t"
import { awaitsPayment } from "./register-payment"

const LinkIcon = ACTION_ICONS.paymentLink

// QR-код і рядки рахунку — окремим чанком, коли наводять на кнопку: на картці рахунку вони не потрібні (ADR-0009).
const PaymentLinkBody = lazyWithPreload(() =>
  import("./payment-link-body").then((m) => m.PaymentLinkBody),
)
const preloadBody = () => {
  void PaymentLinkBody.preload()
}

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
      <DialogTrigger
        render={<Button variant="outline" />}
        onPointerEnter={preloadBody}
        onFocus={preloadBody}
      >
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
        <React.Suspense fallback={<PaymentLinkSkeleton />}>
          <PaymentLinkBody id={invoice.id} />
        </React.Suspense>
      </DialogContent>
    </Dialog>
  )
}

/** Місце QR-коду й посилання, доки рахунок не прийшов із сервера. */
export function PaymentLinkSkeleton() {
  const t = useInvoicesT()
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
}
