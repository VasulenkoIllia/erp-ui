import * as React from "react"

import {
  useAuthErrorText,
  useErpAuthProvider,
  useFieldError,
} from "@/registry/erp/auth-layout"
import { SectionSkeleton } from "@/registry/erp/page-state"
import { useReauth } from "@/registry/erp/reauth-dialog"
import { RolePicker } from "@/registry/erp/role-picker"
import { useMe } from "@/registry/hooks/use-me"
import { isApiError } from "@/registry/lib/api"
import { useErpUiT } from "@/registry/lib/i18n"
import type { Invitation } from "@/registry/lib/invitations"
import type { Role } from "@/registry/lib/roles"
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"
import { Spinner } from "@/registry/ui/spinner"
import { Textarea } from "@/registry/ui/textarea"

/**
 * «Запросити колегу» (ADR-0014, ADR-0040): адреса, ім'я, ролі, кілька слів у лист. Запрошення дає
 * постійний доступ до компанії, тож сервер просить пароль ще раз (403 `reauth_required`): діалог
 * підтвердження відкриває `useReauth`, форма лишається з уведеним. Частина `InvitationsSection`.
 */
export function InviteDialog({
  roles,
  rolesError,
  onClose,
  onSent,
}: {
  roles: Role[] | undefined
  rolesError: string | null
  onClose: () => void
  onSent: (invitation: Invitation) => void
}) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const fieldError = useFieldError()
  const errorText = useAuthErrorText()
  const { guard, dialog: reauthDialog } = useReauth()
  const ids = React.useId()
  const ceiling = useMe().data?.permissions
  const [email, setEmail] = React.useState("")
  const [name, setName] = React.useState("")
  const [selected, setSelected] = React.useState<string[]>([])
  const [message, setMessage] = React.useState("")
  const [emailError, setEmailError] = React.useState<string>()
  const [rolesInvalid, setRolesInvalid] = React.useState<string>()
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const emailText = (failure: unknown) => {
    const code = isApiError(failure) ? failure.fieldErrors?.email : undefined
    if (code === "taken") return t("invitations.emailTaken")
    if (code === "invited") return t("invitations.emailInvited")
    return fieldError(failure, "email") ?? undefined
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        // Під час запиту не закриваємо: відповідь може попросити пароль, а діалог пароля живе тут.
        if (!next && !busy) onClose()
      }}
    >
      <DialogContent>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            const nextEmail = email.trim()
            const emailMissing = !nextEmail
            setEmailError(
              emailMissing ? t("auth.fieldErrors.required") : undefined,
            )
            setRolesInvalid(
              selected.length ? undefined : t("invitations.rolesRequired"),
            )
            if (emailMissing || !selected.length) return
            setError(null)
            setBusy(true)
            guard(() =>
              provider.invitations.create({
                email: nextEmail,
                ...(name.trim() ? { name: name.trim() } : {}),
                roles: selected,
                ...(message.trim() ? { message: message.trim() } : {}),
              }),
            )
              .then(onSent)
              .catch((failure: unknown) => {
                const emailIssue = emailText(failure)
                const rolesIssue = fieldError(failure, "roles")
                if (emailIssue) setEmailError(emailIssue)
                if (rolesIssue) setRolesInvalid(t("invitations.rolesRequired"))
                if (!emailIssue && !rolesIssue) setError(errorText(failure))
              })
              .finally(() => {
                setBusy(false)
              })
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("invitations.inviteTitle")}</DialogTitle>
            <DialogDescription>
              {t("invitations.description")}
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Field data-invalid={emailError ? true : undefined}>
            <FieldLabel htmlFor={`${ids}-email`}>
              {t("invitations.emailLabel")}
            </FieldLabel>
            <Input
              id={`${ids}-email`}
              type="email"
              inputMode="email"
              autoComplete="off"
              value={email}
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? `${ids}-email-error` : undefined}
              onChange={(event) => {
                setEmail(event.target.value)
              }}
            />
            {emailError ? (
              <FieldError id={`${ids}-email-error`}>{emailError}</FieldError>
            ) : null}
          </Field>
          <Field>
            <FieldLabel htmlFor={`${ids}-name`}>
              {t("invitations.nameLabel")}
            </FieldLabel>
            <Input
              id={`${ids}-name`}
              autoComplete="off"
              value={name}
              maxLength={100}
              onChange={(event) => {
                setName(event.target.value)
              }}
            />
          </Field>
          {roles ? (
            <RolePicker
              roles={roles}
              value={selected}
              legend={t("invitations.rolesLabel")}
              error={rolesInvalid}
              disabled={busy}
              ceiling={ceiling}
              onChange={(next) => {
                setSelected(next)
                setRolesInvalid(undefined)
              }}
            />
          ) : rolesError ? (
            <Alert variant="destructive">
              <AlertDescription>{rolesError}</AlertDescription>
            </Alert>
          ) : (
            <SectionSkeleton rows={2} />
          )}
          <Field>
            <FieldLabel htmlFor={`${ids}-message`}>
              {t("invitations.messageLabel")}
            </FieldLabel>
            <Textarea
              id={`${ids}-message`}
              rows={2}
              value={message}
              maxLength={500}
              aria-describedby={`${ids}-message-hint`}
              onChange={(event) => {
                setMessage(event.target.value)
              }}
            />
            <FieldDescription id={`${ids}-message-hint`}>
              {t("invitations.messageHint")}
            </FieldDescription>
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              {t("auth.account.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={busy || !roles}
              // Під час запиту кнопка лишається у фокусі: сюди повернеться фокус із діалогу пароля.
              focusableWhenDisabled={busy}
              aria-busy={busy || undefined}
            >
              {busy ? <Spinner aria-hidden /> : null}
              {t("invitations.send")}
            </Button>
          </DialogFooter>
        </form>
        {reauthDialog}
      </DialogContent>
    </Dialog>
  )
}
