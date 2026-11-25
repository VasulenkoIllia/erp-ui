import { useEffect, useRef, useState, type ReactNode } from "react"

import { AuthCard } from "@/registry/erp/auth-card"
import { FormSelect } from "@/registry/erp/form-select"
import {
  LoginForm,
  SetPasswordForm,
  type AuthFormFailure,
  type LoginFormValues,
} from "@/registry/erp/login-form"
import { useErpUiT } from "@/registry/lib/i18n"
import { ukSignIn } from "@/registry/lib/i18n-uk-sign-in"
import { Button } from "@/registry/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/registry/ui/card"
import { useDemoTranslation } from "@/i18n"
import { ukLightAuthPage } from "@/i18n/pages"

import { AUTH_ROUTES } from "@/router"

/** Демо-сервер проекту: логін і пароль, з якими вхід вдається (у проекті — свій сервер, ADR-0099). */
const DEMO_LOGIN = "manager"
const DEMO_EMAIL = "manager@demo.example"
const DEMO_PASSWORD = "demo-password-12"
/** Мінімум нового пароля, як у проекті зі своїм сервером. */
const MIN_PASSWORD = 12
const RETRY_AFTER_SECONDS = 30
const SERVER_DELAY_MS = 600

/** Успіх демо-сервера: форма з кнопкою у фокусі зникла, тож фокус — на повідомленні (скрінрідер його прочитає). */
function DoneMessage({
  text,
  children,
}: {
  text: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="space-y-3 focus-visible:outline-none"
    >
      <p role="status">{text}</p>
      {children}
    </div>
  )
}

const wait = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

/**
 * Відповідь «сервера» на вхід: так проект перетворює статус і `Retry-After` свого сервера на причину відмови.
 * `offline` — збій мережі, як у `fetch` (`TypeError`).
 */
async function demoLogin({
  identifier,
  password,
}: LoginFormValues): Promise<AuthFormFailure | undefined> {
  await wait(SERVER_DELAY_MS)
  if (identifier === "offline") throw new TypeError("Failed to fetch")
  if (identifier === "limit")
    return { kind: "rateLimited", retryAfterSeconds: RETRY_AFTER_SECONDS }
  if (identifier === "budget") return { kind: "rateLimited" }
  if (identifier === "server") return { kind: "server" }
  const known = identifier === DEMO_LOGIN || identifier === DEMO_EMAIL
  return known && password === DEMO_PASSWORD
    ? undefined
    : { kind: "credentials" }
}

type IdentifierKind = "login" | "email"
type LinkState = "valid" | "expired"

const linkClass =
  "inline-flex min-h-touch items-center text-primary underline-offset-4 hover:underline"

/**
 * Легкий набір у демо (erp/login-form, erp/auth-card, ADR-0099): вхід логіном чи email і новий пароль за
 * посиланням. Сервер — у сторінці; підказки під карткою кажуть, що ввести для кожного стану.
 */
export function LightAuthPage({
  screen,
  language,
}: {
  screen: "lightLogin" | "lightPassword"
  /** Перемикач мови сторінок входу демо. */
  language: React.ReactNode
}) {
  const t = useErpUiT(ukSignIn)
  const { t: pageT } = useDemoTranslation([ukLightAuthPage], {
    keyPrefix: "lightAuthPage",
  })
  const [identifier, setIdentifier] = useState<IdentifierKind>("login")
  const [link, setLink] = useState<LinkState>("valid")
  const [done, setDone] = useState<string>()

  const hints =
    screen === "lightLogin" ? (
      <Card size="sm">
        <CardHeader>
          <CardTitle>
            <h2>{pageT("hintsTitle")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <FormSelect
            aria-label={pageT("identifierLabel")}
            items={[
              { value: "login", label: pageT("identifierLogin") },
              { value: "email", label: pageT("identifierEmail") },
            ]}
            value={identifier}
            onValueChange={(value: IdentifierKind) => {
              setIdentifier(value)
              setDone(undefined)
            }}
          />
          <ul className="list-disc space-y-1 pl-4">
            <li>
              {pageT("valid", {
                login: identifier === "login" ? DEMO_LOGIN : DEMO_EMAIL,
                password: DEMO_PASSWORD,
              })}
            </li>
            <li>{pageT("limit")}</li>
            <li>{pageT("budget")}</li>
            <li>{pageT("offline")}</li>
            <li>{pageT("server")}</li>
          </ul>
          <a href={`#${AUTH_ROUTES.login}`} className={linkClass}>
            {pageT("kitLogin")}
          </a>
        </CardContent>
      </Card>
    ) : (
      <Card size="sm">
        <CardHeader>
          <CardTitle>
            <h2>{pageT("hintsTitle")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <FormSelect
            aria-label={pageT("linkLabel")}
            items={[
              { value: "valid", label: pageT("linkValid") },
              { value: "expired", label: pageT("linkExpired") },
            ]}
            value={link}
            onValueChange={(value: LinkState) => {
              setLink(value)
              setDone(undefined)
            }}
          />
          <a href={`#${AUTH_ROUTES.lightLogin}`} className={linkClass}>
            {pageT("toLogin")}
          </a>
        </CardContent>
      </Card>
    )

  const footer = (
    <>
      {hints}
      <div className="flex justify-center">{language}</div>
    </>
  )

  if (screen === "lightPassword")
    return (
      <AuthCard
        title={t("auth.reset.title")}
        description={pageT("passwordLead", { min: MIN_PASSWORD })}
        footer={footer}
      >
        {done ? (
          <DoneMessage text={done}>
            <a href={`#${AUTH_ROUTES.lightLogin}`} className={linkClass}>
              {pageT("toLogin")}
            </a>
          </DoneMessage>
        ) : (
          <SetPasswordForm
            minLength={MIN_PASSWORD}
            context={[DEMO_LOGIN]}
            onSubmit={async () => {
              await wait(SERVER_DELAY_MS)
              if (link === "expired") return { kind: "linkInvalid" }
              setDone(pageT("saved"))
              return undefined
            }}
          />
        )}
      </AuthCard>
    )

  return (
    <AuthCard
      title={t("auth.title")}
      description={pageT("loginLead")}
      footer={footer}
    >
      {done ? (
        <DoneMessage text={done}>
          <Button
            variant="outline"
            onClick={() => {
              setDone(undefined)
            }}
          >
            {pageT("again")}
          </Button>
        </DoneMessage>
      ) : (
        <LoginForm
          key={identifier}
          identifier={identifier}
          forgotPassword={
            <a
              href={`#${AUTH_ROUTES.lightPassword}`}
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              {t("auth.forgot")}
            </a>
          }
          onSubmit={async (values) => {
            const failure = await demoLogin(values)
            if (!failure)
              setDone(pageT("signedIn", { login: values.identifier }))
            return failure
          }}
        />
      )}
    </AuthCard>
  )
}
