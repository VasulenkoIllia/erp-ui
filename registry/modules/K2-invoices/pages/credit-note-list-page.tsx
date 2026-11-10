import { useAuthenticated } from "ra-core"
import { useSearchParams } from "react-router"

import { PageSkeleton, PageState } from "@/components/erp/page-state"
import {
  ListReport,
  ListReportHeader,
  useListReport,
} from "@/components/templates/list-report"
import { useExtendedList } from "@/hooks/use-extended-list"
import { usePageHeading } from "@/hooks/use-page-heading"
import { MODULE_ICONS } from "@/lib/icons"
import type { ListDefaults } from "@/lib/list-state"

import { useDocumentListFilters } from "../components/document-list"
import { useCreditNoteColumns } from "../components/invoice-columns"
import { useDocumentStatuses } from "../components/invoice-statuses"
import { CREDIT_NOTES, type CreditNote } from "../contract"
import { CREDIT_NOTE_KIND } from "../credit-note-kind"
import type { CreditNoteIds } from "../extension"
import { useInvoicesModule } from "../module-context"
import { useInvoicesT } from "../use-invoices-t"

/** Номер — заголовок картки на телефоні й посилання на картку: розширення його не ховає. */
const LOCKED_COLUMNS = ["number"] as const

/** Без параметрів в адресі: усі кредит-ноти, новіші вгорі. */
const DEFAULTS: ListDefaults = {
  tab: "all",
  sort: { field: "date", order: "DESC" },
  sortFields: ["number", "clientName", "invoiceNumber", "date", "total"],
}

/**
 * Список кредит-нот на шаблоні List Report сторінками (SPEC §7; ADR-0022, ADR-0072): вкладки за статусом
 * (зі статусами розширення), фільтри «Клієнт» і «Дата», пошук за номером, клієнтом чи рахунком; номер —
 * посилання на картку, «Рахунок» — на картку рахунку-підстави. Кнопки «Створити» немає: кредит-ноту
 * створюють на картці виставленого рахунку, про це каже порожній список.
 */
export function CreditNotesListPage() {
  const t = useInvoicesT()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  const heading = usePageHeading(t("creditNotes.title"))
  return (
    <div className="space-y-6">
      <ListReportHeader
        title={t("creditNotes.title")}
        description={t("creditNotes.lead")}
        headingRef={heading}
      />
      {isPending ? <PageSkeleton rows={8} /> : <CreditNoteList />}
    </div>
  )
}

/** Колонки, фільтри й вкладки зі змінами розширення та стан списку з адреси. */
function useCreditNoteList() {
  const { extension } = useInvoicesModule()
  const [searchParams, setSearchParams] = useSearchParams()
  const statuses = useDocumentStatuses(CREDIT_NOTE_KIND)
  const columns = useCreditNoteColumns(statuses)
  const { filters, tabs } = useDocumentListFilters(CREDIT_NOTE_KIND, statuses)
  const extended = useExtendedList<CreditNote, CreditNoteIds>(
    columns,
    filters,
    tabs,
    extension.creditNotes,
    LOCKED_COLUMNS,
  )
  const report = useListReport({
    resource: CREDIT_NOTES,
    params: searchParams,
    onParamsChange: setSearchParams,
    defaults: DEFAULTS,
    tabs: extended.tabs,
    filters: extended.filters,
  })
  return { report, columns: extended.columns }
}

function CreditNoteList() {
  const t = useInvoicesT()
  const list = useCreditNoteList()
  return (
    <ListReport
      report={list.report}
      mode="pages"
      tabsLabel={t("creditNotes.tabsLabel")}
      searchPlaceholder={t("creditNotes.search")}
      tableLabel={t("creditNotes.tableLabel")}
      columns={list.columns}
      countLabel={(count, value) => t("creditNotes.count", { count, value })}
      empty={
        <PageState
          kind="empty"
          icon={MODULE_ICONS.K2}
          title={t("creditNotes.empty.title")}
          description={t("creditNotes.empty.description")}
        />
      }
    />
  )
}
