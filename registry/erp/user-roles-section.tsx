import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import {
  useAuthErrorText,
  useErpAuthProvider,
} from "@/registry/erp/auth-layout"
import { PageState, SectionSkeleton } from "@/registry/erp/page-state"
import { useReauth } from "@/registry/erp/reauth-dialog"
import { RolePicker, useRoles } from "@/registry/erp/role-picker"
import { useRefreshAccess } from "@/registry/erp/user-access-data"
import { useHasPermission, useMe } from "@/registry/hooks/use-me"
import { useErpUiT } from "@/registry/lib/i18n"
import { ROLES_QUERY_KEYS } from "@/registry/lib/roles"
import { Badge } from "@/registry/ui/badge"
import { Button } from "@/registry/ui/button"
import { Spinner } from "@/registry/ui/spinner"

/**
 * Ролі користувача (ADR-0014): позначки ролей і «Зберегти ролі» з повторним підтвердженням.
 * Свої ролі — лише перегляд (щоб не втратити доступ); без права `roles:read` — назви з відповіді.
 * Каталог ролей не завантажився — стан помилки з повтором, а не ключі ролей замість назв.
 */
export function UserRolesSection({
  userId,
  current,
  self,
  onChange,
}: {
  userId: string
  current: string[]
  self: boolean
  onChange?: () => void
}) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const errorText = useAuthErrorText()
  const queryClient = useQueryClient()
  const refresh = useRefreshAccess()
  const { guard, dialog: reauthDialog } = useReauth()
  const canRead = useHasPermission("roles", "read")
  const ceiling = useMe().data?.permissions
  const query = useRoles(canRead)
  const [value, setValue] = React.useState(current)
  const [error, setError] = React.useState<string>()
  const [busy, setBusy] = React.useState(false)
  const dirty =
    value.length !== current.length || value.some((r) => !current.includes(r))

  if (!query.data)
    return (
      <section className="space-y-2">
        <h3 className="text-sm font-medium">{t("roles.userRolesTitle")}</h3>
        {canRead && query.isPending ? (
          <SectionSkeleton rows={2} />
        ) : canRead && query.isError ? (
          <PageState
            kind="error"
            headingLevel={3}
            className="min-h-40"
            onRetry={() => {
              void query.refetch()
            }}
          />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {current.map((role) => (
              <Badge key={role} variant="secondary">
                {role}
              </Badge>
            ))}
          </div>
        )}
      </section>
    )

  return (
    <section className="space-y-3">
      <RolePicker
        roles={query.data.roles}
        value={value}
        legend={t("roles.userRolesTitle")}
        error={error}
        disabled={self || busy}
        ceiling={ceiling}
        onChange={(next) => {
          setValue(next)
          setError(undefined)
        }}
      />
      {self ? null : (
        <Button
          variant="outline"
          disabled={!dirty || busy}
          onClick={() => {
            if (!value.length) {
              setError(t("roles.userRolesRequired"))
              return
            }
            setBusy(true)
            guard(() => provider.roles.setUserRoles(userId, value))
              .then(async () => {
                toast.success(t("roles.userRolesSaved"))
                onChange?.()
                await Promise.all([
                  refresh(userId),
                  queryClient.invalidateQueries({
                    queryKey: ROLES_QUERY_KEYS.list,
                  }),
                ])
              })
              .catch((failure: unknown) => {
                toast.error(errorText(failure))
              })
              .finally(() => {
                setBusy(false)
              })
          }}
        >
          {busy ? <Spinner aria-hidden /> : null}
          {t("roles.userRolesSave")}
        </Button>
      )}
      {reauthDialog}
    </section>
  )
}
