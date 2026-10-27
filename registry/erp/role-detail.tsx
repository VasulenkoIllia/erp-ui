import * as React from "react"
import { CopyIcon, LockIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import {
  useAuthErrorText,
  useErpAuthProvider,
  useFieldError,
} from "@/registry/erp/auth-layout"
import { DeniedAction } from "@/registry/erp/permission-gate"
import { RoleMatrix } from "@/registry/erp/role-matrix"
import { isApiError } from "@/registry/lib/api"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  canGrant,
  countGranted,
  type PermissionResource,
  type Role,
  type RoleInput,
} from "@/registry/lib/roles"
import { Alert, AlertDescription } from "@/registry/ui/alert"
import { Badge } from "@/registry/ui/badge"
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

/**
 * Права ролі (ADR-0014): назва, опис, підсумок і матриця прав; «Зберегти», «Скасувати зміни»,
 * «Копіювати», «Видалити» з підтвердженням. Вбудована роль чи без права `roles:update` — лише
 * перегляд. Незбережені зміни — `onDirtyChange` для переходу до іншої ролі. `ceiling` — права
 * того, хто змінює: права поза ними неактивні, а роль, що дає більше, лише для перегляду — не
 * змінити, не скопіювати й не видалити (ADR-0032).
 */
export function RoleDetail({
  role,
  resources,
  canEdit,
  onDirtyChange,
  onSaved,
  onDeleted,
  onDuplicate,
  ceiling,
}: {
  role: Role
  resources: PermissionResource[]
  canEdit: boolean
  onDirtyChange: (dirty: boolean) => void
  onSaved: () => void
  onDeleted: () => void
  onDuplicate: (input: RoleInput) => void
  ceiling?: readonly string[]
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
  const beyond = ceiling ? !canGrant(ceiling, role.permissions) : false
  // Сильнішу роль не змінити зовсім, зокрема назву: сервер однаково відмовить (ADR-0032).
  const readOnly = role.system || !canEdit || beyond
  const dirty =
    name !== role.name ||
    description !== (role.description ?? "") ||
    JSON.stringify([...permissions].sort()) !==
      JSON.stringify([...role.permissions].sort())

  React.useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])

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
      ) : beyond && canEdit ? (
        <Alert>
          <LockIcon aria-hidden />
          <AlertDescription>{t("roles.beyondCeilingHint")}</AlertDescription>
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

      <RoleMatrix
        resources={resources}
        permissions={permissions}
        readOnly={readOnly}
        onChange={setPermissions}
        ceiling={ceiling}
      />

      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          {role.system || beyond ? null : (
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
          {beyond ? (
            <DeniedAction reason={t("roles.roleBeyondCeiling")}>
              <CopyIcon aria-hidden />
              {t("roles.duplicate")}
            </DeniedAction>
          ) : (
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
          )}
          {role.system ? null : beyond ? (
            <DeniedAction variant="ghost" reason={t("roles.roleBeyondCeiling")}>
              <Trash2Icon aria-hidden />
              {t("roles.remove")}
            </DeniedAction>
          ) : (
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
