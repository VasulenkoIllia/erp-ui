import * as React from "react"
import { LockIcon } from "lucide-react"
import { toast } from "sonner"

import {
  useAuthErrorText,
  useErpAuthProvider,
} from "@/registry/erp/auth-layout"
import { isApiError } from "@/registry/lib/api"
import { useErpUiT } from "@/registry/lib/i18n"
import type { Role, RoleInput } from "@/registry/lib/roles"
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

/**
 * Список ролей (ADR-0014, ADR-0033), частина `erp/roles-editor` разом із діалогом нової ролі:
 * вибрана — `aria-current`, вбудована — замок, під назвою — скільки людей у компанії має роль.
 */
export function RoleList({
  roles,
  selectedId,
  onSelect,
}: {
  roles: readonly Role[]
  selectedId: string | undefined
  onSelect: (id: string) => void
}) {
  const t = useErpUiT()
  return (
    <ul className="space-y-1" aria-label={t("roles.listLabel")}>
      {roles.map((role) => (
        <li key={role.id}>
          <button
            type="button"
            aria-current={role.id === selectedId ? "true" : undefined}
            className={cn(
              "flex min-h-touch w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-start text-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              role.id === selectedId && "bg-muted font-medium",
            )}
            onClick={() => {
              onSelect(role.id)
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
  )
}

/**
 * Роль, яку показати: вибрана; без вибору — перша; вибраної немає (видалили, інша компанія) — `null`
 * для «не знайдено», коли вибір з адреси, і перша, коли вибір усередині.
 */
export function shownRole(
  roles: readonly Role[],
  selectedId: string | null,
  routed: boolean,
): Role | null {
  const found = roles.find((role) => role.id === selectedId)
  if (found) return found
  return routed && selectedId ? null : (roles[0] ?? null)
}

/** Нова роль або копія: назва й опис; права — з `initial` (порожні чи скопійовані). */
export function CreateRoleDialog({
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
