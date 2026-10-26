import { useMemo } from "react"

import { RecordLink } from "@/components/erp/record-link"
import { StatusBadge } from "@/components/erp/status-badge"
import type { DataTableColumn } from "@/lib/data-table-core"
import { useFormat } from "@/lib/format"
import type { ResolvedStatuses } from "@/lib/statuses"

import type { User } from "../contract"
import type { UserColumnId } from "../extension"
import { useUsersModule } from "../module-context"
import { useUsersT } from "../use-users-t"
import { UserRoleBadges } from "./user-roles"

type UserColumn = DataTableColumn<User> & { id: UserColumnId }

/**
 * Колонки списку людей: ім'я-посилання на картку, статус, email, ролі, посада, другий крок, останній
 * вхід; на телефоні — картки (ім'я, статус-бейдж). Ключі — `UserColumnId`.
 */
export function useUserColumns(
  statuses: ResolvedStatuses,
): readonly UserColumn[] {
  const t = useUsersT()
  const format = useFormat()
  const { paths, preload } = useUsersModule()
  return useMemo(
    () => [
      {
        id: "name",
        header: t("users.columns.name"),
        cell: (user) => (
          <RecordLink to={paths.user(user.id)} preload={preload} fromList>
            {user.name}
          </RecordLink>
        ),
        sortField: "name",
        minWidth: 12,
        grow: 2,
        sticky: true,
        card: "title",
      },
      {
        id: "status",
        header: t("users.columns.status"),
        cell: (user) => (
          <StatusBadge status={statuses.byId.get(user.status) ?? user.status} />
        ),
        minWidth: 9,
        card: "badge",
      },
      {
        id: "email",
        header: t("users.columns.email"),
        cell: (user) => <span className="break-all">{user.email}</span>,
        sortField: "email",
        minWidth: 12,
        grow: 2,
        overflow: "wrap",
      },
      {
        id: "roles",
        header: t("users.columns.roles"),
        cell: (user) => <UserRoleBadges roles={user.roles} />,
        minWidth: 10,
        priority: 5,
        overflow: "wrap",
      },
      {
        id: "position",
        header: t("users.columns.position"),
        cell: (user) => user.position || "—",
        minWidth: 9,
        priority: 7,
        overflow: "wrap",
      },
      {
        id: "twoFactor",
        header: t("users.columns.twoFactor"),
        cell: (user) => t(user.twoFactor ? "twoFactor.on" : "twoFactor.off"),
        minWidth: 8,
        priority: 6,
      },
      {
        id: "lastSignInAt",
        header: t("users.columns.lastSignInAt"),
        cell: (user) =>
          user.lastSignInAt ? (
            <time dateTime={user.lastSignInAt}>
              {format.relative(user.lastSignInAt)}
            </time>
          ) : (
            <span className="text-muted-foreground">{t("neverSignedIn")}</span>
          ),
        sortField: "lastSignInAt",
        minWidth: 9,
        priority: 4,
        overflow: "wrap",
      },
    ],
    [t, format, paths, preload, statuses],
  )
}
