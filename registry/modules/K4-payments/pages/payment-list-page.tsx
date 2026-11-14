import { useAuthenticated, useCanAccess } from "ra-core"
import { useMemo } from "react"
import { Link, useSearchParams } from "react-router"

import { PageSkeleton, PageState } from "@/components/erp/page-state"
import { DeniedAction } from "@/components/erp/permission-gate"
import {
  ListReport,
  ListReportHeader,
  useListReport,
  type ListReportAction,
} from "@/components/templates/list-report"
import { useListSlots } from "@/components/templates/list-report-slots"
import { buttonVariants } from "@/components/ui/button"
import { useExtendedList } from "@/hooks/use-extended-list"
import { usePageHeading } from "@/hooks/use-page-heading"
import { ACTION_ICONS } from "@/lib/icons"
import type { ListDefaults } from "@/lib/list-state"

import {
  usePaymentColumns,
  usePaymentListFilters,
} from "../components/payment-columns"
import { usePaymentTitle } from "../components/payment-display"
import { usePaymentStatuses } from "../components/payment-statuses"
import type { Payment } from "../contract"
import {
  PAYMENT_KIND,
  REFUND_KIND,
  type K4DocumentKind,
} from "../document-kind"
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

/**
 * «Зареєструвати оплату» з правом `sales-payments:create` чи «Повернути переплату» з `sales-refunds:create`;
 * без права — неактивна з причиною.
 */
function CreateDocument({ kind }: { kind: K4DocumentKind }) {
  const t = usePaymentsT()
  const { paths, preload } = usePaymentsModule()
  const { canAccess, isPending } = useCanAccess({
    resource: kind.resource,
    action: "create",
  })
  if (isPending) return null
  const to = kind.pathsOf(paths).create()
  if (!canAccess)
    return (
      <DeniedAction reason={t(`${kind.list}.createDenied`)} variant="default">
        <CreateIcon aria-hidden />
        {t(`${kind.list}.create`)}
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
      {t(`${kind.list}.create`)}
    </Link>
  )
}

/** Список оплат (ADR-0073). */
export function PaymentsListPage() {
  return <MoneyDocumentsListPage kind={PAYMENT_KIND} />
}

/** Список повернень клієнтам (ADR-0083). */
export function RefundsListPage() {
  return <MoneyDocumentsListPage kind={REFUND_KIND} />
}

/**
 * Список оплат чи повернень на шаблоні List Report сторінками (SPEC §7; ADR-0022, ADR-0073, ADR-0083):
 * вкладки за статусом (зі статусами розширення), фільтри «Клієнт», «Дата» й «Спосіб», пошук за номером,
 * клієнтом чи призначенням; номер — посилання на картку, номери рахунків — на картки рахунків.
 * «Зареєструвати оплату» чи «Повернути переплату» — з правом.
 */
function MoneyDocumentsListPage({ kind }: { kind: K4DocumentKind }) {
  const t = usePaymentsT()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  const heading = usePageHeading(t(`${kind.list}.title`))
  const actions = useMemo(
    (): readonly ListReportAction[] => [
      { id: "create", node: <CreateDocument kind={kind} /> },
    ],
    [kind],
  )
  // Шапка — над перевіркою сесії: той самий вузол від першого кадру (ADR-0022).
  return (
    <div className="space-y-6">
      <ListReportHeader
        title={t(`${kind.list}.title`)}
        description={t(`${kind.list}.lead`)}
        headingRef={heading}
        actions={isPending ? undefined : actions}
      />
      {isPending ? <PageSkeleton rows={8} /> : <PaymentList kind={kind} />}
    </div>
  )
}

/** Колонки, фільтри й вкладки зі змінами розширення та стан списку з адреси. */
function usePaymentList(kind: K4DocumentKind) {
  const { extension } = usePaymentsModule()
  const [searchParams, setSearchParams] = useSearchParams()
  const statuses = usePaymentStatuses(kind)
  const columns = usePaymentColumns(kind, statuses)
  const { filters, tabs } = usePaymentListFilters(statuses)
  const extended = useExtendedList<Payment, PaymentIds>(
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
    defaults: DEFAULTS,
    tabs: extended.tabs,
    filters: extended.filters,
  })
  return { report, columns: extended.columns }
}

function PaymentList({ kind }: { kind: K4DocumentKind }) {
  const t = usePaymentsT()
  const { extension } = usePaymentsModule()
  const list = usePaymentList(kind)
  const rowLabel = usePaymentTitle(kind)
  // Своїх масових дій немає: вибір рядків з'являється з масовою дією розширення (ADR-0086).
  const slots = useListSlots(
    list.report,
    list.columns,
    { actions: [], rowLabel },
    kind.extensionOf(extension),
  )
  return (
    <ListReport
      report={list.report}
      bulk={slots.bulk}
      mode="pages"
      tabsLabel={t(`${kind.list}.tabsLabel`)}
      searchPlaceholder={t(`${kind.list}.search`)}
      tableLabel={t(`${kind.list}.tableLabel`)}
      columns={slots.columns}
      countLabel={(count, value) => t(`${kind.list}.count`, { count, value })}
      empty={
        <PageState
          kind="empty"
          icon={kind.icon}
          title={t(`${kind.list}.empty.title`)}
          description={t(`${kind.list}.empty.description`)}
        />
      }
    />
  )
}
