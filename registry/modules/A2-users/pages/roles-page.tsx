import { useAuthenticated, useCanAccess } from "ra-core"

import { PageSkeleton, PageState } from "@/components/erp/page-state"
import { RolesEditor } from "@/components/erp/roles-editor"
import { ListReportHeader } from "@/components/templates/list-report"
import { usePageHeading } from "@/hooks/use-page-heading"
import { useSearchParamState } from "@/hooks/use-tab-param"

import { ROLES } from "../contract"
import { ROLE_PARAM } from "../module-context"
import { useUsersT } from "../use-users-t"

/**
 * Ролі й права компанії (SPEC §7; ADR-0014, ADR-0032, ADR-0033): список ролей і права вибраної
 * поруч (на телефоні — список над правами), вибрана роль — в адресі (`?role=`, без нового запису
 * історії); нова роль, копія, видалення з «стелею» — права того, хто змінює. Без `roles:read` —
 * «Немає доступу» без запиту. Перехід зі сторінки з незбереженими правами — з підтвердженням.
 */
export function RolesPage() {
  const t = useUsersT()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  const access = useCanAccess({ resource: ROLES, action: "read" })
  const heading = usePageHeading(t("roles.title"))
  const role = useSearchParamState(ROLE_PARAM)
  // Шапка — над перевіркою сесії: той самий вузол від першого кадру (ADR-0022).
  return (
    <div className="space-y-6">
      <ListReportHeader
        title={t("roles.title")}
        description={t("roles.lead")}
        headingRef={heading}
      />
      {isPending || access.isPending ? (
        <PageSkeleton rows={6} />
      ) : access.canAccess ? (
        <RolesEditor selectedId={role.value} onSelect={role.onValueChange} />
      ) : (
        <PageState kind="forbidden" />
      )}
    </div>
  )
}
