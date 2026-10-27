import { useMemo } from "react"

import { useRoles } from "@/components/erp/role-picker"
import { Badge } from "@/components/ui/badge"
import { useHasPermission } from "@/hooks/use-me"
import type { FilterDefinition } from "@/lib/filters"

import type { UserRoleRef } from "../contract"
import { useUsersT } from "../use-users-t"

/** Ролі людини бейджами; без ролей — «Без ролей». Назви — із запису, тож без права `roles:read`. */
export function UserRoleBadges({ roles }: { roles: readonly UserRoleRef[] }) {
  const t = useUsersT()
  if (!roles.length)
    return <span className="text-muted-foreground">{t("noRoles")}</span>
  return (
    <span className="flex flex-wrap gap-1">
      {roles.map((role) => (
        <Badge key={role.id} variant="secondary">
          {role.name}
        </Badge>
      ))}
    </span>
  )
}

/**
 * Фільтр «Роль» — ролі з каталогу (`GET /roles`, право `roles:read`). Поки ролі не прийшли —
 * фільтр без варіантів: інакше стан списку викинув би `?roles=…` з адреси чи виду до приходу
 * каталогу. Без права фільтра немає (`null`).
 */
export function useRoleFilter(
  label: string,
): (FilterDefinition & { id: "roles" }) | null {
  const canRead = useHasPermission("roles", "read")
  const roles = useRoles(canRead).data?.roles
  return useMemo(
    () =>
      canRead
        ? {
            kind: "options",
            id: "roles",
            field: "roles",
            label,
            options: (roles ?? []).map((role) => ({
              value: role.id,
              label: role.name,
            })),
          }
        : null,
    [canRead, roles, label],
  )
}
