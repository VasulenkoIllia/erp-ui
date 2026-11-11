import { useAuthenticated, useCanAccess } from "ra-core"
import { Link, useSearchParams } from "react-router"

import { PageSkeleton, PageState } from "@/components/erp/page-state"
import { DeniedAction } from "@/components/erp/permission-gate"
import {
  ListReport,
  ListReportHeader,
  useListReport,
  type ListReportAction,
} from "@/components/templates/list-report"
import { buttonVariants } from "@/components/ui/button"
import { useExtendedList } from "@/hooks/use-extended-list"
import { usePageHeading } from "@/hooks/use-page-heading"
import { ACTION_ICONS, MODULE_ICONS } from "@/lib/icons"
import type { ListDefaults } from "@/lib/list-state"

import {
  usePaymentColumns,
  usePaymentListFilters,
} from "../components/payment-columns"
import { usePaymentStatuses } from "../components/payment-statuses"
import { PAYMENTS, type Payment } from "../contract"
import type { PaymentIds } from "../extension"
import { usePaymentsModule } from "../module-context"
import { usePaymentsT } from "../use-payments-t"

/** Номер — заголовок картки на телефоні й посилання на картку: розширення його не ховає. */
const LOCKED_COLUMNS = ["number"] as const

/** Без параметрів в адресі: усі оплати, новіші вгорі. */
const DEFAULTS: ListDefaults = {
  tab: "all",
  sort: { field: "date", order: "DESC" },
  sortFields: ["number", "clientName", "date", "amount"],
}

const CreateIcon = ACTION_ICONS.create

/** «Зареєструвати оплату» з правом `sales-payments:create`; без права — неактивна з причиною. */
function CreatePayment() {
  const t = usePaymentsT()
  const { paths, preload } = usePaymentsModule()
  const { canAccess, isPending } = useCanAccess({
    resource: PAYMENTS,
    action: "create",
  })
  if (isPending) return null
  const to = paths.newPayment()
  if (!canAccess)
    return (
      <DeniedAction reason={t("payments.createDenied")} variant="default">
        <CreateIcon aria-hidden />
        {t("payments.create")}
      </DeniedAction>
    )
  return (
    <Link
      to={to}
      className={buttonVariants()}
      onPointerEnter={() => {
        preload(to)
      }}
      onFocus={() => {
        preload(to)
      }}
    >
      <CreateIcon aria-hidden />
      {t("payments.create")}
    </Link>
  )
}

const CREATE_ACTIONS: readonly ListReportAction[] = [
  { id: "create", node: <CreatePayment /> },
]

/**
 * Список оплат на шаблоні List Report сторінками (SPEC §7; ADR-0022, ADR-0073): вкладки за статусом (зі
 * статусами розширення), фільтри «Клієнт», «Дата» й «Спосіб», пошук за номером, клієнтом чи призначенням;
 * номер — посилання на картку, номери рахунків — на картки рахунків. «Зареєструвати оплату» — з правом.
 */
export function PaymentsListPage() {
  const t = usePaymentsT()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  const heading = usePageHeading(t("payments.title"))
  // Шапка — над перевіркою сесії: той самий вузол від першого кадру (ADR-0022).
  return (
    <div className="space-y-6">
      <ListReportHeader
        title={t("payments.title")}
        description={t("payments.lead")}
        headingRef={heading}
        actions={isPending ? undefined : CREATE_ACTIONS}
      />
      {isPending ? <PageSkeleton rows={8} /> : <PaymentList />}
    </div>
  )
}

/** Колонки, фільтри й вкладки зі змінами розширення та стан списку з адреси. */
function usePaymentList() {
  const { extension } = usePaymentsModule()
  const [searchParams, setSearchParams] = useSearchParams()
  const statuses = usePaymentStatuses()
  const columns = usePaymentColumns(statuses)
  const { filters, tabs } = usePaymentListFilters(statuses)
  const extended = useExtendedList<Payment, PaymentIds>(
    columns,
    filters,
    tabs,
    extension,
    LOCKED_COLUMNS,
  )
  const report = useListReport({
    resource: PAYMENTS,
    params: searchParams,
    onParamsChange: setSearchParams,
    defaults: DEFAULTS,
    tabs: extended.tabs,
    filters: extended.filters,
  })
  return { report, columns: extended.columns }
}

function PaymentList() {
  const t = usePaymentsT()
  const list = usePaymentList()
  return (
    <ListReport
      report={list.report}
      mode="pages"
      tabsLabel={t("payments.tabsLabel")}
      searchPlaceholder={t("payments.search")}
      tableLabel={t("payments.tableLabel")}
      columns={list.columns}
      countLabel={(count, value) => t("payments.count", { count, value })}
      empty={
        <PageState
          kind="empty"
          icon={MODULE_ICONS.K4}
          title={t("payments.empty.title")}
          description={t("payments.empty.description")}
        />
      }
    />
  )
}
