import { useAuthenticated } from "ra-core"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Link, useLocation, useSearchParams } from "react-router"

import { PageSkeleton } from "@/registry/erp/page-state"
import { usePinColumn } from "@/registry/erp/pin-toggle"
import type { DataTableColumn } from "@/registry/lib/data-table-core"
import type { ListTab } from "@/registry/lib/list-state"
import { isPinned } from "@/registry/lib/pins"
import {
  ListReport,
  ListReportHeader,
  useListReport,
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
 * компаній модуля B1 (крок 1.4).
 */
export function OrganizationsPage() {
  const t = usePageT()
  // Без сесії ra-core перенаправить на /login і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  const heading = usePageHeading(t("title"))
  // Шапка — над перевіркою сесії: той самий вузол від першого кадру (ADR-0022).
  return (
    <div className="space-y-6">
      <ListReportHeader
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
  const report = useListReport({
    resource: ORGANIZATIONS,
    params: searchParams,
    onParamsChange: setSearchParams,
    defaults: ORGANIZATION_LIST_DEFAULTS,
    tabs,
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
