import { useAuthenticated } from "ra-core"
import { useMemo } from "react"
import { useSearchParams } from "react-router"

import { PageSkeleton, PageState } from "@/components/erp/page-state"
import {
  ListReport,
  ListReportHeader,
  useListReport,
  type ListReportAction,
} from "@/components/templates/list-report"
import { useExtendedList } from "@/hooks/use-extended-list"
import { usePageHeading } from "@/hooks/use-page-heading"
import { MODULE_ICONS } from "@/lib/icons"
import type { ListDefaults } from "@/lib/list-state"

import { AccessLink } from "../components/access-link"
import { useInvoiceBulkActions } from "../components/invoice-bulk-actions"
import { useInvoiceColumns } from "../components/invoice-columns"
import { useInvoiceStatuses } from "../components/invoice-statuses"
import { INVOICES, type Invoice } from "../contract"
import type { InvoiceIds } from "../extension"
import { invoiceDocumentPaths } from "../invoice-kind"
import { useInvoicesModule } from "../module-context"
import { useInvoicesT } from "../use-invoices-t"

/** Номер — заголовок картки на телефоні й посилання на картку: розширення його не ховає. */
const LOCKED_COLUMNS = ["number"] as const

/** Без параметрів в адресі: усі рахунки, новіші вгорі. */
const DEFAULTS: ListDefaults = {
  tab: "all",
  sort: { field: "date", order: "DESC" },
  sortFields: ["number", "clientName", "date", "dueDate", "total"],
}

/**
 * Список рахунків на шаблоні List Report сторінками (SPEC §7; ADR-0022, ADR-0070): вкладки за статусом (зі
 * статусами розширення), фільтри «Клієнт» і «Дата», пошук за номером чи клієнтом; номер — посилання на
 * картку. «Створити рахунок» — сторінка форми. Вибрані — «Виставити», «Скасувати» й «Видалити» фоновою
 * задачею зі звітом про невдалі (ADR-0066).
 */
export function InvoicesListPage() {
  const t = useInvoicesT()
  const { paths } = useInvoicesModule()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  const heading = usePageHeading(t("invoices.title"))
  const actions: (ListReportAction & { id: "create" })[] = [
    {
      id: "create",
      node: (
        <AccessLink
          action="create"
          to={invoiceDocumentPaths(paths).create}
          icon="create"
          label={t("invoices.create")}
          deniedReason={t("invoices.createDenied")}
          variant="default"
        />
      ),
    },
  ]
  // Шапка — над перевіркою сесії: той самий вузол від першого кадру (ADR-0022).
  return (
    <div className="space-y-6">
      <ListReportHeader
        title={t("invoices.title")}
        description={t("invoices.lead")}
        headingRef={heading}
        actions={isPending ? undefined : actions}
      />
      {isPending ? <PageSkeleton rows={8} /> : <InvoiceList />}
    </div>
  )
}

/** Колонки, фільтри й вкладки зі змінами розширення та стан списку з адреси. */
function useInvoiceList() {
  const t = useInvoicesT()
  const { extension, clients } = useInvoicesModule()
  const [searchParams, setSearchParams] = useSearchParams()
  const statuses = useInvoiceStatuses()
  const columns = useInvoiceColumns(statuses)
  const filters = useMemo(
    () => [
      {
        kind: "record" as const,
        id: "clientId" as const,
        field: "clientId",
        label: t("invoices.filters.clientId"),
        resource: clients.resource,
        labelField: clients.labelField,
        ...(clients.descriptionField
          ? { descriptionField: clients.descriptionField }
          : {}),
      },
      {
        kind: "date-range" as const,
        id: "date" as const,
        field: "date",
        label: t("invoices.filters.date"),
      },
    ],
    [t, clients],
  )
  const tabs = useMemo(
    () => [
      { id: "all", label: t("invoices.tabs.all"), filter: {} },
      ...statuses.options.map((status) => ({
        id: status.id,
        label: status.label,
        filter: { status: status.id },
      })),
    ],
    [t, statuses.options],
  )
  const extended = useExtendedList<Invoice, InvoiceIds>(
    columns,
    filters,
    tabs,
    extension.invoices,
    LOCKED_COLUMNS,
  )
  const report = useListReport({
    resource: INVOICES,
    params: searchParams,
    onParamsChange: setSearchParams,
    defaults: DEFAULTS,
    tabs: extended.tabs,
    filters: extended.filters,
  })
  return { report, columns: extended.columns }
}

function InvoiceList() {
  const t = useInvoicesT()
  const list = useInvoiceList()
  const { bulk, dialogs } = useInvoiceBulkActions(
    list.report.selection,
    list.report.list.queryFilter,
  )
  return (
    <>
      <ListReport
        report={list.report}
        bulk={bulk}
        mode="pages"
        tabsLabel={t("invoices.tabsLabel")}
        searchPlaceholder={t("invoices.search")}
        tableLabel={t("invoices.tableLabel")}
        columns={list.columns}
        countLabel={(count, value) => t("invoices.count", { count, value })}
        empty={
          <PageState
            kind="empty"
            icon={MODULE_ICONS.K2}
            title={t("invoices.empty.title")}
            description={t("invoices.empty.description")}
          />
        }
      />
      {dialogs}
    </>
  )
}
