import * as React from "react"

import { useErpUiT } from "@/registry/lib/i18n"
import {
  grants,
  togglePermission,
  type PermissionResource,
} from "@/registry/lib/roles"
import { Checkbox } from "@/registry/ui/checkbox"
import { FieldLegend, FieldSet } from "@/registry/ui/field"

/** Зміна набору прав від поточного (кілька галочок поспіль не губляться). */
export type PermissionsUpdate = (current: string[]) => string[]

/**
 * Матриця прав ролі (ADR-0014): ресурси каталогу за розділами, «Усе» для ресурсу (частково — «−»)
 * і окремі дії. Усі дії ресурсу разом стискаються до `<ресурс>:*` (`togglePermission`). `ceiling` —
 * права того, хто змінює: дії, яких у нього немає, лише для перегляду з поясненням над матрицею
 * (ADR-0032). Галочки, яких не змінити (`readOnly`, «стеля»), — у порядку Tab з `aria-readonly` і
 * причиною: `readOnlyReasonId` — елемент, що пояснює, чому вся матриця лише для перегляду
 * (ADR-0033). `memo`: введення назви ролі не перемальовує всієї матриці.
 */
export const RoleMatrix = React.memo(function RoleMatrix({
  resources,
  permissions,
  readOnly,
  readOnlyReasonId,
  onChange,
  ceiling,
}: {
  resources: readonly PermissionResource[]
  permissions: readonly string[]
  readOnly: boolean
  readOnlyReasonId?: string
  onChange: (update: PermissionsUpdate) => void
  ceiling?: readonly string[]
}) {
  const t = useErpUiT()
  const ids = React.useId()
  const hintId = `${ids}-ceiling`
  const groups = [...new Set(resources.map((r) => r.group ?? ""))]
  const locked = (resource: string, action: string) =>
    !readOnly && ceiling !== undefined && !grants(ceiling, resource, action)
  const anyLocked = resources.some((r) =>
    r.actions.some((a) => locked(r.id, a.id)),
  )
  // Причина галочки, якої не змінити: уся матриця — пояснення ззовні, дія поза стелею — над матрицею.
  const reasonOf = (isLocked: boolean) =>
    readOnly ? readOnlyReasonId : isLocked ? hintId : undefined
  return (
    <div className="space-y-5">
      {anyLocked ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {t("roles.matrixCeilingHint")}
        </p>
      ) : null}
      {groups.map((group) => (
        <FieldSet key={group} className="gap-2">
          {group ? <FieldLegend variant="label">{group}</FieldLegend> : null}
          <ul className="divide-y rounded-lg border">
            {resources
              .filter((r) => (r.group ?? "") === group)
              .map((resource) => {
                const granted = resource.actions.filter((a) =>
                  grants(permissions, resource.id, a.id),
                )
                const all = granted.length === resource.actions.length
                const allId = `${ids}-${resource.id}-all`
                // «Усе» зачепило б і дії поза стелею.
                const allLocked = resource.actions.some((a) =>
                  locked(resource.id, a.id),
                )
                return (
                  <li
                    key={resource.id}
                    className="flex flex-col gap-3 p-3 @xl:flex-row @xl:items-center"
                  >
                    <div className="flex items-center gap-2 @xl:w-56 @xl:shrink-0">
                      <Checkbox
                        id={allId}
                        checked={all}
                        indeterminate={!all && granted.length > 0}
                        readOnly={readOnly || allLocked}
                        aria-describedby={reasonOf(allLocked)}
                        aria-label={t("roles.allFor", {
                          resource: resource.label,
                        })}
                        onCheckedChange={(checked) => {
                          onChange((current) =>
                            resource.actions.reduce(
                              (acc, action) =>
                                togglePermission(
                                  acc,
                                  resource,
                                  action.id,
                                  checked,
                                ),
                              current,
                            ),
                          )
                        }}
                      />
                      <label
                        htmlFor={allId}
                        aria-hidden
                        className="text-sm font-medium"
                      >
                        {resource.label}
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-2">
                      {resource.actions.map((action) => {
                        const id = `${ids}-${resource.id}-${action.id}`
                        return (
                          <span
                            key={action.id}
                            className="flex items-center gap-2"
                          >
                            <Checkbox
                              id={id}
                              checked={grants(
                                permissions,
                                resource.id,
                                action.id,
                              )}
                              readOnly={
                                readOnly || locked(resource.id, action.id)
                              }
                              aria-describedby={reasonOf(
                                locked(resource.id, action.id),
                              )}
                              aria-label={t("roles.actionFor", {
                                action: action.label,
                                resource: resource.label,
                              })}
                              onCheckedChange={(checked) => {
                                onChange((current) =>
                                  togglePermission(
                                    current,
                                    resource,
                                    action.id,
                                    checked,
                                  ),
                                )
                              }}
                            />
                            <label htmlFor={id} aria-hidden className="text-sm">
                              {action.label}
                            </label>
                          </span>
                        )
                      })}
                    </div>
                  </li>
                )
              })}
          </ul>
        </FieldSet>
      ))}
    </div>
  )
})
