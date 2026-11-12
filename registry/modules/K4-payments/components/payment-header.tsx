import type { RaRecord } from "ra-core"
import { useEffect } from "react"
import { useNavigate } from "react-router"

import { DocumentActionBar } from "@/components/erp/document-action-bar"
import { PeriodLockBanner } from "@/components/erp/period-lock-banner"
import type { RecordField } from "@/components/erp/record-header"
import { StatusBadge } from "@/components/erp/status-badge"
import type {
  ObjectPageAction,
  ObjectPageHeader,
} from "@/components/templates/object-page"
import { useExtensionFields } from "@/lib/extension-fields"
import {
  applyKeyedChanges,
  mapKeyedChanges,
  type KeyedChanges,
} from "@/lib/extensions"
import { useFormat } from "@/lib/format"
import type { ResolvedStatuses } from "@/lib/statuses"

import type { Payment } from "../contract"
import type { K4DocumentKind } from "../document-kind"
import type { PaymentFieldId, PaymentIds } from "../extension"
import { usePaymentsModule } from "../module-context"
import { usePaymentsT } from "../use-payments-t"
import { useRefreshInvoices } from "./use-refresh-invoices"
import {
  PaymentBaseAmount,
  PaymentClient,
  PaymentTotal,
  usePaymentTitle,
} from "./payment-display"
import { usePaymentMethods, usePaymentTransitions } from "./payment-statuses"

/**
 * Шапка картки оплати чи повернення: номер, статус, ключові поля (клієнт, дата, спосіб, сума, у документі у
 * валюті — сума в базовій валюті з курсом, ADR-0071; призначення) з полями розширення й дії розширення. Своїх
 * дій у шапці модуль не має: документ не змінюють, дії графа — на панелі дій.
 */
export function usePaymentHeader(
  kind: K4DocumentKind,
  payment: Payment | undefined,
  statuses: ResolvedStatuses,
  slotActions: KeyedChanges<ObjectPageAction, PaymentIds["action"]> | undefined,
): ObjectPageHeader | undefined {
  const t = usePaymentsT()
  const format = useFormat()
  const titleOf = usePaymentTitle(kind)
  const methods = usePaymentMethods()
  const { extension } = usePaymentsModule()
  const kindExtension = kind.extensionOf(extension)
  const extensionFields = useExtensionFields(kindExtension.fields)
  if (!payment) return undefined
  const fields: (RecordField & { id: PaymentFieldId })[] = [
    {
      id: "client",
      label: t("payment.fields.client"),
      value: <PaymentClient payment={payment} />,
    },
    {
      id: "date",
      label: t("payment.fields.date"),
      value: format.date(payment.date, "date"),
    },
    {
      id: "method",
      label: t("payment.fields.method"),
      value: methods.labelOf(payment.method),
    },
    {
      id: "amount",
      label: t("payment.fields.amount"),
      value: <PaymentTotal payment={payment} />,
    },
  ]
  if (payment.exchange)
    fields.push({
      id: "baseAmount",
      label: t("payment.fields.baseAmount"),
      value: (
        <PaymentBaseAmount payment={payment} exchange={payment.exchange} />
      ),
    })
  if (payment.reference)
    fields.push({
      id: "reference",
      label: t("payment.fields.reference"),
      value: payment.reference,
    })
  return {
    title: titleOf(payment),
    status: (
      <StatusBadge
        status={statuses.byId.get(payment.status) ?? payment.status}
      />
    ),
    fields: applyKeyedChanges(
      fields,
      mapKeyedChanges(kindExtension.recordFields, (field) =>
        extensionFields.displayEntry(field, payment),
      ),
    ),
    actions: applyKeyedChanges([], slotActions),
  }
}

/**
 * Смуга закритого періоду (PF13: що робити далі — сторно) і панель дій графа під шапкою картки оплати чи
 * повернення. Після «Сторнувати» — картка сторно.
 */
export function PaymentStatusBar({
  kind,
  payment,
}: {
  kind: K4DocumentKind
  payment: Payment
}) {
  const t = usePaymentsT()
  const navigate = useNavigate()
  const { paths } = usePaymentsModule()
  const transitions = usePaymentTransitions(kind)
  const refreshInvoices = useRefreshInvoices()
  // Нова версія документа — дія над ним («Скасувати», «Сторнувати»): борг і статус рахунків змінились.
  useEffect(() => {
    refreshInvoices()
  }, [payment.version, refreshInvoices])
  return (
    <div className="grid gap-3">
      <PeriodLockBanner
        date={payment.date}
        hint={t(`${kind.key}.periodLockHint`)}
      />
      <DocumentActionBar
        resource={kind.resource}
        record={payment}
        transitions={transitions}
        // Новий документ — нова картка: фокус на її заголовок ставить перехід.
        onCreated={(created: RaRecord) => {
          void navigate(kind.pathsOf(paths).record(String(created.id)))
        }}
      />
    </div>
  )
}
