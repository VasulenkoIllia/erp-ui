"use client"

import * as React from "react"
import { LinkBase } from "ra-core"

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
import { PasswordInput, PasswordStrength } from "@/registry/erp/password-input"
import {
  isCaptchaRequired,
  isChallengeRequired,
  type Challenge,
} from "@/registry/lib/auth"
import { useErpUiT } from "@/registry/lib/i18n"
import { normalizeUaId, validateUaId } from "@/registry/lib/ua-ids"
import { cn } from "@/registry/lib/utils"
import { Alert, AlertDescription } from "@/registry/ui/alert"
import { Button, buttonVariants } from "@/registry/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"
import { Spinner } from "@/registry/ui/spinner"

type FieldName = "name" | "email" | "password" | "company.name" | "company.code"

/**
 * Самостійна реєстрація (SaaS, ADR-0010): людина, email, пароль і компанія (ЄДРПОУ чи РНОКПП
 * необов'язково) → код на email → акаунт власника компанії. Після — `afterSignUp` (онбординг PF12).
 */
export function SignUpScreen({
  logo,
  footer,
  paths: pathsOverride,
  afterSignUp = "/",
  renderCaptcha,
}: {
  logo?: React.ReactNode
  footer?: React.ReactNode
  paths?: Partial<AuthPaths>
  afterSignUp?: string
  renderCaptcha?: CaptchaRenderer
}) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const done = useAfterLogin(afterSignUp)
  const fieldError = useFieldError()
  const errorText = useAuthErrorText()
  const methods = useAuthMethods()
  const paths = { ...AUTH_PATHS, ...pathsOverride }
  const ids = React.useId()
  const [values, setValues] = React.useState({
    name: "",
    email: "",
    password: "",
    company: "",
    code: "",
  })
  const [errors, setErrors] = React.useState<
    Partial<Record<FieldName, string>>
  >({})
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [challenge, setChallenge] = React.useState<Challenge | null>(null)
  const [captcha, setCaptcha] = React.useState<{
    required: boolean
    token?: string
  }>({
    required: false,
  })

  const finish = async (action: () => Promise<void>) => {
    try {
      await action()
      done()
    } catch (failure) {
      if (isChallengeRequired(failure)) {
        setChallenge(failure.challenge)
        return
      }
      throw failure
    }
  }

  if (challenge)
    return (
      <AuthLayout
        title={t("auth.challenge.verifyEmailTitle")}
        logo={logo}
        footer={footer}
      >
        <ChallengeForm
          challenge={challenge}
          onVerify={(method, code) =>
            finish(() => provider.login({ method, code }))
          }
          onSend={(method) => provider.sendCode(method)}
        />
      </AuthLayout>
    )

  const set =
    (field: keyof typeof values) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setValues((v) => ({ ...v, [field]: event.target.value }))
    }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const need = t("auth.fieldErrors.required")
    const local: Partial<Record<FieldName, string>> = {}
    if (!values.name.trim()) local.name = need
    if (!values.email.trim()) local.email = need
    if (!values.password) local.password = need
    if (!values.company.trim()) local["company.name"] = need
    const code = normalizeUaId("edrpou", values.code)
    if (code && validateUaId(code.length === 10 ? "rnokpp" : "edrpou", code))
      local["company.code"] = t("auth.fieldErrors.invalid")
    setErrors(local)
    if (Object.keys(local).length) return
    setBusy(true)
    setError(null)
    finish(() =>
      provider.signUp({
        name: values.name.trim(),
        email: values.email.trim(),
        password: values.password,
        company: { name: values.company.trim(), code: code || undefined },
        captchaToken: captcha.token,
      }),
    )
      .catch((failure: unknown) => {
        if (isCaptchaRequired(failure)) {
          setCaptcha({ required: true })
          return
        }
        const fields = Object.fromEntries(
          (["name", "email", "password", "company.name"] as const)
            .map((field) => [field, fieldError(failure, field)])
            .filter((entry): entry is [FieldName, string] => Boolean(entry[1])),
        )
        if (Object.keys(fields).length) setErrors(fields)
        else setError(errorText(failure))
      })
      .finally(() => {
        setBusy(false)
      })
  }

  const input = (
    field: FieldName,
    label: React.ReactNode,
    control: (props: {
      id: string
      "aria-invalid"?: boolean
      "aria-describedby"?: string
    }) => React.ReactNode,
  ) => {
    const id = `${ids}-${field.replace(".", "-")}`
    const message = errors[field]
    return (
      <Field data-invalid={message ? true : undefined}>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {control({
          id,
          ...(message
            ? { "aria-invalid": true, "aria-describedby": `${id}-error` }
            : {}),
        })}
        {message ? <FieldError id={`${id}-error`}>{message}</FieldError> : null}
      </Field>
    )
  }

  return (
    <AuthLayout
      title={t("auth.signUpPage.title")}
      description={t("auth.signUpPage.lead")}
      logo={logo}
      footer={footer}
    >
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <form className="space-y-4" noValidate onSubmit={submit}>
        <FieldGroup>
          {input("name", t("auth.signUpPage.name"), (props) => (
            <Input
              autoComplete="name"
              value={values.name}
              onChange={set("name")}
              {...props}
            />
          ))}
          {input("email", t("auth.email"), (props) => (
            <Input
              type="email"
              autoComplete="email"
              value={values.email}
              onChange={set("email")}
              {...props}
            />
          ))}
          {input("password", t("auth.password"), (props) => (
            <>
              <PasswordInput
                autoComplete="new-password"
                value={values.password}
                onChange={set("password")}
                {...props}
              />
              <PasswordStrength
                password={values.password}
                context={[values.email, values.name, values.company]}
              />
            </>
          ))}
          {input("company.name", t("auth.signUpPage.company"), (props) => (
            <Input
              autoComplete="organization"
              value={values.company}
              onChange={set("company")}
              {...props}
            />
          ))}
          {input(
            "company.code",
            <>
              {t("auth.signUpPage.companyCode")}{" "}
              <span className="font-normal text-muted-foreground">
                ({t("auth.signUpPage.optional")})
              </span>
            </>,
            (props) => (
              <Input
                inputMode="numeric"
                maxLength={10}
                value={values.code}
                onChange={set("code")}
                {...props}
              />
            ),
          )}
        </FieldGroup>
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
          {t("auth.signUpPage.submit")}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        {t("auth.haveAccount")}{" "}
        <LinkBase
          to={paths.login}
          className={cn(buttonVariants({ variant: "link" }), "h-auto px-0")}
        >
          {t("auth.signIn")}
        </LinkBase>
      </p>
    </AuthLayout>
  )
}
