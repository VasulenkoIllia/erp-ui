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
 * права того, хто змінює: дії, яких у нього немає, неактивні з поясненням над матрицею (ADR-0032).
 */
export function RoleMatrix({
  resources,
  permissions,
  readOnly,
  onChange,
  ceiling,
}: {
  resources: readonly PermissionResource[]
  permissions: readonly string[]
  readOnly: boolean
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
                        disabled={readOnly || allLocked}
                        aria-describedby={allLocked ? hintId : undefined}
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
                              disabled={
                                readOnly || locked(resource.id, action.id)
                              }
                              aria-describedby={
                                locked(resource.id, action.id)
                                  ? hintId
                                  : undefined
                              }
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
}
