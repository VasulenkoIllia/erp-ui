import { Link } from "react-router"

import {
  EXCHANGE_RATE_DECIMALS,
  type DocumentExchange,
} from "@/lib/currency-conversion"
import { useFormat } from "@/lib/format"

import type { Payment } from "../contract"
import { usePaymentsModule } from "../module-context"
import { usePaymentsT } from "../use-payments-t"

const LINK_CLASS =
  "tabular-nums underline-offset-4 hover:underline focus-visible:underline"

/** Назва оплати для заголовка й палітри: «Оплата ОП-2026-0001». */
export function usePaymentTitle() {
  const t = usePaymentsT()
  return (payment: Pick<Payment, "number">) =>
    t("payment.titleNumber", { number: payment.number })
}

/** Клієнт оплати: посилання на його картку, якщо вона є в проекті, інакше — назва текстом. */
export function PaymentClient({
  payment,
}: {
  payment: Pick<Payment, "clientId" | "clientName">
}) {
  const { clients } = usePaymentsModule()
  return clients.href ? (
    <Link
      to={clients.href(payment.clientId)}
      className="underline-offset-4 hover:underline focus-visible:underline"
    >
      {payment.clientName}
    </Link>
  ) : (
    payment.clientName
  )
}

/** Рахунок оплати: номер-посилання на картку рахунку, коли проект дав її адресу, інакше — текстом. */
export function InvoiceLink({ id, number }: { id: string; number: string }) {
  const { invoices } = usePaymentsModule()
  return invoices.href ? (
    <Link to={invoices.href(id)} className={LINK_CLASS}>
      {number}
    </Link>
  ) : (
    <span className="tabular-nums">{number}</span>
  )
}

/** Номери рахунків оплати через кому — у колонці списку. */
export function PaymentInvoices({ payment }: { payment: Payment }) {
  return (
    <span className="inline-flex flex-wrap gap-x-2 gap-y-1">
      {payment.allocations.map((allocation, index) => (
        <span key={allocation.invoiceId}>
          <InvoiceLink
            id={allocation.invoiceId}
            number={allocation.invoiceNumber}
          />
          {index < payment.allocations.length - 1 ? "," : null}
        </span>
      ))}
    </span>
  )
}

/** Сума оплати; у сторно — з мінусом (рахує сервер). */
export function PaymentTotal({ payment }: { payment: Payment }) {
  const format = useFormat()
  return (
    <span className="tabular-nums">
      {format.money({ amount: payment.amount, currency: payment.currency })}
    </span>
  )
}

/** Сума оплати в базовій валюті чи `null`, коли курсу немає (ADR-0071). */
function useBaseAmountText() {
  const format = useFormat()
  return (exchange: DocumentExchange) =>
    exchange.baseTotal === null
      ? null
      : format.money({
          amount: exchange.baseTotal,
          currency: exchange.baseCurrency,
        })
}

/**
 * Сума оплати в колонці списку (ADR-0071): сума в валюті оплати, під нею дрібніше — у базовій валюті, коли
 * оплата у валюті.
 */
export function PaymentAmount({ payment }: { payment: Payment }) {
  const t = usePaymentsT()
  const baseText = useBaseAmountText()
  const { exchange } = payment
  if (!exchange) return <PaymentTotal payment={payment} />
  return (
    <span className="relative inline-grid justify-items-end">
      <PaymentTotal payment={payment} />
      <span className="text-xs text-muted-foreground tabular-nums">
        <span className="sr-only">{t("payment.exchange.inBase")} </span>
        {baseText(exchange) ?? t("payment.exchange.noRateShort")}
      </span>
    </span>
  )
}

/** Сума в базовій валюті на картці (ADR-0071): сума, курс і його дата; курсу немає — на яку дату. */
export function PaymentBaseAmount({
  payment,
  exchange,
}: {
  payment: Payment
  exchange: DocumentExchange
}) {
  const t = usePaymentsT()
  const format = useFormat()
  const amount = useBaseAmountText()(exchange)
  if (amount === null || exchange.rate === null || exchange.rateDate === null)
    return (
      <span>
        {t("payment.exchange.noRate", {
          currency: payment.currency,
          date: format.date(payment.date, "date"),
        })}
      </span>
    )
  return (
    <span className="grid gap-0.5">
      <span className="tabular-nums">{amount}</span>
      <span className="text-xs text-muted-foreground">
        {t("payment.exchange.rate", {
          rate: format.number(exchange.rate, {
            maximumFractionDigits: EXCHANGE_RATE_DECIMALS,
          }),
          date: format.date(exchange.rateDate, "date"),
        })}
      </span>
    </span>
  )
}
