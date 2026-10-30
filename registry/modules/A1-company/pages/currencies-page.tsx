import { useAuthenticated, useCanAccess } from "ra-core"
import { useCallback, useRef, useState } from "react"
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
import { ACTION_ICONS, MODULE_ICONS } from "@/lib/icons"
import type { ListDefaults } from "@/lib/list-state"

import { BaseCurrencyGate } from "../components/base-currency-gate"
import { useCurrencyColumns } from "../components/currency-columns"
import { CurrencyFormDialog } from "../components/currency-form"
import { useCompanyState } from "../components/use-company-state"
import { useCurrencyCodes } from "../components/use-currency-codes"
import { useCurrencyToggle } from "../components/use-currency-toggle"
import { CURRENCIES, type Currency } from "../contract"
import type { CurrencyColumnId, CurrencyIds } from "../extension"
import { useCompanyModule } from "../module-context"
import { useCompanyT } from "../use-company-t"

const LIST_DEFAULTS: ListDefaults = {
  tab: "all",
  sort: { field: "code", order: "ASC" },
  sortFields: ["code"],
}
const NO_FILTERS = [] as const
const NO_TABS = [] as const
/** Код — заголовок картки на телефоні й посилання на курси: розширення його не ховає. */
const LOCKED_COLUMNS: readonly CurrencyColumnId[] = ["code"]

/**
 * Валюти компанії на шаблоні List Report сторінками (SPEC §7; ADR-0043): код і назва, стан, найновіший
 * курс. «Додати валюту» — форма в діалозі, «Вимкнути» — у рядку; валюти не видаляються. Без
 * `currencies:read` — «Немає доступу» без запиту.
 */
export function CurrenciesPage() {
  const t = useCompanyT()
  const { isPending } = useAuthenticated()
  const access = useCanAccess({ resource: CURRENCIES, action: "read" })
  const heading = usePageHeading(t("currencies.title"))
  const company = useCompanyState(!isPending)
  const { base } = company
  const canRead = access.canAccess === true
  const codes = useCurrencyCodes(company, canRead)
  const [creating, setCreating] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)
  const Create = ACTION_ICONS.create
  const denied = (reason: string) => (
    <DeniedAction reason={reason}>
      <Create aria-hidden />
      {t("currencies.create")}
    </DeniedAction>
  )
  const actions: (ListReportAction & { id: "create" })[] = [
    {
      id: "create",
      node: (
        <PermissionGate
          resource={CURRENCIES}
          action="create"
          fallback={denied(t("currencies.createDenied"))}
        >
          {codes.unavailable ? (
            denied(codes.unavailable)
          ) : (
            <Button
              ref={opener}
              onClick={() => {
                setCreating(true)
              }}
            >
              <Create aria-hidden />
              {t("currencies.create")}
            </Button>
          )}
        </PermissionGate>
      ),
    },
  ]
  return (
    <div className="space-y-6">
      <ListReportHeader
        title={t("currencies.title")}
        description={base && t("currencies.lead", { base })}
        headingRef={heading}
        actions={isPending ? undefined : actions}
      />
      {isPending || access.isPending ? (
        <PageSkeleton rows={6} />
      ) : canRead ? (
        <BaseCurrencyGate company={company} rows={6}>
          {(known) => <CurrencyList base={known} />}
        </BaseCurrencyGate>
      ) : (
        <PageState kind="forbidden" />
      )}
      {creating && base ? (
        <CurrencyFormDialog
          taken={[base, ...codes.all]}
          finalFocus={opener}
          onClose={() => {
            setCreating(false)
          }}
          onSaved={() => {
            setCreating(false)
          }}
        />
      ) : null}
    </div>
  )
}

function CurrencyList({ base }: { base: string }) {
  const t = useCompanyT()
  const { extension } = useCompanyModule()
  const [searchParams, setSearchParams] = useSearchParams()
  const canUpdate = useHasPermission(CURRENCIES, "update")
  const { toggle, isSaving } = useCurrencyToggle()
  const onToggle = useCallback(
    (currency: Currency) => {
      void toggle(currency)
    },
    [toggle],
  )
  const columns = useCurrencyColumns({ base, canUpdate, onToggle, isSaving })
  const list = useExtendedList<Currency, CurrencyIds>(
    columns,
    NO_FILTERS,
    NO_TABS,
    extension.currencies,
    LOCKED_COLUMNS,
  )
  const report = useListReport({
    resource: CURRENCIES,
    params: searchParams,
    onParamsChange: setSearchParams,
    defaults: LIST_DEFAULTS,
  })
  return (
    <ListReport
      report={report}
      mode="pages"
      searchPlaceholder={t("currencies.search")}
      tableLabel={t("currencies.tableLabel")}
      columns={list.columns}
      countLabel={(count, value) => t("currencies.count", { count, value })}
      empty={
        <PageState
          kind="empty"
          icon={MODULE_ICONS.A1}
          title={t("currencies.empty.title")}
          description={t("currencies.empty.description", { base })}
        />
      }
    />
  )
}
