import * as React from "react"
import { EyeIcon, EyeOffIcon } from "lucide-react"

import { useErpUiT } from "@/registry/lib/i18n"
import { ukSignIn } from "@/registry/lib/i18n-uk-sign-in"
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_STRENGTH_KEYS,
  passwordStrength,
} from "@/registry/lib/password"
import { cn } from "@/registry/lib/utils"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/registry/ui/input-group"

/*
 * Поле пароля й підказка надійності без входу кіта: файл не тягне ra-core й провайдер входу, тож їх бере
 * і проект зі своїм сервером (ADR-0099). Екрани входу кіта беруть їх через erp/password-input.
 */

/**
 * Поле пароля (ADR-0010): кнопка «Показати пароль» замість поля «Повторіть пароль»
 * (WCAG 3.3.7 — не просимо вводити те саме двічі). Автозаповнення менеджерами паролів:
 * `autoComplete="current-password"` для входу, `"new-password"` — для нового.
 */
export function PasswordInput({
  className,
  ...props
}: Omit<React.ComponentProps<typeof InputGroupInput>, "type">) {
  const t = useErpUiT(ukSignIn)
  const [visible, setVisible] = React.useState(false)
  return (
    <InputGroup className={className}>
      <InputGroupInput
        type={visible ? "text" : "password"}
        spellCheck={false}
        autoCapitalize="none"
        {...props}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-sm"
          aria-label={visible ? t("auth.hidePassword") : t("auth.showPassword")}
          aria-pressed={visible}
          onClick={() => {
            setVisible((v) => !v)
          }}
        >
          {visible ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}

const BAR_TONES = [
  "bg-destructive",
  "bg-destructive",
  "bg-warning",
  "bg-success",
] as const

export interface PasswordStrengthMeterProps {
  password: string
  context?: string[]
  /** Мінімум довжини, символів. */
  minLength?: number
  id?: string
  className?: string
}

/**
 * Підказка надійності під полем нового пароля: смужка й текст (не лише колір).
 * `context` — логін, email, ім'я, назва компанії, яких у паролі бути не повинно; `minLength` — мінімум
 * довжини (за замовчуванням типовий кіта). Мінімум із політики сервера кіта бере `PasswordStrength`
 * з erp/password-input.
 */
export function PasswordStrengthMeter({
  password,
  context,
  minLength = PASSWORD_MIN_LENGTH,
  id,
  className,
}: PasswordStrengthMeterProps) {
  const t = useErpUiT(ukSignIn)
  const strength = passwordStrength(password, context, minLength)
  const key = PASSWORD_STRENGTH_KEYS[strength]
  const value =
    key === "tooShort"
      ? t("auth.strength.tooShort", { min: minLength })
      : t(`auth.strength.${key}`)
  return (
    <div
      id={id}
      data-slot="password-strength"
      data-strength={strength}
      className={cn("space-y-1.5", className)}
    >
      <div className="grid grid-cols-3 gap-1" aria-hidden>
        {[1, 2, 3].map((level) => (
          <span
            key={level}
            className={cn(
              "h-1 rounded-full",
              password && strength >= level ? BAR_TONES[strength] : "bg-muted",
            )}
          />
        ))}
      </div>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {password
          ? t("auth.strength.label", { value })
          : t("auth.strength.hint")}
      </p>
    </div>
  )
}
