import { useMemo, type MouseEvent } from "react"

import { DeniedAction } from "@/components/erp/permission-gate"
import { StatusBadge } from "@/components/erp/status-badge"
import { Button } from "@/components/ui/button"
import { useRecordDenialReason } from "@/hooks/use-record-access"
import { currencyName } from "@/lib/currencies"
import type { DataTableColumn } from "@/lib/data-table-core"
import { useFormat } from "@/lib/format"
import { ACTION_ICONS } from "@/lib/icons"
import { recordDenial } from "@/lib/record-access"

import {
  MANUAL_RATE_SOURCE,
  RATE_DECIMALS,
  RATE_SOURCE_DENIAL,
  type ExchangeRate,
} from "../contract"
import type { RateColumnId } from "../extension"
import { useCompanyT } from "../use-company-t"
import { useRateSourceLabel } from "./rate-source"

type RateColumn = DataTableColumn<ExchangeRate> & { id: RateColumnId }

export type RateAction = (
  rate: ExchangeRate,
  event: MouseEvent<HTMLElement>,
) => void

/**
 * Колонки таблиці курсів: дата, валюта, курс до базової, джерело; дії «Змінити» й «Видалити» — з
 * правом. Курс, який забороняє сервер (із зовнішнього джерела, ADR-0037), — неактивна «Змінити» з
 * причиною. Ключі — `RateColumnId`.
 */
export function useRateColumns({
  base,
  canUpdate,
  canDelete,
  onEdit,
  onDelete,
}: {
  base: string
  canUpdate: boolean
  canDelete: boolean
  onEdit: RateAction
  onDelete: RateAction
}): readonly RateColumn[] {
  const t = useCompanyT()
  const format = useFormat()
  const sourceLabel = useRateSourceLabel()
  const recordReason = useRecordDenialReason()
  return useMemo(() => {
    const dateText = (rate: ExchangeRate) => format.date(rate.date, "date")
    const lockReason = (rate: ExchangeRate, action: string) =>
      recordDenial(rate, action) === RATE_SOURCE_DENIAL
        ? t("rates.sourceLocked", { source: sourceLabel(rate.source) })
        : recordReason(rate, action)
    const columns: RateColumn[] = [
      {
        id: "date",
        header: t("rates.columns.date"),
        cell: (rate) => (
          <span className="font-medium tabular-nums">{dateText(rate)}</span>
        ),
        sortField: "date",
        firstSortOrder: "DESC",
        minWidth: 8,
        grow: 0,
        sticky: true,
        card: "title",
      },
      {
        id: "currency",
        header: t("rates.columns.currency"),
        cell: (rate) => (
          <span>
            <span className="font-medium">{rate.currency}</span>{" "}
            <span className="text-muted-foreground">
              {currencyName(rate.currency, format.locale)}
            </span>
          </span>
        ),
        sortField: "currency",
        minWidth: 14,
        grow: 2,
      },
      {
        id: "rate",
        header: t("rates.columns.rate", { base }),
        cell: (rate) => (
          <span className="tabular-nums">
            {format.number(rate.rate, {
              minimumFractionDigits: 2,
              maximumFractionDigits: RATE_DECIMALS,
            })}
          </span>
        ),
        sortField: "rate",
        firstSortOrder: "DESC",
        align: "end",
        minWidth: 9,
      },
      {
        id: "source",
        header: t("rates.columns.source"),
        cell: (rate) => (
          <StatusBadge
            status={{
              id: rate.source,
              label: sourceLabel(rate.source),
              tone: rate.source === MANUAL_RATE_SOURCE ? "neutral" : "info",
              icon: rate.source === MANUAL_RATE_SOURCE ? "draft" : "info",
            }}
          />
        ),
        minWidth: 8,
        grow: 0,
        card: "badge",
      },
      {
        id: "actions",
        header: t("rates.columns.actions"),
        headerHidden: true,
        cell: (rate) => (
          <RateActions
            rate={rate}
            label={dateText(rate)}
            canUpdate={canUpdate}
            canDelete={canDelete}
            lockReason={lockReason}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ),
        minWidth: 14,
        grow: 0,
        align: "end",
        card: "actions",
      },
    ]
    return canUpdate || canDelete
      ? columns
      : columns.filter((column) => column.id !== "actions")
  }, [
    t,
    format,
    sourceLabel,
    recordReason,
    base,
    canUpdate,
    canDelete,
    onEdit,
    onDelete,
  ])
}

function RateActions({
  rate,
  label,
  canUpdate,
  canDelete,
  lockReason,
  onEdit,
  onDelete,
}: {
  rate: ExchangeRate
  label: string
  canUpdate: boolean
  canDelete: boolean
  lockReason: (rate: ExchangeRate, action: string) => string | undefined
  onEdit: RateAction
  onDelete: RateAction
}) {
  const t = useCompanyT()
  const name = { currency: rate.currency, date: label }
  return (
    <span className="flex justify-end gap-1">
      {canUpdate ? (
        <RateActionButton
          label={t("rates.edit")}
          ariaLabel={t("rates.editFor", name)}
          lock={lockReason(rate, "update")}
          onClick={(event) => {
            onEdit(rate, event)
          }}
        />
      ) : null}
      {canDelete ? (
        <RateActionButton
          label={t("rates.delete")}
          ariaLabel={t("rates.deleteFor", name)}
          lock={lockReason(rate, "delete")}
          onClick={(event) => {
            onDelete(rate, event)
          }}
        />
      ) : null}
    </span>
  )
}

/** Заборонена дія лишається на місці, неактивна, з причиною (SPEC §8.4). */
function RateActionButton({
  label,
  ariaLabel,
  lock,
  onClick,
}: {
  label: string
  ariaLabel: string
  lock: string | undefined
  onClick: (event: MouseEvent<HTMLElement>) => void
}) {
  const Lock = ACTION_ICONS.lock
  return lock ? (
    <DeniedAction
      variant="ghost"
      size="sm"
      reason={lock}
      aria-label={ariaLabel}
    >
      <Lock aria-hidden />
      {label}
    </DeniedAction>
  ) : (
    <Button variant="ghost" size="sm" aria-label={ariaLabel} onClick={onClick}>
      {label}
    </Button>
  )
}
