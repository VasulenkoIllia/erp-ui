import { Radio } from "@base-ui/react/radio"
import { RadioGroup } from "@base-ui/react/radio-group"
import * as React from "react"

import { useErpUiT } from "@/registry/lib/i18n"
import {
  canChangeScope,
  permissionScope,
  setPermissionScope,
  togglePermission,
  type PermissionResource,
  type PermissionScope,
} from "@/registry/lib/roles"
import { Checkbox } from "@/registry/ui/checkbox"
import { FieldLegend, FieldSet } from "@/registry/ui/field"

/** Зміна набору прав від поточного (кілька галочок поспіль не губляться). */
export type PermissionsUpdate = (current: string[]) => string[]

type CatalogAction = PermissionResource["actions"][number]

/**
 * Матриця прав ролі (ADR-0014): ресурси каталогу за розділами, «Усе» для ресурсу (усі дії над усіма
 * записами; частково, зокрема зі «Свої», — «−») і окремі дії. Усі дії ресурсу разом стискаються до
 * `<ресурс>:*` (`togglePermission`). Дія з вибором (`own` у каталозі, ADR-0038) — ще й перемикач
 * «Свої | Усі» поруч з увімкненою галочкою.
 * `ceiling` — права того, хто змінює: дії й обсяги, яких у нього немає, лише для перегляду з
 * поясненням над матрицею (ADR-0032). Галочки й перемикачі, яких не змінити (`readOnly`, «стеля»),
 * — у порядку Tab з `aria-readonly` і причиною: `readOnlyReasonId` — елемент, що пояснює, чому вся
 * матриця лише для перегляду (ADR-0033). `memo`: введення назви ролі не перемальовує всієї матриці.
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
  const scopeHintId = `${ids}-scope`
  const scopeCeilingId = `${ids}-scope-ceiling`
  const groups = [...new Set(resources.map((r) => r.group ?? ""))]
  const access = matrixAccess(permissions, readOnly, ceiling)
  const someAction = (
    test: (resource: string, action: CatalogAction) => boolean,
  ) => resources.some((r) => r.actions.some((a) => test(r.id, a)))
  // «Усе» для ресурсу: усі дії над усіма записами (`<ресурс>:*`), «Свої» хоч в одній — частково.
  const rows = resources.map((resource) => {
    const scopes = resource.actions.map((a) =>
      access.scopeOf(resource.id, a.id),
    )
    const all = scopes.every((scope) => scope === "all")
    const some = scopes.some((scope) => scope !== null)
    return { resource, all, some, lock: access.allLock(resource, all) }
  })
  const locks = rows.map((row) => row.lock)
  const anyLocked = someAction(access.toggleLocked) || locks.includes("ceiling")
  const anyScopeLocked =
    someAction(access.scopeLocked) || locks.includes("scope")
  // Пояснення «Свої» й «Усі» — коли в каталозі є дія з вибором: перша галочка не зсуває матрицю.
  const anyScope = someAction((_, action) => action.own === true)
  // Причина галочки, якої не змінити: уся матриця — пояснення ззовні, дія поза стелею — над матрицею.
  const reasonOf = (isLocked: boolean) =>
    readOnly ? readOnlyReasonId : isLocked ? hintId : undefined
  // Перемикач: пояснення обсягів і коротка причина, а не весь текст про «стелю».
  const scopeDescription = (isLocked: boolean) =>
    [
      scopeHintId,
      readOnly ? readOnlyReasonId : isLocked ? scopeCeilingId : undefined,
    ]
      .filter(Boolean)
      .join(" ")
  return (
    <div className="space-y-5">
      {anyScope ? (
        <p id={scopeHintId} className="text-sm text-muted-foreground">
          {t("roles.scopeHint")}
        </p>
      ) : null}
      {anyLocked ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {t("roles.matrixCeilingHint")}
        </p>
      ) : null}
      {anyScopeLocked ? (
        <p id={scopeCeilingId} className="text-sm text-muted-foreground">
          {t("roles.scopeCeilingHint")}
        </p>
      ) : null}
      {groups.map((group) => (
        <FieldSet key={group} className="gap-2">
          {group ? <FieldLegend variant="label">{group}</FieldLegend> : null}
          <ul className="divide-y rounded-lg border">
            {rows
              .filter(({ resource }) => (resource.group ?? "") === group)
              .map(({ resource, all, some, lock }) => {
                const allId = `${ids}-${resource.id}-all`
                return (
                  <li
                    key={resource.id}
                    className="flex flex-col gap-3 p-3 @xl:flex-row @xl:items-center"
                  >
                    <div className="flex items-center gap-2 @xl:w-56 @xl:shrink-0">
                      <Checkbox
                        id={allId}
                        checked={all}
                        indeterminate={!all && some}
                        readOnly={readOnly || lock !== null}
                        aria-describedby={
                          lock === "scope"
                            ? scopeCeilingId
                            : reasonOf(lock !== null)
                        }
                        aria-label={t("roles.allFor", {
                          resource: resource.label,
                        })}
                        onCheckedChange={(checked) => {
                          onChange((current) =>
                            resource.actions.reduce(
                              (acc, action) =>
                                setPermissionScope(
                                  acc,
                                  resource,
                                  action.id,
                                  checked ? "all" : null,
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
                      {resource.actions.map((action) => (
                        <ActionPermission
                          key={action.id}
                          id={`${ids}-${resource.id}-${action.id}`}
                          resource={resource}
                          action={action}
                          scope={access.scopeOf(resource.id, action.id)}
                          defaultScope={access.defaultScope(
                            resource.id,
                            action,
                          )}
                          readOnly={readOnly}
                          toggleLocked={access.toggleLocked(
                            resource.id,
                            action,
                          )}
                          scopeLocked={access.scopeLocked(resource.id, action)}
                          reasonOf={reasonOf}
                          scopeDescription={scopeDescription}
                          onChange={onChange}
                        />
                      ))}
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

/**
 * Що в матриці можна змінити тому, хто має права `ceiling` («стеля», ADR-0032): дію ввімкнути чи
 * вимкнути, обсяг перемкнути. Без `ceiling` — усе; `readOnly` — нічого, але без «стелі» в причині.
 */
function matrixAccess(
  permissions: readonly string[],
  readOnly: boolean,
  ceiling: readonly string[] | undefined,
) {
  const scopeOf = (resource: string, action: string) =>
    permissionScope(permissions, resource, action)
  const allowed = (
    resource: string,
    action: string,
    from: PermissionScope | null,
    to: PermissionScope | null,
  ) =>
    readOnly ||
    ceiling === undefined ||
    canChangeScope(ceiling, resource, action, from, to)
  // Нова дія — над усіма записами, а хто має лише свої, дає «Свої».
  const defaultScope = (resource: string, action: CatalogAction) =>
    action.own &&
    ceiling !== undefined &&
    permissionScope(ceiling, resource, action.id) !== "all"
      ? "own"
      : "all"
  const target = (resource: string, action: CatalogAction, on: boolean) =>
    on ? (scopeOf(resource, action.id) ?? defaultScope(resource, action)) : null
  return {
    scopeOf,
    defaultScope,
    toggleLocked: (resource: string, action: CatalogAction) => {
      const from = scopeOf(resource, action.id)
      return !allowed(
        resource,
        action.id,
        from,
        target(resource, action, !from),
      )
    },
    // «Усе» вмикає все над усіма записами чи знімає все. Чого не змінити: дії, якої в «стелі»
    // немає зовсім («ceiling»), чи лише обсягу — у «стелі» дія лише на свої («scope»).
    allLock: (
      resource: PermissionResource,
      all: boolean,
    ): "ceiling" | "scope" | null => {
      const locked = resource.actions.filter(
        (a) =>
          !allowed(
            resource.id,
            a.id,
            scopeOf(resource.id, a.id),
            all ? null : "all",
          ),
      )
      if (!locked.length) return null
      return locked.some(
        (a) => permissionScope(ceiling ?? [], resource.id, a.id) === null,
      )
        ? "ceiling"
        : "scope"
    },
    // Перемикач видно лише в увімкненої дії з вибором; змінити його може лише той, хто має «Усі».
    scopeLocked: (resource: string, action: CatalogAction) => {
      const from = scopeOf(resource, action.id)
      if (!action.own || from === null) return false
      return !allowed(resource, action.id, from, from === "own" ? "all" : "own")
    },
  }
}

/** Дія ресурсу: галочка «може це робити» і, якщо каталог дає вибір, обсяг «Свої | Усі». */
function ActionPermission({
  id,
  resource,
  action,
  scope,
  defaultScope,
  readOnly,
  toggleLocked,
  scopeLocked,
  reasonOf,
  scopeDescription,
  onChange,
}: {
  id: string
  resource: PermissionResource
  action: CatalogAction
  scope: PermissionScope | null
  defaultScope: PermissionScope
  readOnly: boolean
  toggleLocked: boolean
  scopeLocked: boolean
  reasonOf: (isLocked: boolean) => string | undefined
  scopeDescription: (isLocked: boolean) => string
  onChange: (update: PermissionsUpdate) => void
}) {
  const t = useErpUiT()
  const names = { action: action.label, resource: resource.label }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Checkbox
        id={id}
        checked={scope !== null}
        readOnly={readOnly || toggleLocked}
        aria-describedby={reasonOf(toggleLocked)}
        aria-label={t("roles.actionFor", names)}
        onCheckedChange={(checked) => {
          onChange((current) =>
            togglePermission(
              current,
              resource,
              action.id,
              checked,
              defaultScope,
            ),
          )
        }}
      />
      <label htmlFor={id} aria-hidden className="text-sm">
        {action.label}
      </label>
      {action.own && scope !== null ? (
        <ScopeToggle
          scope={scope}
          readOnly={readOnly || scopeLocked}
          label={t("roles.scopeFor", names)}
          describedBy={scopeDescription(scopeLocked)}
          onScopeChange={(next) => {
            onChange((current) =>
              setPermissionScope(current, resource, action.id, next),
            )
          }}
        />
      ) : null}
    </div>
  )
}

const SCOPES: readonly PermissionScope[] = ["own", "all"]

/**
 * Перемикач «Свої | Усі» — дві радіокнопки (одна зупинка Tab, стрілки між ними). Лише для перегляду
 * — у порядку Tab з `aria-readonly` і пунктирною рамкою, як галочки матриці (ADR-0033). Ціль дотику —
 * 44 px заввишки (`after:`), як у галочок; у forced-colors тло зникає — вибраний підкреслено.
 */
function ScopeToggle({
  scope,
  readOnly,
  label,
  describedBy,
  onScopeChange,
}: {
  scope: PermissionScope
  readOnly: boolean
  label: string
  describedBy: string
  onScopeChange: (scope: PermissionScope) => void
}) {
  const t = useErpUiT()
  return (
    <RadioGroup
      value={scope}
      readOnly={readOnly}
      aria-label={label}
      aria-describedby={describedBy || undefined}
      onValueChange={(value) => {
        if (value === "own" || value === "all") onScopeChange(value)
      }}
      data-slot="permission-scope"
      className="inline-flex rounded-md border bg-background p-0.5 aria-readonly:border-dashed aria-readonly:border-input"
    >
      {SCOPES.map((value) => (
        <Radio.Root
          key={value}
          value={value}
          className="relative inline-flex h-7 min-w-11 cursor-pointer items-center justify-center rounded-sm px-2.5 text-xs font-medium text-muted-foreground transition-colors outline-none select-none after:absolute after:inset-x-0 after:-inset-y-2 hover:not-data-checked:not-data-readonly:text-foreground focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background data-readonly:cursor-default data-checked:bg-primary data-checked:text-primary-foreground data-readonly:data-checked:bg-muted-foreground data-readonly:data-checked:text-background forced-colors:data-checked:underline forced-colors:data-checked:decoration-2 forced-colors:data-checked:underline-offset-4"
        >
          {t(value === "own" ? "roles.scopeOwn" : "roles.scopeAll")}
        </Radio.Root>
      ))}
    </RadioGroup>
  )
}
