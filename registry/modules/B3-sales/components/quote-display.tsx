import { StatusBadge } from "@/components/erp/status-badge"
import { compareCalendarDates, todayIn } from "@/lib/dates"
import { useFormat } from "@/lib/format"
import { useErpUiT } from "@/lib/i18n"

import { AWAITING_REPLY, type Quote } from "../contract"
import { useSalesT } from "../use-sales-t"

/** Номер пропозиції; чернетка номера не має, поки її не надішлють (ADR-0058). */
export function QuoteNumber({ number }: { number: string | null }) {
  const kitT = useErpUiT()
  return number ? (
    <span className="tabular-nums">{number}</span>
  ) : (
    <span className="text-muted-foreground">{kitT("numbering.noNumber")}</span>
  )
}

/** Назва пропозиції для заголовка й палітри: «Пропозиція КП-2026-0001», чернетка — без номера. */
export function useQuoteTitle() {
  const t = useSalesT()
  return (quote: Pick<Quote, "number">) =>
    quote.number
      ? t("quote.titleNumber", { number: quote.number })
      : t("quote.titleDraft")
}

/**
 * Строк минув у пропозиції, що чекає відповіді клієнта (рішення власника 08.11.2026): окремого
 * статусу немає, сервер нічого не змінює.
 */
export function useIsExpired() {
  const { timeZone } = useFormat()
  const today = todayIn(timeZone)
  return (quote: Pick<Quote, "status" | "validUntil">) =>
    AWAITING_REPLY.includes(quote.status) &&
    compareCalendarDates(quote.validUntil, today) < 0
}

/** «Дійсна до» з позначкою «Термін минув»: текстом, а не лише кольором (WCAG 1.4.1). */
export function QuoteValidity({
  quote,
}: {
  quote: Pick<Quote, "status" | "validUntil">
}) {
  const t = useSalesT()
  const format = useFormat()
  const isExpired = useIsExpired()
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="tabular-nums">
        {format.date(quote.validUntil, "date")}
      </span>
      {isExpired(quote) ? (
        <StatusBadge
          status={{
            id: "expired",
            label: t("quote.expired"),
            tone: "warning",
            icon: "pending",
          }}
        />
      ) : null}
    </span>
  )
}
