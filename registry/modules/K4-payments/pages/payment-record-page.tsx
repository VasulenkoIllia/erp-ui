import { useAuthenticated } from "ra-core"
import { useParams } from "react-router"

import { PageSkeleton } from "@/components/erp/page-state"
import { RecordHistory } from "@/components/erp/record-history"
import { BackToList } from "@/components/erp/record-link"
import {
  ObjectPage,
  useRecordSlots,
  type ObjectPageSectionItem,
} from "@/components/templates/object-page"
import { useCardRecord } from "@/hooks/use-card-record"
import { useHistoryRefresh } from "@/hooks/use-history-refresh"
import { usePageHeading } from "@/hooks/use-page-heading"
import { usePaletteActions } from "@/hooks/use-palette-actions"
import { applyKeyedChanges } from "@/lib/extensions"

import {
  PaymentAllocations,
  PaymentFlow,
} from "../components/payment-allocations"
import { usePaymentTitle } from "../components/payment-display"
import {
  PaymentStatusBar,
  usePaymentHeader,
} from "../components/payment-header"
import { usePaymentStatuses } from "../components/payment-statuses"
import type { Payment } from "../contract"
import {
  PAYMENT_KIND,
  REFUND_KIND,
  type K4DocumentKind,
} from "../document-kind"
import type { PaymentIds, PaymentSectionId } from "../extension"
import { usePaymentsModule } from "../module-context"
import { usePaymentsT } from "../use-payments-t"

/** Картка оплати (ADR-0073). */
export function PaymentPage() {
  return <MoneyDocumentPage kind={PAYMENT_KIND} />
}

/** Картка повернення клієнту (ADR-0083). */
export function RefundPage() {
  return <MoneyDocumentPage kind={REFUND_KIND} />
}

/**
 * Картка оплати чи повернення на шаблоні Object Page (SPEC §7; ADR-0057, ADR-0069, ADR-0073, ADR-0083): шапка
 * з номером і статусом, смуга закритого періоду над панеллю дій графа («Скасувати», «Сторнувати»), рахунки
 * документа, потік документів (ADR-0061), «Історія» з журналу аудиту чи стрічка зі слота `aside` — праворуч на
 * широкому, вкладкою на вузькому. Після «Сторнувати» — картка сторно.
 */
function MoneyDocumentPage({ kind }: { kind: K4DocumentKind }) {
  const { id = "" } = useParams()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  // Інший документ — інша картка: фокус не переходить від попереднього.
  return isPending ? (
    <PageSkeleton rows={4} />
  ) : (
    <PaymentCard key={id} kind={kind} id={id} />
  )
}

function PaymentCard({ kind, id }: { kind: K4DocumentKind; id: string }) {
  const t = usePaymentsT()
  const titleOf = usePaymentTitle(kind)
  const { extension, paths } = usePaymentsModule()
  const kindExtension = kind.extensionOf(extension)
  const card = useCardRecord<Payment>(kind.resource, id)
  const payment = card.record
  const heading = usePageHeading(
    payment ? titleOf(payment) : t(`${kind.key}.title`),
    !card.isPending || card.pageError !== undefined,
  )
  const statuses = usePaymentStatuses(kind)
  const slots = useRecordSlots<Payment, PaymentSectionId, PaymentIds["action"]>(
    {
      record: payment,
      resource: kind.resource,
      sections: kindExtension.sections,
      actions: kindExtension.actions,
      aside: extension.aside,
    },
  )
  const header = usePaymentHeader(kind, payment, statuses, slots.actions)
  useHistoryRefresh(payment?.version)
  const sections: (ObjectPageSectionItem & { id: PaymentSectionId })[] = payment
    ? [
        {
          id: "allocations",
          title: t("payment.sections.allocations"),
          content: <PaymentAllocations kind={kind} payment={payment} />,
        },
        {
          id: "flow",
          title: t("payment.sections.flow"),
          content: <PaymentFlow kind={kind} id={id} />,
        },
      ]
    : []
  usePaletteActions(payment ? { title: titleOf(payment), actions: [] } : null)
  return (
    <ObjectPage
      title={t(`${kind.key}.title`)}
      headingRef={heading}
      back={
        <BackToList
          to={kind.pathsOf(paths).list}
          label={t(`${kind.key}.back`)}
        />
      }
      isPending={card.isPending}
      error={card.pageError}
      onRetry={card.retry}
      header={header}
      statusBar={
        payment ? <PaymentStatusBar kind={kind} payment={payment} /> : undefined
      }
      sections={applyKeyedChanges(sections, slots.sections)}
      // Бекенд без журналу змін — картка без «Історії» (`history: false` у розширенні).
      aside={
        slots.aside ??
        (extension.history === false
          ? undefined
          : {
              label: t("payment.history"),
              content: (
                <RecordHistory
                  target={{
                    type: kind.resource,
                    id,
                    name: payment ? titleOf(payment) : undefined,
                  }}
                />
              ),
            })
      }
    />
  )
}
