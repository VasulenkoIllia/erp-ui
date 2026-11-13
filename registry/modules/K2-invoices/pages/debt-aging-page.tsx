import { useAuthenticated } from "ra-core"
import { useMemo } from "react"
import { useSearchParams } from "react-router"

import { PageSkeleton, PageState } from "@/components/erp/page-state"
import {
  ListReport,
  ListReportHeader,
  useListReport,
} from "@/components/templates/list-report"
import { usePageHeading } from "@/hooks/use-page-heading"
import { MODULE_ICONS } from "@/lib/icons"
import type { ListDefaults } from "@/lib/list-state"

import { agingBucketsParam } from "../aging-buckets"
import { useAgingColumns } from "../components/aging-columns"
import { clientFilter } from "../components/document-list"
import { useCurrencyFilter } from "../components/invoice-currency"
import { useFreshAging } from "../components/use-fresh-aging"
import { INVOICE_AGING, type AgingRow } from "../contract"
import { useInvoicesModule } from "../module-context"
import { useInvoicesT } from "../use-invoices-t"

/** Без параметрів в адресі: хто винен найбільше в базовій валюті. */
const DEFAULTS: ListDefaults = {
  tab: "all",
  sort: { field: "baseTotal", order: "DESC" },
  sortFields: ["clientName", "baseTotal"],
}

/**
 * «Борги клієнтів» — старіння боргу на шаблоні List Report сторінками (SPEC §7; ADR-0084): рядок на клієнта
 * й валюту за рахунками з боргом > 0 на сьогодні, колонки — кошики днів після «Сплатити до», «Разом» і
 * «Разом у базовій валюті» за курсом кожного рахунку. Фільтри «Клієнт» і «Валюта», пошук за назвою
 * клієнта; назва — посилання на рахунки клієнта, що чекають оплати. Сторінка є лише з оплатами модуля K4.
 */
export function DebtAgingPage() {
  const t = useInvoicesT()
  useFreshAging()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  const heading = usePageHeading(t("debts.title"))
  // Шапка — над перевіркою сесії: той самий вузол від першого кадру (ADR-0022).
  return (
    <div className="space-y-6">
      <ListReportHeader
        title={t("debts.title")}
        description={t("debts.lead")}
        headingRef={heading}
      />
      {isPending ? <PageSkeleton rows={8} /> : <DebtList />}
    </div>
  )
}

/** Фільтри звіту: «Клієнт» (ресурс клієнтів проекту) і «Валюта» (з валютами компанії). */
function useDebtFilters() {
  const t = useInvoicesT()
  const { clients } = useInvoicesModule()
  const currency = useCurrencyFilter(t("debts.filters.currency"))
  return useMemo(
    () => [
      clientFilter(clients, t("debts.filters.clientId")),
      ...(currency ? [currency] : []),
    ],
    [t, clients, currency],
  )
}

function DebtList() {
  const t = useInvoicesT()
  const { agingBuckets } = useInvoicesModule()
  const [searchParams, setSearchParams] = useSearchParams()
  const columns = useAgingColumns()
  const filters = useDebtFilters()
  const fixedFilter = useMemo(
    () => ({ buckets: agingBucketsParam(agingBuckets) }),
    [agingBuckets],
  )
  const report = useListReport({
    resource: INVOICE_AGING,
    params: searchParams,
    onParamsChange: setSearchParams,
    defaults: DEFAULTS,
    filters,
    fixedFilter,
  })
  return (
    <ListReport<AgingRow>
      report={report}
      mode="pages"
      searchPlaceholder={t("debts.search")}
      tableLabel={t("debts.tableLabel")}
      columns={columns}
      countLabel={(count, value) => t("debts.count", { count, value })}
      empty={
        <PageState
          kind="empty"
          icon={MODULE_ICONS.K2}
          title={t("debts.empty.title")}
          description={t("debts.empty.description")}
        />
      }
    />
  )
}
