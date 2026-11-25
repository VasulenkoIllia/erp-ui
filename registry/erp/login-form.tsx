import * as React from "react"

import {
  PasswordInput,
  PasswordStrengthMeter,
} from "@/registry/erp/password-field"
import {
  formatMinutesSeconds,
  useCountdown,
} from "@/registry/hooks/use-countdown"
import { useErpUiT, type ErpUiTranslate } from "@/registry/lib/i18n"
import { ukSignIn } from "@/registry/lib/i18n-uk-sign-in"
import { PASSWORD_MIN_LENGTH } from "@/registry/lib/password"
import { cn } from "@/registry/lib/utils"
import { Alert, AlertDescription } from "@/registry/ui/alert"
import { Button } from "@/registry/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"
import { Spinner } from "@/registry/ui/spinner"

/**
 * Вхід і новий пароль для проекту зі своїм сервером і своїм входом (легкий набір, ADR-0099): без ra-core
 * і провайдера входу кіта. Форма збирає поля, перевіряє їх, показує зайнятість і помилки; запит на сервер
 * і перехід після успіху робить проект у `onSubmit`. Сторінку дає `AuthCard` (erp/auth-card).
 *
 *   <AuthCard title={t("auth.title")}>
 *     <LoginForm
 *       onSubmit={async ({ identifier, password }) => {
 *         const res = await fetch("/api/auth/login", { method: "POST", … })
 *         if (res.ok) { navigate("/"); return }
 *         if (res.status === 401) return { kind: "credentials" }
 *         if (res.status === 429)
 *           return { kind: "rateLimited", retryAfterSeconds: Number(res.headers.get("Retry-After")) || undefined }
 *         return { kind: "server" }
 *       }}
 *     />
 *   </AuthCard>
 *
 * - `onSubmit` нічого не повертає — успіх: форма лишається зайнятою, доки проект переходить далі чи прибирає
 *   її. Повертає `AuthFormFailure` — форма знову доступна й показує причину своїм текстом мовою інтерфейсу
 *   (текст сервера англійською людині не показуємо). Кидає (також синхронно) — «Немає з'єднання» для збою
 *   мережі (`TypeError` від `fetch`) і «Помилка сервера» для решти; саму помилку видно в консолі.
 * - «Забагато спроб» із `retryAfterSeconds` (заголовок `Retry-After`): кнопка чекає з відліком, далі знову
 *   доступна, а текст зникає. Без секунд чи довше за годину — лише текст «Спробуйте пізніше».
 * - Порожні поля й закороткий пароль — помилка біля поля й фокус на ньому, запит не йде. Повторне натискання,
 *   поки запит іде, нічого не робить.
 */

/** Чому сервер не прийняв форму: проект перетворює відповідь свого сервера на цей тип. */
export type AuthFormFailure =
  /** Невірний логін (email) чи пароль. */
  | { kind: "credentials" }
  /** Забагато спроб; `retryAfterSeconds` — з `Retry-After`. */
  | { kind: "rateLimited"; retryAfterSeconds?: number }
  /** Посилання запрошення чи скидання пароля недійсне, застаріло чи вже використане. */
  | { kind: "linkInvalid" }
  | { kind: "offline" }
  | { kind: "server" }
  /** Свій текст проекту мовою інтерфейсу. */
  | { kind: "message"; message: string }

/** Довше за це відліку не показуємо: кнопка доступна, текст «Спробуйте пізніше». */
const MAX_RETRY_COUNTDOWN_SECONDS = 3600

function retrySeconds(failure: AuthFormFailure | undefined): number {
  if (failure?.kind !== "rateLimited") return 0
  const seconds = failure.retryAfterSeconds ?? 0
  return Number.isFinite(seconds) &&
    seconds > 0 &&
    seconds <= MAX_RETRY_COUNTDOWN_SECONDS
    ? Math.ceil(seconds)
    : 0
}

function failureText(
  t: ErpUiTranslate,
  failure: AuthFormFailure,
  identifier: "login" | "email",
): string {
  switch (failure.kind) {
    case "credentials":
      return identifier === "login"
        ? t("auth.invalidLogin")
        : t("auth.invalidCredentials")
    case "rateLimited": {
      const seconds = retrySeconds(failure)
      return seconds
        ? t("auth.tooManyAttemptsIn", { time: formatMinutesSeconds(seconds) })
        : t("auth.tooManyAttempts")
    }
    case "linkInvalid":
      return t("auth.link.expired")
    case "offline":
      return t("apiErrors.offline")
    case "server":
      return t("apiErrors.server")
    case "message":
      if (failure.message.trim()) return failure.message
      break
  }
  // Невідома причина чи порожній текст (код проекту на JS, `as`): людина бачить хоча б «Помилка сервера».
  return t("apiErrors.server")
}

/**
 * Відправка форми: один запит за раз, причина відмови, відлік після «Забагато спроб». Після успіху форма
 * лишається зайнятою: поки проект переходить далі, другий запит не піде (одноразове посилання не згорить двічі).
 */
function useAuthFormSubmit<TValues>(
  onSubmit: (values: TValues) => Promise<AuthFormFailure | undefined>,
) {
  const [busy, setBusy] = React.useState(false)
  const [failure, setFailure] = React.useState<AuthFormFailure>()
  const pending = React.useRef(false)
  const { secondsLeft, start } = useCountdown()

  const submit = (values: TValues) => {
    if (pending.current || secondsLeft > 0) return
    pending.current = true
    setBusy(true)
    setFailure(undefined)
    // Через Promise.resolve синхронний виняток з onSubmit іде тим самим шляхом, що й відхилений запит.
    void Promise.resolve()
      .then(() => onSubmit(values))
      .catch((error: unknown): AuthFormFailure => {
        console.error("erp-ui: sign-in request failed", error)
        return error instanceof TypeError
          ? { kind: "offline" }
          : { kind: "server" }
      })
      .then((result) => {
        if (!result) return
        pending.current = false
        setBusy(false)
        setFailure(result)
        const seconds = retrySeconds(result)
        if (seconds) start(seconds)
      })
  }
  // Відлік скінчився — «Спробуйте через 0:30» уже неправда, а кнопка знову доступна.
  const expired = retrySeconds(failure) > 0 && secondsLeft === 0
  return { busy, failure: expired ? undefined : failure, secondsLeft, submit }
}

/** Текст поля форми за його `name`; поля немає — порожній рядок. */
function formText(form: HTMLFormElement, name: string): string {
  const field = form.elements.namedItem(name)
  return field instanceof HTMLInputElement ? field.value : ""
}

function SubmitButton({
  busy,
  secondsLeft,
  children,
}: {
  busy: boolean
  secondsLeft: number
  children: React.ReactNode
}) {
  return (
    <Button
      type="submit"
      className="w-full"
      disabled={busy || secondsLeft > 0}
      focusableWhenDisabled
      aria-busy={busy || undefined}
    >
      {busy ? <Spinner aria-hidden /> : null}
      {children}
      {secondsLeft > 0 ? (
        <span aria-hidden className="tabular-nums">
          {formatMinutesSeconds(secondsLeft)}
        </span>
      ) : null}
    </Button>
  )
}

function FailureAlert({ text }: { text: string | undefined }) {
  return text ? (
    <Alert variant="destructive" role="alert">
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  ) : null
}

export interface LoginFormValues {
  /** Логін чи email без пробілів на краях. */
  identifier: string
  password: string
}

type LoginField = "identifier" | "password"
const LOGIN_FIELDS: readonly LoginField[] = ["identifier", "password"]

export interface LoginFormProps {
  /** Перше поле: логін (за замовчуванням) чи email — підпис, тип поля й автозаповнення. */
  identifier?: "login" | "email"
  onSubmit: (values: LoginFormValues) => Promise<AuthFormFailure | undefined>
  /** Поруч із підписом пароля: посилання «Забули пароль?». */
  forgotPassword?: React.ReactNode
  className?: string
}

/** Вхід логіном (чи email) і паролем для свого сервера проекту (ADR-0099). */
export function LoginForm({
  identifier: kind = "login",
  onSubmit,
  forgotPassword,
  className,
}: LoginFormProps) {
  const t = useErpUiT(ukSignIn)
  const ids = React.useId()
  const [missing, setMissing] = React.useState<Record<LoginField, boolean>>({
    identifier: false,
    password: false,
  })
  const { busy, failure, secondsLeft, submit } = useAuthFormSubmit(onSubmit)
  const fieldId = (field: LoginField) => `${ids}-${field}`
  const invalid = (field: LoginField) =>
    missing[field]
      ? { "aria-invalid": true, "aria-describedby": `${fieldId(field)}-error` }
      : {}
  const typed = (field: LoginField) => () => {
    if (missing[field])
      setMissing((current) => ({ ...current, [field]: false }))
  }

  return (
    <form
      className={cn("space-y-4", className)}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        // Значення — з полів, а не зі стану: менеджер паролів може вставити їх без події введення.
        const values = {
          identifier: formText(event.currentTarget, "username").trim(),
          password: formText(event.currentTarget, "password"),
        }
        const next = {
          identifier: !values.identifier,
          password: !values.password,
        }
        setMissing(next)
        const first = LOGIN_FIELDS.find((field) => next[field])
        if (first) document.getElementById(fieldId(first))?.focus()
        else submit(values)
      }}
    >
      <FailureAlert text={failure && failureText(t, failure, kind)} />
      <FieldGroup>
        <Field data-invalid={missing.identifier || undefined}>
          <FieldLabel htmlFor={`${ids}-identifier`}>
            {kind === "login" ? t("auth.login") : t("auth.email")}
          </FieldLabel>
          <Input
            id={fieldId("identifier")}
            name="username"
            type={kind === "login" ? "text" : "email"}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={typed("identifier")}
            {...invalid("identifier")}
          />
          {missing.identifier ? (
            <FieldError id={`${fieldId("identifier")}-error`}>
              {t("auth.fieldErrors.required")}
            </FieldError>
          ) : null}
        </Field>
        <Field data-invalid={missing.password || undefined}>
          <div className="flex items-baseline justify-between gap-2">
            <FieldLabel htmlFor={fieldId("password")}>
              {t("auth.password")}
            </FieldLabel>
            {forgotPassword}
          </div>
          <PasswordInput
            id={fieldId("password")}
            name="password"
            autoComplete="current-password"
            onChange={typed("password")}
            {...invalid("password")}
          />
          {missing.password ? (
            <FieldError id={`${fieldId("password")}-error`}>
              {t("auth.fieldErrors.required")}
            </FieldError>
          ) : null}
        </Field>
      </FieldGroup>
      <SubmitButton busy={busy} secondsLeft={secondsLeft}>
        {t("auth.signIn")}
      </SubmitButton>
    </form>
  )
}

export interface SetPasswordFormProps {
  onSubmit: (values: {
    password: string
  }) => Promise<AuthFormFailure | undefined>
  /** Мінімум довжини пароля, символів; за замовчуванням — типовий кіта. */
  minLength?: number
  /** Логін, ім'я, email — їх не повинно бути в паролі (підказка надійності). */
  context?: string[]
  /** Текст кнопки; за замовчуванням «Зберегти пароль». */
  submitLabel?: string
  /** Поля перед паролем (ім'я в запрошенні). */
  children?: React.ReactNode
  className?: string
}

/**
 * Новий пароль за посиланням запрошення чи скидання (ADR-0099): поле з «Показати пароль», підказка
 * надійності, мінімум довжини проекту. Токен із посилання читає проект (`/invite#токен`: `location.hash`) і
 * надсилає сам; недійсне посилання — `{ kind: "linkInvalid" }`.
 */
export function SetPasswordForm({
  onSubmit,
  minLength = PASSWORD_MIN_LENGTH,
  context,
  submitLabel,
  children,
  className,
}: SetPasswordFormProps) {
  const t = useErpUiT(ukSignIn)
  const ids = React.useId()
  const [password, setPassword] = React.useState("")
  const [fieldMessage, setFieldMessage] = React.useState<string>()
  const { busy, failure, secondsLeft, submit } = useAuthFormSubmit(onSubmit)

  return (
    <form
      className={cn("space-y-4", className)}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        const message = !password
          ? t("auth.fieldErrors.required")
          : password.length < minLength
            ? t("auth.passwordTooShort", { min: minLength })
            : undefined
        setFieldMessage(message)
        if (message) document.getElementById(`${ids}-password`)?.focus()
        else submit({ password })
      }}
    >
      <FailureAlert text={failure && failureText(t, failure, "login")} />
      <FieldGroup>
        {children}
        <Field data-invalid={fieldMessage ? true : undefined}>
          <FieldLabel htmlFor={`${ids}-password`}>
            {t("auth.reset.password")}
          </FieldLabel>
          <PasswordInput
            id={`${ids}-password`}
            name="password"
            autoComplete="new-password"
            value={password}
            aria-invalid={fieldMessage ? true : undefined}
            aria-describedby={`${fieldMessage ? `${ids}-error ` : ""}${ids}-strength`}
            onChange={(event) => {
              setPassword(event.target.value)
              setFieldMessage(undefined)
            }}
          />
          {fieldMessage ? (
            <FieldError id={`${ids}-error`}>{fieldMessage}</FieldError>
          ) : null}
          <PasswordStrengthMeter
            id={`${ids}-strength`}
            password={password}
            context={context}
            minLength={minLength}
          />
        </Field>
      </FieldGroup>
      <SubmitButton busy={busy} secondsLeft={secondsLeft}>
        {submitLabel ?? t("auth.reset.submit")}
      </SubmitButton>
    </form>
  )
}
