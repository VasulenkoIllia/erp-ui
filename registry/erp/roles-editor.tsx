import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { LockIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"

import {
  useAuthErrorText,
  useErpAuthProvider,
} from "@/registry/erp/auth-layout"
import { PageState, SectionSkeleton } from "@/registry/erp/page-state"
import { RoleDetail } from "@/registry/erp/role-detail"
import { RolePicker, useRoles } from "@/registry/erp/role-picker"
import { useCompanyId } from "@/registry/hooks/use-company"
import { useHasPermission, useMe, useRefreshMe } from "@/registry/hooks/use-me"
import { isApiError } from "@/registry/lib/api"
import { ME_QUERY_KEY } from "@/registry/lib/auth"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  ROLES_QUERY_KEYS,
  type Role,
  type RoleInput,
} from "@/registry/lib/roles"
import { cn } from "@/registry/lib/utils"
import { Alert, AlertDescription } from "@/registry/ui/alert"
import { Button } from "@/registry/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/registry/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"
import { Spinner } from "@/registry/ui/spinner"
import { Textarea } from "@/registry/ui/textarea"

// Вибір ролей жив тут до A2b2: імпорт `RolePicker` і `useRoles` з цього елемента працює й далі.
export { RolePicker, useRoles }

/**
 * Ролі й матриця прав (ADR-0014, основа A2): список ролей, права ролі за ресурсами й діями,
 * нова роль і копія, видалення. Вбудовані ролі — лише перегляд. Каталог прав дає сервер. Права
 * ролі — `erp/role-detail`, матриця — `erp/role-matrix`, вибір ролей — `erp/role-picker`.
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
  // «Стеля» (ADR-0032): права, яких немає в того, хто змінює, неактивні.
  const ceiling = useMe().data?.permissions
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
            ceiling={ceiling}
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

/** Нова роль або копія: назва й опис; права — з `initial` (порожні чи скопійовані). */
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
