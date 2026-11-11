import { useCanAccess } from "ra-core"
import { Link } from "react-router"

import { DeniedAction } from "@/components/erp/permission-gate"
import { buttonVariants } from "@/components/ui/button"
import { MODULE_ICONS } from "@/lib/icons"

import { AWAITING_PAYMENT, type Invoice } from "../contract"
import { invoiceDebt } from "../invoice-debt"
import type { InvoicePayments } from "../module-context"
import { useInvoicesT } from "../use-invoices-t"

const PaymentIcon = MODULE_ICONS.K4

/** Рахунок чекає оплати: виставлений, з номером і боргом. */
export const awaitsPayment = (invoice: Invoice) =>
  AWAITING_PAYMENT.includes(invoice.status) &&
  invoice.number !== null &&
  invoiceDebt(invoice) > 0

/**
 * «Зареєструвати оплату» на картці рахунку, що чекає оплати (ADR-0073): форма оплати модуля K4 з клієнтом і
 * цим рахунком. Право — `<ресурс оплат>:create`: без нього неактивна кнопка з причиною, поки права невідомі —
 * нічого.
 */
export function RegisterPayment({
  invoice,
  payments,
}: {
  invoice: Invoice
  payments: InvoicePayments
}) {
  const t = useInvoicesT()
  const { canAccess, isPending } = useCanAccess({
    resource: payments.resource,
    action: "create",
  })
  if (isPending) return null
  if (!canAccess)
    return (
      <DeniedAction reason={t("invoice.payment.denied")} variant="outline">
        <PaymentIcon aria-hidden />
        {t("invoice.payment.register")}
      </DeniedAction>
    )
  return (
    <Link
      to={payments.register({
        clientId: invoice.clientId,
        invoiceId: invoice.id,
      })}
      className={buttonVariants({ variant: "outline" })}
    >
      <PaymentIcon aria-hidden />
      {t("invoice.payment.register")}
    </Link>
  )
}
