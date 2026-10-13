"use client"

import * as React from "react"
import { REGEXP_ONLY_DIGITS } from "input-otp"
import { useLogout } from "ra-core"
import { toast } from "sonner"

import {
  useAuthErrorText,
  useErpAuthProvider,
  useFieldError,
} from "@/registry/erp/auth-layout"
import { PasswordInput, PasswordStrength } from "@/registry/erp/password-input"
import { useReauth } from "@/registry/erp/reauth-dialog"
import { useMe } from "@/registry/hooks/use-me"
import type { Challenge } from "@/registry/lib/auth"
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/registry/ui/input-otp"
import { Spinner } from "@/registry/ui/spinner"

/**
 * Безпека акаунта в налаштуваннях (PF01, ADR-0010): зміна пароля, зміна email із кодом на нову
 * адресу, експорт даних і видалення акаунта (GDPR). Чутливі дії — через повторне підтвердження.
 * Розмітку сторінки (картки, заголовки) задає проект; ці форми — вміст.
 */

function useFormState() {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fields, setFields] = React.useState<Record<string, string>>({})
  return { busy, setBusy, error, setError, fields, setFields }
}

export function ChangePasswordForm() {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const fieldError = useFieldError()
  const errorText = useAuthErrorText()
  const { data: me } = useMe()
  const ids = React.useId()
  const { busy, setBusy, error, setError, fields, setFields } = useFormState()
  const [current, setCurrent] = React.useState("")
  const [next, setNext] = React.useState("")

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        const need = t("auth.fieldErrors.required")
        const local: Record<string, string> = {}
        if (!current) local.currentPassword = need
        if (!next) local.newPassword = need
        setFields(local)
        if (Object.keys(local).length) return
        setBusy(true)
        setError(null)
        provider
          .changePassword(current, next)
          .then(() => {
            setCurrent("")
            setNext("")
            toast.success(t("auth.account.passwordChanged"))
          })
          .catch((failure: unknown) => {
            if (fieldError(failure, "currentPassword"))
              setFields({ currentPassword: t("auth.account.wrongCurrent") })
            else {
              const weak = fieldError(failure, "newPassword")
              if (weak) setFields({ newPassword: weak })
              else setError(errorText(failure))
            }
          })
          .finally(() => {
            setBusy(false)
          })
      }}
    >
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <FieldGroup>
        <Field data-invalid={fields.currentPassword ? true : undefined}>
          <FieldLabel htmlFor={`${ids}-current`}>
            {t("auth.account.currentPassword")}
          </FieldLabel>
          <PasswordInput
            id={`${ids}-current`}
            autoComplete="current-password"
            value={current}
            aria-invalid={fields.currentPassword ? true : undefined}
            aria-describedby={
              fields.currentPassword ? `${ids}-current-error` : undefined
            }
            onChange={(event) => {
              setCurrent(event.target.value)
            }}
          />
          {fields.currentPassword ? (
            <FieldError id={`${ids}-current-error`}>
              {fields.currentPassword}
            </FieldError>
          ) : null}
        </Field>
        <Field data-invalid={fields.newPassword ? true : undefined}>
          <FieldLabel htmlFor={`${ids}-new`}>
            {t("auth.account.newPassword")}
          </FieldLabel>
          <PasswordInput
            id={`${ids}-new`}
            autoComplete="new-password"
            value={next}
            aria-invalid={fields.newPassword ? true : undefined}
            aria-describedby={`${ids}-strength${fields.newPassword ? ` ${ids}-new-error` : ""}`}
            onChange={(event) => {
              setNext(event.target.value)
            }}
          />
          {fields.newPassword ? (
            <FieldError id={`${ids}-new-error`}>
              {fields.newPassword}
            </FieldError>
          ) : null}
          <PasswordStrength
            id={`${ids}-strength`}
            password={next}
            context={[me?.email ?? "", me?.name ?? ""]}
          />
        </Field>
      </FieldGroup>
      <Button type="submit" disabled={busy}>
        {busy ? <Spinner aria-hidden /> : null}
        {t("auth.account.changePassword")}
      </Button>
    </form>
  )
}

export function ChangeEmailForm() {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const fieldError = useFieldError()
  const errorText = useAuthErrorText()
  const { guard, dialog } = useReauth()
  const { data: me } = useMe()
  const ids = React.useId()
  const { busy, setBusy, error, setError, fields, setFields } = useFormState()
  const [email, setEmail] = React.useState("")
  const [code, setCode] = React.useState("")
  const [challenge, setChallenge] = React.useState<Challenge | null>(null)
  const codeInput = React.useRef<HTMLInputElement>(null)
  // Код надіслано — переводимо фокус у поле коду, щоб не шукати його.
  React.useEffect(() => {
    if (challenge) codeInput.current?.focus()
  }, [challenge])

  const reset = () => {
    setChallenge(null)
    setEmail("")
    setCode("")
    setFields({})
  }

  const confirm = (value: string) => {
    setBusy(true)
    setError(null)
    provider
      .confirmEmail(value)
      .then(() => {
        toast.success(t("auth.account.emailChanged"))
        reset()
      })
      .catch((failure: unknown) => {
        if (fieldError(failure, "code"))
          setFields({ code: t("auth.challenge.invalidCode") })
        else setError(errorText(failure))
        setCode("")
      })
      .finally(() => {
        setBusy(false)
      })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{me?.email}</p>
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {challenge ? (
        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            confirm(code)
          }}
        >
          <Field data-invalid={fields.code ? true : undefined}>
            <FieldLabel htmlFor={`${ids}-code`}>
              {t("auth.account.emailCode", {
                destination: challenge.destination ?? email,
              })}
            </FieldLabel>
            <InputOTP
              ref={codeInput}
              id={`${ids}-code`}
              maxLength={6}
              pattern={REGEXP_ONLY_DIGITS}
              inputMode="numeric"
              value={code}
              aria-invalid={fields.code ? true : undefined}
              aria-describedby={fields.code ? `${ids}-code-error` : undefined}
              onChange={setCode}
              onComplete={confirm}
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
            {fields.code ? (
              <FieldError id={`${ids}-code-error`}>{fields.code}</FieldError>
            ) : null}
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || code.length < 6}>
              {busy ? <Spinner aria-hidden /> : null}
              {t("auth.challenge.verify")}
            </Button>
            <Button type="button" variant="outline" onClick={reset}>
              {t("auth.account.cancel")}
            </Button>
          </div>
        </form>
      ) : (
        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            if (!email.trim()) {
              setFields({ email: t("auth.fieldErrors.required") })
              return
            }
            setBusy(true)
            setError(null)
            setFields({})
            guard(() => provider.changeEmail(email.trim()))
              .then(setChallenge)
              .catch((failure: unknown) => {
                const message = fieldError(failure, "email")
                if (message) setFields({ email: message })
                else if (failure) setError(errorText(failure))
              })
              .finally(() => {
                setBusy(false)
              })
          }}
        >
          <Field data-invalid={fields.email ? true : undefined}>
            <FieldLabel htmlFor={`${ids}-email`}>
              {t("auth.account.newEmail")}
            </FieldLabel>
            <Input
              id={`${ids}-email`}
              type="email"
              autoComplete="email"
              value={email}
              aria-invalid={fields.email ? true : undefined}
              aria-describedby={fields.email ? `${ids}-email-error` : undefined}
              onChange={(event) => {
                setEmail(event.target.value)
              }}
            />
            {fields.email ? (
              <FieldError id={`${ids}-email-error`}>{fields.email}</FieldError>
            ) : null}
          </Field>
          <Button type="submit" disabled={busy}>
            {busy ? <Spinner aria-hidden /> : null}
            {t("auth.sendCode")}
          </Button>
        </form>
      )}
      {dialog}
    </div>
  )
}

/** Експорт даних і видалення акаунта (SPEC §8.2: критичне видалення — з введенням слова). */
export function AccountDataSection() {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const errorText = useAuthErrorText()
  const logout = useLogout()
  const { guard, dialog } = useReauth()
  const { data: me } = useMe()
  const ids = React.useId()
  const [exporting, setExporting] = React.useState(false)
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [typed, setTyped] = React.useState("")
  const [deleting, setDeleting] = React.useState(false)
  const word = t("auth.account.deleteWord")

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t("auth.account.dataDescription")}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={exporting}
          onClick={() => {
            setExporting(true)
            provider
              .exportData()
              .then(() => {
                toast.success(
                  t("auth.account.exportQueued", { email: me?.email ?? "" }),
                )
              })
              .catch((failure: unknown) => {
                toast.error(errorText(failure))
              })
              .finally(() => {
                setExporting(false)
              })
          }}
        >
          {exporting ? <Spinner aria-hidden /> : null}
          {t("auth.account.export")}
        </Button>
        <Button
          variant="destructive"
          onClick={() => {
            setTyped("")
            setConfirmOpen(true)
          }}
        >
          {t("auth.account.delete")}
        </Button>
      </div>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <form
            className="grid gap-4"
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              if (typed.trim() !== word) return
              setDeleting(true)
              guard(() => provider.deleteAccount())
                .then(() => {
                  setConfirmOpen(false)
                  return logout({ remote: true })
                })
                .catch((failure: unknown) => {
                  if (failure) toast.error(errorText(failure))
                })
                .finally(() => {
                  setDeleting(false)
                })
            }}
          >
            <DialogHeader>
              <DialogTitle>{t("auth.account.deleteTitle")}</DialogTitle>
              <DialogDescription>
                {t("auth.account.deleteDescription")}
              </DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor={`${ids}-word`}>
                {t("auth.account.deleteConfirm", { word })}
              </FieldLabel>
              <Input
                id={`${ids}-word`}
                autoComplete="off"
                spellCheck={false}
                value={typed}
                onChange={(event) => {
                  setTyped(event.target.value)
                }}
              />
            </Field>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setConfirmOpen(false)
                }}
              >
                {t("auth.account.cancel")}
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={deleting || typed.trim() !== word}
              >
                {deleting ? <Spinner aria-hidden /> : null}
                {t("auth.account.deleteSubmit")}
              </Button>
            </DialogFooter>
          </form>
          {/* Повторне підтвердження — вкладений діалог поверх підтвердження видалення. */}
          {dialog}
        </DialogContent>
      </Dialog>
    </div>
  )
}
