import type * as React from "react"

import {
  useBulkAction,
  type BulkActionTexts,
} from "@/components/erp/bulk-action"
import type { ListReportBulk } from "@/components/templates/list-report"
import type { RowSelection } from "@/hooks/use-row-selection"
import type { FilterValue } from "@/lib/api"
import { useFormat } from "@/lib/format"
import type { Job } from "@/lib/jobs"

import { QUOTES, type Quote } from "../contract"
import { useSalesT } from "../use-sales-t"
import { useQuoteLockedReason } from "./quote-access"
import { useQuoteTransitions } from "./quote-statuses"

/** Масові дії списку (ADR-0066): дії графа й видалення чернеток. */
type QuoteBulkId = "submit" | "cancel" | "delete"

/** Тексти масової дії модуля: підтвердження з кількістю, підсумок задачі, причина відмови. */
function useBulkTexts(id: QuoteBulkId): BulkActionTexts {
  const t = useSalesT()
  const format = useFormat()
  const key = `quotes.bulk.${id}` as const
  return {
    title: (count, value) => t(`${key}.title`, { count, value }),
    description: t(`${key}.description`),
    confirm: (count, value) => t(`${key}.confirm`, { count, value }),
    denied:
      id === "delete"
        ? t("quote.delete.denied")
        : t(`quotes.bulk.${id}.denied`),
    progress: t(`${key}.progress`),
    summary: (job: Job) =>
      job.failed
        ? t(`${key}.partial`, {
            done: format.number(job.succeeded),
            total: format.number(job.total),
            failed: format.number(job.failed),
          })
        : t(`${key}.done`, { value: format.number(job.succeeded) }),
  }
}

/**
 * «Надіслати», «Скасувати» з причиною й «Видалити» для вибраних пропозицій (ADR-0066): фонова задача
 * сервера, звіт про невдалі з причиною кожної. Дія графа, яку розширення сховало, зі списку теж
 * зникає. Діалоги — на сторінці поруч зі списком (`dialogs`).
 */
export function useQuoteBulkActions(
  selection: RowSelection,
  filter: Record<string, FilterValue>,
): { bulk: ListReportBulk<Quote>; dialogs: React.ReactNode } {
  const t = useSalesT()
  const format = useFormat()
  const transitions = useQuoteTransitions()
  const lockedReason = useQuoteLockedReason()
  const submitTransition = transitions.find((item) => item.id === "submit")
  const cancelTransition = transitions.find((item) => item.id === "cancel")
  const common = { resource: QUOTES, selection, filter }
  const submit = useBulkAction({
    ...common,
    action: "submit",
    label: submitTransition?.label ?? "",
    icon: "send",
    variant: "default",
    texts: useBulkTexts("submit"),
    failureLabel: (code) =>
      code === "transition_not_allowed"
        ? t("quotes.bulk.submit.notAllowed")
        : undefined,
  })
  const cancel = useBulkAction({
    ...common,
    action: "cancel",
    label: cancelTransition?.label ?? "",
    icon: "cancelDocument",
    reason: cancelTransition?.reason,
    destructive: true,
    texts: useBulkTexts("cancel"),
    failureLabel: (code) =>
      code === "transition_not_allowed"
        ? t("quotes.bulk.cancel.notAllowed")
        : undefined,
  })
  const remove = useBulkAction({
    ...common,
    action: "delete",
    label: t("quotes.bulk.delete.button"),
    icon: "delete",
    destructive: true,
    texts: useBulkTexts("delete"),
    failureLabel: (code) => lockedReason("delete", code),
  })
  const actions = [
    ...(submitTransition ? [{ id: "submit", render: submit.button }] : []),
    ...(cancelTransition ? [{ id: "cancel", render: cancel.button }] : []),
    { id: "delete", render: remove.button },
  ]
  return {
    bulk: {
      actions,
      rowLabel: (quote) =>
        quote.number
          ? t("quotes.bulk.rowLabel", { number: quote.number })
          : t("quotes.bulk.rowLabelDraft", {
              client: quote.clientName,
              date: format.date(quote.date, "date"),
            }),
    },
    dialogs: (
      <>
        {submit.dialog}
        {cancel.dialog}
        {remove.dialog}
      </>
    ),
  }
}
