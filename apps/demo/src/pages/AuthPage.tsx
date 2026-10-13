import { useEffect, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  AcceptInviteScreen,
  EmailLinkScreen,
  ForgotPasswordScreen,
  ResetPasswordScreen,
  SsoCallbackScreen,
} from "@/registry/erp/account-recovery"
import type { AuthPaths } from "@/registry/erp/auth-layout"
import type { CaptchaRenderer } from "@/registry/erp/captcha"
import { LoginScreen } from "@/registry/erp/login-screen"
import { SignUpScreen } from "@/registry/erp/sign-up-screen"
import { useAppearance } from "@/registry/hooks/use-appearance"
import { LANGUAGES, type Language } from "@/registry/lib/i18n"
import { LANGUAGE_NAMES } from "@/registry/lib/language-names"
import { Button } from "@/registry/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/registry/ui/card"
import { Field, FieldLabel } from "@/registry/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/registry/ui/select"
import { Spinner } from "@/registry/ui/spinner"

import { MOCK_USERS } from "@/mocks/users"
import { AUTH_ROUTES, ROUTES, useSearchParam, type AuthRoute } from "@/router"

import { MockSsoPage } from "./MockSsoPage"

const PATHS: AuthPaths = {
  login: AUTH_ROUTES.login,
  forgot: AUTH_ROUTES.forgot,
  signUp: AUTH_ROUTES.signUp,
  callback: AUTH_ROUTES.callback,
}

/** Демо замість Turnstile: мережі немає, перевірка «проходить» за пів секунди. */
const demoCaptcha: CaptchaRenderer = (props) => <DemoCaptcha {...props} />

function DemoCaptcha({ onToken }: { onToken: (token: string) => void }) {
  const { t } = useTranslation("demo", { keyPrefix: "authDemo" })
  const { t: kitT } = useTranslation("erp-ui")
  const [done, setDone] = useState(false)
  const callback = useRef(onToken)
  useEffect(() => {
    callback.current = onToken
  })
  useEffect(() => {
    const timer = setTimeout(() => {
      setDone(true)
      callback.current("demo-captcha-token")
    }, 500)
    return () => {
      clearTimeout(timer)
    }
  }, [])
  return (
    <div className="space-y-1 rounded-lg border border-dashed p-3 text-sm">
      <p role="status" className="flex items-center gap-2">
        {done ? null : <Spinner aria-hidden />}
        {done ? kitT("auth.captcha.done") : kitT("auth.captcha.checking")}
      </p>
      <p className="text-muted-foreground">{t("captcha")}</p>
    </div>
  )
}

function LanguageSelect() {
  const { t } = useTranslation("demo", { keyPrefix: "authDemo" })
  const ids = useId()
  const [appearance, setAppearance] = useAppearance()
  const items = LANGUAGES.map((value) => ({
    value,
    label: LANGUAGE_NAMES[value],
  }))
  return (
    <Field className="w-48">
      <FieldLabel htmlFor={`${ids}-language`} className="sr-only">
        {t("language")}
      </FieldLabel>
      <Select
        items={items}
        value={appearance.language}
        onValueChange={(value: Language | null) => {
          if (value) setAppearance({ language: value })
        }}
      >
        <SelectTrigger id={`${ids}-language`} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

const HINTS: Record<string, "accountant" | "sales" | "temporary"> = {
  "u-olena": "accountant",
  "u-ivan": "sales",
  "u-marta": "temporary",
}

/**
 * Екрани входу кіта в демо: вибір екрана за адресою, підказки з демо-акаунтами,
 * перемикач мови й демо-перевірка «не бот».
 */
export function AuthPage({
  screen,
  devPanel,
}: {
  screen: AuthRoute
  /** Панель моків — під карткою, щоб не перекривати форму на телефоні. */
  devPanel: React.ReactNode
}) {
  const { t } = useTranslation("demo", { keyPrefix: "authDemo" })
  const token = useSearchParam("token")
  const [prefill, setPrefill] = useState<{
    key: number
    email: string
    password: string
  }>({ key: 0, email: "", password: "" })

  if (screen === "mockSso") return <MockSsoPage />

  const footer = (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <LanguageSelect />
      {devPanel}
    </div>
  )
  const common = { footer, paths: PATHS, afterLogin: ROUTES.data }

  switch (screen) {
    case "forgot":
      return <ForgotPasswordScreen {...common} renderCaptcha={demoCaptcha} />
    case "reset":
      return <ResetPasswordScreen {...common} token={token} />
    case "invite":
      return <AcceptInviteScreen {...common} token={token} />
    case "link":
      return <EmailLinkScreen {...common} token={token} />
    case "signUp":
      return (
        <SignUpScreen
          footer={footer}
          paths={PATHS}
          afterSignUp={ROUTES.data}
          renderCaptcha={demoCaptcha}
        />
      )
    case "callback":
      return <SsoCallbackScreen {...common} />
    default:
      return (
        <LoginScreen
          key={prefill.key}
          {...common}
          renderCaptcha={demoCaptcha}
          defaultValues={{ email: prefill.email, password: prefill.password }}
          footer={
            <>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>
                    <h2>{t("accountsTitle")}</h2>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3 text-sm">
                    {MOCK_USERS.map((user) => (
                      <li key={user.id}>
                        <Button
                          variant="link"
                          className="h-auto min-h-touch p-0 text-start whitespace-normal"
                          onClick={() => {
                            setPrefill((p) => ({
                              key: p.key + 1,
                              email: user.email,
                              password: user.password,
                            }))
                          }}
                        >
                          {t("signInAs", { email: user.email })}
                        </Button>
                        <span className="block text-muted-foreground">
                          {t(HINTS[user.id] ?? "sales")}
                        </span>
                      </li>
                    ))}
                    <li>
                      <a
                        href={`#${AUTH_ROUTES.invite}?token=demo-invite`}
                        className="inline-flex min-h-touch items-center text-primary underline-offset-4 hover:underline"
                      >
                        {t("invite")}
                      </a>
                    </li>
                  </ul>
                </CardContent>
              </Card>
              {footer}
            </>
          }
        />
      )
  }
}
