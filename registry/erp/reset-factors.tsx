"use client"

import * as React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { LifeBuoyIcon } from "lucide-react"
import { toast } from "sonner"

import {
  useAuthErrorText,
  useErpAuthProvider,
  useFieldError,
} from "@/registry/erp/auth-layout"
import { PageState, SectionSkeleton } from "@/registry/erp/page-state"
import { useReauth } from "@/registry/erp/reauth-dialog"
import { useCompanyId } from "@/registry/hooks/use-company"
import { isApiError } from "@/registry/lib/api"
import { companyScope } from "@/registry/lib/company-scope"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  ADMIN_QUERY_KEYS,
  type RecoveryRequest,
} from "@/registry/lib/security-policy"
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
 * Відновлення доступу (ADR-0012): користувач, що втратив телефон і резервні коди, просить на кроці
 * коду; адміністратор перевіряє особу (дзвінок, зустріч) і скидає другий крок із причиною для аудиту.
 *
 *   const { start, dialog } = useResetFactors()
 *   <Button onClick={() => start({ id, name, email })}>…</Button>{dialog}
 */

export interface ResetTarget {
  id: string
  name: string
  email: string
}

export function useResetFactors({ onDone }: { onDone?: () => void } = {}) {
  const [target, setTarget] = React.useState<ResetTarget | null>(null)
  const start = React.useCallback((user: ResetTarget) => {
    setTarget(user)
  }, [])
  const dialog = target ? (
    <ResetFactorsDialog
      key={target.id}
      target={target}
      onClose={() => {
        setTarget(null)
      }}
      onDone={() => {
        setTarget(null)
        onDone?.()
      }}
    />
  ) : null
  return { start, dialog }
}

function ResetFactorsDialog({
  target,
  onClose,
  onDone,
}: {
  target: ResetTarget
  onClose: () => void
  onDone: () => void
}) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const queryClient = useQueryClient()
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
            guard(() => provider.admin.resetFactors(target.id, reason.trim()))
              .then(() => {
                void queryClient.invalidateQueries({
                  queryKey: ADMIN_QUERY_KEYS.recoveryRequests,
                })
                toast.success(t("resetFactors.done", { email: target.email }))
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
              {t("resetFactors.title", { name: target.name })}
            </DialogTitle>
            <DialogDescription>
              {t("resetFactors.description", { name: target.name })}
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Field data-invalid={reasonError ? true : undefined}>
            <FieldLabel htmlFor={`${id}-reason`}>
              {t("resetFactors.reasonLabel")}
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
              {t("resetFactors.reasonHint")}
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
              {t("resetFactors.submit")}
            </Button>
          </DialogFooter>
        </form>
        {reauthDialog}
      </DialogContent>
    </Dialog>
  )
}

/** Запити «втратив доступ до другого кроку» для адміністратора: скинути або відхилити. */
export function RecoveryRequestsSection() {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const queryClient = useQueryClient()
  const errorText = useAuthErrorText()
  const format = useFormat()
  const { start, dialog } = useResetFactors()
  const [declining, setDeclining] = React.useState<string | null>(null)
  const companyId = useCompanyId()
  const query = useQuery({
    queryKey: [...ADMIN_QUERY_KEYS.recoveryRequests, companyScope(companyId)],
    queryFn: () => provider.admin.getRecoveryRequests(),
  })

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

  const requests = query.data
  if (!requests.length)
    return (
      <p className="text-sm text-muted-foreground">
        {t("resetFactors.noRequests")}
      </p>
    )

  const decline = (request: RecoveryRequest) => {
    setDeclining(request.id)
    provider.admin
      .declineRecoveryRequest(request.id)
      .then(() => {
        toast.success(t("resetFactors.declined"))
        return queryClient.invalidateQueries({
          queryKey: ADMIN_QUERY_KEYS.recoveryRequests,
        })
      })
      .catch((failure: unknown) => {
        toast.error(errorText(failure))
      })
      .finally(() => {
        setDeclining(null)
      })
  }

  return (
    <div className="@container" data-slot="recovery-requests">
      <ul
        className="divide-y rounded-lg border"
        aria-label={t("resetFactors.requestsTitle")}
      >
        {requests.map((request) => (
          <li
            key={request.id}
            className="flex flex-col gap-3 p-3 @lg:flex-row @lg:items-center"
          >
            <div className="flex min-w-0 flex-1 gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-warning-soft text-warning-foreground">
                <LifeBuoyIcon aria-hidden className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{request.userName}</p>
                <p className="text-sm text-muted-foreground">
                  {[request.email, format.relative(request.requestedAt)].join(
                    " · ",
                  )}
                </p>
                {request.comment ? (
                  <p className="text-sm">«{request.comment}»</p>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                aria-label={t("resetFactors.actionFor", {
                  name: request.userName,
                })}
                onClick={() => {
                  start({
                    id: request.userId,
                    name: request.userName,
                    email: request.email,
                  })
                }}
              >
                {t("resetFactors.action")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={declining === request.id}
                aria-label={t("resetFactors.declineFor", {
                  name: request.userName,
                })}
                onClick={() => {
                  decline(request)
                }}
              >
                {declining === request.id ? <Spinner aria-hidden /> : null}
                {t("resetFactors.decline")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {dialog}
    </div>
  )
}
