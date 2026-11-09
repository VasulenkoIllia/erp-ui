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

import type { SalesDocument } from "../contract"
import type { SalesKindBase } from "../sales-kinds"
import { useSalesT } from "../use-sales-t"
import { useSalesLockedReason } from "./sales-access"

/** Масові дії списку з рядками модуля: префікс `<список>.bulk.<дія>` в `i18n/uk.json`. */
export type SalesBulkKey =
  | `quotes.bulk.${"submit" | "cancel" | "delete"}`
  | `orders.bulk.${"submit" | "complete" | "cancel" | "delete"}`

/** Що спільне в масових діях списку: ресурс, вибір і фільтр списку. */
export interface SalesBulkScope {
  readonly kind: SalesKindBase
  readonly selection: RowSelection
  readonly filter: Record<string, FilterValue>
}

/** Тексти масової дії модуля: підтвердження з кількістю, підсумок задачі, причина відмови. */
function useBulkTexts(key: SalesBulkKey, denied: string): BulkActionTexts {
  const t = useSalesT()
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
 * Дія графа для вибраних документів (ADR-0066): підпис і причина — з графа зі змінами розширення,
 * невдача «не з того статусу» — словами модуля (`<ключ>.notAllowed`).
 */
export function useSalesBulkTransition(
  { kind, selection, filter }: SalesBulkScope,
  {
    key,
    transition,
    icon,
    isPrimary = false,
  }: {
    key: Exclude<SalesBulkKey, `${string}.delete`>
    /** Дія графа; `undefined` — розширення її сховало, кнопки немає. */
    transition: ModuleTransition | undefined
    icon: ActionIcon
    isPrimary?: boolean
  },
): BulkAction {
  const t = useSalesT()
  const texts = useBulkTexts(key, t(`${key}.denied`))
  const isCancel = transition?.id === "cancel"
  return useBulkAction({
    resource: kind.resource,
    selection,
    filter,
    action: transition?.id ?? "",
    label: transition?.label ?? "",
    icon,
    variant: isPrimary ? "default" : "outline",
    reason: transition?.reason,
    destructive: isCancel,
    texts,
    failureLabel: (code) =>
      code === "transition_not_allowed" ? t(`${key}.notAllowed`) : undefined,
  })
}

/** «Видалити» вибрані чернетки (ADR-0066): проведені й скасовані — у звіті з причиною словами модуля. */
export function useSalesBulkDelete({
  kind,
  selection,
  filter,
}: SalesBulkScope): BulkAction {
  const t = useSalesT()
  const lockedReason = useSalesLockedReason(kind)
  const key = `${kind.keys.list}.bulk.delete` as const
  const texts = useBulkTexts(key, t(`${kind.keys.record}.delete.denied`))
  return useBulkAction({
    resource: kind.resource,
    selection,
    filter,
    action: "delete",
    label: t(`${key}.button`),
    icon: "delete",
    destructive: true,
    texts,
    failureLabel: (code) => lockedReason("delete", code),
  })
}

/** Підпис рядка у звіті й панелі вибраного: номер, у чернетки — клієнт і дата. */
export function useSalesRowLabel(kind: SalesKindBase) {
  const t = useSalesT()
  const format = useFormat()
  const { list } = kind.keys
  return (document: SalesDocument) =>
    document.number
      ? t(`${list}.bulk.rowLabel`, { number: document.number })
      : t(`${list}.bulk.rowLabelDraft`, {
          client: document.clientName,
          date: format.date(document.date, "date"),
        })
}

/** Масова дія панелі вибраного: дія графа, яку розширення сховало, не показується (`isShown`). */
export interface SalesBulkEntry {
  readonly id: string
  readonly action: BulkAction
  readonly isShown: boolean
}

/** Кнопки панелі вибраного й діалоги поруч зі списком у порядку `entries`. */
export function salesBulkOf<D extends SalesDocument>(
  entries: readonly SalesBulkEntry[],
  rowLabel: (document: D) => string,
): { bulk: ListReportBulk<D>; dialogs: React.ReactNode } {
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
