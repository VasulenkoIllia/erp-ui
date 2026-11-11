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

import { PAYMENTS, type Payment } from "../contract"
import { usePaymentsModule } from "../module-context"
import { usePaymentsT } from "../use-payments-t"
import { InvoiceLink } from "./payment-display"
import { usePaymentStatuses } from "./payment-statuses"

/**
 * Рахунки оплати на картці: номер рахунку з посиланням на його картку, дата рахунку й сума з цієї оплати,
 * разом — сума оплати. Колонок лише три, тож і на вузькому — таблиця, ширша за контейнер прокручується.
 */
export function PaymentAllocations({ payment }: { payment: Payment }) {
  const t = usePaymentsT()
  const format = useFormat()
  const money = (amount: number) =>
    format.money({ amount, currency: payment.currency })
  const total = payment.allocations.reduce(
    (sum, allocation) => sum + allocation.amount,
    0,
  )
  return (
    <Table label={t("payment.allocations.label")}>
      <TableHeader>
        <TableRow>
          <TableHead>{t("payment.allocations.invoice")}</TableHead>
          <TableHead>{t("payment.allocations.date")}</TableHead>
          <TableHead className="text-end">
            {t("payment.allocations.amount")}
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
 * Потік документів на картці оплати (UI13, ADR-0061): оплати модуля зі статусами K4 і рахунки — з посиланням на
 * картку, коли проект дав її адресу, і зі станом документа кіта. Зв'язки «На підставі …» й «Сторно …» дає
 * сервер.
 */
export function PaymentFlow({ id }: { id: string }) {
  const t = usePaymentsT()
  const { paths, invoices } = usePaymentsModule()
  const statuses = usePaymentStatuses()
  const types: Readonly<Record<string, DocumentFlowType>> = {
    [invoices.resource]: {
      label: t("payment.sources.invoice"),
      href: invoices.href,
    },
    [PAYMENTS]: { label: t("payment.flow"), href: paths.payment, statuses },
  }
  return <DocumentFlow resource={PAYMENTS} id={id} types={types} />
}
