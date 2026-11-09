import { StatusBadge } from "@/components/erp/status-badge"
import { compareCalendarDates, todayIn } from "@/lib/dates"
import { useFormat } from "@/lib/format"
import { useErpUiT } from "@/lib/i18n"

import type { SalesDocument } from "../contract"
import type { SalesDocumentKind, SalesKindBase } from "../sales-kinds"
import { useSalesT } from "../use-sales-t"

/** Номер документа; чернетка номера не має, поки її не проведуть (ADR-0058). */
export function SalesNumber({ number }: { number: string | null }) {
  const kitT = useErpUiT()
  return number ? (
    <span className="tabular-nums">{number}</span>
  ) : (
    <span className="text-muted-foreground">{kitT("numbering.noNumber")}</span>
  )
}

/**
 * Назва документа для заголовка й палітри: «Пропозиція КП-2026-0001», «Замовлення ЗМ-2026-0001»;
 * чернетка — без номера.
 */
export function useSalesTitle(kind: SalesKindBase) {
  const t = useSalesT()
  const { record } = kind.keys
  return (document: Pick<SalesDocument, "number">) =>
    document.number
      ? t(`${record}.titleNumber`, { number: document.number })
      : t(`${record}.titleDraft`)
}

/**
 * Друга дата минула в документа, що чекає (надіслана пропозиція, підтверджене замовлення; рішення
 * власника 08.11.2026): окремого статусу немає, сервер нічого не змінює.
 */
export function useIsOverdue<D extends SalesDocument, Due extends string>(
  kind: SalesDocumentKind<D, Due>,
) {
  const { timeZone } = useFormat()
  const today = todayIn(timeZone)
  return (document: D) =>
    kind.due.awaiting.includes(document.status) &&
    compareCalendarDates(kind.dueOf(document), today) < 0
}

/** Друга дата з позначкою «Термін минув» чи «Прострочено»: текстом, а не лише кольором (WCAG 1.4.1). */
export function SalesDueDate<D extends SalesDocument, Due extends string>({
  kind,
  document,
}: {
  kind: SalesDocumentKind<D, Due>
  document: D
}) {
  const t = useSalesT()
  const format = useFormat()
  const isOverdue = useIsOverdue(kind)
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="tabular-nums">
        {format.date(kind.dueOf(document), "date")}
      </span>
      {isOverdue(document) ? (
        <StatusBadge
          status={{
            id: "overdue",
            label: t(kind.due.badge),
            tone: "warning",
            icon: "pending",
          }}
        />
      ) : null}
    </span>
  )
}
