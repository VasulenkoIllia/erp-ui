import type { ReactNode } from "react"
import { useNavigate } from "react-router"

import { useImpersonation } from "@/components/erp/impersonation"
import { DeniedAction } from "@/components/erp/permission-gate"
import type { RecordField } from "@/components/erp/record-header"
import { useRoles } from "@/components/erp/role-picker"
import { StatusBadge } from "@/components/erp/status-badge"
import type {
  ObjectPageAction,
  ObjectPageHeader,
} from "@/components/templates/object-page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useMe } from "@/hooks/use-me"
import { hasPermission } from "@/lib/auth"
import { useExtensionFields } from "@/lib/extension-fields"
import {
  applyKeyedChanges,
  mapKeyedChanges,
  type KeyedChanges,
} from "@/lib/extensions"
import { useFormat } from "@/lib/format"
import { useErpUiT } from "@/lib/i18n"
import { impersonationBlock, permissionsOfRoles } from "@/lib/roles"
import type { ResolvedStatuses } from "@/lib/statuses"

import { ROLES, USERS, type User } from "../contract"
import type { UserActionId, UserFieldId } from "../extension"
import { useUsersModule } from "../module-context"
import { useUsersT } from "../use-users-t"
import { UserRoleBadges } from "./user-roles"

/**
 * Шапка картки людини: ім'я, статус, «Це ви», email, посада, ролі, останній вхід і поля розширення;
 * дія «Увійти як…» — `useImpersonateAction`.
 */
export function useUserHeader(
  user: User | undefined,
  statuses: ResolvedStatuses,
  slotActions: KeyedChanges<ObjectPageAction, UserActionId> | undefined,
): { header: ObjectPageHeader | undefined; dialog: ReactNode } {
  const t = useUsersT()
  const format = useFormat()
  const { extension } = useUsersModule()
  const extensionFields = useExtensionFields(extension.users?.fields)
  const me = useMe().data
  const impersonate = useImpersonateAction(user)
  if (!user) return { header: undefined, dialog: impersonate.dialog }
  const self = me?.id === user.id
  const fields: (RecordField & { id: UserFieldId })[] = [
    { id: "email", label: t("user.fields.email"), value: user.email },
    { id: "position", label: t("user.fields.position"), value: user.position },
    {
      id: "roles",
      label: t("user.fields.roles"),
      value: <UserRoleBadges roles={user.roles} />,
    },
    {
      id: "lastSignInAt",
      label: t("user.fields.lastSignInAt"),
      value: user.lastSignInAt
        ? format.relative(user.lastSignInAt)
        : t("neverSignedIn"),
    },
  ]
  const actions: (ObjectPageAction & { id: UserActionId })[] = impersonate.node
    ? [{ id: "impersonate", node: impersonate.node }]
    : []
  return {
    header: {
      title: user.name,
      status: (
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge status={statuses.byId.get(user.status) ?? user.status} />
          {self ? <Badge variant="outline">{t("user.self")}</Badge> : null}
        </span>
      ),
      fields: applyKeyedChanges(
        fields,
        mapKeyedChanges(extension.users?.recordFields, (field) =>
          extensionFields.displayEntry(field, user),
        ),
      ),
      actions: applyKeyedChanges(actions, slotActions),
    },
    dialog: impersonate.dialog,
  }
}

/**
 * «Увійти як…» (ADR-0011) у шапці картки: з правом `users:impersonate`, не для себе й не з чужого
 * акаунта (сервер відповів би 403). Адміністратор чи людина з правами, яких у вас немає, — дія
 * неактивна з причиною (ADR-0032); права людини видно з каталогу ролей (`roles:read`), без нього
 * це перевіряє лише сервер. Після входу — `homePath` фабрики: картка може бути недоступна тому, за
 * кого увійшли.
 */
function useImpersonateAction(user: User | undefined): {
  node: ReactNode
  dialog: ReactNode
} {
  const t = useUsersT()
  const kitT = useErpUiT()
  const navigate = useNavigate()
  const { homePath } = useUsersModule()
  const me = useMe().data
  const impersonation = useImpersonation({
    onStarted: () => {
      void navigate(homePath)
    },
  })
  const canImpersonate = me
    ? hasPermission(me.permissions, USERS, "impersonate")
    : false
  const shown = Boolean(user && me && me.id !== user.id && !me.impersonator)
  const roles = useRoles(
    shown &&
      canImpersonate &&
      hasPermission(me?.permissions ?? [], ROLES, "read"),
  )
  const catalog = roles.data?.roles
  if (!user || !me || !shown)
    return { node: null, dialog: impersonation.dialog }
  const block = catalog
    ? impersonationBlock(
        me.permissions,
        permissionsOfRoles(
          user.roles.map((role) => role.id),
          catalog,
        ),
      )
    : null
  const denied = !canImpersonate
    ? t("user.impersonateDenied")
    : block === "administrator"
      ? t("user.impersonateAdministrator")
      : block === "ceiling"
        ? t("user.impersonateBeyondCeiling")
        : null
  const label = kitT("auth.impersonation.action")
  return {
    node: denied ? (
      <DeniedAction reason={denied} variant="outline">
        {label}
      </DeniedAction>
    ) : (
      <Button
        variant="outline"
        // Поки каталог ролей вантажиться, ще невідомо, чи можна (кнопка не міняється під пальцем).
        disabled={roles.isLoading}
        onClick={() => {
          impersonation.start({ id: user.id, name: user.name })
        }}
      >
        {label}
      </Button>
    ),
    dialog: impersonation.dialog,
  }
}
