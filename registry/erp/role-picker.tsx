import * as React from "react"
import { useQuery } from "@tanstack/react-query"

import { useErpAuthProvider } from "@/registry/erp/auth-layout"
import { useCompanyId } from "@/registry/hooks/use-company"
import { companyScope } from "@/registry/lib/company-scope"
import { useErpUiT } from "@/registry/lib/i18n"
import { canGrant, ROLES_QUERY_KEYS, type Role } from "@/registry/lib/roles"
import { Checkbox } from "@/registry/ui/checkbox"
import { FieldError, FieldLegend, FieldSet } from "@/registry/ui/field"

/** Ролі компанії й каталог прав (право `roles:read`); без права запит не йде. */
export function useRoles(enabled = true) {
  const provider = useErpAuthProvider()
  const companyId = useCompanyId()
  return useQuery({
    queryKey: [...ROLES_QUERY_KEYS.list, companyScope(companyId)],
    queryFn: () => provider.roles.list(),
    enabled,
  })
}

/**
 * Позначки ролей з описами — для запрошення й доступу користувача. Права людини — сума прав
 * обраних ролей; порожній вибір підсвічується помилкою `error`. `ceiling` — права того, хто
 * вибирає: роль, що дає більше, неактивна з причиною (її не дати й не забрати, ADR-0032).
 */
export function RolePicker({
  roles,
  value,
  onChange,
  legend,
  error,
  disabled,
  ceiling,
}: {
  roles: readonly Role[]
  value: readonly string[]
  onChange: (value: string[]) => void
  legend: string
  error?: string
  disabled?: boolean
  ceiling?: readonly string[]
}) {
  const t = useErpUiT()
  const ids = React.useId()
  return (
    <FieldSet
      className="gap-2"
      data-invalid={error ? true : undefined}
      aria-describedby={error ? `${ids}-error` : undefined}
    >
      <FieldLegend variant="label">{legend}</FieldLegend>
      <ul className="divide-y rounded-lg border">
        {roles.map((role) => {
          const id = `${ids}-${role.id}`
          const beyond = ceiling ? !canGrant(ceiling, role.permissions) : false
          const describedBy = [
            role.description ? `${id}-description` : "",
            beyond ? `${id}-ceiling` : "",
          ]
            .filter(Boolean)
            .join(" ")
          return (
            <li key={role.id} className="flex items-start gap-3 p-3">
              <Checkbox
                id={id}
                className="mt-0.5"
                checked={value.includes(role.id)}
                disabled={disabled || beyond}
                aria-describedby={describedBy || undefined}
                onCheckedChange={(checked) => {
                  onChange(
                    checked
                      ? [...value, role.id]
                      : value.filter((r) => r !== role.id),
                  )
                }}
              />
              <span className="grid gap-0.5">
                <label htmlFor={id} className="text-sm font-medium">
                  {role.name}
                </label>
                {role.description ? (
                  <span
                    id={`${id}-description`}
                    className="text-sm text-muted-foreground"
                  >
                    {role.description}
                  </span>
                ) : null}
                {beyond ? (
                  <span
                    id={`${id}-ceiling`}
                    className="text-sm text-muted-foreground"
                  >
                    {t("roles.beyondCeiling")}
                  </span>
                ) : null}
              </span>
            </li>
          )
        })}
      </ul>
      {error ? <FieldError id={`${ids}-error`}>{error}</FieldError> : null}
    </FieldSet>
  )
}
