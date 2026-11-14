import { useAuthenticated } from "ra-core"
import { useMemo, type ReactNode } from "react"
import { useSearchParams } from "react-router"

import { AccessLink } from "@/components/erp/access-link"
import { PageSkeleton, PageState } from "@/components/erp/page-state"
import {
  ListReport,
  ListReportHeader,
  useListReport,
  type ListReportAction,
  type ListReportBulk,
} from "@/components/templates/list-report"
import { useExtendedList } from "@/hooks/use-extended-list"
import { usePageHeading } from "@/hooks/use-page-heading"
import { MODULE_ICONS } from "@/lib/icons"
import type { ListDefaults } from "@/lib/list-state"

import { useOrderBulkActions } from "../components/order-bulk-actions"
import { useQuoteBulkActions } from "../components/quote-bulk-actions"
import { useSalesColumns } from "../components/sales-columns"
import { useSalesStatuses } from "../components/sales-statuses"
import type { SalesDocument } from "../contract"
import type { SalesDocumentIds } from "../extension"
import { useSalesModule } from "../module-context"
import {
  ORDER_KIND,
  QUOTE_KIND,
  type SalesDocumentKind,
  type SalesKindBase,
} from "../sales-kinds"
import { useSalesT } from "../use-sales-t"

/** Номер — заголовок картки на телефоні й посилання на картку: розширення його не ховає. */
const LOCKED_COLUMNS = ["number"] as const

/** Список пропозицій (ADR-0065, ADR-0066). */
export function QuotesListPage() {
  return (
    <SalesListPage kind={QUOTE_KIND}>
      <QuoteList />
    </SalesListPage>
  )
}

/** Список замовлень (ADR-0067). */
export function OrdersListPage() {
  return (
    <SalesListPage kind={ORDER_KIND}>
      <OrderList />
    </SalesListPage>
  )
}

function QuoteList() {
  const list = useSalesList(QUOTE_KIND)
  const { bulk, dialogs } = useQuoteBulkActions(
    list.report.selection,
    list.report.list.queryFilter,
  )
  return (
    <SalesListView
      kind={QUOTE_KIND}
      list={list}
      bulk={bulk}
      dialogs={dialogs}
    />
  )
}

function OrderList() {
  const list = useSalesList(ORDER_KIND)
  const { bulk, dialogs } = useOrderBulkActions(
    list.report.selection,
    list.report.list.queryFilter,
  )
  return (
    <SalesListView
      kind={ORDER_KIND}
      list={list}
      bulk={bulk}
      dialogs={dialogs}
    />
  )
}

/**
 * Список документів продажу на шаблоні List Report сторінками (SPEC §7; ADR-0022): вкладки за
 * статусом (зі статусами розширення), фільтри «Клієнт» і «Дата», пошук за номером чи клієнтом; номер —
 * посилання на картку. «Створити …» — сторінка форми. Вибрані — масові дії графа й «Видалити» фоновою
 * задачею зі звітом про невдалі (ADR-0066).
 */
function SalesListPage({
  kind,
  children,
}: {
  kind: SalesKindBase
  children: ReactNode
}) {
  const t = useSalesT()
  const { paths, preload } = useSalesModule()
  const { list } = kind.keys
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  const heading = usePageHeading(t(`${list}.title`))
  const actions: (ListReportAction & { id: "create" })[] = [
    {
      id: "create",
      node: (
        <AccessLink
          resource={kind.resource}
          action="create"
          to={kind.pathsOf(paths).create}
          preload={preload}
          icon="create"
          label={t(`${list}.create`)}
          deniedReason={t(`${list}.createDenied`)}
          variant="default"
        />
      ),
    },
  ]
  // Шапка — над перевіркою сесії: той самий вузол від першого кадру (ADR-0022).
  return (
    <div className="space-y-6">
      <ListReportHeader
        title={t(`${list}.title`)}
        description={t(`${list}.lead`)}
        headingRef={heading}
        actions={isPending ? undefined : actions}
      />
      {isPending ? <PageSkeleton rows={8} /> : children}
    </div>
  )
}

/** Колонки, фільтри й вкладки зі змінами розширення та стан списку з адреси. */
function useSalesList<D extends SalesDocument, Due extends string>(
  kind: SalesDocumentKind<D, Due>,
) {
  const t = useSalesT()
  const { extension, clients } = useSalesModule()
  const [searchParams, setSearchParams] = useSearchParams()
  const statuses = useSalesStatuses(kind)
  const columns = useSalesColumns(kind, statuses)
  const { list: keys } = kind.keys
  const dueField = kind.due.field
  // Без параметрів в адресі: усі документи, новіші вгорі.
  const defaults = useMemo(
    (): ListDefaults => ({
      tab: "all",
      sort: { field: "date", order: "DESC" },
      sortFields: ["number", "clientName", "date", dueField, "total"],
    }),
    [dueField],
  )
  const filters = useMemo(
    () => [
      {
        kind: "record" as const,
        id: "clientId" as const,
        field: "clientId",
        label: t(`${keys}.filters.clientId`),
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
        label: t(`${keys}.filters.date`),
      },
    ],
    [t, clients, keys],
  )
  const tabs = useMemo(
    () => [
      { id: "all", label: t(`${keys}.tabs.all`), filter: {} },
      ...statuses.options.map((status) => ({
        id: status.id,
        label: status.label,
        filter: { status: status.id },
      })),
    ],
    [t, statuses.options, keys],
  )
  const extended = useExtendedList<D, SalesDocumentIds<Due>>(
    columns,
    filters,
    tabs,
    kind.extensionOf(extension),
    LOCKED_COLUMNS,
  )
  const report = useListReport({
    resource: kind.resource,
    params: searchParams,
    onParamsChange: setSearchParams,
    defaults,
    tabs: extended.tabs,
    filters: extended.filters,
  })
  return { report, columns: extended.columns }
}

function SalesListView<D extends SalesDocument, Due extends string>({
  kind,
  list,
  bulk,
  dialogs,
}: {
  kind: SalesDocumentKind<D, Due>
  list: ReturnType<typeof useSalesList<D, Due>>
  bulk: ListReportBulk<D>
  dialogs: ReactNode
}) {
  const t = useSalesT()
  const { list: keys } = kind.keys
  return (
    <>
      <ListReport
        report={list.report}
        bulk={bulk}
        mode="pages"
        tabsLabel={t(`${keys}.tabsLabel`)}
        searchPlaceholder={t(`${keys}.search`)}
        tableLabel={t(`${keys}.tableLabel`)}
        columns={list.columns}
        countLabel={(count, value) => t(`${keys}.count`, { count, value })}
        empty={
          <PageState
            kind="empty"
            icon={MODULE_ICONS.B3}
            title={t(`${keys}.empty.title`)}
            description={t(`${keys}.empty.description`)}
          />
        }
      />
      {dialogs}
    </>
  )
}
