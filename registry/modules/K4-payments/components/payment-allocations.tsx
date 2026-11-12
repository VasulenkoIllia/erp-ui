import {
  DocumentFlow,
  type DocumentFlowType,
} from "@/components/erp/document-flow"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useFormat } from "@/lib/format"

import type { Payment } from "../contract"
import {
  PAYMENT_KIND,
  REFUND_KIND,
  type K4DocumentKind,
} from "../document-kind"
import { usePaymentsModule } from "../module-context"
import { usePaymentsT } from "../use-payments-t"
import { InvoiceLink } from "./payment-display"
import { usePaymentStatuses } from "./payment-statuses"

/**
 * Рахунки оплати чи повернення на картці: номер рахунку з посиланням на його картку, дата рахунку й сума з
 * цього документа, разом — сума документа. Колонок лише три, тож і на вузькому — таблиця, ширша за контейнер
 * прокручується.
 */
export function PaymentAllocations({
  kind,
  payment,
}: {
  kind: K4DocumentKind
  payment: Payment
}) {
  const t = usePaymentsT()
  const format = useFormat()
  const money = (amount: number) =>
    format.money({ amount, currency: payment.currency })
  const total = payment.allocations.reduce(
    (sum, allocation) => sum + allocation.amount,
    0,
  )
  return (
    <Table label={t(`${kind.key}.allocations.label`)}>
      <TableHeader>
        <TableRow>
          <TableHead>{t("payment.allocations.invoice")}</TableHead>
          <TableHead>{t("payment.allocations.date")}</TableHead>
          <TableHead className="text-end">
            {t(`${kind.key}.allocations.amount`)}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payment.allocations.map((allocation) => (
          <TableRow key={allocation.invoiceId}>
            <TableCell>
              <InvoiceLink
                id={allocation.invoiceId}
                number={allocation.invoiceNumber}
              />
            </TableCell>
            <TableCell className="tabular-nums">
              {format.date(allocation.invoiceDate, "date")}
            </TableCell>
            <TableCell className="text-end tabular-nums">
              {money(allocation.amount)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={2}>{t("payment.allocations.total")}</TableCell>
          <TableCell className="text-end tabular-nums">
            {money(total)}
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  )
}

/**
 * Потік документів на картці оплати чи повернення (UI13, ADR-0061): оплати й повернення модуля зі статусами K4
 * і рахунки — з посиланням на картку, коли проект дав її адресу, і зі станом документа кіта. Зв'язки «На
 * підставі …» й «Сторно …» дає сервер.
 */
export function PaymentFlow({
  kind,
  id,
}: {
  kind: K4DocumentKind
  id: string
}) {
  const t = usePaymentsT()
  const { paths, invoices } = usePaymentsModule()
  const paymentStatuses = usePaymentStatuses(PAYMENT_KIND)
  const refundStatuses = usePaymentStatuses(REFUND_KIND)
  const types: Readonly<Record<string, DocumentFlowType>> = {
    [invoices.resource]: {
      label: t("payment.sources.invoice"),
      href: invoices.href,
    },
    [PAYMENT_KIND.resource]: {
      label: t("payment.flow"),
      href: paths.payment,
      statuses: paymentStatuses,
    },
    [REFUND_KIND.resource]: {
      label: t("refund.flow"),
      href: paths.refund,
      statuses: refundStatuses,
    },
  }
  return <DocumentFlow resource={kind.resource} id={id} types={types} />
}
