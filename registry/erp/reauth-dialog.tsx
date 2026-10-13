"use client"

import * as React from "react"
import { REGEXP_ONLY_DIGITS } from "input-otp"

import { useErpAuthProvider, useFieldError } from "@/registry/erp/auth-layout"
import { PasswordInput } from "@/registry/erp/password-input"
import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import { useMe } from "@/registry/hooks/use-me"
import { isReauthRequired } from "@/registry/lib/auth"
import { useErpUiT } from "@/registry/lib/i18n"
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
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/registry/ui/input-otp"
import { Spinner } from "@/registry/ui/spinner"

/**
 * Повторне підтвердження перед чутливою дією (ADR-0010): показати пароль зі сховища, змінити 2FA
 * чи email, видалити акаунт. Сервер відповідає 403 `reauth_required` — `guard` відкриває діалог
 * (пароль або код застосунку) і після підтвердження повторює дію один раз.
 *
 *   const { guard, dialog } = useReauth()
 *   await guard(() => auth.deleteAccount())
 *   return <>{…}{dialog}</>
 */
export function useReauth() {
  const [pending, setPending] = React.useState<{
    resolve: () => void
    reject: (error: unknown) => void
    error: unknown
    /** Кожне відкриття — нова форма без попереднього введення. */
    id: number
  } | null>(null)

  const guard = React.useCallback(
    async <T,>(action: () => Promise<T>): Promise<T> => {
      try {
        return await action()
      } catch (error) {
        if (!isReauthRequired(error)) throw error
        await new Promise<void>((resolve, reject) => {
          setPending({ resolve, reject, error, id: Date.now() })
        })
        return action()
      }
    },
    [],
  )

  const dialog = (
    <ReauthDialog
      key={pending?.id ?? 0}
      open={pending !== null}
      onConfirmed={() => {
        pending?.resolve()
        setPending(null)
      }}
      onCancel={() => {
        pending?.reject(pending.error)
        setPending(null)
      }}
    />
  )
  return { guard, dialog }
}

export function ReauthDialog({
  open,
  onConfirmed,
  onCancel,
}: {
  open: boolean
  onConfirmed: () => void
  onCancel: () => void
}) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const fieldError = useFieldError()
  const apiMessage = useApiErrorMessage()
  const { data: me } = useMe()
  const ids = React.useId()
  const hasTotp = me?.factors.includes("totp") ?? false
  const [mode, setMode] = React.useState<"password" | "code">("password")
  const [value, setValue] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fieldMessage, setFieldMessage] = React.useState<string | null>(null)

  const submit = (event?: React.FormEvent) => {
    event?.preventDefault()
    if (!value) {
      setFieldMessage(t("auth.fieldErrors.required"))
      return
    }
    setBusy(true)
    setError(null)
    setFieldMessage(null)
    provider
      .reauthenticate(
        mode === "password"
          ? { password: value }
          : { method: "totp", code: value },
      )
      .then(onConfirmed)
      .catch((failure: unknown) => {
        const message =
          fieldError(failure, "password") ?? fieldError(failure, "code")
        if (message)
          setFieldMessage(
            mode === "password"
              ? t("auth.account.wrongCurrent")
              : t("auth.challenge.invalidCode"),
          )
        else setError(apiMessage(failure))
        setValue("")
      })
      .finally(() => {
        setBusy(false)
      })
  }

  const fieldId = `${ids}-${mode}`
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
    >
      <DialogContent>
        <form className="grid gap-4" noValidate onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t("auth.reauth.title")}</DialogTitle>
            <DialogDescription>
              {t("auth.reauth.description")}
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Field data-invalid={fieldMessage ? true : undefined}>
            <FieldLabel htmlFor={fieldId}>
              {mode === "password" ? t("auth.password") : t("auth.reauth.code")}
            </FieldLabel>
            {mode === "password" ? (
              <PasswordInput
                id={fieldId}
                autoComplete="current-password"
                value={value}
                aria-invalid={fieldMessage ? true : undefined}
                aria-describedby={fieldMessage ? `${ids}-error` : undefined}
                onChange={(event) => {
                  setValue(event.target.value)
                  setFieldMessage(null)
                }}
              />
            ) : (
              <InputOTP
                id={fieldId}
                maxLength={6}
                pattern={REGEXP_ONLY_DIGITS}
                inputMode="numeric"
                value={value}
                aria-invalid={fieldMessage ? true : undefined}
                aria-describedby={fieldMessage ? `${ids}-error` : undefined}
                onChange={(next) => {
                  setValue(next)
                  setFieldMessage(null)
                }}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                </InputOTPGroup>
                <InputOTPSeparator />
                <InputOTPGroup>
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            )}
            {fieldMessage ? (
              <FieldError id={`${ids}-error`}>{fieldMessage}</FieldError>
            ) : null}
          </Field>
          {hasTotp ? (
            <Button
              type="button"
              variant="link"
              className="h-auto min-h-touch justify-start px-0"
              onClick={() => {
                setMode((m) => (m === "password" ? "code" : "password"))
                setValue("")
                setFieldMessage(null)
              }}
            >
              {mode === "password"
                ? t("auth.reauth.useCode")
                : t("auth.reauth.usePassword")}
            </Button>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              {t("auth.account.cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Spinner aria-hidden /> : null}
              {t("auth.reauth.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
