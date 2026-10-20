import * as React from "react"
import { REGEXP_ONLY_DIGITS } from "input-otp"
import {
  DownloadIcon,
  FingerprintIcon,
  MailIcon,
  MessageSquareIcon,
  SmartphoneIcon,
  type LucideIcon,
} from "lucide-react"

import {
  useAuthErrorText,
  useErpAuthProvider,
  useFieldError,
} from "@/registry/erp/auth-layout"
import { CopyButton } from "@/registry/erp/copy-button"
import { QrCode } from "@/registry/erp/qr-code"
import { useMe } from "@/registry/hooks/use-me"
import type {
  FactorEnrolled,
  SetupFactor,
  SmsSetup,
  TotpSetup,
} from "@/registry/lib/account"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  PasskeyCancelledError,
  passkeysSupported,
} from "@/registry/lib/passkey"
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
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/registry/ui/input-otp"
import { Spinner } from "@/registry/ui/spinner"

/**
 * Налаштування способів підтвердження (PF01, ADR-0011, ADR-0012): застосунок із QR, телефон для SMS,
 * коди на email, ключ доступу, резервні коди (показ один раз).
 *
 * - `useFactorSetup` — запуск налаштування й діалоги; у налаштуваннях з повторним підтвердженням,
 *   на кроці входу — без нього.
 * - `FactorSetupStep` — крок входу «Налаштуйте двоетапну перевірку», коли її вимагає політика.
 * - Модуль легкий для сторінки входу: поле телефону з libphonenumber передається ззовні (`phone`).
 */

export const FACTOR_ICONS: Record<SetupFactor, LucideIcon> = {
  totp: SmartphoneIcon,
  sms: MessageSquareIcon,
  email: MailIcon,
  passkey: FingerprintIcon,
}

/** «ab12cd34» → «ab12-cd34»: легше читати й переписувати. */
export function formatBackupCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code
}

/** Обгортка дії: повторне підтвердження в налаштуваннях; на кроці входу — без нього. */
export type FactorGuard = <T>(action: () => Promise<T>) => Promise<T>

const noGuard: FactorGuard = (action) => action()

/**
 * Поле номера для SMS. Без нього — звичайне поле `tel` (сторінка входу не вантажить
 * libphonenumber); у налаштуваннях передається PhoneInput і validatePhone (LC12).
 */
export interface PhoneField {
  Input?: React.ComponentType<{
    id: string
    value: string
    onValueChange: (value: string) => void
    "aria-invalid"?: boolean
    "aria-describedby"?: string
  }>
  validate?: (value: string) => "incomplete" | "invalid" | null
}

const minimalPhoneCheck = (value: string) =>
  value.replace(/\D/g, "").length < 10 ? ("incomplete" as const) : null

/** Поле 6-значного коду (застосунок, SMS). */
function CodeField({
  id,
  label,
  value,
  error,
  onChange,
  onComplete,
  inputRef,
}: {
  id: string
  label: string
  value: string
  error?: string
  onChange: (value: string) => void
  onComplete: (value: string) => void
  inputRef?: React.Ref<HTMLInputElement>
}) {
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputOTP
        ref={inputRef}
        id={id}
        maxLength={6}
        pattern={REGEXP_ONLY_DIGITS}
        inputMode="numeric"
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={onChange}
        onComplete={onComplete}
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
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </Field>
  )
}

/** Код перевірки: хибний — під полем, решта — банером. */
function useVerify(onEnrolled: (result: FactorEnrolled) => void) {
  const t = useErpUiT()
  const fieldError = useFieldError()
  const errorText = useAuthErrorText()
  const [busy, setBusy] = React.useState(false)
  const [code, setCode] = React.useState("")
  const [codeError, setCodeError] = React.useState<string>()
  const [error, setError] = React.useState<string | null>(null)
  const run = (action: () => Promise<FactorEnrolled>) => {
    setBusy(true)
    setError(null)
    setCodeError(undefined)
    action()
      .then(onEnrolled)
      .catch((failure: unknown) => {
        if (fieldError(failure, "code"))
          setCodeError(t("auth.challenge.invalidCode"))
        else if (failure) setError(errorText(failure))
        setCode("")
      })
      .finally(() => {
        setBusy(false)
      })
  }
  return { busy, code, setCode, codeError, error, run }
}

function TotpDialog({
  setup,
  guard,
  onClose,
  onEnrolled,
  children,
}: {
  setup: TotpSetup
  guard: FactorGuard
  onClose: () => void
  onEnrolled: (result: FactorEnrolled) => void
  children?: React.ReactNode
}) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const id = React.useId()
  const { busy, code, setCode, codeError, error, run } = useVerify(onEnrolled)
  const verify = (value: string) => {
    run(() => guard(() => provider.account.verifyTotp(setup.setupId, value)))
  }
  const secret = setup.secret.replace(/(.{4})/g, "$1 ").trim()

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
            verify(code)
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("auth.factors.totp.title")}</DialogTitle>
            <DialogDescription>{t("auth.factors.totp.scan")}</DialogDescription>
          </DialogHeader>
          <QrCode
            value={setup.uri}
            label={t("auth.factors.totp.qrLabel")}
            className="mx-auto"
          />
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              {t("auth.factors.totp.manual")}
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 rounded-md bg-muted px-2 py-1.5 font-mono text-sm break-all">
                {secret}
              </code>
              <CopyButton
                value={setup.secret}
                label={t("auth.factors.totp.copySecret")}
              />
            </div>
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <CodeField
            id={`${id}-code`}
            label={t("auth.factors.totp.enterCode")}
            value={code}
            error={codeError}
            onChange={setCode}
            onComplete={verify}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("auth.account.cancel")}
            </Button>
            <Button type="submit" disabled={busy || code.length < 6}>
              {busy ? <Spinner aria-hidden /> : null}
              {t("auth.challenge.verify")}
            </Button>
          </DialogFooter>
        </form>
        {children}
      </DialogContent>
    </Dialog>
  )
}

function SmsDialog({
  guard,
  phoneField,
  onClose,
  onEnrolled,
  children,
}: {
  guard: FactorGuard
  phoneField?: PhoneField
  onClose: () => void
  onEnrolled: (result: FactorEnrolled) => void
  children?: React.ReactNode
}) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const fieldError = useFieldError()
  const errorText = useAuthErrorText()
  const { data: me } = useMe()
  const id = React.useId()
  const [phone, setPhone] = React.useState(me?.phone ?? "")
  const PhoneControl = phoneField?.Input
  const [phoneError, setPhoneError] = React.useState<string>()
  const [sending, setSending] = React.useState(false)
  const [sendError, setSendError] = React.useState<string | null>(null)
  const [setup, setSetup] = React.useState<SmsSetup | null>(null)
  const { busy, code, setCode, codeError, error, run } = useVerify(onEnrolled)
  const codeInput = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    if (setup) codeInput.current?.focus()
  }, [setup])

  const send = () => {
    const issue = phone
      ? (phoneField?.validate ?? minimalPhoneCheck)(phone)
      : "required"
    if (issue) {
      setPhoneError(
        issue === "required"
          ? t("auth.fieldErrors.required")
          : t(`validation.phone.${issue}`),
      )
      return
    }
    setPhoneError(undefined)
    setSending(true)
    setSendError(null)
    guard(() => provider.account.startSms(phone))
      .then(setSetup)
      .catch((failure: unknown) => {
        const message = fieldError(failure, "phone")
        if (message) setPhoneError(message)
        else if (failure) setSendError(errorText(failure))
      })
      .finally(() => {
        setSending(false)
      })
  }
  const verify = (value: string) => {
    if (!setup) return
    run(() => guard(() => provider.account.verifySms(setup.setupId, value)))
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
            if (setup) verify(code)
            else send()
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("auth.factors.sms.title")}</DialogTitle>
            <DialogDescription>
              {t("auth.factors.sms.description")}
            </DialogDescription>
          </DialogHeader>
          {sendError || error ? (
            <Alert variant="destructive">
              <AlertDescription>{sendError ?? error}</AlertDescription>
            </Alert>
          ) : null}
          {setup ? (
            <CodeField
              id={`${id}-code`}
              inputRef={codeInput}
              label={t("auth.factors.sms.codeLabel", {
                destination: setup.destination,
              })}
              value={code}
              error={codeError}
              onChange={setCode}
              onComplete={verify}
            />
          ) : (
            <Field data-invalid={phoneError ? true : undefined}>
              <FieldLabel htmlFor={`${id}-phone`}>
                {t("auth.factors.sms.phoneLabel")}
              </FieldLabel>
              {PhoneControl ? (
                <PhoneControl
                  id={`${id}-phone`}
                  value={phone}
                  onValueChange={setPhone}
                  aria-invalid={phoneError ? true : undefined}
                  aria-describedby={
                    phoneError ? `${id}-phone-error` : undefined
                  }
                />
              ) : (
                <Input
                  id={`${id}-phone`}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  aria-invalid={phoneError ? true : undefined}
                  aria-describedby={
                    phoneError ? `${id}-phone-error` : undefined
                  }
                  onChange={(event) => {
                    setPhone(event.target.value)
                  }}
                />
              )}
              {phoneError ? (
                <FieldError id={`${id}-phone-error`}>{phoneError}</FieldError>
              ) : null}
            </Field>
          )}
          <DialogFooter>
            {setup ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSetup(null)
                  setCode("")
                }}
              >
                {t("auth.factors.sms.otherNumber")}
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={onClose}>
                {t("auth.account.cancel")}
              </Button>
            )}
            <Button
              type="submit"
              disabled={setup ? busy || code.length < 6 : sending}
            >
              {busy || sending ? <Spinner aria-hidden /> : null}
              {setup ? t("auth.challenge.verify") : t("auth.factors.sms.send")}
            </Button>
          </DialogFooter>
        </form>
        {children}
      </DialogContent>
    </Dialog>
  )
}

/** Назва ключа за замовчуванням: «Chrome, macOS». */
function defaultPasskeyName(): string {
  if (typeof navigator === "undefined") return ""
  const ua = navigator.userAgent
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : ""
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : ""
  return [browser, os].filter(Boolean).join(", ")
}

function PasskeyDialog({
  guard,
  onClose,
  onEnrolled,
  children,
}: {
  guard: FactorGuard
  onClose: () => void
  onEnrolled: (result: FactorEnrolled) => void
  children?: React.ReactNode
}) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const fieldError = useFieldError()
  const errorText = useAuthErrorText()
  const id = React.useId()
  const [name, setName] = React.useState(defaultPasskeyName)
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
            guard(() => provider.account.addPasskey(name.trim()))
              .then(onEnrolled)
              .catch((failure: unknown) => {
                if (failure instanceof PasskeyCancelledError)
                  setError(t("auth.factors.passkey.cancelled"))
                else {
                  const message = fieldError(failure, "name")
                  if (message) setNameError(message)
                  else if (failure) setError(errorText(failure))
                }
              })
              .finally(() => {
                setBusy(false)
              })
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("auth.factors.passkey.title")}</DialogTitle>
            <DialogDescription>
              {t("auth.factors.passkey.description")}
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Field data-invalid={nameError ? true : undefined}>
            <FieldLabel htmlFor={`${id}-name`}>
              {t("auth.factors.passkey.nameLabel")}
            </FieldLabel>
            <Input
              id={`${id}-name`}
              value={name}
              maxLength={64}
              autoComplete="off"
              aria-invalid={nameError ? true : undefined}
              aria-describedby={`${id}-hint${nameError ? ` ${id}-error` : ""}`}
              onChange={(event) => {
                setName(event.target.value)
              }}
            />
            <FieldDescription id={`${id}-hint`}>
              {t("auth.factors.passkey.nameHint")}
            </FieldDescription>
            {nameError ? (
              <FieldError id={`${id}-error`}>{nameError}</FieldError>
            ) : null}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("auth.account.cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Spinner aria-hidden /> : <FingerprintIcon aria-hidden />}
              {t("auth.factors.passkey.create")}
            </Button>
          </DialogFooter>
        </form>
        {children}
      </DialogContent>
    </Dialog>
  )
}

/** Нові резервні коди — показуємо один раз: копіювати, завантажити, «Я зберіг коди». */
export function BackupCodesDialog({
  codes,
  onClose,
}: {
  codes: string[] | null
  onClose: () => void
}) {
  const t = useErpUiT()
  const { data: me } = useMe()
  const formatted = (codes ?? []).map(formatBackupCode)
  const text = [
    t("auth.factors.backup.fileTitle", { account: me?.email ?? "" }),
    "",
    ...formatted,
    "",
  ].join("\n")

  return (
    <Dialog
      open={codes !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("auth.factors.backup.dialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("auth.factors.backup.dialogDescription")}
          </DialogDescription>
        </DialogHeader>
        <ul
          aria-label={t("auth.factors.backup.listLabel")}
          className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-3 font-mono text-sm"
        >
          {formatted.map((code) => (
            <li key={code} className="text-center tabular-nums">
              {code}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <CopyButton
            value={formatted.join("\n")}
            label={t("auth.factors.backup.copy")}
            variant="outline"
            showLabel
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([text], { type: "text/plain;charset=utf-8" }),
              )
              const link = document.createElement("a")
              link.href = url
              link.download = "backup-codes.txt"
              link.click()
              URL.revokeObjectURL(url)
            }}
          >
            <DownloadIcon aria-hidden />
            {t("auth.factors.backup.download")}
          </Button>
        </div>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            {t("auth.factors.backup.done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type SetupOpen =
  { kind: "totp"; setup: TotpSetup } | { kind: "sms" } | { kind: "passkey" }

/**
 * Запуск налаштування фактора: `start(type)` відкриває потрібний діалог (email вмикається одразу).
 * `nested` — повторне підтвердження всередині відкритого діалогу (вкладений діалог).
 */
export function useFactorSetup({
  guard = noGuard,
  onEnrolled,
  onError,
  phone,
  nested,
}: {
  guard?: FactorGuard
  onEnrolled: (result: FactorEnrolled) => void
  onError: (failure: unknown) => void
  phone?: PhoneField
  nested?: React.ReactNode
}) {
  const provider = useErpAuthProvider()
  const [open, setOpen] = React.useState<SetupOpen | null>(null)
  const [busy, setBusy] = React.useState<SetupFactor | null>(null)

  const enrolled = (result: FactorEnrolled) => {
    setOpen(null)
    onEnrolled(result)
  }
  const close = () => {
    setOpen(null)
  }

  const start = (type: SetupFactor) => {
    if (type === "sms" || type === "passkey") {
      setOpen({ kind: type })
      return
    }
    setBusy(type)
    const action =
      type === "totp"
        ? guard(() => provider.account.startTotp()).then((setup) => {
            setOpen({ kind: "totp", setup })
          })
        : guard(() => provider.account.enableEmail()).then(enrolled)
    action.catch(onError).finally(() => {
      setBusy(null)
    })
  }

  const dialogs = (
    <>
      {open?.kind === "totp" ? (
        <TotpDialog
          setup={open.setup}
          guard={guard}
          onClose={close}
          onEnrolled={enrolled}
        >
          {nested}
        </TotpDialog>
      ) : null}
      {open?.kind === "sms" ? (
        <SmsDialog
          guard={guard}
          phoneField={phone}
          onClose={close}
          onEnrolled={enrolled}
        >
          {nested}
        </SmsDialog>
      ) : null}
      {open?.kind === "passkey" ? (
        <PasskeyDialog guard={guard} onClose={close} onEnrolled={enrolled}>
          {nested}
        </PasskeyDialog>
      ) : null}
    </>
  )

  return { start, busy, open: open !== null, dialogs }
}

/**
 * Крок входу, коли політика вимагає другий крок, а його ще немає (ADR-0012): вибір способу,
 * налаштування, резервні коди — і `onComplete` (`provider.completeFactorSetup`).
 */
export function FactorSetupStep({
  factors,
  onComplete,
  onRestart,
  phone,
}: {
  factors: SetupFactor[]
  onComplete: () => Promise<void>
  /** «Почати спочатку» — інший акаунт чи спосіб входу. */
  onRestart?: () => void
  phone?: PhoneField
}) {
  const t = useErpUiT()
  const errorText = useAuthErrorText()
  const [codes, setCodes] = React.useState<string[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [completing, setCompleting] = React.useState(false)

  const complete = () => {
    setCompleting(true)
    setError(null)
    onComplete()
      .catch((failure: unknown) => {
        setError(errorText(failure))
      })
      .finally(() => {
        setCompleting(false)
      })
  }
  const setup = useFactorSetup({
    phone,
    onEnrolled: (result) => {
      if (result.backupCodes) setCodes(result.backupCodes)
      else complete()
    },
    onError: (failure) => {
      setError(errorText(failure))
    },
  })
  const options = factors.filter(
    (type) => type !== "passkey" || passkeysSupported(),
  )

  return (
    <div className="space-y-4" data-slot="factor-setup-step">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <ul className="space-y-2" aria-label={t("auth.factors.addTitle")}>
        {options.map((type) => {
          const Icon = FACTOR_ICONS[type]
          return (
            <li key={type}>
              <Button
                variant="outline"
                className="h-auto w-full justify-start gap-3 py-3 text-start whitespace-normal"
                disabled={setup.busy !== null || completing}
                onClick={() => {
                  setup.start(type)
                }}
              >
                {setup.busy === type ? (
                  <Spinner aria-hidden />
                ) : (
                  <Icon aria-hidden />
                )}
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">
                    {t(`auth.factors.types.${type}`)}
                  </span>
                  {/* Під наведенням фон кнопки темніший: приглушений текст втратив би контраст. */}
                  <span className="text-xs text-muted-foreground group-hover/button:text-foreground">
                    {t(`auth.factors.hints.${type}`)}
                  </span>
                </span>
              </Button>
            </li>
          )
        })}
      </ul>
      {completing ? (
        <p role="status" className="flex items-center gap-2 text-sm">
          <Spinner aria-hidden />
          {t("auth.factorSetup.finishing")}
        </p>
      ) : null}
      {onRestart ? (
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          disabled={completing}
          onClick={onRestart}
        >
          {t("auth.challenge.restart")}
        </Button>
      ) : null}
      {setup.dialogs}
      <BackupCodesDialog
        codes={codes}
        onClose={() => {
          setCodes(null)
          complete()
        }}
      />
    </div>
  )
}
