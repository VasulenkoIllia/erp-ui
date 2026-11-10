import { Fragment } from "react"
import type * as React from "react"

import {
  useBulkAction,
  type BulkAction,
  type BulkActionTexts,
} from "@/components/erp/bulk-action"
import type { ListReportBulk } from "@/components/templates/list-report"
import type { RowSelection } from "@/hooks/use-row-selection"
import type { FilterValue } from "@/lib/api"
import { useFormat } from "@/lib/format"
import type { ActionIcon } from "@/lib/icons"
import type { Job } from "@/lib/jobs"
import type { ModuleTransition } from "@/lib/statuses"

import { INVOICES, type Invoice } from "../contract"
import { useInvoicesT } from "../use-invoices-t"
import { INVOICE_KIND } from "../invoice-kind"
import { useDocumentLockedReason } from "./invoice-access"
import { useDocumentTransitions } from "./invoice-statuses"

/** Масові дії списку з рядками модуля: префікс `invoices.bulk.<дія>` в `i18n/uk.json`. */
type InvoiceBulkKey = `invoices.bulk.${"submit" | "cancel" | "delete"}`

/** Що спільне в масових діях списку: вибір і фільтр списку. */
interface InvoiceBulkScope {
  readonly selection: RowSelection
  readonly filter: Record<string, FilterValue>
}

/** Тексти масової дії модуля: підтвердження з кількістю, підсумок задачі, причина відмови. */
function useBulkTexts(key: InvoiceBulkKey, denied: string): BulkActionTexts {
  const t = useInvoicesT()
  const format = useFormat()
  return {
    title: (count, value) => t(`${key}.title`, { count, value }),
    description: t(`${key}.description`),
    confirm: (count, value) => t(`${key}.confirm`, { count, value }),
    denied,
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
 * Дія графа для вибраних рахунків (ADR-0066): підпис і причина — з графа зі змінами розширення, невдача
 * «не з того статусу» — словами модуля (`<ключ>.notAllowed`), заборона станом — теж; закритий період
 * (`period_locked`) — текстом кіта.
 */
function useInvoiceBulkTransition(
  { selection, filter }: InvoiceBulkScope,
  {
    key,
    transition,
    icon,
    isPrimary = false,
  }: {
    key: Exclude<InvoiceBulkKey, "invoices.bulk.delete">
    /** Дія графа; `undefined` — розширення її сховало, кнопки немає. */
    transition: ModuleTransition | undefined
    icon: ActionIcon
    isPrimary?: boolean
  },
): BulkAction {
  const t = useInvoicesT()
  const lockedReason = useDocumentLockedReason(INVOICE_KIND)
  const texts = useBulkTexts(key, t(`${key}.denied`))
  const action = transition?.id ?? ""
  return useBulkAction({
    resource: INVOICES,
    selection,
    filter,
    action,
    label: transition?.label ?? "",
    icon,
    variant: isPrimary ? "default" : "outline",
    reason: transition?.reason,
    destructive: action === "cancel",
    texts,
    failureLabel: (code) =>
      code === "transition_not_allowed"
        ? t(`${key}.notAllowed`)
        : lockedReason(action, code),
  })
}

/** «Видалити» вибрані чернетки (ADR-0066): виставлені й скасовані — у звіті з причиною словами модуля. */
function useInvoiceBulkDelete({
  selection,
  filter,
}: InvoiceBulkScope): BulkAction {
  const t = useInvoicesT()
  const lockedReason = useDocumentLockedReason(INVOICE_KIND)
  const texts = useBulkTexts("invoices.bulk.delete", t("invoice.delete.denied"))
  return useBulkAction({
    resource: INVOICES,
    selection,
    filter,
    action: "delete",
    label: t("invoices.bulk.delete.button"),
    icon: "delete",
    destructive: true,
    texts,
    failureLabel: (code) => lockedReason("delete", code),
  })
}

/** Підпис рядка у звіті й панелі вибраного: номер, у чернетки — клієнт і дата. */
function useInvoiceRowLabel() {
  const t = useInvoicesT()
  const format = useFormat()
  return (invoice: Invoice) =>
    invoice.number
      ? t("invoices.bulk.rowLabel", { number: invoice.number })
      : t("invoices.bulk.rowLabelDraft", {
          client: invoice.clientName,
          date: format.date(invoice.date, "date"),
        })
}

/**
 * «Виставити», «Скасувати» з причиною й «Видалити» для вибраних рахунків (ADR-0066, ADR-0070): фонова
 * задача сервера, звіт про невдалі з причиною кожного (закритий період — `period_locked`). Дія графа, яку
 * розширення сховало, зі списку теж зникає. Сторно масово не запускається: воно створює документ.
 * Діалоги — на сторінці поруч зі списком (`dialogs`).
 */
export function useInvoiceBulkActions(
  selection: RowSelection,
  filter: Record<string, FilterValue>,
): { bulk: ListReportBulk<Invoice>; dialogs: React.ReactNode } {
  const scope = { selection, filter }
  const transitions = useDocumentTransitions(INVOICE_KIND)
  const submitTransition = transitions.find((item) => item.id === "submit")
  const cancelTransition = transitions.find((item) => item.id === "cancel")
  const submit = useInvoiceBulkTransition(scope, {
    key: "invoices.bulk.submit",
    transition: submitTransition,
    icon: "submit",
    isPrimary: true,
  })
  const cancel = useInvoiceBulkTransition(scope, {
    key: "invoices.bulk.cancel",
    transition: cancelTransition,
    icon: "cancelDocument",
  })
  const remove = useInvoiceBulkDelete(scope)
  const rowLabel = useInvoiceRowLabel()
  const entries = [
    { id: "submit", action: submit, isShown: Boolean(submitTransition) },
    { id: "cancel", action: cancel, isShown: Boolean(cancelTransition) },
    { id: "delete", action: remove, isShown: true },
  ]
  return {
    bulk: {
      actions: entries
        .filter((entry) => entry.isShown)
        .map((entry) => ({ id: entry.id, render: entry.action.button })),
      rowLabel,
    },
    dialogs: entries.map((entry) => (
      <Fragment key={entry.id}>{entry.action.dialog}</Fragment>
    )),
  }
}
