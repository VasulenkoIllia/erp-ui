/**
 * Підказка надійності пароля (ADR-0010) — лише підказка під полем; правила задає сервер (422).
 *
 * Без важких словників (zxcvbn — ~800 КБ): довжина, різноманітність символів, повтори й
 * послідовності, збіг з email чи ім'ям. Довга фраза з кількох слів — надійна, навіть без цифр.
 */

export const PASSWORD_MIN_LENGTH = 10

export type PasswordStrength = 0 | 1 | 2 | 3
/** 0 — закороткий, 1 — слабкий, 2 — середній, 3 — надійний. */
export const PASSWORD_STRENGTH_KEYS = [
  "tooShort",
  "weak",
  "fair",
  "strong",
] as const

const SEQUENCES = [
  "0123456789",
  "abcdefghijklmnopqrstuvwxyz",
  "qwertyuiopasdfghjklzxcvbnm",
  "йцукенгшщзхїфівапролджєячсмитьбю",
]

const COMMON = [
  "password",
  "qwerty",
  "admin",
  "letmein",
  "welcome",
  "пароль",
  "україна",
]

function hasSequence(value: string, length = 4): boolean {
  const lower = value.toLocaleLowerCase("uk")
  for (let i = 0; i + length <= lower.length; i++) {
    const part = lower.slice(i, i + length)
    if (/^(.)\1+$/u.test(part)) return true
    if (
      SEQUENCES.some(
        (seq) =>
          seq.includes(part) || seq.includes([...part].reverse().join("")),
      )
    )
      return true
  }
  return false
}

/** Надійність пароля; `context` — email, ім'я, назва компанії, яких у паролі бути не повинно. */
export function passwordStrength(
  password: string,
  context: string[] = [],
): PasswordStrength {
  if (password.length < PASSWORD_MIN_LENGTH) return 0
  const lower = password.toLocaleLowerCase("uk")
  const personal = context
    .flatMap((value) => value.toLocaleLowerCase("uk").split(/[\s@.]+/))
    .filter((part) => part.length >= 3)
  if (
    COMMON.some((word) => lower.includes(word)) ||
    personal.some((part) => lower.includes(part))
  )
    return 1

  const classes = [/\p{Ll}/u, /\p{Lu}/u, /\p{Nd}/u, /[^\p{L}\p{Nd}]/u].filter(
    (re) => re.test(password),
  ).length
  const words = password.trim().split(/\s+/).length
  let score = 0
  if (password.length >= 12) score++
  if (password.length >= 16 || words >= 4) score++
  if (classes >= 3) score++
  if (classes === 4 || password.length >= 20) score++
  if (hasSequence(password)) score--
  return Math.max(1, Math.min(3, score)) as PasswordStrength
}
