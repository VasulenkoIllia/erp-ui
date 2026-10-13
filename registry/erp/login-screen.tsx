"use client"

import * as React from "react"
import { FingerprintIcon } from "lucide-react"
import { LinkBase } from "ra-core"

import {
  AUTH_PATHS,
  AuthDivider,
  AuthLayout,
  useAfterLogin,
  useAuthErrorText,
  useAuthMethods,
  useErpAuthProvider,
  useFieldError,
  useLoginTarget,
  type AuthPaths,
} from "@/registry/erp/auth-layout"
import { TurnstileCaptcha, type CaptchaRenderer } from "@/registry/erp/captcha"
import { ChallengeForm } from "@/registry/erp/challenge-form"
import { PasswordInput, PasswordStrength } from "@/registry/erp/password-input"
import { SsoButtons } from "@/registry/erp/sso-buttons"
import { isApiError } from "@/registry/lib/api"
import {
  isCaptchaRequired,
  isChallengeRequired,
  isPasswordChangeRequired,
  type AuthMethods,
  type Challenge,
  type SsoProvider,
} from "@/registry/lib/auth"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  PasskeyCancelledError,
  passkeysSupported,
} from "@/registry/lib/passkey"
import { cn } from "@/registry/lib/utils"
import { Alert, AlertDescription } from "@/registry/ui/alert"
import { Button, buttonVariants } from "@/registry/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"
import { Skeleton } from "@/registry/ui/skeleton"
import { Spinner } from "@/registry/ui/spinner"
import { Tabs, TabsList, TabsTrigger } from "@/registry/ui/tabs"

/** Ключ кешу налаштувань входу (`GET /auth/methods`). */
type StartMethod = "password" | "email" | "sms"

type Step =
  | { kind: "start" }
  | { kind: "challenge"; challenge: Challenge }
  | { kind: "password_change" }

/** Адреса повернення з SSO: маршрут `callback` з `next`; хеш-роутинг ra-core враховано. */
export function defaultSsoReturnUrl(callbackPath: string, next: string) {
  const { origin, pathname, hash } = window.location
  const query = `?next=${encodeURIComponent(next)}`
  return hash.startsWith("#/")
    ? `${origin}${pathname}#${callbackPath}${query}`
    : `${origin}${callbackPath}${query}`
}

export interface LoginScreenProps {
  title?: string
  description?: React.ReactNode
  logo?: React.ReactNode
  footer?: React.ReactNode
  /** Куди після входу, якщо ra-core не запам'ятав сторінку. */
  afterLogin?: string
  paths?: Partial<AuthPaths>
  /** Інший віджет перевірки «не бот» (за замовчуванням — Turnstile із `captchaSiteKey`). */
  renderCaptcha?: CaptchaRenderer
  /** Адреса повернення з SSO. */
  ssoReturnUrl?: (next: string) => string
  /** Початкові значення (напр. «Увійти як» у демо); зміна `key` скидає форму. */
  defaultValues?: { email?: string; password?: string; identifier?: string }
}

/**
 * Екран входу (PF01, ADR-0010): що показати, вирішує сервер (`GET /auth/methods`).
 *
 * - Перший крок: пароль, код на email чи в SMS (вкладки), ключ доступу, SSO-кнопки.
 * - Далі — `ChallengeForm`, якщо сервер просить підтвердження, або новий пароль замість тимчасового.
 * - Після кількох невдалих спроб — перевірка «не бот», без неї форма не надсилається.
 * - Після входу — туди, звідки перенаправив ra-core (або `afterLogin`).
 */
export function LoginScreen({
  title,
  description,
  logo,
  footer,
  afterLogin,
  paths: pathsOverride,
  renderCaptcha,
  ssoReturnUrl,
  defaultValues,
}: LoginScreenProps) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const done = useAfterLogin(afterLogin)
  const target = useLoginTarget(afterLogin)
  const paths = { ...AUTH_PATHS, ...pathsOverride }
  const methods = useAuthMethods()
  const [step, setStep] = React.useState<Step>({ kind: "start" })

  const handle = async (action: () => Promise<void>) => {
    try {
      await action()
      done()
    } catch (failure) {
      if (isChallengeRequired(failure)) {
        setStep({ kind: "challenge", challenge: failure.challenge })
        return
      }
      if (isPasswordChangeRequired(failure)) {
        setStep({ kind: "password_change" })
        return
      }
      throw failure
    }
  }

  const restart = () => {
    setStep({ kind: "start" })
  }

  if (step.kind === "challenge") {
    return (
      <AuthLayout title={t("auth.challenge.title")} logo={logo} footer={footer}>
        <ChallengeForm
          challenge={step.challenge}
          trustedDeviceDays={methods.data?.trustedDeviceDays}
          onVerify={(method, code, trustDevice) =>
            handle(() => provider.login({ method, code, trustDevice }))
          }
          onSend={(method) => provider.sendCode(method)}
          onPasskey={
            passkeysSupported()
              ? (trustDevice) =>
                  handle(() =>
                    provider.login({ method: "passkey", trustDevice }),
                  )
              : undefined
          }
          onRestart={restart}
        />
      </AuthLayout>
    )
  }

  if (step.kind === "password_change")
    return (
      <AuthLayout
        title={t("auth.forced.title")}
        description={t("auth.forced.lead")}
        logo={logo}
        footer={footer}
      >
        <NewPasswordForm
          submitLabel={t("auth.reset.submit")}
          onSubmit={(password) =>
            handle(() => provider.setNewPassword(password))
          }
        />
      </AuthLayout>
    )

  return (
    <AuthLayout
      title={title ?? t("auth.title")}
      description={description ?? t("auth.lead")}
      logo={logo}
      footer={footer}
    >
      {methods.isPending ? (
        <div
          className="space-y-3"
          role="status"
          aria-label={t("pageState.loading")}
        >
          <Skeleton className="h-control w-full" />
          <Skeleton className="h-control w-full" />
          <Skeleton className="h-control w-full" />
        </div>
      ) : methods.error || !methods.data ? (
        <MethodsError onRetry={() => void methods.refetch()} />
      ) : (
        <LoginStart
          methods={methods.data}
          paths={paths}
          renderCaptcha={renderCaptcha}
          defaultValues={defaultValues}
          onSubmit={handle}
          onSso={(sso) => {
            const returnUrl = ssoReturnUrl
              ? ssoReturnUrl(target)
              : defaultSsoReturnUrl(paths.callback, target)
            window.location.assign(provider.ssoUrl(sso.id, returnUrl))
          }}
        />
      )}
    </AuthLayout>
  )
}

function MethodsError({ onRetry }: { onRetry: () => void }) {
  const t = useErpUiT()
  return (
    <Alert variant="destructive" role="alert">
      <AlertDescription className="space-y-2">
        <p>{t("pageState.error.title")}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t("pageState.error.retry")}
        </Button>
      </AlertDescription>
    </Alert>
  )
}

function LoginStart({
  methods,
  paths,
  renderCaptcha,
  defaultValues,
  onSubmit,
  onSso,
}: {
  methods: AuthMethods
  paths: AuthPaths
  renderCaptcha?: CaptchaRenderer
  defaultValues?: LoginScreenProps["defaultValues"]
  onSubmit: (action: () => Promise<void>) => Promise<void>
  onSso: (provider: SsoProvider) => void
}) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const errorText = useAuthErrorText()
  const fieldError = useFieldError()
  const ids = React.useId()
  const available: StartMethod[] = [
    ...(methods.password ? (["password"] as const) : []),
    ...(methods.passwordless.includes("email") ? (["email"] as const) : []),
    ...(methods.passwordless.includes("sms") ? (["sms"] as const) : []),
  ]
  const [method, setMethod] = React.useState<StartMethod>(
    available[0] ?? "password",
  )
  const [email, setEmail] = React.useState(defaultValues?.email ?? "")
  const [password, setPassword] = React.useState(defaultValues?.password ?? "")
  const [phone, setPhone] = React.useState(defaultValues?.identifier ?? "")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>(
    {},
  )
  const [captcha, setCaptcha] = React.useState<{
    required: boolean
    token?: string
  }>({ required: false })
  const passkey =
    methods.passwordless.includes("passkey") && passkeysSupported()

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    setFieldErrors({})
    try {
      await onSubmit(action)
    } catch (failure) {
      if (isCaptchaRequired(failure)) {
        setCaptcha({ required: true })
        return
      }
      if (failure instanceof PasskeyCancelledError) {
        setError(t("auth.passkeyCancelled"))
        return
      }
      if (
        isApiError(failure) &&
        failure.status === 401 &&
        method === "password"
      ) {
        setError(t("auth.invalidCredentials"))
        return
      }
      const fields = Object.fromEntries(
        ["email", "identifier", "password"]
          .map((field) => [field, fieldError(failure, field)])
          .filter((entry): entry is [string, string] => Boolean(entry[1])),
      )
      if (Object.keys(fields).length) setFieldErrors(fields)
      else setError(errorText(failure))
    } finally {
      setBusy(false)
    }
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const required: Record<string, string> = {}
    const need = t("auth.fieldErrors.required")
    if (method !== "sms" && !email.trim()) required.email = need
    if (method === "password" && !password) required.password = need
    if (method === "sms" && !phone.trim()) required.identifier = need
    if (Object.keys(required).length) {
      setFieldErrors(required)
      return
    }
    const captchaToken = captcha.token
    void run(() =>
      method === "password"
        ? provider.login({ email: email.trim(), password, captchaToken })
        : provider.login({
            method,
            identifier: method === "email" ? email.trim() : phone.trim(),
            captchaToken,
          }),
    )
  }

  const captchaSlot = captcha.required ? (
    renderCaptcha ? (
      renderCaptcha({
        onToken: (token) => {
          setCaptcha({ required: true, token })
        },
        onError: () => {
          setCaptcha({ required: true })
        },
      })
    ) : methods.captchaSiteKey ? (
      <TurnstileCaptcha
        siteKey={methods.captchaSiteKey}
        onToken={(token) => {
          setCaptcha({ required: true, token })
        }}
        onError={() => {
          setCaptcha({ required: true })
        }}
      />
    ) : null
  ) : null

  const errorFor = (field: string) =>
    fieldErrors[field] ? (
      <FieldError id={`${ids}-${field}-error`}>{fieldErrors[field]}</FieldError>
    ) : null
  const invalid = (field: string) =>
    fieldErrors[field]
      ? { "aria-invalid": true, "aria-describedby": `${ids}-${field}-error` }
      : {}

  return (
    <div className="space-y-4">
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {available.length > 1 ? (
        <Tabs
          value={method}
          onValueChange={(value: StartMethod) => {
            setMethod(value)
            setError(null)
            setFieldErrors({})
          }}
        >
          <TabsList aria-label={t("auth.methodsLabel")} className="w-full">
            {available.map((value) => (
              <TabsTrigger key={value} value={value} className="flex-1">
                {value === "password"
                  ? t("auth.withPassword")
                  : value === "email"
                    ? t("auth.withEmailCode")
                    : t("auth.withSmsCode")}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      ) : null}

      {available.length ? (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <FieldGroup>
            {method === "sms" ? (
              <Field data-invalid={fieldErrors.identifier ? true : undefined}>
                <FieldLabel htmlFor={`${ids}-phone`}>
                  {t("auth.phone")}
                </FieldLabel>
                <Input
                  id={`${ids}-phone`}
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="+380"
                  value={phone}
                  onChange={(event) => {
                    setPhone(event.target.value)
                  }}
                  {...invalid("identifier")}
                />
                {errorFor("identifier")}
              </Field>
            ) : (
              <Field data-invalid={fieldErrors.email ? true : undefined}>
                <FieldLabel htmlFor={`${ids}-email`}>
                  {t("auth.email")}
                </FieldLabel>
                <Input
                  id={`${ids}-email`}
                  type="email"
                  autoComplete={method === "password" ? "username" : "email"}
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value)
                  }}
                  {...invalid("email")}
                />
                {errorFor("email")}
              </Field>
            )}
            {method === "password" ? (
              <Field data-invalid={fieldErrors.password ? true : undefined}>
                <div className="flex items-baseline justify-between gap-2">
                  <FieldLabel htmlFor={`${ids}-password`}>
                    {t("auth.password")}
                  </FieldLabel>
                  {methods.passwordReset ? (
                    <LinkBase
                      to={paths.forgot}
                      className="text-sm text-primary underline-offset-4 hover:underline"
                    >
                      {t("auth.forgot")}
                    </LinkBase>
                  ) : null}
                </div>
                <PasswordInput
                  id={`${ids}-password`}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value)
                  }}
                  {...invalid("password")}
                />
                {errorFor("password")}
              </Field>
            ) : null}
          </FieldGroup>
          {captchaSlot}
          <Button
            type="submit"
            className="w-full"
            disabled={busy || (captcha.required && !captcha.token)}
          >
            {busy ? <Spinner aria-hidden /> : null}
            {method === "password" ? t("auth.signIn") : t("auth.sendCode")}
          </Button>
        </form>
      ) : null}

      {passkey || methods.providers.length ? (
        <>
          {available.length ? <AuthDivider /> : null}
          {passkey ? (
            <Button
              type="button"
              variant="outline"
              className="w-full bg-card"
              disabled={busy}
              onClick={() => {
                void run(() => provider.login({ method: "passkey" }))
              }}
            >
              <FingerprintIcon aria-hidden />
              {t("auth.passkey")}
            </Button>
          ) : null}
          <SsoButtons
            providers={methods.providers}
            disabled={busy}
            onSelect={onSso}
          />
        </>
      ) : null}

      {methods.signUp ? (
        <p className="text-center text-sm text-muted-foreground">
          {t("auth.noAccount")}{" "}
          <LinkBase
            to={paths.signUp}
            className={cn(buttonVariants({ variant: "link" }), "h-auto px-0")}
          >
            {t("auth.signUp")}
          </LinkBase>
        </p>
      ) : null}
    </div>
  )
}

/** Новий пароль із підказкою надійності — для скидання, тимчасового пароля, запрошення. */
export function NewPasswordForm({
  submitLabel,
  onSubmit,
  context,
  children,
}: {
  submitLabel: string
  onSubmit: (password: string) => Promise<void>
  /** Email, ім'я — не повинні бути частиною пароля. */
  context?: string[]
  /** Поля перед паролем (ім'я в запрошенні). */
  children?: React.ReactNode
}) {
  const t = useErpUiT()
  const fieldError = useFieldError()
  const errorText = useAuthErrorText()
  const ids = React.useId()
  const [password, setPassword] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fieldMessage, setFieldMessage] = React.useState<string | null>(null)

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (!password) {
          setFieldMessage(t("auth.fieldErrors.required"))
          return
        }
        setBusy(true)
        setError(null)
        setFieldMessage(null)
        onSubmit(password)
          .catch((failure: unknown) => {
            const message = fieldError(failure, "password")
            if (message) setFieldMessage(message)
            else setError(errorText(failure))
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
        {children}
        <Field data-invalid={fieldMessage ? true : undefined}>
          <FieldLabel htmlFor={`${ids}-password`}>
            {t("auth.reset.password")}
          </FieldLabel>
          <PasswordInput
            id={`${ids}-password`}
            autoComplete="new-password"
            value={password}
            aria-invalid={fieldMessage ? true : undefined}
            aria-describedby={`${ids}-strength${fieldMessage ? ` ${ids}-error` : ""}`}
            onChange={(event) => {
              setPassword(event.target.value)
              setFieldMessage(null)
            }}
          />
          {fieldMessage ? (
            <FieldError id={`${ids}-error`}>{fieldMessage}</FieldError>
          ) : null}
          <PasswordStrength
            id={`${ids}-strength`}
            password={password}
            context={context}
          />
        </Field>
      </FieldGroup>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? <Spinner aria-hidden /> : null}
        {submitLabel}
      </Button>
    </form>
  )
}
