import { useAuthenticated, useCanAccess } from "ra-core"
import { useSearchParams } from "react-router"

import { PageSkeleton, PageState } from "@/components/erp/page-state"
import { BackToList } from "@/components/erp/record-link"
import { ListReportHeader } from "@/components/templates/list-report"
import { usePageHeading } from "@/hooks/use-page-heading"

import { PaymentForm } from "../components/payment-form"
import {
  PAYMENT_KIND,
  REFUND_KIND,
  type K4DocumentKind,
} from "../document-kind"
import { NEW_PAYMENT_PARAMS, usePaymentsModule } from "../module-context"
import { usePaymentsT } from "../use-payments-t"

/** Нова оплата (`…/payments/new`, ADR-0073). */
export function PaymentFormPage() {
  return <MoneyDocumentFormPage kind={PAYMENT_KIND} />
}

/** Нове повернення (`…/refunds/new`, ADR-0083). */
export function RefundFormPage() {
  return <MoneyDocumentFormPage kind={REFUND_KIND} />
}

/**
 * Сторінка нової оплати чи повернення; з картки рахунку — `?client=<id>&invoice=<id>`: клієнт і рахунок уже
 * вибрано, сума — його борг чи переплата, «назад» — до рахунку. Без права `<ресурс>:create` — стан «немає
 * доступу» замість форми.
 */
function MoneyDocumentFormPage({ kind }: { kind: K4DocumentKind }) {
  const t = usePaymentsT()
  const [params] = useSearchParams()
  const { paths, invoices } = usePaymentsModule()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  const access = useCanAccess({ resource: kind.resource, action: "create" })
  const heading = usePageHeading(t(`${kind.form}.title`))
  const clientId = params.get(NEW_PAYMENT_PARAMS.client) ?? undefined
  const invoiceId = params.get(NEW_PAYMENT_PARAMS.invoice) ?? undefined
  const back =
    invoiceId && invoices.href ? (
      <BackToList
        to={invoices.href(invoiceId)}
        label={t(`${kind.form}.backInvoice`)}
      />
    ) : (
      <BackToList
        to={kind.pathsOf(paths).list}
        label={t(`${kind.form}.back`)}
      />
    )
  return (
    <div className="space-y-6">
      {back}
      <ListReportHeader title={t(`${kind.form}.title`)} headingRef={heading} />
      {isPending || access.isPending ? (
        <PageSkeleton rows={6} />
      ) : !access.canAccess ? (
        <PageState kind="forbidden" />
      ) : (
        // Інший рахунок в адресі — нова форма з новим ключем запиту.
        <PaymentForm
          key={`${clientId ?? ""}/${invoiceId ?? ""}`}
          kind={kind}
          from={{ clientId, invoiceId }}
        />
      )}
    </div>
  )
}
