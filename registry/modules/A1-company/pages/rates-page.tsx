import { useQueryClient } from "@tanstack/react-query"
import { useAuthenticated, useCanAccess } from "ra-core"
import { useCallback, useMemo, useRef, useState, type RefObject } from "react"
import { useSearchParams } from "react-router"

import { PageSkeleton, PageState } from "@/components/erp/page-state"
import { DeniedAction, PermissionGate } from "@/components/erp/permission-gate"
import {
  ListReport,
  ListReportHeader,
  useListReport,
  type ListReportAction,
} from "@/components/templates/list-report"
import { Button } from "@/components/ui/button"
import { useExtendedList } from "@/hooks/use-extended-list"
import { useHasPermission } from "@/hooks/use-me"
import { usePageHeading } from "@/hooks/use-page-heading"
import type { FilterDefinition } from "@/lib/filters"
import { ACTION_ICONS, MODULE_ICONS } from "@/lib/icons"
import type { ListDefaults } from "@/lib/list-state"

import { BaseCurrencyGate } from "../components/base-currency-gate"
import { useRateColumns, type RateAction } from "../components/rate-columns"
import { RateFormDialog } from "../components/rate-form"
import { useRateSourceLabel } from "../components/rate-source"
import {
  RemoveRateDialog,
  type RateRemoval,
} from "../components/remove-rate-dialog"
import { useCompanyState } from "../components/use-company-state"
import { useCurrencyCodes } from "../components/use-currency-codes"
import {
  CURRENCIES,
  EXCHANGE_RATES,
  RATE_SOURCES,
  type ExchangeRate,
} from "../contract"
import type { RateColumnId, RateFilterId, RateIds } from "../extension"
import { useCompanyModule } from "../module-context"
import { useCompanyT } from "../use-company-t"

const LIST_DEFAULTS: ListDefaults = {
  tab: "all",
  sort: { field: "date", order: "DESC" },
  sortFields: ["date", "currency", "rate"],
}
const NO_TABS = [] as const
/** Дата — заголовок картки на телефоні: розширення її не ховає. */
const LOCKED_COLUMNS: readonly RateColumnId[] = ["date"]

type RateDialog =
  { kind: "create" } | { kind: "edit"; rate: ExchangeRate } | null

/**
 * Таблиця курсів на шаблоні List Report сторінками (SPEC §7; ADR-0043): фільтри за валютою, датою й
 * джерелом, новіші згори. Форми в діалозі; курс із зовнішнього джерела лише для перегляду. Без
 * `exchange-rates:read` — «Немає доступу» без запиту.
 */
export function RatesPage() {
  const t = useCompanyT()
  const { isPending } = useAuthenticated()
  const access = useCanAccess({ resource: EXCHANGE_RATES, action: "read" })
  const heading = usePageHeading(t("rates.title"))
  const company = useCompanyState(!isPending)
  const { base } = company
  const canRead = access.canAccess === true
  const codes = useCurrencyCodes(company, canRead)
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<RateDialog>(null)
  const opener = useRef<HTMLElement | null>(null)
  const close = () => {
    setDialog(null)
  }
  const openEdit = useCallback<RateAction>((rate, event) => {
    opener.current = event.currentTarget
    setDialog({ kind: "edit", rate })
  }, [])
  const Create = ACTION_ICONS.create
  const denied = (reason: string) => (
    <DeniedAction reason={reason}>
      <Create aria-hidden />
      {t("rates.create")}
    </DeniedAction>
  )
  const blocked =
    codes.unavailable ??
    (codes.active.length ? undefined : t("rates.noCurrencies"))
  const actions: (ListReportAction & { id: "create" })[] = [
    {
      id: "create",
      node: (
        <PermissionGate
          resource={EXCHANGE_RATES}
          action="create"
          fallback={denied(t("rates.createDenied"))}
        >
          {blocked ? (
            denied(blocked)
          ) : (
            <Button
              onClick={(event) => {
                opener.current = event.currentTarget
                setDialog({ kind: "create" })
              }}
            >
              <Create aria-hidden />
              {t("rates.create")}
            </Button>
          )}
        </PermissionGate>
      ),
    },
  ]
  return (
    <div className="space-y-6">
      <ListReportHeader
        title={t("rates.title")}
        description={base && t("rates.lead", { base })}
        headingRef={heading}
        actions={isPending ? undefined : actions}
      />
      {isPending || access.isPending ? (
        <PageSkeleton rows={8} />
      ) : canRead ? (
        <BaseCurrencyGate company={company} rows={8}>
          {(known) => (
            <RateList
              base={known}
              currencies={codes.all}
              heading={heading}
              onEdit={openEdit}
            />
          )}
        </BaseCurrencyGate>
      ) : (
        <PageState kind="forbidden" />
      )}
      {dialog && base ? (
        <RateFormDialog
          rate={dialog.kind === "edit" ? dialog.rate : undefined}
          currencies={codes.active}
          base={base}
          finalFocus={opener}
          onClose={close}
          onSaved={() => {
            close()
            // Найновіший курс валюти на сусідній сторінці.
            void queryClient.invalidateQueries({ queryKey: [CURRENCIES] })
          }}
        />
      ) : null}
    </div>
  )
}

function useRateFilters(currencies: readonly string[]) {
  const t = useCompanyT()
  const sourceLabel = useRateSourceLabel()
  return useMemo(() => {
    const filters: (FilterDefinition & { id: RateFilterId })[] = [
      {
        kind: "options",
        id: "currency",
        field: "currency",
        label: t("rates.filters.currency"),
        options: currencies.map((code) => ({ value: code, label: code })),
      },
      {
        kind: "date-range",
        id: "date",
        field: "date",
        label: t("rates.filters.date"),
      },
      {
        kind: "options",
        id: "source",
        field: "source",
        label: t("rates.filters.source"),
        options: RATE_SOURCES.map((source) => ({
          value: source,
          label: sourceLabel(source),
        })),
      },
    ]
    return filters
  }, [t, currencies, sourceLabel])
}

function RateList({
  base,
  currencies,
  heading,
  onEdit,
}: {
  base: string
  currencies: readonly string[]
  heading: RefObject<HTMLHeadingElement | null>
  onEdit: RateAction
}) {
  const t = useCompanyT()
  const { extension } = useCompanyModule()
  const [searchParams, setSearchParams] = useSearchParams()
  const canUpdate = useHasPermission(EXCHANGE_RATES, "update")
  const canDelete = useHasPermission(EXCHANGE_RATES, "delete")
  const [removal, setRemoval] = useState<RateRemoval | null>(null)
  const onDelete = useCallback<RateAction>((rate) => {
    setRemoval({ rate, open: true })
  }, [])
  const columns = useRateColumns({
    base,
    canUpdate,
    canDelete,
    onEdit,
    onDelete,
  })
  const filters = useRateFilters(currencies)
  const list = useExtendedList<ExchangeRate, RateIds>(
    columns,
    filters,
    NO_TABS,
    extension.rates,
    LOCKED_COLUMNS,
  )
  const report = useListReport({
    resource: EXCHANGE_RATES,
    params: searchParams,
    onParamsChange: setSearchParams,
    defaults: LIST_DEFAULTS,
    filters: list.filters,
  })
  return (
    <>
      <ListReport
        report={report}
        mode="pages"
        tableLabel={t("rates.tableLabel")}
        columns={list.columns}
        countLabel={(count, value) => t("rates.count", { count, value })}
        empty={
          <PageState
            kind="empty"
            icon={MODULE_ICONS.A1}
            title={t("rates.empty.title")}
            description={t("rates.empty.description")}
          />
        }
      />
      <RemoveRateDialog
        removal={removal}
        returnFocus={() => heading.current}
        onClose={() => {
          setRemoval((current) => current && { ...current, open: false })
        }}
      />
    </>
  )
}
