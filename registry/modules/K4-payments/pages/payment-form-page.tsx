import { useAuthenticated, useCanAccess } from "ra-core"
import { useSearchParams } from "react-router"

import { PageSkeleton, PageState } from "@/components/erp/page-state"
import { BackToList } from "@/components/erp/record-link"
import { ListReportHeader } from "@/components/templates/list-report"
import { usePageHeading } from "@/hooks/use-page-heading"

import { PaymentForm } from "../components/payment-form"
import { PAYMENTS } from "../contract"
import { NEW_PAYMENT_PARAMS, usePaymentsModule } from "../module-context"
import { usePaymentsT } from "../use-payments-t"

/**
 * Сторінка нової оплати (`…/payments/new`, ADR-0073); з картки рахунку — `?client=<id>&invoice=<id>`: клієнт і
 * рахунок уже вибрано, сума — його борг, «назад» — до рахунку. Без права `sales-payments:create` — стан
 * «немає доступу» замість форми.
 */
export function PaymentFormPage() {
  const t = usePaymentsT()
  const [params] = useSearchParams()
  const { paths, invoices } = usePaymentsModule()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  const access = useCanAccess({ resource: PAYMENTS, action: "create" })
  const heading = usePageHeading(t("paymentForm.title"))
  const clientId = params.get(NEW_PAYMENT_PARAMS.client) ?? undefined
  const invoiceId = params.get(NEW_PAYMENT_PARAMS.invoice) ?? undefined
  const back =
    invoiceId && invoices.href ? (
      <BackToList
        to={invoices.href(invoiceId)}
        label={t("paymentForm.backInvoice")}
      />
    ) : (
      <BackToList to={paths.payments} label={t("paymentForm.back")} />
    )
  return (
    <div className="space-y-6">
      {back}
      <ListReportHeader title={t("paymentForm.title")} headingRef={heading} />
      {isPending || access.isPending ? (
        <PageSkeleton rows={6} />
      ) : !access.canAccess ? (
        <PageState kind="forbidden" />
      ) : (
        // Інший рахунок в адресі — нова форма з новим ключем запиту.
        <PaymentForm
          key={`${clientId ?? ""}/${invoiceId ?? ""}`}
          from={{ clientId, invoiceId }}
        />
      )}
    </div>
  )
}
