import * as React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { MailIcon, UserPlusIcon } from "lucide-react"
import { toast } from "sonner"

import {
  useAuthErrorText,
  useErpAuthProvider,
  useFieldError,
} from "@/registry/erp/auth-layout"
import { ConfirmDialog } from "@/registry/erp/confirm-dialog"
import {
  InvitationActions,
  useInvitationActions,
  useInvitationCeiling,
} from "@/registry/erp/invitation-actions"
import { PageState, SectionSkeleton } from "@/registry/erp/page-state"
import { RolePicker, useRoles } from "@/registry/erp/role-picker"
import { useCompanyId } from "@/registry/hooks/use-company"
import { useMe } from "@/registry/hooks/use-me"
import { isApiError } from "@/registry/lib/api"
import { companyScope } from "@/registry/lib/company-scope"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  INVITATION_QUERY_KEYS,
  type Invitation,
} from "@/registry/lib/invitations"
import { ROLES_QUERY_KEYS, type Role } from "@/registry/lib/roles"
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
 * Запрошення колег (ADR-0014, PF01/A2): хто чекає на прийняття, «Запросити колегу» з ролями,
 * надіслати ще раз, відкликати. Людина приймає запрошення на `AcceptInviteScreen` (ADR-0010).
 * Право `users:create`; ролі для вибору — `roles:read`. Запрошення з ролями понад свої права —
 * дії неактивні з причиною; щойно змінене чи зникле (409, 404) — свіжий список (ADR-0035).
 */
export function InvitationsSection() {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const queryClient = useQueryClient()
  const errorText = useAuthErrorText()
  const format = useFormat()
  const [inviting, setInviting] = React.useState(false)
  const inviteButton = React.useRef<HTMLButtonElement>(null)
  const companyId = useCompanyId()
  const query = useQuery({
    queryKey: [...INVITATION_QUERY_KEYS.list, companyScope(companyId)],
    queryFn: () => provider.invitations.list(),
    // Запрошення приймають без участі адміністратора — свіжий список при кожному відкритті.
    refetchOnMount: "always",
  })
  const roles = useRoles()
  const ceiling = useInvitationCeiling()
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: INVITATION_QUERY_KEYS.list }),
      queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEYS.list }),
    ])
  const actions = useInvitationActions(refresh)
  const { revoking } = actions

  if (query.isPending) return <SectionSkeleton rows={2} />
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

  const roleName = (id: string) =>
    roles.data?.roles.find((role) => role.id === id)?.name ?? id

  return (
    <div className="@container space-y-4" data-slot="invitations-section">
      {query.data.length ? (
        <ul
          className="divide-y rounded-lg border"
          aria-label={t("invitations.listLabel")}
        >
          {query.data.map((invitation) => {
            const expired = invitation.status === "expired"
            const deniedReason = ceiling.deniedReason(invitation)
            return (
              <li
                key={invitation.id}
                className="flex flex-col gap-3 p-3 @lg:flex-row @lg:items-center"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <MailIcon aria-hidden className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-medium break-all">
                      {invitation.name
                        ? `${invitation.name} · ${invitation.email}`
                        : invitation.email}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {invitation.roles.map((role) => (
                        <Badge key={role} variant="secondary">
                          {roleName(role)}
                        </Badge>
                      ))}
                    </div>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                      <span>
                        {t("invitations.invitedBy", {
                          by: invitation.invitedBy,
                          when: format.relative(invitation.lastSentAt),
                        })}
                      </span>
                      {expired ? (
                        <Badge variant="destructive">
                          {t("invitations.expired")}
                        </Badge>
                      ) : (
                        <span>
                          {t("invitations.expires", {
                            date: format.date(invitation.expiresAt, "medium"),
                          })}
                        </span>
                      )}
                    </p>
                    {deniedReason ? (
                      <p className="text-sm text-muted-foreground">
                        {deniedReason}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 @lg:shrink-0">
                  <InvitationActions
                    invitation={invitation}
                    busy={actions.resending.has(invitation.id)}
                    checking={ceiling.checking}
                    deniedReason={deniedReason}
                    onResend={() => {
                      actions.resend(invitation)
                    }}
                    onRevoke={() => {
                      actions.askRevoke(invitation)
                    }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("invitations.empty")}
        </p>
      )}

      <Button
        ref={inviteButton}
        onClick={() => {
          setInviting(true)
        }}
      >
        <UserPlusIcon aria-hidden />
        {t("invitations.invite")}
      </Button>

      {inviting ? (
        <InviteDialog
          roles={roles.data?.roles}
          rolesError={roles.isError ? errorText(roles.error) : null}
          onClose={() => {
            setInviting(false)
          }}
          onSent={(invitation) => {
            setInviting(false)
            toast.success(t("invitations.sent", { email: invitation.email }))
            void refresh()
          }}
        />
      ) : null}

      <ConfirmDialog
        // Запрошення зникло зі списку (прийняли чи відкликали деінде) — діалог закривається сам.
        open={
          actions.revokeOpen &&
          revoking !== null &&
          query.data.some((invitation) => invitation.id === revoking.id)
        }
        title={t("invitations.revokeTitle", { email: revoking?.email ?? "" })}
        description={t("invitations.revokeDescription")}
        confirmLabel={t("invitations.revoke")}
        destructive
        // Рядка з кнопкою «Відкликати» після відкликання вже немає — фокус на «Запросити колегу».
        returnFocus={() => inviteButton.current}
        onClose={actions.closeRevoke}
        onConfirm={actions.confirmRevoke}
      />
    </div>
  )
}

function InviteDialog({
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
        if (!next) onClose()
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
            provider.invitations
              .create({
                email: nextEmail,
                ...(name.trim() ? { name: name.trim() } : {}),
                roles: selected,
                ...(message.trim() ? { message: message.trim() } : {}),
              })
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
            <Button type="button" variant="outline" onClick={onClose}>
              {t("auth.account.cancel")}
            </Button>
            <Button type="submit" disabled={busy || !roles}>
              {busy ? <Spinner aria-hidden /> : null}
              {t("invitations.send")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
