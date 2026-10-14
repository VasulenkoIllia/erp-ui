import { useAuthenticated, useCanAccess, useUpdate } from "ra-core"
import { useId, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router"
import { toast } from "sonner"

import { ConflictDialog } from "@/registry/erp/conflict-dialog"
import { FilterBar } from "@/registry/erp/filter-bar"
import { PageSkeleton, PageState } from "@/registry/erp/page-state"
import { SavedViewsMenu } from "@/registry/erp/saved-views-menu"
import { StatusTabs } from "@/registry/erp/status-tabs"
import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import { useListCounts } from "@/registry/hooks/use-list-counts"
import { useListState } from "@/registry/hooks/use-list-state"
import { useSavedViews } from "@/registry/hooks/use-saved-views"
import { useMe } from "@/registry/hooks/use-me"
import { isApiError } from "@/registry/lib/api"
import { useErpUiT } from "@/registry/lib/i18n"
import { ACTION_ICONS, MODULE_ICONS } from "@/registry/lib/icons"
import { Button } from "@/registry/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/registry/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/registry/ui/select"
import { Spinner } from "@/registry/ui/spinner"

import {
  INVOICE_STATUSES,
  type Invoice,
  type InvoiceStatus,
} from "@/data/invoices"

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
 * адресі, права на редагування, збереження з версією й діалог конфлікту.
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
  const { canAccess: canEdit } = useCanAccess({
    resource: RESOURCE,
    action: "edit",
  })

  const listProps: InvoiceTableProps = {
    view,
    canEdit: canEdit === true,
    onEdit: setEditing,
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

type EditValues = Pick<Invoice, "client" | "status">

function EditInvoiceDialog({
  invoice,
  onReplace,
  onClose,
}: {
  invoice: Invoice
  /** Показати в формі іншу версію запису (після «Взяти збережене»). */
  onReplace: (invoice: Invoice) => void
  onClose: () => void
}) {
  const t = usePageT()
  const kitT = useErpUiT()
  const errorMessage = useApiErrorMessage()
  const ids = useId()
  const [values, setValues] = useState<EditValues>({
    client: invoice.client,
    status: invoice.status,
  })
  const [clientError, setClientError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<Invoice | null>(null)
  const [update, { isPending: saving }] = useUpdate<Invoice>()

  const statusItems = INVOICE_STATUSES.map((value) => ({
    value,
    label: t(`statuses.${value}`),
  }))

  const save = (version: number) => {
    void update(
      RESOURCE,
      {
        id: invoice.id,
        data: { ...values, version },
        previousData: invoice,
      },
      {
        mutationMode: "pessimistic",
        onSuccess: () => {
          toast.success(t("saved"))
          onClose()
        },
        onError: (error) => {
          if (isApiError(error) && error.code === "conflict") {
            setConflict(error.current as Invoice)
            return
          }
          if (isApiError(error) && error.fieldErrors?.client) {
            setClientError(errorMessage(error))
            return
          }
          toast.error(t("saveFailed", { message: errorMessage(error) }))
        },
      },
    )
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!values.client.trim()) {
      setClientError(kitT("validation.required"))
      return
    }
    setClientError(null)
    save(invoice.version)
  }

  const statusLabel = (status: InvoiceStatus) => t(`statuses.${status}`)

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>
              {t("editTitle", { number: invoice.number })}
            </DialogTitle>
            <DialogDescription>{t("editDescription")}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={clientError ? true : undefined}>
              <FieldLabel htmlFor={`${ids}-client`}>{t("client")}</FieldLabel>
              <Input
                id={`${ids}-client`}
                value={values.client}
                required
                aria-invalid={clientError ? true : undefined}
                onChange={(event) => {
                  setValues((v) => ({ ...v, client: event.target.value }))
                }}
              />
              {clientError ? <FieldError>{clientError}</FieldError> : null}
            </Field>
            <Field>
              <FieldLabel htmlFor={`${ids}-status`}>
                {t("columns.status")}
              </FieldLabel>
              <Select
                items={statusItems}
                value={values.status}
                onValueChange={(value: InvoiceStatus | null) => {
                  if (value) setValues((v) => ({ ...v, status: value }))
                }}
              >
                <SelectTrigger id={`${ids}-status`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Spinner aria-hidden /> : null}
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
        {/* Вкладений діалог: Base UI тримає фокус у ньому й повертає у форму. */}
        <ConflictDialog
          open={conflict !== null}
          onOpenChange={(open) => {
            if (!open) setConflict(null)
          }}
          fields={
            conflict
              ? [
                  {
                    key: "client",
                    label: t("client"),
                    mine: values.client,
                    theirs: conflict.client,
                  },
                  {
                    key: "status",
                    label: t("columns.status"),
                    mine: statusLabel(values.status),
                    theirs: statusLabel(conflict.status),
                  },
                ]
              : []
          }
          onOverwrite={() => {
            const latest = conflict
            setConflict(null)
            if (latest) save(latest.version)
          }}
          onReload={() => {
            const latest = conflict
            setConflict(null)
            if (latest) {
              onReplace(latest)
              toast(t("reloaded"))
            }
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
