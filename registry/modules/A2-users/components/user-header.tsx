import type { ReactNode } from "react"
import { useNavigate } from "react-router"

import { useImpersonation } from "@/components/erp/impersonation"
import { DeniedAction } from "@/components/erp/permission-gate"
import type { RecordField } from "@/components/erp/record-header"
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
import type { ResolvedStatuses } from "@/lib/statuses"

import { USERS, type User } from "../contract"
import type { UserActionId, UserFieldId } from "../extension"
import { useUsersModule } from "../module-context"
import { useUsersT } from "../use-users-t"
import { UserRoleBadges } from "./user-roles"

/**
 * Шапка картки людини: ім'я, статус, «Це ви», email, посада, ролі, останній вхід і поля розширення;
 * дія «Увійти як…» (ADR-0011) — з правом `users:impersonate`, не для себе й не з чужого акаунта.
 * Після входу — `homePath` фабрики: картка може бути недоступна тому, за кого увійшли.
 */
export function useUserHeader(
  user: User | undefined,
  statuses: ResolvedStatuses,
  slotActions: KeyedChanges<ObjectPageAction, UserActionId> | undefined,
): { header: ObjectPageHeader | undefined; dialog: ReactNode } {
  const t = useUsersT()
  const kitT = useErpUiT()
  const format = useFormat()
  const navigate = useNavigate()
  const { extension, homePath } = useUsersModule()
  const extensionFields = useExtensionFields(extension.users?.fields)
  const me = useMe().data
  const impersonation = useImpersonation({
    onStarted: () => {
      void navigate(homePath)
    },
  })
  if (!user) return { header: undefined, dialog: impersonation.dialog }
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
  const canImpersonate = me
    ? hasPermission(me.permissions, USERS, "impersonate")
    : false
  const actions: (ObjectPageAction & { id: UserActionId })[] =
    // Від себе й з чужого акаунта «Увійти як…» не буває: сервер відповів би 403.
    self || !me || me.impersonator
      ? []
      : [
          {
            id: "impersonate",
            node: canImpersonate ? (
              <Button
                variant="outline"
                onClick={() => {
                  impersonation.start({ id: user.id, name: user.name })
                }}
              >
                {kitT("auth.impersonation.action")}
              </Button>
            ) : (
              <DeniedAction
                reason={t("user.impersonateDenied")}
                variant="outline"
              >
                {kitT("auth.impersonation.action")}
              </DeniedAction>
            ),
          },
        ]
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
    dialog: impersonation.dialog,
  }
}
