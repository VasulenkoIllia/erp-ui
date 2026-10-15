import { useAuthenticated, useCanAccess } from "ra-core"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router"
import { toast } from "sonner"

import { PageSkeleton, PageState } from "@/registry/erp/page-state"
import { useMe } from "@/registry/hooks/use-me"
import { ACTION_ICONS, MODULE_ICONS } from "@/registry/lib/icons"
import { whenIdle } from "@/registry/lib/lazy"
import {
  ListReport,
  ListReportHeader,
  useListReport,
} from "@/registry/templates/list-report"
import { Button } from "@/registry/ui/button"

import type { Invoice } from "@/data/invoices"

import { usePageHeading } from "./heading-focus"
import { useApproveAction } from "./invoice-bulk"
import { InlineConflictDialog, type InlineConflict } from "./invoice-cells"
import { EditInvoiceDialog } from "./invoice-edit-dialog"
import { preloadInlineEditors } from "./inline-editors"
import { INVOICE_LIST_DEFAULTS, useInvoiceListSetup } from "./invoice-filters"
import { getInvoiceId, useInvoiceColumns } from "./invoice-columns"
import {
  NO_INVOICES_EXTENSION,
  useExtendedInvoiceColumns,
  type InvoicesExtension,
} from "./invoice-extension"

const usePageT = () => useTranslation("demo", { keyPrefix: "dataPage" }).t

const RESOURCE = "invoices"

type ViewMode = "scroll" | "pages"

/**
 * Стрес-сторінка (SPEC §18.1, кроки 0.6b і 0.6c) на шаблоні List Report (крок 1.1, ADR-0022):
 * 10 000 рахунків з мок-сервера через ra-core. Прокрутка вікнами по 100 або звичайні сторінки,
 * вкладки-статуси з лічильниками, FilterBar із чипами, особисті збережені види, стан списку в
 * адресі, вибір «сторінка / усе» й масове погодження фоновою задачею, редагування клієнта й суми в
 * комірці, права на редагування, збереження з версією й діалог конфлікту. `extension` — розширення
 * проекту (ADR-0020): колонки з нових полів рахунку.
 */
export function DataPage({
  extension = NO_INVOICES_EXTENSION,
}: {
  extension?: InvoicesExtension
}) {
  const t = usePageT()
  // Без сесії ra-core перенаправить на /login і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  const heading = usePageHeading(t("title"))
  // Шапка — над перевіркою сесії: той самий вузол від першого кадру (перший екран і фокус на h1 не
  // чекають на сесію), тож список нижче — без власної шапки.
  return (
    <div className="space-y-6">
      <ListReportHeader
        title={t("title")}
        description={t("lead")}
        headingRef={heading}
        actions={[{ id: "create", node: <CreateInvoiceButton /> }]}
      />
      {isPending ? (
        <PageSkeleton rows={8} />
      ) : (
        <InvoiceList extension={extension} />
      )}
    </div>
  )
}

/** Створення рахунку в демо — лише сповіщення: у шапці й у стані «порожньо вперше». */
function CreateInvoiceButton() {
  const t = usePageT()
  const CreateIcon = ACTION_ICONS.create
  return (
    <Button
      onClick={() => {
        toast(t("createInvoice"))
      }}
    >
      <CreateIcon aria-hidden />
      {t("createInvoice")}
    </Button>
  )
}

function InvoiceList({ extension }: { extension: InvoicesExtension }) {
  const t = usePageT()
  const { data: me } = useMe()
  const { tabs, filters } = useInvoiceListSetup()
  const [searchParams, setSearchParams] = useSearchParams()
  const report = useListReport({
    resource: RESOURCE,
    params: searchParams,
    onParamsChange: setSearchParams,
    defaults: INVOICE_LIST_DEFAULTS,
    tabs,
    filters,
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
  const approve = useApproveAction(report.selection, report.list.queryFilter)
  const columns = useExtendedInvoiceColumns(
    useInvoiceColumns(canEdit === true, setEditing, setConflict),
    extension,
  )

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
      <ListReport
        report={report}
        toolbar={[
          {
            id: "view-mode",
            node: <ViewModeToggle value={view} onValueChange={setView} />,
          },
        ]}
        tabsLabel={t("statusFilter")}
        searchPlaceholder={t("search")}
        tableLabel={t("tableLabel")}
        columns={columns}
        getRowId={getInvoiceId}
        countLabel={(count, value) => t("count", { count, value })}
        bulk={{
          actions: [{ id: "approve", render: approve.button }],
          rowLabel: (invoice) => t("rowLabel", { number: invoice.number }),
          selectionLabel: (count, value, all) =>
            t(all ? "selectedAll" : "selected", { count, value }),
        }}
        mode={view}
        empty={
          <PageState
            kind="empty"
            icon={MODULE_ICONS.K2}
            action={<CreateInvoiceButton />}
          />
        }
      />
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
