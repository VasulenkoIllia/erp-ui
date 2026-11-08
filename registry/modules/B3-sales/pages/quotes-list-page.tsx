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
import { useQuoteColumns } from "../components/quote-columns"
import { useQuoteStatuses } from "../components/quote-statuses"
import { QUOTES, type Quote } from "../contract"
import type { QuoteColumnId, QuoteIds } from "../extension"
import { useSalesModule } from "../module-context"
import { useSalesT } from "../use-sales-t"

/** Без параметрів в адресі: усі пропозиції, новіші вгорі. */
const QUOTE_LIST_DEFAULTS: ListDefaults = {
  tab: "all",
  sort: { field: "date", order: "DESC" },
  sortFields: ["number", "clientName", "date", "validUntil", "total"],
}

/** Номер — заголовок картки на телефоні й посилання на картку: розширення його не ховає. */
const LOCKED_COLUMNS: readonly QuoteColumnId[] = ["number"]

/**
 * Список пропозицій на шаблоні List Report сторінками (SPEC §7; ADR-0022): вкладки за статусом (зі
 * статусами розширення), фільтри «Клієнт» і «Дата», пошук за номером чи клієнтом; номер — посилання на
 * картку. «Створити пропозицію» — сторінка форми.
 */
export function QuotesListPage() {
  const t = useSalesT()
  const { paths } = useSalesModule()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  const heading = usePageHeading(t("quotes.title"))
  const actions: (ListReportAction & { id: "create" })[] = [
    {
      id: "create",
      node: (
        <AccessLink
          action="create"
          to={paths.newQuote}
          icon="create"
          label={t("quotes.create")}
          deniedReason={t("quotes.createDenied")}
          variant="default"
        />
      ),
    },
  ]
  // Шапка — над перевіркою сесії: той самий вузол від першого кадру (ADR-0022).
  return (
    <div className="space-y-6">
      <ListReportHeader
        title={t("quotes.title")}
        description={t("quotes.lead")}
        headingRef={heading}
        actions={isPending ? undefined : actions}
      />
      {isPending ? <PageSkeleton rows={8} /> : <QuoteList />}
    </div>
  )
}

function QuoteList() {
  const t = useSalesT()
  const { extension, clients } = useSalesModule()
  const [searchParams, setSearchParams] = useSearchParams()
  const statuses = useQuoteStatuses()
  const columns = useQuoteColumns(statuses)
  const filters = useMemo(
    () => [
      {
        kind: "record" as const,
        id: "clientId" as const,
        field: "clientId",
        label: t("quotes.filters.clientId"),
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
        label: t("quotes.filters.date"),
      },
    ],
    [t, clients],
  )
  const tabs = useMemo(
    () => [
      { id: "all", label: t("quotes.tabs.all"), filter: {} },
      ...statuses.options.map((status) => ({
        id: status.id,
        label: status.label,
        filter: { status: status.id },
      })),
    ],
    [t, statuses.options],
  )
  const list = useExtendedList<Quote, QuoteIds>(
    columns,
    filters,
    tabs,
    extension.quotes,
    LOCKED_COLUMNS,
  )
  const report = useListReport({
    resource: QUOTES,
    params: searchParams,
    onParamsChange: setSearchParams,
    defaults: QUOTE_LIST_DEFAULTS,
    tabs: list.tabs,
    filters: list.filters,
  })
  return (
    <ListReport
      report={report}
      mode="pages"
      tabsLabel={t("quotes.tabsLabel")}
      searchPlaceholder={t("quotes.search")}
      tableLabel={t("quotes.tableLabel")}
      columns={list.columns}
      countLabel={(count, value) => t("quotes.count", { count, value })}
      empty={
        <PageState
          kind="empty"
          icon={MODULE_ICONS.B3}
          title={t("quotes.empty.title")}
          description={t("quotes.empty.description")}
        />
      }
    />
  )
}
