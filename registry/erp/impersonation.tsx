import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { UserCogIcon } from "lucide-react"
import { toast } from "sonner"

import {
  useAuthErrorText,
  useErpAuthProvider,
  useFieldError,
} from "@/registry/erp/auth-layout"
import { useReauth } from "@/registry/erp/reauth-dialog"
import { useMe, useResetUserData } from "@/registry/hooks/use-me"
import { ME_QUERY_KEY } from "@/registry/lib/auth"
import { useErpUiT } from "@/registry/lib/i18n"
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/registry/ui/field"
import { Spinner } from "@/registry/ui/spinner"
import { Textarea } from "@/registry/ui/textarea"

/**
 * «Увійти як…» (ADR-0011): адміністратор із правом `users:impersonate` бачить застосунок очима
 * користувача, щоб розібратися зі зверненням.
 *
 * - Причина обов'язкова — вона й ім'я адміністратора йдуть у журнал аудиту та журнал входів.
 * - Перед стартом — повторне підтвердження; зміни пароля, email і факторів сервер забороняє.
 * - Поки триває, `ImpersonationBanner` (слот `banner` в AppShell) показує, від чийого імені робота,
 *   і повертає до свого акаунта.
 *
 *   const { start, dialog } = useImpersonation({ onStarted: () => navigate("/") })
 *   <Button onClick={() => start(user)}>…</Button>{dialog}
 */

export interface ImpersonationTarget {
  id: string
  name: string
}

/**
 * Особа змінилася: профіль — новий (authProvider завантажив його під час перемикання, getMe запиту
 * не робить), решту кешу скинуто навіть тоді, коли профіль не вдалося покласти в кеш.
 */
function useIdentityReset() {
  const provider = useErpAuthProvider()
  const queryClient = useQueryClient()
  const resetUserData = useResetUserData()
  return React.useCallback(async () => {
    try {
      queryClient.setQueryData(ME_QUERY_KEY, await provider.getMe())
    } finally {
      resetUserData()
    }
  }, [provider, queryClient, resetUserData])
}

export function useImpersonation({
  onStarted,
}: { onStarted?: () => void } = {}) {
  const [target, setTarget] = React.useState<ImpersonationTarget | null>(null)
  const start = React.useCallback((user: ImpersonationTarget) => {
    setTarget(user)
  }, [])
  const dialog = target ? (
    <ImpersonateDialog
      key={target.id}
      target={target}
      onClose={() => {
        setTarget(null)
      }}
      onStarted={() => {
        setTarget(null)
        onStarted?.()
      }}
    />
  ) : null
  return { start, dialog }
}

function ImpersonateDialog({
  target,
  onClose,
  onStarted,
}: {
  target: ImpersonationTarget
  onClose: () => void
  onStarted: () => void
}) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const resetIdentity = useIdentityReset()
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
            guard(() => provider.impersonate(target.id, reason.trim()))
              .then(async () => {
                // Дані, права й налаштування — вже іншого користувача.
                await resetIdentity()
                toast.success(
                  t("auth.impersonation.started", { name: target.name }),
                )
                onStarted()
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
              {t("auth.impersonation.title", { name: target.name })}
            </DialogTitle>
            <DialogDescription>
              {t("auth.impersonation.description", { name: target.name })}
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Field data-invalid={reasonError ? true : undefined}>
            <FieldLabel htmlFor={`${id}-reason`}>
              {t("auth.impersonation.reasonLabel")}
            </FieldLabel>
            <Textarea
              id={`${id}-reason`}
              value={reason}
              rows={3}
              maxLength={500}
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={`${id}-hint${reasonError ? ` ${id}-error` : ""}`}
              onChange={(event) => {
                setReason(event.target.value)
              }}
            />
            <FieldDescription id={`${id}-hint`}>
              {t("auth.impersonation.reasonHint")}
            </FieldDescription>
            {reasonError ? (
              <FieldError id={`${id}-error`}>{reasonError}</FieldError>
            ) : null}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("auth.account.cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Spinner aria-hidden /> : null}
              {t("auth.impersonation.submit", { name: target.name })}
            </Button>
          </DialogFooter>
        </form>
        {reauthDialog}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Смуга над застосунком, поки адміністратор працює від імені користувача. Без «Увійти як…» не
 * рендерить нічого. `onStopped` — куди повернутися (напр. до списку користувачів).
 */
export function ImpersonationBanner({
  onStopped,
  className,
}: {
  onStopped?: () => void
  className?: string
}) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const resetIdentity = useIdentityReset()
  const errorText = useAuthErrorText()
  const { data: me } = useMe()
  const [busy, setBusy] = React.useState(false)
  if (!me?.impersonator) return null

  return (
    <section
      data-slot="impersonation-banner"
      aria-label={t("auth.impersonation.region")}
      className={cn(
        "@container bg-warning-soft px-4 py-2 text-sm text-warning-foreground",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <UserCogIcon aria-hidden className="size-4 shrink-0" />
        <p className="min-w-0 flex-1">
          <span className="font-medium">
            {t("auth.impersonation.banner", { name: me.name })}
          </span>
          {/* На вузькому екрані смуга липне вгорі — лише головне, щоб не забирати місце. */}
          <span className="hidden @2xl:inline">
            {" "}
            {t("auth.impersonation.bannerHint", {
              admin: me.impersonator.name,
            })}
          </span>
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            provider
              .stopImpersonation()
              .then(async () => {
                await resetIdentity()
                toast.success(t("auth.impersonation.stopped"))
                onStopped?.()
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
          {t("auth.impersonation.stop")}
        </Button>
      </div>
    </section>
  )
}
