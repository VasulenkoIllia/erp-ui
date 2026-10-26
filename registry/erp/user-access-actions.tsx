import * as React from "react"
import { toast } from "sonner"

import {
  useAuthErrorText,
  useErpAuthProvider,
  useFieldError,
} from "@/registry/erp/auth-layout"
import { ConfirmDialog } from "@/registry/erp/confirm-dialog"
import { useReauth } from "@/registry/erp/reauth-dialog"
import { useResetFactors } from "@/registry/erp/reset-factors"
import {
  useRefreshAccess,
  type AccessTarget,
} from "@/registry/erp/user-access-data"
import { useErpUiT } from "@/registry/lib/i18n"
import type { UserAccess } from "@/registry/lib/security-policy"
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
import { Spinner } from "@/registry/ui/spinner"
import { Textarea } from "@/registry/ui/textarea"

/**
 * Дії адміністратора над доступом людини (ADR-0013): вийти на всіх пристроях, скинути другий крок,
 * заблокувати з причиною чи розблокувати — з підтвердженням, а блокування й розблокування — ще й з
 * повторним підтвердженням.
 *
 *   const actions = useUserAccessActions(target, { onChange })
 *   <UserAccessButtons access={access} onAction={actions.start} />{actions.dialogs}
 */

export type UserAccessAction = "signOut" | "resetFactors" | "block" | "unblock"

type Confirm = Exclude<UserAccessAction, "resetFactors"> | null

/**
 * Діалоги дій над доступом. `onChange` — після блокування, розблокування чи виходу всюди, щоб
 * проект оновив свій список користувачів.
 */
export function useUserAccessActions(
  target: AccessTarget,
  { onChange }: { onChange?: () => void } = {},
) {
  const refresh = useRefreshAccess()
  const [confirm, setConfirm] = React.useState<Confirm>(null)
  const reset = useResetFactors({
    onDone: () => {
      void refresh(target.id)
    },
  })
  const start = (action: UserAccessAction) => {
    if (action === "resetFactors") reset.start(target)
    else setConfirm(action)
  }
  const close = () => {
    setConfirm(null)
  }
  const done = () => {
    setConfirm(null)
    void refresh(target.id)
    onChange?.()
  }
  const dialogs = (
    <>
      {reset.dialog}
      {confirm === "block" ? (
        <BlockDialog target={target} onClose={close} onDone={done} />
      ) : confirm ? (
        <AccessConfirm
          kind={confirm}
          target={target}
          onClose={close}
          onDone={done}
        />
      ) : null}
    </>
  )
  return { start, dialogs }
}

/** Кнопки дій за станом доступу: «Скинути другий крок» — лише з налаштованим фактором. */
export function UserAccessButtons({
  access,
  onAction,
}: {
  access: UserAccess
  onAction: (action: UserAccessAction) => void
}) {
  const t = useErpUiT()
  const blocked = access.status === "blocked"
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        disabled={!access.sessions.length}
        onClick={() => {
          onAction("signOut")
        }}
      >
        {t("userAccess.signOutAll")}
      </Button>
      {access.factors.length ? (
        <Button
          variant="outline"
          onClick={() => {
            onAction("resetFactors")
          }}
        >
          {t("resetFactors.action")}
        </Button>
      ) : null}
      {blocked ? (
        <Button
          variant="outline"
          onClick={() => {
            onAction("unblock")
          }}
        >
          {t("userAccess.unblock")}
        </Button>
      ) : (
        <Button
          variant="destructive"
          onClick={() => {
            onAction("block")
          }}
        >
          {t("userAccess.block")}
        </Button>
      )}
    </div>
  )
}

/* ----------------------------- Діалоги дій ----------------------------- */

function BlockDialog({
  target,
  onClose,
  onDone,
}: {
  target: AccessTarget
  onClose: () => void
  onDone: () => void
}) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const fieldError = useFieldError()
  const errorText = useAuthErrorText()
  const { guard, dialog: reauthDialog } = useReauth()
  const id = React.useId()
  const [reason, setReason] = React.useState("")
  const [reasonError, setReasonError] = React.useState<string>()
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
            if (!reason.trim()) {
              setReasonError(t("auth.fieldErrors.required"))
              return
            }
            setReasonError(undefined)
            setError(null)
            setBusy(true)
            guard(() => provider.admin.blockUser(target.id, reason.trim()))
              .then(() => {
                toast.success(t("userAccess.blocked"))
                onDone()
              })
              .catch((failure: unknown) => {
                const message = fieldError(failure, "reason")
                if (message) setReasonError(message)
                else if (failure) setError(errorText(failure))
              })
              .finally(() => {
                setBusy(false)
              })
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {t("userAccess.blockTitle", { name: target.name })}
            </DialogTitle>
            <DialogDescription>
              {t("userAccess.blockDescription")}
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Field data-invalid={reasonError ? true : undefined}>
            <FieldLabel htmlFor={`${id}-reason`}>
              {t("userAccess.reasonLabel")}
            </FieldLabel>
            <Textarea
              id={`${id}-reason`}
              rows={2}
              maxLength={500}
              value={reason}
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={`${id}-hint${reasonError ? ` ${id}-error` : ""}`}
              onChange={(event) => {
                setReason(event.target.value)
              }}
            />
            <FieldDescription id={`${id}-hint`}>
              {t("userAccess.reasonHint")}
            </FieldDescription>
            {reasonError ? (
              <FieldError id={`${id}-error`}>{reasonError}</FieldError>
            ) : null}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("auth.account.cancel")}
            </Button>
            <Button type="submit" variant="destructive" disabled={busy}>
              {busy ? <Spinner aria-hidden /> : null}
              {t("userAccess.block")}
            </Button>
          </DialogFooter>
        </form>
        {reauthDialog}
      </DialogContent>
    </Dialog>
  )
}

function AccessConfirm({
  kind,
  target,
  onClose,
  onDone,
}: {
  kind: "signOut" | "unblock"
  target: AccessTarget
  onClose: () => void
  onDone: () => void
}) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const errorText = useAuthErrorText()
  const { guard, dialog: reauthDialog } = useReauth()
  const signOut = kind === "signOut"

  return (
    <ConfirmDialog
      open
      title={
        signOut
          ? t("userAccess.signOutAllTitle", { name: target.name })
          : t("userAccess.unblockTitle", { name: target.name })
      }
      description={
        signOut
          ? t("userAccess.signOutAllDescription")
          : t("userAccess.unblockDescription")
      }
      confirmLabel={
        signOut ? t("userAccess.signOutAll") : t("userAccess.unblock")
      }
      destructive={signOut}
      onClose={onClose}
      onConfirm={() =>
        (signOut
          ? provider.admin.signOutUser(target.id)
          : guard(() => provider.admin.unblockUser(target.id))
        )
          .then(() => {
            toast.success(
              signOut
                ? t("userAccess.signedOutAll")
                : t("userAccess.unblocked"),
            )
            onDone()
          })
          .catch((failure: unknown) => {
            toast.error(errorText(failure))
          })
      }
    >
      {reauthDialog}
    </ConfirmDialog>
  )
}
