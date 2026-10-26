import { useAuthenticated, useCanAccess } from "ra-core"
import { useMemo } from "react"
import { useSearchParams } from "react-router"

import { PageSkeleton, PageState } from "@/components/erp/page-state"
import {
  ListReport,
  ListReportHeader,
  useListReport,
} from "@/components/templates/list-report"
import { useExtendedList } from "@/hooks/use-extended-list"
import { usePageHeading } from "@/hooks/use-page-heading"
import type { FilterDefinition } from "@/lib/filters"
import { MODULE_ICONS } from "@/lib/icons"
import type { ListDefaults } from "@/lib/list-state"

import { useUserColumns } from "../components/user-columns"
import { useRoleFilter } from "../components/user-roles"
import { useUserStatuses } from "../components/user-statuses"
import { USER_STATUSES, USERS, type User } from "../contract"
import type { UserColumnId, UserFilterId, UserIds } from "../extension"
import { useUsersModule } from "../module-context"
import { useUsersT } from "../use-users-t"

/** Без параметрів в адресі: усі люди за ім'ям. */
const USER_LIST_DEFAULTS: ListDefaults = {
  tab: "all",
  sort: { field: "name", order: "ASC" },
  sortFields: ["name", "email", "lastSignInAt"],
}

/** Ім'я — заголовок картки на телефоні й посилання на картку: розширення його не ховає. */
const LOCKED_COLUMNS: readonly UserColumnId[] = ["name"]

/**
 * Люди компанії на шаблоні List Report сторінками (SPEC §7; ADR-0022, ADR-0031): вкладки за статусом
 * з лічильниками, фільтри «Роль» і «Другий крок», пошук за ім'ям чи email, запам'ятаний розмір
 * сторінки; ім'я — посилання на картку з вкладками. Без `users:read` — «Немає доступу» без запиту:
 * сервер віддав би такій людині лише довідник (ім'я та email).
 */
export function UsersListPage() {
  const t = useUsersT()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  const access = useCanAccess({ resource: USERS, action: "read" })
  const heading = usePageHeading(t("users.title"))
  // Шапка — над перевіркою сесії: той самий вузол від першого кадру (ADR-0022).
  return (
    <div className="space-y-6">
      <ListReportHeader
        title={t("users.title")}
        description={t("users.lead")}
        headingRef={heading}
      />
      {isPending || access.isPending ? (
        <PageSkeleton rows={8} />
      ) : access.canAccess ? (
        <UserList />
      ) : (
        <PageState kind="forbidden" />
      )}
    </div>
  )
}

function UserList() {
  const t = useUsersT()
  const { extension } = useUsersModule()
  const [searchParams, setSearchParams] = useSearchParams()
  const statuses = useUserStatuses()
  const columns = useUserColumns(statuses)
  const roleFilter = useRoleFilter(t("users.filters.roles"))
  const filters = useMemo(() => {
    const twoFactor: FilterDefinition & { id: UserFilterId } = {
      kind: "options",
      id: "twoFactor",
      field: "twoFactor",
      label: t("users.filters.twoFactor"),
      options: [
        { value: "true", label: t("twoFactor.on") },
        { value: "false", label: t("twoFactor.off") },
      ],
    }
    return roleFilter ? [roleFilter, twoFactor] : [twoFactor]
  }, [t, roleFilter])
  const tabs = useMemo(
    () => [
      { id: "all" as const, label: t("users.tabs.all"), filter: {} },
      ...USER_STATUSES.map((id) => ({
        id,
        label: statuses.byId.get(id)?.label ?? id,
        filter: { status: id },
      })),
    ],
    [t, statuses.byId],
  )
  const list = useExtendedList<User, UserIds>(
    columns,
    filters,
    tabs,
    extension.users,
    LOCKED_COLUMNS,
  )
  const report = useListReport({
    resource: USERS,
    params: searchParams,
    onParamsChange: setSearchParams,
    defaults: USER_LIST_DEFAULTS,
    tabs: list.tabs,
    filters: list.filters,
  })
  return (
    <ListReport
      report={report}
      mode="pages"
      tabsLabel={t("users.tabsLabel")}
      searchPlaceholder={t("users.search")}
      tableLabel={t("users.tableLabel")}
      columns={list.columns}
      countLabel={(count, value) => t("users.count", { count, value })}
      empty={
        <PageState
          kind="empty"
          icon={MODULE_ICONS.A2}
          title={t("users.empty.title")}
          description={t("users.empty.description")}
        />
      }
    />
  )
}
