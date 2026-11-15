import { keepPreviousData } from "@tanstack/react-query"
import { useAuthenticated, useGetList } from "@/registry/lib/ra-core"
import { useMemo, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Link, useLocation, useSearchParams } from "react-router"

import { PageHeader } from "@/registry/erp/page-header"
import {
  PageSkeleton,
  PageState,
  SectionSkeleton,
} from "@/registry/erp/page-state"
import { usePinColumn } from "@/registry/erp/pin-toggle"
import { useCompanyId } from "@/registry/hooks/use-company"
import { errorStateKind } from "@/registry/lib/api"
import { companyScope } from "@/registry/lib/company-scope"
import type { DataTableColumn } from "@/registry/lib/data-table-core"
import { LAYOUT_ICONS } from "@/registry/lib/icons"
import type { ListTab } from "@/registry/lib/list-state"
import { isPinned } from "@/registry/lib/pins"
import {
  ListReport,
  useListReport,
  type ListReportContentProps,
  type ListReportLayout,
} from "@/registry/templates/list-report"
import { Badge } from "@/registry/ui/badge"

import { invoiceLinkState, organizationHref } from "@/router"

import { usePageHeading } from "./heading-focus"
import { preloadPage } from "./lazy-pages"
import {
  ORGANIZATION_LIST_DEFAULTS,
  ORGANIZATIONS,
  organizationLabel,
  type OrganizationRow,
} from "./organization-options"

const usePageT = () =>
  useTranslation("demo", { keyPrefix: "organizationsPage" }).t

/**
 * Довідник організацій на шаблоні List Report сторінками (SPEC §7; ADR-0022, ADR-0024): закріплення
 * вгорі списку (особисте, у порядку закріплення), «Рядків на сторінці» із запам'ятаним вибором,
 * вкладки за типом, пошук, сортування; назва — посилання на картку з вкладками. Зразок списку
 * компаній модуля B1 (крок 1.4). Подання «Картки» (ADR-0091) — та сама вибірка сіткою карток: вкладки,
 * пошук, види й сортування спільні з таблицею, вибране подання — в адресі й у збереженому виді.
 */
export function OrganizationsPage() {
  const t = usePageT()
  // Без сесії ra-core перенаправить на /login і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  const heading = usePageHeading(t("title"))
  // Шапка — над перевіркою сесії: той самий вузол від першого кадру (ADR-0022).
  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("lead")}
        headingRef={heading}
      />
      {isPending ? <PageSkeleton rows={8} /> : <OrganizationList />}
    </div>
  )
}

function OrganizationList() {
  const t = usePageT()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabs = useMemo<ListTab[]>(
    () => [
      { id: "all", label: t("tabs.all"), filter: {} },
      { id: "legal", label: t("tabs.legal"), filter: { type: "legal" } },
      { id: "fop", label: t("tabs.fop"), filter: { type: "fop" } },
    ],
    [t],
  )
  const layouts = useMemo<ListReportLayout[]>(
    () => [
      { id: "table", label: t("layouts.table"), icon: LAYOUT_ICONS.table },
      {
        id: "cards",
        label: t("layouts.cards"),
        icon: LAYOUT_ICONS.cards,
        component: OrganizationCards,
      },
    ],
    [t],
  )
  const report = useListReport({
    resource: ORGANIZATIONS,
    params: searchParams,
    onParamsChange: setSearchParams,
    defaults: ORGANIZATION_LIST_DEFAULTS,
    tabs,
    layouts,
  })
  const columns = useOrganizationColumns()
  return (
    <ListReport
      report={report}
      mode="pages"
      tabsLabel={t("tabsLabel")}
      searchPlaceholder={t("search")}
      tableLabel={t("tableLabel")}
      columns={columns}
      isPinned={isPinned}
      countLabel={(count, value) => t("count", { count, value })}
    />
  )
}

/**
 * Скільки карток показує подання «Картки»; решту видно з підпису над сіткою. Демо обмежене: справжнє
 * подання модуля вантажить усе вікнами чи сторінками, як таблиця.
 */
const CARDS_LIMIT = 48

/**
 * Подання «Картки»: той самий запит, що й таблиця (вкладка, пошук, сортування), сіткою на ширину
 * контейнера. Стани колекції (SPEC §8.1) — як у таблиці: скелетон, помилка з повтором, немає доступу,
 * офлайн, «нічого не знайдено» зі скиданням фільтрів і «порожньо вперше». Поки летить новий запит,
 * видно попередні картки, а рядок стану з кількістю стоїть постійно: скрінрідер чує нове число.
 */
function OrganizationCards({
  resource,
  label,
  filter,
  sort,
  isFiltered,
  onResetFilters,
}: ListReportContentProps) {
  const t = usePageT()
  const { search } = useLocation()
  const companyId = useCompanyId()
  const { data, total, isPending, isFetching, error, refetch } =
    useGetList<OrganizationRow>(
      resource,
      {
        pagination: { page: 1, perPage: CARDS_LIMIT },
        sort,
        filter,
        meta: companyScope(companyId),
      },
      { placeholderData: keepPreviousData },
    )
  const shown = data?.length ?? 0
  const count = total ?? shown
  let body: ReactNode
  if (error) {
    const kind = errorStateKind(error)
    body = (
      <PageState
        kind={kind}
        onRetry={
          kind === "forbidden"
            ? undefined
            : () => {
                void refetch()
              }
        }
      />
    )
  } else if (isPending) body = <SectionSkeleton rows={6} />
  else if (!data.length)
    body = isFiltered ? (
      <PageState kind="no-results" onReset={onResetFilters} />
    ) : (
      <PageState kind="empty" />
    )
  else
    body = (
      <ul className="grid gap-3 @xl:grid-cols-2 @4xl:grid-cols-3">
        {data.map((organization) => (
          <li
            key={organization.id}
            className="min-w-0 space-y-2 rounded-lg border bg-card p-4 break-words text-card-foreground"
          >
            <OrganizationLink organization={organization} listSearch={search} />
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline">{t(`types.${organization.type}`)}</Badge>
              <span className="font-mono tabular-nums">
                {organization.code}
              </span>
              {organization.city ? <span>{organization.city}</span> : null}
            </div>
          </li>
        ))}
      </ul>
    )
  let status = ""
  if (!error && shown > 0)
    status =
      count > shown
        ? t("cards.shown", { shown, count, value: count })
        : t("count", { count, value: count })
  return (
    <section
      aria-label={label}
      aria-busy={isFetching}
      className="@container space-y-3"
    >
      <p role="status" className="min-h-5 text-sm text-muted-foreground">
        {status}
      </p>
      {body}
    </section>
  )
}

/** Колонки: закріплення, назва-посилання, тип, код, місто; на телефоні — картки. */
function useOrganizationColumns(): DataTableColumn<OrganizationRow>[] {
  const t = usePageT()
  // Адреса списку (вкладка, пошук, вид) — для «До списку» на картці.
  const { search } = useLocation()
  const pin = usePinColumn<OrganizationRow>({
    resource: ORGANIZATIONS,
    name: organizationLabel,
  })
  return useMemo(
    () => [
      pin,
      {
        id: "name",
        header: t("columns.name"),
        cell: (organization) => (
          <OrganizationLink organization={organization} listSearch={search} />
        ),
        sortField: "name",
        minWidth: 14,
        grow: 3,
        sticky: true,
        card: "title",
      },
      {
        id: "type",
        header: t("columns.type"),
        cell: (organization) => (
          <Badge variant="outline">{t(`types.${organization.type}`)}</Badge>
        ),
        minWidth: 8,
        priority: 4,
        card: "badge",
      },
      {
        id: "code",
        header: t("columns.code"),
        cell: (organization) => (
          <span className="font-mono tabular-nums">{organization.code}</span>
        ),
        sortField: "code",
        minWidth: 9,
      },
      {
        id: "city",
        header: t("columns.city"),
        cell: (organization) => organization.city,
        sortField: "city",
        minWidth: 8,
        priority: 5,
      },
    ],
    [t, pin, search],
  )
}

/** Назва — посилання на картку; адреса списку їде зі станом переходу для «До списку». */
function OrganizationLink({
  organization,
  listSearch,
}: {
  organization: OrganizationRow
  listSearch: string
}) {
  const href = organizationHref(organization.id)
  const preload = () => {
    preloadPage(href)
  }
  return (
    <Link
      to={href}
      state={invoiceLinkState(listSearch)}
      onPointerEnter={preload}
      onFocus={preload}
      // Ціль дотику ≥ 24 px (WCAG 2.5.8).
      className="touch-target relative inline-flex min-h-7 items-center font-medium underline underline-offset-4"
    >
      {organization.name}
    </Link>
  )
}
