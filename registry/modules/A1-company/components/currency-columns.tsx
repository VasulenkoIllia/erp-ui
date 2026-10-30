import { useMemo } from "react"

import { RecordLink } from "@/components/erp/record-link"
import { StatusBadge } from "@/components/erp/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { currencyName } from "@/lib/currencies"
import type { DataTableColumn } from "@/lib/data-table-core"
import { useFormat } from "@/lib/format"

import { RATE_DECIMALS, type Currency } from "../contract"
import type { CurrencyColumnId } from "../extension"
import { RATE_CURRENCY_PARAM, useCompanyModule } from "../module-context"
import { useCompanyT } from "../use-company-t"

type CurrencyColumn = DataTableColumn<Currency> & { id: CurrencyColumnId }

/**
 * Колонки списку валют: код і назва (посилання на курси цієї валюти), стан, найновіший курс і його
 * дата; з правом змінювати — «Вимкнути» чи «Увімкнути». Базова валюта має позначку: курс до себе
 * самої не потрібен. Ключі — `CurrencyColumnId`.
 */
export function useCurrencyColumns({
  base,
  canUpdate,
  onToggle,
  isSaving,
}: {
  base: string
  canUpdate: boolean
  onToggle: (currency: Currency) => void
  isSaving: boolean
}): readonly CurrencyColumn[] {
  const t = useCompanyT()
  const format = useFormat()
  const { paths, preload } = useCompanyModule()
  return useMemo(() => {
    const columns: CurrencyColumn[] = [
      {
        id: "code",
        header: t("currencies.columns.code"),
        cell: (currency) => (
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <RecordLink
              to={`${paths.rates}?${RATE_CURRENCY_PARAM}=${currency.code}`}
              preload={preload}
            >
              {currency.code}
            </RecordLink>
            <span className="text-muted-foreground">
              {currencyName(currency.code, format.locale)}
            </span>
            {currency.code === base ? (
              <Badge variant="secondary">{t("currencies.base")}</Badge>
            ) : null}
          </span>
        ),
        sortField: "code",
        minWidth: 16,
        grow: 2,
        sticky: true,
        card: "title",
      },
      {
        id: "status",
        header: t("currencies.columns.status"),
        cell: (currency) => (
          <StatusBadge
            status={
              currency.active
                ? {
                    id: "active",
                    label: t("currencies.status.active"),
                    tone: "success",
                  }
                : {
                    id: "disabled",
                    label: t("currencies.status.disabled"),
                    tone: "neutral",
                  }
            }
          />
        ),
        minWidth: 8,
        grow: 0,
        card: "badge",
      },
      {
        id: "latestRate",
        header: t("currencies.columns.latestRate", { base }),
        cell: (currency) =>
          typeof currency.latestRate === "number" ? (
            <span className="tabular-nums">
              {format.number(currency.latestRate, {
                minimumFractionDigits: 2,
                maximumFractionDigits: RATE_DECIMALS,
              })}
            </span>
          ) : (
            <span className="text-muted-foreground">
              {t("currencies.noRate")}
            </span>
          ),
        align: "end",
        minWidth: 9,
      },
      {
        id: "latestRateDate",
        header: t("currencies.columns.latestRateDate"),
        cell: (currency) =>
          currency.latestRateDate
            ? format.date(currency.latestRateDate, "date")
            : null,
        minWidth: 8,
      },
      {
        id: "actions",
        header: t("currencies.columns.actions"),
        headerHidden: true,
        // Базову валюту не вимикають: на ній тримаються всі курси.
        cell: (currency) =>
          currency.code === base ? null : (
            <Button
              variant="ghost"
              size="sm"
              disabled={isSaving}
              focusableWhenDisabled
              aria-label={t(
                currency.active
                  ? "currencies.disableFor"
                  : "currencies.enableFor",
                { code: currency.code },
              )}
              onClick={() => {
                onToggle(currency)
              }}
            >
              {t(currency.active ? "currencies.disable" : "currencies.enable")}
            </Button>
          ),
        minWidth: 8,
        grow: 0,
        align: "end",
        card: "actions",
      },
    ]
    return canUpdate
      ? columns
      : columns.filter((column) => column.id !== "actions")
  }, [t, format, paths.rates, preload, base, canUpdate, onToggle, isSaving])
}
