import { useQueryClient } from "@tanstack/react-query"
import { useLogin } from "ra-core"
import { useEffect, useId, useRef, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { useLocation } from "react-router"

import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import { useAppearance } from "@/registry/hooks/use-appearance"
import { isApiError } from "@/registry/lib/api"
import { isTwoFactorRequired, ME_QUERY_KEY } from "@/registry/lib/auth"
import { LANGUAGES, type Language } from "@/registry/lib/i18n"
import { LANGUAGE_NAMES } from "@/registry/lib/language-names"
import { Alert, AlertDescription } from "@/registry/ui/alert"
import { Button } from "@/registry/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/registry/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/registry/ui/select"
import { Spinner } from "@/registry/ui/spinner"

import { MOCK_USERS } from "@/mocks/users"
import { ROUTES } from "@/router"

const usePageT = () => useTranslation("demo", { keyPrefix: "loginPage" }).t

type Step = "password" | "code"

/**
 * Вхід (ADR-0003): email і пароль, далі — код 2FA, якщо його ввімкнено.
 * Після входу ra-core повертає туди, звідки перенаправив (або на «Дані й моки»).
 */
export function LoginPage() {
  const t = usePageT()
  const ids = useId()
  const login = useLogin()
  const queryClient = useQueryClient()
  const errorMessage = useApiErrorMessage()
  const location = useLocation()
  const [appearance, setAppearance] = useAppearance()
  const [step, setStep] = useState<Step>("password")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const codeInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    document.title = `${t("title")} · erp-ui`
  }, [t])

  useEffect(() => {
    if (step === "code") codeInput.current?.focus()
  }, [step])

  const next =
    (location.state as { nextPathname?: string } | null)?.nextPathname ??
    ROUTES.data

  const run = async (params: Record<string, string>) => {
    setBusy(true)
    setError(null)
    try {
      await login(params, next)
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY })
    } catch (failure) {
      if (isTwoFactorRequired(failure)) {
        setStep("code")
        return
      }
      if (isApiError(failure) && failure.status === 401 && step === "password")
        setError(t("invalidCredentials"))
      else if (isApiError(failure) && failure.fieldErrors?.code)
        setError(t("invalidCode"))
      else setError(t("failed", { message: errorMessage(failure) }))
    } finally {
      setBusy(false)
    }
  }

  const submitPassword = (event: FormEvent) => {
    event.preventDefault()
    void run({ email, password })
  }

  const submitCode = (event: FormEvent) => {
    event.preventDefault()
    void run({ code })
  }

  const languageItems = LANGUAGES.map((value) => ({
    value,
    label: LANGUAGE_NAMES[value],
  }))

  return (
    <main
      id="erp-ui-main"
      className="grid min-h-svh place-items-center bg-muted/40 p-4"
    >
      <div className="w-full max-w-sm space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>
              <h1 ref={heading} tabIndex={-1} className="text-xl font-semibold">
                {step === "password" ? t("title") : t("codeTitle")}
              </h1>
            </CardTitle>
            <CardDescription>
              {step === "password" ? t("lead") : t("codeHint")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error ? (
              <Alert id={`${ids}-error`} variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            {step === "password" ? (
              <form onSubmit={submitPassword} className="space-y-4">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor={`${ids}-email`}>
                      {t("email")}
                    </FieldLabel>
                    <Input
                      id={`${ids}-email`}
                      type="email"
                      autoComplete="username"
                      required
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value)
                      }}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${ids}-password`}>
                      {t("password")}
                    </FieldLabel>
                    <Input
                      id={`${ids}-password`}
                      type="password"
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value)
                      }}
                    />
                  </Field>
                </FieldGroup>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? <Spinner aria-hidden /> : null}
                  {t("submit")}
                </Button>
              </form>
            ) : (
              <form onSubmit={submitCode} className="space-y-4">
                <Field data-invalid={error ? true : undefined}>
                  <FieldLabel htmlFor={`${ids}-code`}>{t("code")}</FieldLabel>
                  <Input
                    ref={codeInput}
                    id={`${ids}-code`}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="\d{6}"
                    maxLength={6}
                    required
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `${ids}-error` : undefined}
                    className="font-mono tracking-widest tabular-nums"
                    value={code}
                    onChange={(event) => {
                      setCode(event.target.value.replace(/\D/g, ""))
                    }}
                  />
                </Field>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={busy || code.length !== 6}
                >
                  {busy ? <Spinner aria-hidden /> : null}
                  {t("verify")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setStep("password")
                    setCode("")
                    setError(null)
                    heading.current?.focus()
                  }}
                >
                  {t("back")}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>
              <h2>{t("demoTitle")}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {MOCK_USERS.map((user) => (
                <li key={user.id}>
                  <Button
                    variant="link"
                    className="h-auto min-h-touch p-0 text-start whitespace-normal"
                    onClick={() => {
                      setEmail(user.email)
                      setPassword(user.password)
                      setStep("password")
                      setError(null)
                    }}
                  >
                    {user.email}
                  </Button>
                  <span className="block text-muted-foreground">
                    {user.twoFactorEnabled
                      ? t("demoAccountant")
                      : t("demoSales")}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Field className="mx-auto max-w-48">
          <FieldLabel htmlFor={`${ids}-language`} className="sr-only">
            {t("language")}
          </FieldLabel>
          <Select
            items={languageItems}
            value={appearance.language}
            onValueChange={(value: Language | null) => {
              if (value) setAppearance({ language: value })
            }}
          >
            <SelectTrigger id={`${ids}-language`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {languageItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
    </main>
  )
}
