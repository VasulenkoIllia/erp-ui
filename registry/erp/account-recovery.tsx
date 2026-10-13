"use client"

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { MailCheckIcon } from "lucide-react"
import { LinkBase, useHandleAuthCallback } from "ra-core"

import {
  AUTH_PATHS,
  AuthLayout,
  useAfterLogin,
  useAuthErrorText,
  useAuthMethods,
  useErpAuthProvider,
  useFieldError,
  type AuthPaths,
} from "@/registry/erp/auth-layout"
import { TurnstileCaptcha, type CaptchaRenderer } from "@/registry/erp/captcha"
import { ChallengeForm } from "@/registry/erp/challenge-form"
import { FactorSetupStep } from "@/registry/erp/factor-setup"
import { NewPasswordForm } from "@/registry/erp/login-screen"
import type { SetupFactor } from "@/registry/lib/account"
import { isApiError } from "@/registry/lib/api"
import {
  isCaptchaRequired,
  isChallengeRequired,
  isFactorSetupRequired,
  type Challenge,
} from "@/registry/lib/auth"
import { useErpUiT, type ErpUiKey } from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"
import { Alert, AlertDescription } from "@/registry/ui/alert"
import { Button, buttonVariants } from "@/registry/ui/button"
import { Field, FieldError, FieldLabel } from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"
import { Spinner } from "@/registry/ui/spinner"

/**
 * Відновлення доступу (ADR-0010): «Забули пароль?», новий пароль за посиланням, запрошення,
 * вхід за посиланням із листа й повернення з SSO. Токен — з адреси (`?token=`); розібрати адресу
 * має застосунок і передати сюди.
 */

interface ScreenProps {
  logo?: React.ReactNode
  footer?: React.ReactNode
  paths?: Partial<AuthPaths>
  afterLogin?: string
}

function BackToLogin({ paths }: { paths?: Partial<AuthPaths> }) {
  const t = useErpUiT()
  return (
    <LinkBase
      to={paths?.login ?? AUTH_PATHS.login}
      className={cn(buttonVariants({ variant: "outline" }), "w-full")}
    >
      {t("auth.backToLogin")}
    </LinkBase>
  )
}

/**
 * Після скидання пароля чи прийняття запрошення сервер може попросити другий фактор або, за
 * політикою (ADR-0012), налаштувати його.
 */
function useLoginFlow(afterLogin?: string) {
  const provider = useErpAuthProvider()
  const done = useAfterLogin(afterLogin)
  const [challenge, setChallenge] = React.useState<Challenge | null>(null)
  const [setup, setSetup] = React.useState<SetupFactor[] | null>(null)
  const handle = async (action: () => Promise<void>) => {
    try {
      await action()
      done()
    } catch (failure) {
      if (isChallengeRequired(failure)) {
        setChallenge(failure.challenge)
        return
      }
      if (isFactorSetupRequired(failure)) {
        setSetup(failure.factors)
        return
      }
      throw failure
    }
  }
  const challengeForm = setup ? (
    <FactorSetupStep
      factors={setup}
      onComplete={() => handle(() => provider.completeFactorSetup())}
    />
  ) : challenge ? (
    <ChallengeForm
      challenge={challenge}
      onVerify={(method, code, trustDevice) =>
        handle(() => provider.login({ method, code, trustDevice }))
      }
      onSend={(method) => provider.sendCode(method)}
      onRequestRecovery={(comment) => provider.requestRecovery(comment)}
    />
  ) : null
  const stepTitle: ErpUiKey | null = setup
    ? "auth.factorSetup.title"
    : challenge
      ? "auth.challenge.title"
      : null
  return { handle, challengeForm, stepTitle }
}

export function ForgotPasswordScreen({
  logo,
  footer,
  paths,
  renderCaptcha,
}: ScreenProps & { renderCaptcha?: CaptchaRenderer }) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const errorText = useAuthErrorText()
  const methods = useAuthMethods()
  const ids = React.useId()
  const [email, setEmail] = React.useState("")
  const [sentTo, setSentTo] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [emailError, setEmailError] = React.useState<string | null>(null)
  const [captcha, setCaptcha] = React.useState<{
    required: boolean
    token?: string
  }>({
    required: false,
  })

  if (sentTo)
    return (
      <AuthLayout
        title={t("auth.forgotPage.sentTitle")}
        logo={logo}
        footer={footer}
      >
        <div className="flex gap-3">
          <MailCheckIcon
            aria-hidden
            className="mt-0.5 size-5 shrink-0 text-success-foreground"
          />
          <p className="text-sm">
            {t("auth.forgotPage.sent", { email: sentTo })}
          </p>
        </div>
        <BackToLogin paths={paths} />
      </AuthLayout>
    )

  return (
    <AuthLayout
      title={t("auth.forgotPage.title")}
      description={t("auth.forgotPage.lead")}
      logo={logo}
      footer={footer}
    >
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <form
        className="space-y-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          if (!email.trim()) {
            setEmailError(t("auth.fieldErrors.required"))
            return
          }
          setBusy(true)
          setError(null)
          provider
            .forgotPassword(email.trim(), captcha.token)
            .then(() => {
              setSentTo(email.trim())
            })
            .catch((failure: unknown) => {
              if (isCaptchaRequired(failure)) setCaptcha({ required: true })
              else setError(errorText(failure))
            })
            .finally(() => {
              setBusy(false)
            })
        }}
      >
        <Field data-invalid={emailError ? true : undefined}>
          <FieldLabel htmlFor={`${ids}-email`}>{t("auth.email")}</FieldLabel>
          <Input
            id={`${ids}-email`}
            type="email"
            autoComplete="email"
            value={email}
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? `${ids}-error` : undefined}
            onChange={(event) => {
              setEmail(event.target.value)
              setEmailError(null)
            }}
          />
          {emailError ? (
            <FieldError id={`${ids}-error`}>{emailError}</FieldError>
          ) : null}
        </Field>
        {captcha.required ? (
          renderCaptcha ? (
            renderCaptcha({
              onToken: (token) => {
                setCaptcha({ required: true, token })
              },
              onError: () => {
                setCaptcha({ required: true })
              },
            })
          ) : methods.data?.captchaSiteKey ? (
            <TurnstileCaptcha
              siteKey={methods.data.captchaSiteKey}
              onToken={(token) => {
                setCaptcha({ required: true, token })
              }}
              onError={() => {
                setCaptcha({ required: true })
              }}
            />
          ) : null
        ) : null}
        <Button
          type="submit"
          className="w-full"
          disabled={busy || (captcha.required && !captcha.token)}
        >
          {busy ? <Spinner aria-hidden /> : null}
          {t("auth.forgotPage.submit")}
        </Button>
      </form>
      <BackToLogin paths={paths} />
    </AuthLayout>
  )
}

function Expired({
  message,
  paths,
  action,
}: {
  message: string
  paths?: Partial<AuthPaths>
  action?: React.ReactNode
}) {
  return (
    <div className="space-y-4">
      <Alert variant="warning">
        <AlertDescription>{message}</AlertDescription>
      </Alert>
      {action}
      <BackToLogin paths={paths} />
    </div>
  )
}

export function ResetPasswordScreen({
  token,
  logo,
  footer,
  paths,
  afterLogin,
}: ScreenProps & { token: string | null }) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const { handle, challengeForm, stepTitle } = useLoginFlow(afterLogin)
  const [expired, setExpired] = React.useState(!token)
  const forgot = (
    <LinkBase
      to={paths?.forgot ?? AUTH_PATHS.forgot}
      className={cn(buttonVariants(), "w-full")}
    >
      {t("auth.reset.requestNew")}
    </LinkBase>
  )
  return (
    <AuthLayout
      title={stepTitle ? t(stepTitle) : t("auth.reset.title")}
      description={challengeForm || expired ? undefined : t("auth.reset.lead")}
      logo={logo}
      footer={footer}
    >
      {challengeForm ??
        (expired ? (
          <Expired
            message={t("auth.reset.expired")}
            paths={paths}
            action={forgot}
          />
        ) : (
          <NewPasswordForm
            submitLabel={t("auth.reset.submit")}
            onSubmit={(password) =>
              handle(() => provider.resetPassword(token ?? "", password)).catch(
                (failure: unknown) => {
                  if (isApiError(failure) && failure.code === "token_expired") {
                    setExpired(true)
                    return
                  }
                  throw failure
                },
              )
            }
          />
        ))}
    </AuthLayout>
  )
}

export function AcceptInviteScreen({
  token,
  logo,
  footer,
  paths,
  afterLogin,
}: ScreenProps & { token: string | null }) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const fieldError = useFieldError()
  const ids = React.useId()
  const { handle, challengeForm, stepTitle } = useLoginFlow(afterLogin)
  const invite = useQuery({
    queryKey: ["erp-ui", "invite", token],
    queryFn: () => provider.getInvite(token ?? ""),
    enabled: Boolean(token),
    retry: false,
  })
  const [name, setName] = React.useState("")
  const [nameError, setNameError] = React.useState<string | null>(null)

  const title = invite.data
    ? t("auth.invite.title", { company: invite.data.companyName })
    : t("auth.signUpPage.title")

  return (
    <AuthLayout
      title={stepTitle ? t(stepTitle) : title}
      description={
        invite.data && !challengeForm
          ? invite.data.invitedBy
            ? t("auth.invite.lead", {
                inviter: invite.data.invitedBy,
                company: invite.data.companyName,
                email: invite.data.email,
              })
            : t("auth.invite.leadNoInviter", {
                company: invite.data.companyName,
                email: invite.data.email,
              })
          : undefined
      }
      logo={logo}
      footer={footer}
    >
      {challengeForm ??
        (!token || invite.isError ? (
          <Expired message={t("auth.invite.expired")} paths={paths} />
        ) : invite.isPending ? (
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Spinner aria-hidden />
            {t("auth.invite.loading")}
          </p>
        ) : (
          <NewPasswordForm
            submitLabel={t("auth.invite.submit")}
            context={[invite.data.email, name]}
            onSubmit={async (password) => {
              if (!name.trim()) {
                setNameError(t("auth.fieldErrors.required"))
                return
              }
              setNameError(null)
              await handle(() =>
                provider.acceptInvite(token, { name: name.trim(), password }),
              ).catch((failure: unknown) => {
                const message = fieldError(failure, "name")
                if (message) {
                  setNameError(message)
                  return
                }
                throw failure
              })
            }}
          >
            <Field data-invalid={nameError ? true : undefined}>
              <FieldLabel htmlFor={`${ids}-name`}>
                {t("auth.invite.name")}
              </FieldLabel>
              <Input
                id={`${ids}-name`}
                autoComplete="name"
                value={name}
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? `${ids}-name-error` : undefined}
                onChange={(event) => {
                  setName(event.target.value)
                  setNameError(null)
                }}
              />
              {nameError ? (
                <FieldError id={`${ids}-name-error`}>{nameError}</FieldError>
              ) : null}
            </Field>
          </NewPasswordForm>
        ))}
    </AuthLayout>
  )
}

/** Посилання з листа (вхід без пароля): перевіряє токен один раз і входить. */
export function EmailLinkScreen({
  token,
  logo,
  footer,
  paths,
  afterLogin,
}: ScreenProps & { token: string | null }) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const { handle, challengeForm, stepTitle } = useLoginFlow(afterLogin)
  const [failed, setFailed] = React.useState(!token)
  const started = React.useRef(false)

  React.useEffect(() => {
    // StrictMode викликає ефект двічі, а токен одноразовий.
    if (!token || started.current) return
    started.current = true
    handle(() => provider.login({ link: token })).catch(() => {
      setFailed(true)
    })
  }, [token, handle, provider])

  return (
    <AuthLayout
      title={stepTitle ? t(stepTitle) : t("auth.title")}
      logo={logo}
      footer={footer}
    >
      {challengeForm ??
        (failed ? (
          <Expired message={t("auth.link.expired")} paths={paths} />
        ) : (
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Spinner aria-hidden />
            {t("auth.link.verifying")}
          </p>
        ))}
    </AuthLayout>
  )
}

/** Маршрут повернення з SSO: ra-core викликає `handleCallback` і перенаправляє на `next`. */
export function SsoCallbackScreen({ logo, footer, paths }: ScreenProps) {
  const t = useErpUiT()
  const [failed, setFailed] = React.useState(false)
  useHandleAuthCallback({
    onError: () => {
      setFailed(true)
    },
  })
  return (
    <AuthLayout title={t("auth.title")} logo={logo} footer={footer}>
      {failed ? (
        <Expired message={t("auth.callback.failed")} paths={paths} />
      ) : (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Spinner aria-hidden />
          {t("auth.callback.verifying")}
        </p>
      )}
    </AuthLayout>
  )
}
