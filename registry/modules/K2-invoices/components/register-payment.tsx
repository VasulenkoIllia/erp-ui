import type { LucideIcon } from "lucide-react"
import { useCanAccess } from "ra-core"
import { Link } from "react-router"

import { DeniedAction } from "@/components/erp/permission-gate"
import { buttonVariants } from "@/components/ui/button"
import { ACTION_ICONS, MODULE_ICONS } from "@/lib/icons"

import { AWAITING_PAYMENT, type Invoice } from "../contract"
import { invoiceDebt, isSettling } from "../invoice-debt"
import type { InvoiceMoneyDocuments } from "../module-context"
import { useInvoicesT } from "../use-invoices-t"

/** Рахунок чекає оплати: виставлений, з номером і боргом. */
export const awaitsPayment = (invoice: Invoice) =>
  AWAITING_PAYMENT.includes(invoice.status) &&
  invoice.number !== null &&
  invoiceDebt(invoice) > 0

/**
 * Рахунок із переплатою (ADR-0083): «Виставлено» чи «Оплачено», з номером, а борг менший за нуль — кредит-ноту
 * виставили вже після оплати.
 */
export const isOverpaid = (invoice: Invoice) =>
  isSettling(invoice) && invoice.number !== null && invoiceDebt(invoice) < 0

/**
 * Дія модуля K4 на картці рахунку: форма нового документа з клієнтом і цим рахунком. Право —
 * `<ресурс документа>:create`: без нього неактивна кнопка з причиною, поки права невідомі — нічого.
 */
function MoneyDocumentAction({
  invoice,
  documents,
  icon: Icon,
  label,
  deniedReason,
}: {
  invoice: Invoice
  documents: InvoiceMoneyDocuments
  icon: LucideIcon
  label: string
  deniedReason: string
}) {
  const { canAccess, isPending } = useCanAccess({
    resource: documents.resource,
    action: "create",
  })
  if (isPending) return null
  if (!canAccess)
    return (
      <DeniedAction reason={deniedReason} variant="outline">
        <Icon aria-hidden />
        {label}
      </DeniedAction>
    )
  return (
    <Link
      to={documents.register({
        clientId: invoice.clientId,
        invoiceId: invoice.id,
      })}
      className={buttonVariants({ variant: "outline" })}
    >
      <Icon aria-hidden />
      {label}
    </Link>
  )
}

/** «Зареєструвати оплату» на картці рахунку, що чекає оплати (ADR-0073), з правом `<ресурс оплат>:create`. */
export function RegisterPayment({
  invoice,
  payments,
}: {
  invoice: Invoice
  payments: InvoiceMoneyDocuments
}) {
  const t = useInvoicesT()
  return (
    <MoneyDocumentAction
      invoice={invoice}
      documents={payments}
      icon={MODULE_ICONS.K4}
      label={t("invoice.payment.register")}
      deniedReason={t("invoice.payment.denied")}
    />
  )
}

/**
 * «Повернути переплату» на картці рахунку з переплатою (ADR-0083): форма повернення модуля K4 з клієнтом і цим
 * рахунком, сума — переплата. Право — `<ресурс повернень>:create`.
 */
export function RefundOverpayment({
  invoice,
  refunds,
}: {
  invoice: Invoice
  refunds: InvoiceMoneyDocuments
}) {
  const t = useInvoicesT()
  return (
    <MoneyDocumentAction
      invoice={invoice}
      documents={refunds}
      icon={ACTION_ICONS.refund}
      label={t("invoice.refund.register")}
      deniedReason={t("invoice.refund.denied")}
    />
  )
}
