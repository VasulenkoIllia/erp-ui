import { useAuthenticated } from "ra-core"
import { useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"

import { PageSkeleton, PageState } from "@/components/erp/page-state"
import {
  ListReport,
  ListReportHeader,
  useListReport,
  type ListReportAction,
} from "@/components/templates/list-report"
import { SHELL_ICONS } from "@/lib/icons"
import type { ListDefaults } from "@/lib/list-state"
import { isPinned } from "@/lib/pins"

import { AccessAction, useOpener } from "../components/access-action"
import { useOrganizationColumns } from "../components/organization-columns"
import {
  OrganizationFormDialog,
  usePreloadForm,
} from "../components/form-dialogs"
import { useOrganizationStatuses } from "../components/organization-statuses"
import { useSegmentFilter } from "../components/segments"
import { useExtendedList } from "../components/use-extended-list"
import { usePageHeading } from "../components/use-page-heading"
import {
  ORGANIZATION_TYPES,
  ORGANIZATIONS,
  type Organization,
} from "../contract"
import type { OrganizationColumnId, OrganizationIds } from "../extension"
import { useContactsModule } from "../module-context"
import { useContactsT } from "../use-contacts-t"

/** Без параметрів в адресі: усі організації за назвою. */
const ORGANIZATION_LIST_DEFAULTS: ListDefaults = {
  tab: "all",
  sort: { field: "name", order: "ASC" },
  sortFields: ["name", "code", "city"],
}

/** Назва — заголовок картки на телефоні й посилання на картку: розширення її не ховає. */
const LOCKED_COLUMNS: readonly OrganizationColumnId[] = ["name"]

/**
 * Список організацій на шаблоні List Report сторінками (SPEC §7; ADR-0022, ADR-0024): вкладки за
 * статусом (зі статусами розширення), фільтри «Тип» і «Сегменти», пошук за назвою чи кодом,
 * закріплення вгорі, запам'ятаний розмір сторінки; назва — посилання на картку з вкладками.
 * «Створити організацію» — форма в діалозі (ADR-0026), після створення — картка нової організації.
 */
export function OrganizationsListPage() {
  const t = useContactsT()
  const { paths } = useContactsModule()
  const navigate = useNavigate()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  const heading = usePageHeading(t("organizations.title"))
  const [isCreating, setCreating] = useState(false)
  const opener = useOpener()
  usePreloadForm("organization", "create")
  const actions: (ListReportAction & { id: "create" })[] = [
    {
      id: "create",
      node: (
        <AccessAction
          resource={ORGANIZATIONS}
          action="create"
          icon="create"
          label={t("organizations.create")}
          deniedReason={t("organizations.createDenied")}
          variant="default"
          onClick={(event) => {
            opener.remember(event)
            setCreating(true)
          }}
        />
      ),
    },
  ]
  // Шапка — над перевіркою сесії: той самий вузол від першого кадру (ADR-0022).
  return (
    <div className="space-y-6">
      <ListReportHeader
        title={t("organizations.title")}
        description={t("organizations.lead")}
        headingRef={heading}
        actions={isPending ? undefined : actions}
      />
      {isPending ? <PageSkeleton rows={8} /> : <OrganizationList />}
      {isCreating ? (
        <OrganizationFormDialog
          finalFocus={opener.ref}
          onClose={() => {
            setCreating(false)
          }}
          onSaved={(organization) => {
            setCreating(false)
            void navigate(paths.organization(String(organization.id)))
          }}
        />
      ) : null}
    </div>
  )
}

function OrganizationList() {
  const t = useContactsT()
  const { extension } = useContactsModule()
  const [searchParams, setSearchParams] = useSearchParams()
  const statuses = useOrganizationStatuses()
  const columns = useOrganizationColumns(statuses)
  const segmentFilter = useSegmentFilter(t("organizations.filters.segments"))
  const filters = useMemo(
    () => [
      {
        kind: "options" as const,
        id: "type" as const,
        field: "type",
        label: t("organizations.filters.type"),
        options: ORGANIZATION_TYPES.map((type) => ({
          value: type,
          label: t(`organization.types.${type}`),
        })),
      },
      { ...segmentFilter, id: "segments" as const },
    ],
    [t, segmentFilter],
  )
  const tabs = useMemo(
    () => [
      { id: "all", label: t("organizations.tabs.all"), filter: {} },
      ...statuses.options.map((status) => ({
        id: status.id,
        label: status.label,
        filter: { status: status.id },
      })),
    ],
    [t, statuses.options],
  )
  const list = useExtendedList<Organization, OrganizationIds>(
    columns,
    filters,
    tabs,
    extension.organizations,
    LOCKED_COLUMNS,
  )
  const report = useListReport({
    resource: ORGANIZATIONS,
    params: searchParams,
    onParamsChange: setSearchParams,
    defaults: ORGANIZATION_LIST_DEFAULTS,
    tabs: list.tabs,
    filters: list.filters,
  })
  return (
    <ListReport
      report={report}
      mode="pages"
      tabsLabel={t("organizations.tabsLabel")}
      searchPlaceholder={t("organizations.search")}
      tableLabel={t("organizations.tableLabel")}
      columns={list.columns}
      isPinned={isPinned}
      countLabel={(count, value) => t("organizations.count", { count, value })}
      empty={
        <PageState
          kind="empty"
          icon={SHELL_ICONS.company}
          title={t("organizations.empty.title")}
          description={t("organizations.empty.description")}
        />
      }
    />
  )
}
