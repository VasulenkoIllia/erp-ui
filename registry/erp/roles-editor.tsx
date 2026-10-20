import * as React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { CopyIcon, LockIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import {
  useAuthErrorText,
  useErpAuthProvider,
  useFieldError,
} from "@/registry/erp/auth-layout"
import { PageState, SectionSkeleton } from "@/registry/erp/page-state"
import { useCompanyId } from "@/registry/hooks/use-company"
import { useHasPermission, useRefreshMe } from "@/registry/hooks/use-me"
import { isApiError } from "@/registry/lib/api"
import { ME_QUERY_KEY } from "@/registry/lib/auth"
import { companyScope } from "@/registry/lib/company-scope"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  countGranted,
  grants,
  ROLES_QUERY_KEYS,
  togglePermission,
  type PermissionResource,
  type Role,
  type RoleInput,
} from "@/registry/lib/roles"
import { cn } from "@/registry/lib/utils"
import { Alert, AlertDescription } from "@/registry/ui/alert"
import { Badge } from "@/registry/ui/badge"
import { Button } from "@/registry/ui/button"
import { Checkbox } from "@/registry/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/registry/ui/dialog"
import {
  Field,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"
import { Spinner } from "@/registry/ui/spinner"
import { Textarea } from "@/registry/ui/textarea"

/**
 * Ролі й матриця прав (ADR-0014, основа A2): список ролей, права ролі за ресурсами й діями,
 * нова роль і копія, видалення. Вбудовані ролі — лише перегляд. Каталог прав дає сервер.
 */
export function RolesEditor() {
  // Ролі — свої в кожній компанії: вибрана роль і незбережені права не переходять в іншу.
  return <RolesEditorContent key={useCompanyId() ?? ""} />
}

function RolesEditorContent() {
  const t = useErpUiT()
  const queryClient = useQueryClient()
  const refreshMe = useRefreshMe()
  const canEdit = useHasPermission("roles", "update")
  const query = useRoles()
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [dirty, setDirty] = React.useState(false)
  const [pending, setPending] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState<RoleInput | null>(null)
  // Права поточного користувача — сума прав його ролей: зміна ролі може їх змінити. Профіль
  // перечитуємо з сервера (authProvider його кешує); не вдалося — useMe перезапитає сам.
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEYS.list }),
      refreshMe().catch(() =>
        queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }),
      ),
    ])

  if (query.isPending) return <SectionSkeleton rows={4} />
  if (query.isError)
    return isApiError(query.error) && query.error.status === 403 ? (
      <PageState kind="forbidden" className="min-h-40" />
    ) : (
      <PageState
        kind="error"
        className="min-h-40"
        onRetry={() => {
          void query.refetch()
        }}
      />
    )

  const { roles, resources } = query.data
  const selected =
    roles.find((role) => role.id === selectedId) ?? roles[0] ?? null
  const select = (id: string) => {
    if (id === selected?.id) return
    if (dirty) setPending(id)
    else setSelectedId(id)
  }

  return (
    <div className="@container" data-slot="roles-editor">
      <div className="grid gap-6 @3xl:grid-cols-[15rem_minmax(0,1fr)]">
        <div className="space-y-3">
          <ul className="space-y-1" aria-label={t("roles.listLabel")}>
            {roles.map((role) => (
              <li key={role.id}>
                <button
                  type="button"
                  aria-current={role.id === selected?.id ? "true" : undefined}
                  className={cn(
                    "flex min-h-touch w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-start text-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    role.id === selected?.id && "bg-muted font-medium",
                  )}
                  onClick={() => {
                    select(role.id)
                  }}
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      {role.system ? (
                        <LockIcon
                          aria-hidden
                          className="size-3.5 text-muted-foreground"
                        />
                      ) : null}
                      <span className="truncate">{role.name}</span>
                    </span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      {t("roles.users", { count: role.usersCount })}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {canEdit ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setCreating({ name: "", permissions: [] })
              }}
            >
              <PlusIcon aria-hidden />
              {t("roles.create")}
            </Button>
          ) : null}
        </div>
        {selected ? (
          <RoleDetail
            key={selected.id}
            role={selected}
            resources={resources}
            canEdit={canEdit}
            onDirtyChange={setDirty}
            onSaved={() => {
              setDirty(false)
              void refresh()
            }}
            onDeleted={() => {
              setDirty(false)
              setSelectedId(null)
              void refresh()
            }}
            onDuplicate={(input) => {
              setCreating(input)
            }}
          />
        ) : null}
      </div>

      <Dialog
        open={pending !== null}
        onOpenChange={(next) => {
          if (!next) setPending(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("roles.unsavedTitle", { name: selected?.name ?? "" })}
            </DialogTitle>
            <DialogDescription>
              {t("roles.unsavedDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPending(null)
              }}
            >
              {t("roles.unsavedBack")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setDirty(false)
                setSelectedId(pending)
                setPending(null)
              }}
            >
              {t("roles.unsavedDiscard")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {creating ? (
        <CreateRoleDialog
          initial={creating}
          onClose={() => {
            setCreating(null)
          }}
          onCreated={(role) => {
            setCreating(null)
            setDirty(false)
            setSelectedId(role.id)
            void refresh()
          }}
        />
      ) : null}
    </div>
  )
}

/* ------------------------------ Права ролі ------------------------------ */

function RoleDetail({
  role,
  resources,
  canEdit,
  onDirtyChange,
  onSaved,
  onDeleted,
  onDuplicate,
}: {
  role: Role
  resources: PermissionResource[]
  canEdit: boolean
  onDirtyChange: (dirty: boolean) => void
  onSaved: () => void
  onDeleted: () => void
  onDuplicate: (input: RoleInput) => void
}) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const fieldError = useFieldError()
  const errorText = useAuthErrorText()
  const ids = React.useId()
  const [name, setName] = React.useState(role.name)
  const [description, setDescription] = React.useState(role.description ?? "")
  const [permissions, setPermissions] = React.useState(role.permissions)
  const [nameError, setNameError] = React.useState<string>()
  const [busy, setBusy] = React.useState(false)
  const [removing, setRemoving] = React.useState(false)
  const readOnly = role.system || !canEdit
  const dirty =
    name !== role.name ||
    description !== (role.description ?? "") ||
    JSON.stringify([...permissions].sort()) !==
      JSON.stringify([...role.permissions].sort())

  React.useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])

  const groups = [...new Set(resources.map((r) => r.group ?? ""))]
  const save = () => {
    if (!name.trim()) {
      setNameError(t("auth.fieldErrors.required"))
      return
    }
    setNameError(undefined)
    setBusy(true)
    provider.roles
      .update(role.id, {
        name: name.trim(),
        description: description.trim(),
        permissions,
      })
      .then(() => {
        toast.success(t("roles.saved"))
        onSaved()
      })
      .catch((failure: unknown) => {
        const code = isApiError(failure) ? failure.fieldErrors?.name : undefined
        if (code === "taken") setNameError(t("roles.nameTaken"))
        else if (fieldError(failure, "name"))
          setNameError(fieldError(failure, "name") ?? undefined)
        else toast.error(errorText(failure))
      })
      .finally(() => {
        setBusy(false)
      })
  }

  return (
    <section
      className="min-w-0 space-y-5"
      aria-label={t("roles.matrixLabel", { name: role.name })}
    >
      {role.system ? (
        <Alert>
          <LockIcon aria-hidden />
          <AlertDescription>{t("roles.systemHint")}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 @xl:grid-cols-2">
        <Field data-invalid={nameError ? true : undefined}>
          <FieldLabel htmlFor={`${ids}-name`}>
            {t("roles.nameLabel")}
          </FieldLabel>
          <Input
            id={`${ids}-name`}
            value={name}
            maxLength={60}
            disabled={readOnly}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? `${ids}-name-error` : undefined}
            onChange={(event) => {
              setName(event.target.value)
            }}
          />
          {nameError ? (
            <FieldError id={`${ids}-name-error`}>{nameError}</FieldError>
          ) : null}
        </Field>
        <Field>
          <FieldLabel htmlFor={`${ids}-description`}>
            {t("roles.descriptionLabel")}
          </FieldLabel>
          <Textarea
            id={`${ids}-description`}
            rows={1}
            value={description}
            maxLength={300}
            disabled={readOnly}
            onChange={(event) => {
              setDescription(event.target.value)
            }}
          />
        </Field>
      </div>

      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>
          {t("roles.granted", { count: countGranted(permissions, resources) })}
        </span>
        <span aria-hidden>·</span>
        <span>{t("roles.users", { count: role.usersCount })}</span>
        {role.system ? (
          <Badge variant="secondary">{t("roles.system")}</Badge>
        ) : null}
      </p>

      <div className="space-y-5">
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
                          disabled={readOnly}
                          aria-label={t("roles.allFor", {
                            resource: resource.label,
                          })}
                          onCheckedChange={(checked) => {
                            setPermissions((current) =>
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
                                disabled={readOnly}
                                aria-label={t("roles.actionFor", {
                                  action: action.label,
                                  resource: resource.label,
                                })}
                                onCheckedChange={(checked) => {
                                  setPermissions((current) =>
                                    togglePermission(
                                      current,
                                      resource,
                                      action.id,
                                      checked,
                                    ),
                                  )
                                }}
                              />
                              <label
                                htmlFor={id}
                                aria-hidden
                                className="text-sm"
                              >
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

      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          {role.system ? null : (
            <>
              <Button disabled={!dirty || busy} onClick={save}>
                {busy ? <Spinner aria-hidden /> : null}
                {t("roles.save")}
              </Button>
              <Button
                variant="outline"
                disabled={!dirty || busy}
                onClick={() => {
                  setName(role.name)
                  setDescription(role.description ?? "")
                  setPermissions(role.permissions)
                  setNameError(undefined)
                }}
              >
                {t("roles.discard")}
              </Button>
            </>
          )}
          <Button
            variant="outline"
            onClick={() => {
              onDuplicate({
                name: t("roles.copyOf", { name: role.name }),
                description: role.description,
                permissions,
              })
            }}
          >
            <CopyIcon aria-hidden />
            {t("roles.duplicate")}
          </Button>
          {role.system ? null : (
            <Button
              variant="ghost"
              onClick={() => {
                setRemoving(true)
              }}
            >
              <Trash2Icon aria-hidden />
              {t("roles.remove")}
            </Button>
          )}
        </div>
      ) : null}

      <Dialog
        open={removing}
        onOpenChange={(next) => {
          if (!next) setRemoving(false)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("roles.removeTitle", { name: role.name })}
            </DialogTitle>
            <DialogDescription>
              {role.usersCount
                ? t("roles.removeAssigned")
                : t("roles.removeDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRemoving(false)
              }}
            >
              {t("auth.account.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy || role.usersCount > 0}
              onClick={() => {
                setBusy(true)
                provider.roles
                  .remove(role.id)
                  .then(() => {
                    setRemoving(false)
                    toast.success(t("roles.removed"))
                    onDeleted()
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
              {t("roles.remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

/* ------------------------------ Нова роль ------------------------------ */

function CreateRoleDialog({
  initial,
  onClose,
  onCreated,
}: {
  initial: RoleInput
  onClose: () => void
  onCreated: (role: Role) => void
}) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const errorText = useAuthErrorText()
  const ids = React.useId()
  const [name, setName] = React.useState(initial.name)
  const [description, setDescription] = React.useState(
    initial.description ?? "",
  )
  const [nameError, setNameError] = React.useState<string>()
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            if (!name.trim()) {
              setNameError(t("auth.fieldErrors.required"))
              return
            }
            setNameError(undefined)
            setError(null)
            setBusy(true)
            provider.roles
              .create({
                name: name.trim(),
                description: description.trim(),
                permissions: initial.permissions,
              })
              .then((role) => {
                toast.success(t("roles.created"))
                onCreated(role)
              })
              .catch((failure: unknown) => {
                const code = isApiError(failure)
                  ? failure.fieldErrors?.name
                  : undefined
                if (code === "taken") setNameError(t("roles.nameTaken"))
                else setError(errorText(failure))
              })
              .finally(() => {
                setBusy(false)
              })
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("roles.createTitle")}</DialogTitle>
            <DialogDescription>{t("roles.description")}</DialogDescription>
          </DialogHeader>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Field data-invalid={nameError ? true : undefined}>
            <FieldLabel htmlFor={`${ids}-name`}>
              {t("roles.nameLabel")}
            </FieldLabel>
            <Input
              id={`${ids}-name`}
              value={name}
              maxLength={60}
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? `${ids}-name-error` : undefined}
              onChange={(event) => {
                setName(event.target.value)
              }}
            />
            {nameError ? (
              <FieldError id={`${ids}-name-error`}>{nameError}</FieldError>
            ) : null}
          </Field>
          <Field>
            <FieldLabel htmlFor={`${ids}-description`}>
              {t("roles.descriptionLabel")}
            </FieldLabel>
            <Textarea
              id={`${ids}-description`}
              rows={2}
              value={description}
              maxLength={300}
              onChange={(event) => {
                setDescription(event.target.value)
              }}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("auth.account.cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Spinner aria-hidden /> : null}
              {t("roles.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------ Вибір ролей ------------------------------ */

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
 * обраних ролей; порожній вибір підсвічується помилкою `error`.
 */
export function RolePicker({
  roles,
  value,
  onChange,
  legend,
  error,
  disabled,
}: {
  roles: readonly Role[]
  value: readonly string[]
  onChange: (value: string[]) => void
  legend: string
  error?: string
  disabled?: boolean
}) {
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
          return (
            <li key={role.id} className="flex items-start gap-3 p-3">
              <Checkbox
                id={id}
                className="mt-0.5"
                checked={value.includes(role.id)}
                disabled={disabled}
                aria-describedby={
                  role.description ? `${id}-description` : undefined
                }
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
              </span>
            </li>
          )
        })}
      </ul>
      {error ? <FieldError id={`${ids}-error`}>{error}</FieldError> : null}
    </FieldSet>
  )
}
