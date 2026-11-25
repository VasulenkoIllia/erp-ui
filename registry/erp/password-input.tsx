import { useAuthMethods } from "@/registry/erp/auth-layout"
import {
  PasswordInput,
  PasswordStrengthMeter,
  type PasswordStrengthMeterProps,
} from "@/registry/erp/password-field"
import { PASSWORD_MIN_LENGTH } from "@/registry/lib/password"

/**
 * Підказка надійності під полем нового пароля на екранах входу кіта: мінімум довжини — з політики
 * організації (`GET /auth/methods`, ADR-0012), без неї — типовий кіта. Поле й смужка — erp/password-field.
 */
export function PasswordStrength(
  props: Omit<PasswordStrengthMeterProps, "minLength">,
) {
  const minLength =
    useAuthMethods().data?.passwordPolicy?.minLength ?? PASSWORD_MIN_LENGTH
  return <PasswordStrengthMeter {...props} minLength={minLength} />
}

export { PasswordInput }
