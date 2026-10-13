"use client"

import * as React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { REGEXP_ONLY_DIGITS } from "input-otp"
import {
  DownloadIcon,
  EllipsisVerticalIcon,
  FingerprintIcon,
  KeyRoundIcon,
  MailIcon,
  MessageSquareIcon,
  SmartphoneIcon,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  useAuthErrorText,
  useErpAuthProvider,
  useFieldError,
} from "@/registry/erp/auth-layout"
import { CopyButton } from "@/registry/erp/copy-button"
import { PageState, SectionSkeleton } from "@/registry/erp/page-state"
import { PhoneInput } from "@/registry/erp/phone-input"
import { QrCode } from "@/registry/erp/qr-code"
import { useReauth } from "@/registry/erp/reauth-dialog"
import { useMe } from "@/registry/hooks/use-me"
import {
  ACCOUNT_QUERY_KEYS,
  type Factor,
  type FactorEnrolled,
  type SetupFactor,
  type SmsSetup,
  type TotpSetup,
} from "@/registry/lib/account"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  PasskeyCancelledError,
  passkeysSupported,
} from "@/registry/lib/passkey"
import { validatePhone } from "@/registry/lib/phone"
import { Alert, AlertDescription, AlertTitle } from "@/registry/ui/alert"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/registry/ui/dropdown-menu"
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
 * Способи підтвердження входу в налаштуваннях (PF01, ADR-0011): список факторів, налаштування
 * застосунку (QR), телефону, email і ключів доступу, перейменування й вимкнення, резервні коди.
 * Зміни — після повторного підтвердження (`useReauth`); перший фактор приносить резервні коди,
 * які показуємо один раз.
 */

const FACTOR_ICONS: Record<SetupFactor, LucideIcon> = {
  totp: SmartphoneIcon,
  sms: MessageSquareIcon,
  email: MailIcon,
  passkey: FingerprintIcon,
}

/** «ab12cd34» → «ab12-cd34»: легше читати й переписувати. */
export function formatBackupCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code
}

type Open =
  | { kind: "totp"; setup: TotpSetup }
  | { kind: "sms" }
  | { kind: "passkey" }
  | { kind: "rename"; factor: Factor }
  | { kind: "remove"; factor: Factor; last: boolean }
  | { kind: "regenerate" }

export function FactorsSection() {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const queryClient = useQueryClient()
  const errorText = useAuthErrorText()
  const format = useFormat()
  const { guard, dialog: reauthDialog } = useReauth()
  const [open, setOpen] = React.useState<Open | null>(null)
  const [codes, setCodes] = React.useState<string[] | null>(null)
  const [busy, setBusy] = React.useState<SetupFactor | null>(null)
  const query = useQuery({
    queryKey: ACCOUNT_QUERY_KEYS.security,
    queryFn: () => provider.account.getSecurity(),
  })

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEYS.security })

  /** Фактор додано: оновити список, показати резервні коди, якщо прийшли. */
  const enrolled = (result: FactorEnrolled) => {
    setOpen(null)
    void refresh()
    toast.success(t("auth.factors.enabled"))
    if (result.backupCodes) setCodes(result.backupCodes)
  }

  const fail = (failure: unknown) => {
    // Скасоване повторне підтвердження — не помилка, лише відмова від дії.
    if (failure) toast.error(errorText(failure))
  }

  const label = (factor: Factor) =>
    factor.name ?? t(`auth.factors.types.${factor.type}`)

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
    action.catch(fail).finally(() => {
      setBusy(null)
    })
  }

  if (query.isPending) return <SectionSkeleton rows={3} />
  if (query.isError)
    return (
      <PageState
        kind="error"
        className="min-h-40"
        onRetry={() => {
          void query.refetch()
        }}
      />
    )

  const security = query.data
  const present = new Set(security.factors.map((f) => f.type))
  const addable = security.available.filter(
    (type) =>
      (type === "passkey" ? passkeysSupported() : true) &&
      (type === "passkey" || !present.has(type)),
  )
  // Діалог відкрито — повторне підтвердження показуємо всередині нього (вкладений діалог).
  const nested = open ? reauthDialog : null

  return (
    <div className="@container space-y-4" data-slot="factors-section">
      {security.factors.length === 0 ? (
        <Alert variant="warning" role="note">
          <AlertTitle>{t("auth.factors.off")}</AlertTitle>
          <AlertDescription>{t("auth.factors.offHint")}</AlertDescription>
        </Alert>
      ) : security.twoFactorRequired ? (
        <p className="text-sm text-muted-foreground">
          {t("auth.factors.required")}
        </p>
      ) : null}

      {security.factors.length ? (
        <ul
          className="divide-y rounded-lg border"
          aria-label={t("auth.factors.title")}
        >
          {security.factors.map((factor) => {
            const Icon = FACTOR_ICONS[factor.type]
            const name = label(factor)
            const renamable =
              factor.type === "passkey" || factor.type === "totp"
            return (
              <li key={factor.id} className="flex items-center gap-3 p-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Icon aria-hidden className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{name}</p>
                  <p className="text-sm text-muted-foreground">
                    {[
                      factor.name ? t(`auth.factors.types.${factor.type}`) : "",
                      factor.destination ?? "",
                      t("auth.factors.added", {
                        date: format.date(factor.createdAt, "medium"),
                      }),
                      factor.lastUsedAt
                        ? t("auth.factors.lastUsed", {
                            when: format.relative(factor.lastUsedAt),
                          })
                        : t("auth.factors.neverUsed"),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("auth.factors.actions", { name })}
                      />
                    }
                  >
                    <EllipsisVerticalIcon aria-hidden />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {renamable ? (
                      <DropdownMenuItem
                        onClick={() => {
                          setOpen({ kind: "rename", factor })
                        }}
                      >
                        {t("auth.factors.rename")}
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => {
                        setOpen({
                          kind: "remove",
                          factor,
                          last: security.factors.length === 1,
                        })
                      }}
                    >
                      {t("auth.factors.remove")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            )
          })}
        </ul>
      ) : null}

      {security.backupCodes ? (
        <div className="flex flex-col gap-3 rounded-lg border p-3 @md:flex-row @md:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <KeyRoundIcon aria-hidden className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t("auth.factors.backup.title")}</p>
              <p className="text-sm text-muted-foreground">
                {security.backupCodes.remaining
                  ? t("auth.factors.backup.remaining", {
                      count: security.backupCodes.remaining,
                      total: security.backupCodes.total,
                    })
                  : t("auth.factors.backup.none")}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="self-start @md:self-center"
            onClick={() => {
              setOpen({ kind: "regenerate" })
            }}
          >
            {t("auth.factors.backup.regenerate")}
          </Button>
        </div>
      ) : null}

      {addable.length ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">{t("auth.factors.addTitle")}</h3>
          <div className="flex flex-wrap gap-2">
            {addable.map((type) => {
              const Icon = FACTOR_ICONS[type]
              return (
                <Button
                  key={type}
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => {
                    start(type)
                  }}
                >
                  {busy === type ? (
                    <Spinner aria-hidden />
                  ) : (
                    <Icon aria-hidden />
                  )}
                  {t(`auth.factors.add.${type}`)}
                </Button>
              )
            })}
          </div>
        </div>
      ) : null}

      {open?.kind === "totp" ? (
        <TotpDialog
          setup={open.setup}
          guard={guard}
          onClose={() => {
            setOpen(null)
          }}
          onEnrolled={enrolled}
        >
          {nested}
        </TotpDialog>
      ) : null}
      {open?.kind === "sms" ? (
        <SmsDialog
          guard={guard}
          onClose={() => {
            setOpen(null)
          }}
          onEnrolled={enrolled}
        >
          {nested}
        </SmsDialog>
      ) : null}
      {open?.kind === "passkey" ? (
        <PasskeyDialog
          guard={guard}
          onClose={() => {
            setOpen(null)
          }}
          onEnrolled={enrolled}
        >
          {nested}
        </PasskeyDialog>
      ) : null}
      {open?.kind === "rename" ? (
        <RenameDialog
          factor={open.factor}
          name={label(open.factor)}
          onClose={() => {
            setOpen(null)
          }}
          onRenamed={() => {
            setOpen(null)
            void refresh()
            toast.success(t("auth.factors.renamed"))
          }}
        />
      ) : null}
      {open?.kind === "remove" ? (
        <ConfirmDialog
          title={t("auth.factors.removeTitle", { name: label(open.factor) })}
          description={
            open.last
              ? t("auth.factors.removeLast")
              : t("auth.factors.removeDescription")
          }
          confirm={t("auth.factors.remove")}
          destructive
          onClose={() => {
            setOpen(null)
          }}
          onConfirm={() => {
            const { factor } = open
            return guard(() => provider.account.removeFactor(factor.id)).then(
              () => {
                setOpen(null)
                void refresh()
                toast.success(t("auth.factors.removed"))
              },
              fail,
            )
          }}
        >
          {nested}
        </ConfirmDialog>
      ) : null}
      {open?.kind === "regenerate" ? (
        <ConfirmDialog
          title={t("auth.factors.backup.regenerateTitle")}
          description={t("auth.factors.backup.regenerateDescription")}
          confirm={t("auth.factors.backup.regenerate")}
          onClose={() => {
            setOpen(null)
          }}
          onConfirm={() =>
            guard(() => provider.account.regenerateBackupCodes()).then(
              (fresh) => {
                setOpen(null)
                void refresh()
                setCodes(fresh)
              },
              fail,
            )
          }
        >
          {nested}
        </ConfirmDialog>
      ) : null}
      <BackupCodesDialog
        codes={codes}
        onClose={() => {
          setCodes(null)
        }}
      />
      {open ? null : reauthDialog}
    </div>
  )
}

type Guard = ReturnType<typeof useReauth>["guard"]

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
  guard: Guard
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
  onClose,
  onEnrolled,
  children,
}: {
  guard: Guard
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
    const issue = phone ? validatePhone(phone) : "required"
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
              <PhoneInput
                id={`${id}-phone`}
                value={phone}
                onValueChange={setPhone}
                aria-invalid={phoneError ? true : undefined}
                aria-describedby={phoneError ? `${id}-phone-error` : undefined}
              />
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
  guard: Guard
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

function RenameDialog({
  factor,
  name: current,
  onClose,
  onRenamed,
}: {
  factor: Factor
  name: string
  onClose: () => void
  onRenamed: () => void
}) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const fieldError = useFieldError()
  const errorText = useAuthErrorText()
  const id = React.useId()
  const [name, setName] = React.useState(factor.name ?? "")
  const [nameError, setNameError] = React.useState<string>()
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
            setBusy(true)
            provider.account
              .renameFactor(factor.id, name.trim())
              .then(onRenamed)
              .catch((failure: unknown) => {
                setNameError(fieldError(failure, "name") ?? errorText(failure))
              })
              .finally(() => {
                setBusy(false)
              })
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {t("auth.factors.renameTitle", { name: current })}
            </DialogTitle>
          </DialogHeader>
          <Field data-invalid={nameError ? true : undefined}>
            <FieldLabel htmlFor={`${id}-name`}>
              {t("auth.factors.nameLabel")}
            </FieldLabel>
            <Input
              id={`${id}-name`}
              value={name}
              maxLength={64}
              autoComplete="off"
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? `${id}-error` : undefined}
              onChange={(event) => {
                setName(event.target.value)
              }}
            />
            {nameError ? (
              <FieldError id={`${id}-error`}>{nameError}</FieldError>
            ) : null}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("auth.account.cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Spinner aria-hidden /> : null}
              {t("auth.factors.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Підтвердження дії; `onConfirm` повертає проміс — кнопка зайнята, поки він триває. */
function ConfirmDialog({
  title,
  description,
  confirm,
  destructive = false,
  onClose,
  onConfirm,
  children,
}: {
  title: string
  description: string
  confirm: string
  destructive?: boolean
  onClose: () => void
  onConfirm: () => Promise<unknown>
  children?: React.ReactNode
}) {
  const t = useErpUiT()
  const [busy, setBusy] = React.useState(false)
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("auth.account.cancel")}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void onConfirm().finally(() => {
                setBusy(false)
              })
            }}
          >
            {busy ? <Spinner aria-hidden /> : null}
            {confirm}
          </Button>
        </DialogFooter>
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
