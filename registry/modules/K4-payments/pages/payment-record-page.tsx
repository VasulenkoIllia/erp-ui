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
import { PAYMENTS, type Payment } from "../contract"
import type { PaymentIds, PaymentSectionId } from "../extension"
import { usePaymentsModule } from "../module-context"
import { usePaymentsT } from "../use-payments-t"

/**
 * Картка оплати на шаблоні Object Page (SPEC §7; ADR-0057, ADR-0069, ADR-0073): шапка з номером і статусом,
 * смуга закритого періоду над панеллю дій графа («Скасувати», «Сторнувати»), рахунки оплати, потік документів
 * (ADR-0061), «Історія» з журналу аудиту чи стрічка зі слота `aside` — праворуч на широкому, вкладкою на
 * вузькому. Після «Сторнувати» — картка сторно.
 */
export function PaymentPage() {
  const { id = "" } = useParams()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  // Інша оплата — інша картка: фокус не переходить від попередньої.
  return isPending ? (
    <PageSkeleton rows={4} />
  ) : (
    <PaymentCard key={id} id={id} />
  )
}

function PaymentCard({ id }: { id: string }) {
  const t = usePaymentsT()
  const titleOf = usePaymentTitle()
  const { extension, paths } = usePaymentsModule()
  const card = useCardRecord<Payment>(PAYMENTS, id)
  const payment = card.record
  const heading = usePageHeading(
    payment ? titleOf(payment) : t("payment.title"),
    !card.isPending || card.pageError !== undefined,
  )
  const statuses = usePaymentStatuses()
  const slots = useRecordSlots<Payment, PaymentSectionId, PaymentIds["action"]>(
    {
      record: payment,
      resource: PAYMENTS,
      sections: extension.sections,
      actions: extension.actions,
      aside: extension.aside,
    },
  )
  const header = usePaymentHeader(payment, statuses, slots.actions)
  useHistoryRefresh(payment?.version)
  const sections: (ObjectPageSectionItem & { id: PaymentSectionId })[] = payment
    ? [
        {
          id: "allocations",
          title: t("payment.sections.allocations"),
          content: <PaymentAllocations payment={payment} />,
        },
        {
          id: "flow",
          title: t("payment.sections.flow"),
          content: <PaymentFlow id={id} />,
        },
      ]
    : []
  usePaletteActions(payment ? { title: titleOf(payment), actions: [] } : null)
  return (
    <ObjectPage
      title={t("payment.title")}
      headingRef={heading}
      back={<BackToList to={paths.payments} label={t("payment.back")} />}
      isPending={card.isPending}
      error={card.pageError}
      onRetry={card.retry}
      header={header}
      statusBar={payment ? <PaymentStatusBar payment={payment} /> : undefined}
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
                    type: PAYMENTS,
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
