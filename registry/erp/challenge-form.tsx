"use client"

import * as React from "react"
import { REGEXP_ONLY_DIGITS } from "input-otp"
import { FingerprintIcon } from "lucide-react"

import { useFieldError } from "@/registry/erp/auth-layout"
import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import { isApiError } from "@/registry/lib/api"
import type { AuthFactor, Challenge } from "@/registry/lib/auth"
import { useErpUiT } from "@/registry/lib/i18n"
import { PasskeyCancelledError, readSmsCode } from "@/registry/lib/passkey"
import { Alert, AlertDescription } from "@/registry/ui/alert"
import { Button } from "@/registry/ui/button"
import { Checkbox } from "@/registry/ui/checkbox"
import { Field, FieldError, FieldLabel } from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/registry/ui/input-otp"
import { Spinner } from "@/registry/ui/spinner"

/** Секунди, що лишилися до `until` (мс); оновлюється щосекунди. */
function useSecondsLeft(until: number): number {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (until <= Date.now()) return
    const timer = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => {
      clearInterval(timer)
    }
  }, [until])
  return Math.max(0, Math.ceil((until - now) / 1000))
}

const mmss = (seconds: number) =>
  `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, "0")}`

const SENDS: AuthFactor[] = ["sms", "email"]

/**
 * Крок підтвердження (ADR-0010): код із застосунку, резервний код, SMS/Viber, email або ключ доступу.
 *
 * - Код з 6 цифр — клітинки (`ui/input-otp`); код з SMS підставляє система, а Chrome на Android —
 *   WebOTP. Шостий символ надсилає форму сам.
 * - «Надіслати ще раз» стає доступним через `resendIn` секунд; інші методи — кнопками нижче.
 * - «Запам'ятати пристрій» — лише для другого кроку після пароля, якщо проект це дозволяє.
 */
export function ChallengeForm({
  challenge,
  onVerify,
  onSend,
  onPasskey,
  trustedDeviceDays = 0,
  onRestart,
}: {
  challenge: Challenge
  onVerify: (
    method: Exclude<AuthFactor, "passkey">,
    code: string,
    trustDevice: boolean,
  ) => Promise<void>
  /** Інший метод або повторне надсилання. */
  onSend: (method: AuthFactor) => Promise<Challenge>
  onPasskey?: (trustDevice: boolean) => Promise<void>
  trustedDeviceDays?: number
  /** «Почати спочатку» (інший акаунт, забагато спроб). */
  onRestart?: () => void
}) {
  const t = useErpUiT()
  const apiMessage = useApiErrorMessage()
  const fieldError = useFieldError()
  const ids = React.useId()
  const [current, setCurrent] = React.useState(challenge)
  const [code, setCode] = React.useState("")
  const [trust, setTrust] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  // Поки сервер перемикає метод, поле старого методу вимкнене: введене в нього зникло б.
  const [switching, setSwitching] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [codeError, setCodeError] = React.useState<string | null>(null)
  const [resendAt, setResendAt] = React.useState(
    () => Date.now() + (challenge.resendIn ?? 0) * 1000,
  )
  const secondsLeft = useSecondsLeft(resendAt)
  const method = current.method
  const length = current.codeLength ?? 6
  const digitsOnly = method !== "backup_code"
  const canTrust = current.secondFactor && trustedDeviceDays > 0

  const verify = async (value: string) => {
    if (method === "passkey") return
    setBusy(true)
    setError(null)
    setCodeError(null)
    try {
      await onVerify(method, value, trust)
    } catch (failure) {
      if (isApiError(failure) && failure.status === 429)
        setError(t("auth.challenge.tooManyAttempts"))
      else if (fieldError(failure, "code"))
        setCodeError(t("auth.challenge.invalidCode"))
      else setError(apiMessage(failure))
      setCode("")
    } finally {
      setBusy(false)
    }
  }

  const switchTo = async (next: AuthFactor) => {
    setBusy(true)
    setSwitching(true)
    setError(null)
    setCodeError(null)
    try {
      const updated = await onSend(next)
      setCurrent(updated)
      setCode("")
      setResendAt(Date.now() + (updated.resendIn ?? 0) * 1000)
    } catch (failure) {
      setError(apiMessage(failure))
    } finally {
      setBusy(false)
      setSwitching(false)
    }
  }

  const passkey = async () => {
    if (!onPasskey) return
    setBusy(true)
    setError(null)
    try {
      await onPasskey(trust)
    } catch (failure) {
      setError(
        failure instanceof PasskeyCancelledError
          ? t("auth.passkeyCancelled")
          : t("auth.passkeyFailed"),
      )
    } finally {
      setBusy(false)
    }
  }

  // Chrome на Android сам читає код з SMS, якщо лист закінчується «@домен #код».
  React.useEffect(() => {
    if (method !== "sms") return
    const controller = new AbortController()
    void readSmsCode(controller.signal).then((received) => {
      if (received) {
        setCode(received)
        void verify(received)
      }
    })
    return () => {
      controller.abort()
    }
    // verify читає актуальний стан; перезапускаємо лише при зміні методу.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method])

  const description =
    method === "sms" || method === "email"
      ? t(`auth.challenge.${method}`, {
          destination: current.destination ?? "",
        })
      : t(`auth.challenge.${method}`)
  const others = current.methods.filter((m) => m !== method)
  const codeId = `${ids}-code`

  return (
    <div data-slot="challenge-form" className="space-y-4">
      <p className="text-sm text-muted-foreground">{description}</p>
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {method === "passkey" ? (
        <Button
          type="button"
          className="w-full"
          disabled={busy}
          onClick={() => {
            void passkey()
          }}
        >
          {busy ? <Spinner aria-hidden /> : <FingerprintIcon aria-hidden />}
          {t("auth.challenge.usePasskey")}
        </Button>
      ) : (
        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void verify(code)
          }}
        >
          <Field data-invalid={codeError ? true : undefined}>
            <FieldLabel htmlFor={codeId}>{t("auth.challenge.code")}</FieldLabel>
            {digitsOnly ? (
              <InputOTP
                id={codeId}
                maxLength={length}
                pattern={REGEXP_ONLY_DIGITS}
                inputMode="numeric"
                value={code}
                disabled={switching}
                aria-invalid={codeError ? true : undefined}
                aria-describedby={codeError ? `${ids}-error` : undefined}
                onChange={(value) => {
                  setCode(value)
                  setCodeError(null)
                }}
                onComplete={(value: string) => {
                  void verify(value)
                }}
              >
                <InputOTPGroup>
                  {Array.from({ length: Math.ceil(length / 2) }, (_, i) => (
                    <InputOTPSlot key={i} index={i} />
                  ))}
                </InputOTPGroup>
                <InputOTPSeparator />
                <InputOTPGroup>
                  {Array.from({ length: Math.floor(length / 2) }, (_, i) => (
                    <InputOTPSlot key={i} index={i + Math.ceil(length / 2)} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            ) : (
              <Input
                id={codeId}
                value={code}
                autoComplete="one-time-code"
                spellCheck={false}
                autoCapitalize="none"
                className="font-mono tracking-widest"
                disabled={switching}
                aria-invalid={codeError ? true : undefined}
                aria-describedby={codeError ? `${ids}-error` : undefined}
                onChange={(event) => {
                  setCode(event.target.value)
                  setCodeError(null)
                }}
              />
            )}
            {codeError ? (
              <FieldError id={`${ids}-error`}>{codeError}</FieldError>
            ) : null}
          </Field>
          {canTrust ? (
            <TrustDevice
              id={`${ids}-trust`}
              days={trustedDeviceDays}
              checked={trust}
              onChange={setTrust}
            />
          ) : null}
          <Button
            type="submit"
            className="w-full"
            disabled={
              busy || code.replace(/\W/g, "").length < (digitsOnly ? length : 6)
            }
          >
            {busy ? <Spinner aria-hidden /> : null}
            {t("auth.challenge.verify")}
          </Button>
        </form>
      )}

      {method === "passkey" && canTrust ? (
        <TrustDevice
          id={`${ids}-trust`}
          days={trustedDeviceDays}
          checked={trust}
          onChange={setTrust}
        />
      ) : null}

      {SENDS.includes(method) ? (
        <Button
          type="button"
          variant="link"
          className="h-auto min-h-touch px-0"
          disabled={busy || secondsLeft > 0}
          onClick={() => {
            void switchTo(method)
          }}
        >
          {secondsLeft > 0
            ? t("auth.challenge.resendIn", { time: mmss(secondsLeft) })
            : t("auth.challenge.resend")}
        </Button>
      ) : null}

      {others.length ? (
        <div className="space-y-1">
          <p className="text-sm font-medium">
            {t("auth.challenge.otherMethod")}
          </p>
          <ul className="flex flex-wrap gap-x-4">
            {others.map((other) => (
              <li key={other}>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto min-h-touch px-0"
                  disabled={busy}
                  onClick={() => {
                    void switchTo(other)
                  }}
                >
                  {t(`auth.challenge.methods.${other}`)}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {onRestart ? (
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={onRestart}
        >
          {t("auth.challenge.restart")}
        </Button>
      ) : null}
    </div>
  )
}

function TrustDevice({
  id,
  days,
  checked,
  onChange,
}: {
  id: string
  days: number
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const t = useErpUiT()
  return (
    <Field orientation="horizontal">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => {
          onChange(value)
        }}
      />
      <FieldLabel htmlFor={id} className="font-normal">
        {t("auth.challenge.trustDevice", { count: days })}
      </FieldLabel>
    </Field>
  )
}
