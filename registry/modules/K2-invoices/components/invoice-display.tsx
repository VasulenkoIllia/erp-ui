import { StatusBadge } from "@/components/erp/status-badge"
import {
  EXCHANGE_RATE_DECIMALS,
  type DocumentExchange,
} from "@/lib/currency-conversion"
import { compareCalendarDates, todayIn } from "@/lib/dates"
import { useFormat } from "@/lib/format"
import { useErpUiT } from "@/lib/i18n"

import { AWAITING_PAYMENT, type Invoice } from "../contract"
import { useInvoicesT } from "../use-invoices-t"

/** Номер рахунку; чернетка номера не має, поки її не виставлять (ADR-0058). */
export function InvoiceNumber({ number }: { number: string | null }) {
  const kitT = useErpUiT()
  return number ? (
    <span className="tabular-nums">{number}</span>
  ) : (
    <span className="text-muted-foreground">{kitT("numbering.noNumber")}</span>
  )
}

/** Назва рахунку для заголовка й палітри: «Рахунок РХ-2026-0001»; чернетка — без номера. */
export function useInvoiceTitle() {
  const t = useInvoicesT()
  return (invoice: Pick<Invoice, "number">) =>
    invoice.number
      ? t("invoice.titleNumber", { number: invoice.number })
      : t("invoice.titleDraft")
}

/**
 * «Сплатити до» минула у виставленого рахунку (рішення власника 10.11.2026): окремого статусу немає,
 * сервер нічого не змінює.
 */
export function useIsOverdue() {
  const { timeZone } = useFormat()
  const today = todayIn(timeZone)
  return (invoice: Invoice) =>
    AWAITING_PAYMENT.includes(invoice.status) &&
    compareCalendarDates(invoice.dueDate, today) < 0
}

/** «Сплатити до» з позначкою «Прострочено»: текстом, а не лише кольором (WCAG 1.4.1). */
export function InvoiceDueDate({ invoice }: { invoice: Invoice }) {
  const t = useInvoicesT()
  const format = useFormat()
  const isOverdue = useIsOverdue()
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="tabular-nums">
        {format.date(invoice.dueDate, "date")}
      </span>
      {isOverdue(invoice) ? (
        <StatusBadge
          status={{
            id: "overdue",
            label: t("invoice.overdue"),
            tone: "warning",
            icon: "pending",
          }}
        />
      ) : null}
    </span>
  )
}

/** Сума з податком; у сторно — з мінусом (рахує сервер). */
export function InvoiceTotal({ invoice }: { invoice: Invoice }) {
  const format = useFormat()
  return (
    <span className="tabular-nums">
      {format.money({ amount: invoice.total, currency: invoice.currency })}
    </span>
  )
}

/** Підсумок рахунку в базовій валюті чи `null`, коли курсу немає (ADR-0071). */
function useBaseTotalText() {
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
 * Сума рахунку в колонці списку (ADR-0071): сума документа, а під нею, дрібніше, — у базовій валюті, коли
 * рахунок у валюті. Довідка поруч, а не заміна: сортування й сума рядка — у валюті рахунку.
 */
export function InvoiceAmount({ invoice }: { invoice: Invoice }) {
  const t = useInvoicesT()
  const baseText = useBaseTotalText()
  const { exchange } = invoice
  if (!exchange) return <InvoiceTotal invoice={invoice} />
  return (
    <span className="relative inline-grid justify-items-end">
      <InvoiceTotal invoice={invoice} />
      <span className="text-xs text-muted-foreground tabular-nums">
        <span className="sr-only">{t("invoice.exchange.inBase")} </span>
        {baseText(exchange) ?? t("invoice.exchange.noRateShort")}
      </span>
    </span>
  )
}

/**
 * Сума в базовій валюті на картці (ADR-0071): сума, курс і його дата; у чернетці — що «Виставити» курс
 * закріпить; курсу немає — на яку дату його бракує.
 */
export function InvoiceBaseTotal({
  invoice,
  exchange,
}: {
  invoice: Invoice
  exchange: DocumentExchange
}) {
  const t = useInvoicesT()
  const format = useFormat()
  const baseText = useBaseTotalText()
  const amount = baseText(exchange)
  if (amount === null || exchange.rate === null || exchange.rateDate === null)
    return (
      <span>
        {t("invoice.exchange.noRate", {
          currency: invoice.currency,
          date: format.date(invoice.date, "date"),
        })}
      </span>
    )
  const rate = t("invoice.exchange.rate", {
    rate: format.number(exchange.rate, {
      maximumFractionDigits: EXCHANGE_RATE_DECIMALS,
    }),
    date: format.date(exchange.rateDate, "date"),
  })
  return (
    <span className="grid gap-0.5">
      <span className="tabular-nums">{amount}</span>
      <span className="text-xs text-muted-foreground">
        {invoice.docStatus === "draft"
          ? t("invoice.exchange.rateDraft", { rate })
          : rate}
      </span>
    </span>
  )
}
