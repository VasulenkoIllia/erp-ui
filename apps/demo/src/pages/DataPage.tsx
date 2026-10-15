import { useAuthenticated, useCanAccess } from "ra-core"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router"
import { toast } from "sonner"

import { FilterBar } from "@/registry/erp/filter-bar"
import { PageSkeleton, PageState } from "@/registry/erp/page-state"
import { SavedViewsMenu } from "@/registry/erp/saved-views-menu"
import { StatusTabs } from "@/registry/erp/status-tabs"
import { useCompanyId } from "@/registry/hooks/use-company"
import { useListCounts } from "@/registry/hooks/use-list-counts"
import { useListState } from "@/registry/hooks/use-list-state"
import { useRowSelection } from "@/registry/hooks/use-row-selection"
import { useSavedViews } from "@/registry/hooks/use-saved-views"
import { useMe } from "@/registry/hooks/use-me"
import { ACTION_ICONS, MODULE_ICONS } from "@/registry/lib/icons"
import { whenIdle } from "@/registry/lib/lazy"
import { Button } from "@/registry/ui/button"

import type { Invoice } from "@/data/invoices"

import { useApproveAction } from "./invoice-bulk"
import { InlineConflictDialog, type InlineConflict } from "./invoice-cells"
import { EditInvoiceDialog } from "./invoice-edit-dialog"
import { preloadInlineEditors } from "./inline-editors"
import { INVOICE_LIST_DEFAULTS, useInvoiceListSetup } from "./invoice-filters"
import { InvoiceTable, type InvoiceTableProps } from "./invoice-table"
import { PageHeader } from "./PageHeader"

const usePageT = () => useTranslation("demo", { keyPrefix: "dataPage" }).t

const RESOURCE = "invoices"

type ViewMode = "scroll" | "pages"

/**
 * Стрес-сторінка (SPEC §18.1, кроки 0.6b і 0.6c): 10 000 рахунків з мок-сервера через ra-core у
 * erp/data-table. Прокрутка вікнами по 100 (useWindowedList) або звичайні сторінки (useGetList),
 * вкладки-статуси з лічильниками, FilterBar із чипами, особисті збережені види, стан списку в
 * адресі, вибір «сторінка / усе» й масове погодження фоновою задачею, редагування клієнта й суми в
 * комірці, права на редагування, збереження з версією й діалог конфлікту.
 */
export function DataPage() {
  const t = usePageT()
  // Без сесії ra-core перенаправить на /login і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} lead={t("lead")} />
      {isPending ? <PageSkeleton rows={8} /> : <InvoiceList />}
    </div>
  )
}

function InvoiceList() {
  const t = usePageT()
  const { data: me } = useMe()
  const { tabs, filters } = useInvoiceListSetup()
  const [searchParams, setSearchParams] = useSearchParams()
  const views = useSavedViews(RESOURCE)
  const list = useListState({
    params: searchParams,
    onParamsChange: setSearchParams,
    defaults: INVOICE_LIST_DEFAULTS,
    tabs,
    filters,
    views: views.views,
    viewsFailed: Boolean(views.error),
  })
  const counts = useListCounts(RESOURCE, list.state.filter, tabs, {
    enabled: list.isReady,
  })
  const [view, setView] = useState<ViewMode>("scroll")
  const [editing, setEditing] = useState<Invoice | null>(null)
  const [conflict, setConflict] = useState<InlineConflict | null>(null)
  useEffect(
    () =>
      whenIdle(() => {
        void preloadInlineEditors()
      }),
    [],
  )
  const { canAccess: canEdit } = useCanAccess({
    resource: RESOURCE,
    action: "edit",
  })
  // Інший фільтр чи компанія — інші записи: вибір скидається (ADR-0018).
  const companyId = useCompanyId()
  const selection = useRowSelection([list.queryFilter, companyId])
  const approve = useApproveAction(selection, list.queryFilter)

  const listProps: InvoiceTableProps = {
    view,
    canEdit: canEdit === true,
    onEdit: setEditing,
    onConflict: setConflict,
    selection,
    bulkActions: approve.button,
    filter: list.queryFilter,
    sort: list.state.sort,
    onSortChange: list.setSort,
    isFiltered: list.isFiltered,
    onResetFilters: () => {
      list.applyView(null)
    },
    empty: (
      <PageState
        kind="empty"
        icon={MODULE_ICONS.K2}
        action={
          <Button
            onClick={() => {
              toast(t("createInvoice"))
            }}
          >
            <ACTION_ICONS.create aria-hidden />
            {t("createInvoice")}
          </Button>
        }
      />
    ),
  }

  return (
    <div className="space-y-4">
      {me ? (
        <p className="text-sm text-muted-foreground">
          {t("permissionsNote", {
            name: me.name,
            roles: me.roles
              .map((role) => t(`roles.${role}`, { defaultValue: role }))
              .join(", "),
          })}
        </p>
      ) : null}
      <StatusTabs
        label={t("statusFilter")}
        tabs={tabs}
        value={list.state.tab}
        onValueChange={list.setTab}
        counts={counts}
      />
      <FilterBar
        filters={filters}
        value={list.state.filter}
        onValueChange={list.setFilter}
        searchPlaceholder={t("search")}
        actions={
          <>
            <SavedViewsMenu resource={RESOURCE} views={views} list={list} />
            <ViewModeToggle value={view} onValueChange={setView} />
          </>
        }
      />
      {list.isReady ? (
        <InvoiceTable {...listProps} />
      ) : (
        <PageSkeleton rows={8} />
      )}
      {approve.dialog}
      <InlineConflictDialog
        conflict={conflict}
        onClose={() => {
          setConflict(null)
        }}
      />
      {editing ? (
        <EditInvoiceDialog
          key={`${editing.id}-${String(editing.version)}`}
          invoice={editing}
          onReplace={setEditing}
          onClose={() => {
            setEditing(null)
          }}
        />
      ) : null}
    </div>
  )
}

/** Прокрутка вікнами (великий список) чи сторінки (малий) — для порівняння на стрес-сторінці. */
function ViewModeToggle({
  value,
  onValueChange,
}: {
  value: ViewMode
  onValueChange: (mode: ViewMode) => void
}) {
  const t = usePageT()
  return (
    <div
      role="group"
      aria-label={t("view.label")}
      className="flex shrink-0 gap-1"
    >
      {(["scroll", "pages"] as const).map((mode) => (
        <Button
          key={mode}
          variant={value === mode ? "secondary" : "ghost"}
          aria-pressed={value === mode}
          onClick={() => {
            onValueChange(mode)
          }}
        >
          {t(`view.${mode}`)}
        </Button>
      ))}
    </div>
  )
}
