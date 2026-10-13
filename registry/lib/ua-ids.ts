/**
 * Українські ідентифікатори LC12 (SPEC §11, §15): ЄДРПОУ (8), РНОКПП (10), ІПН платника ПДВ (12), IBAN UA (29).
 *
 * - `normalizeUaId` — те, що зберігаємо: лише цифри (IBAN — "UA" + 27 цифр), без пробілів.
 * - `validateUaId` — код проблеми або null; текст помилки — у рядках кіта `validation.<вид>.<код>`.
 *   Порожнє значення не перевіряємо: обов'язковість поля — справа форми.
 * - Контрольні суми:
 *   ЄДРПОУ і РНОКПП — як у python-stdnum (stdnum.ua.edrpou, stdnum.ua.rntrc);
 *   ІПН платника ПДВ — ваги 11, 13, 17 … 47, остача від 11 за модулем 10 (звірено на номері 143605704021);
 *   IBAN — ISO 13616, mod 97.
 */

export type UaIdKind = "edrpou" | "rnokpp" | "vatIpn" | "iban"
export type UaIdIssue = "length" | "checksum" | "country"

export const UA_ID_LENGTH: Record<UaIdKind, number> = {
  edrpou: 8,
  rnokpp: 10,
  vatIpn: 12,
  /** Цифр після "UA". */
  iban: 27,
}

const digitsOnly = (value: string) => value.replace(/\D/g, "")

function weightedSum(digits: string, weights: readonly number[]): number {
  return weights.reduce((sum, w, i) => sum + w * Number(digits[i]), 0)
}

/** Контрольна цифра ЄДРПОУ за першими сімома цифрами. */
export function edrpouCheckDigit(first7: string): number {
  let weights = [1, 2, 3, 4, 5, 6, 7]
  // Коди від 30000000 до 59999999 мають інший порядок ваг.
  if (/^[345]/.test(first7)) weights = [7, 1, 2, 3, 4, 5, 6]
  const check = weightedSum(first7, weights) % 11
  if (check < 10) return check
  return (
    (weightedSum(
      first7,
      weights.map((w) => w + 2),
    ) %
      11) %
    10
  )
}

/** Контрольна цифра РНОКПП за першими дев'ятьма цифрами. */
export function rnokppCheckDigit(first9: string): number {
  return (weightedSum(first9, [-1, 5, 7, 9, 4, 6, 10, 5, 7]) % 11) % 10
}

/** Контрольна цифра ІПН платника ПДВ за першими одинадцятьма цифрами. */
export function vatIpnCheckDigit(first11: string): number {
  return (
    (weightedSum(first11, [11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47]) % 11) %
    10
  )
}

/** IBAN UA зі сміттям і пробілами → "UA" + цифри; також приймає лише цифри без "UA". */
export function normalizeIban(value: string): string {
  const compact = value.toUpperCase().replace(/[^0-9A-Z]/g, "")
  const digits = digitsOnly(
    compact.startsWith("UA") ? compact.slice(2) : compact,
  )
  return digits || compact.startsWith("UA") ? `UA${digits}` : ""
}

export function normalizeUaId(kind: UaIdKind, value: string): string {
  return kind === "iban" ? normalizeIban(value) : digitsOnly(value)
}

/** mod 97 за ISO 13616: перші чотири символи — в кінець, літери → 10…35. */
function ibanMod97(iban: string): number {
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  let remainder = 0
  for (const ch of rearranged) {
    const code = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55)
    for (const d of code) remainder = (remainder * 10 + Number(d)) % 97
  }
  return remainder
}

export function validateUaId(kind: UaIdKind, value: string): UaIdIssue | null {
  if (kind === "iban") {
    const compact = value.toUpperCase().replace(/[\s-]/g, "")
    if (!compact) return null
    if (/^[A-Z]{2}/.test(compact) && !compact.startsWith("UA")) return "country"
    const iban = normalizeIban(compact)
    if (iban.length !== 2 + UA_ID_LENGTH.iban) return "length"
    return ibanMod97(iban) === 1 ? null : "checksum"
  }
  const digits = digitsOnly(value)
  if (!value.trim()) return null
  if (digits.length !== UA_ID_LENGTH[kind] || /[^\d\s]/.test(value))
    return "length"
  const body = digits.slice(0, -1)
  const check = Number(digits.at(-1))
  const expected =
    kind === "edrpou"
      ? edrpouCheckDigit(body)
      : kind === "rnokpp"
        ? rnokppCheckDigit(body)
        : vatIpnCheckDigit(body)
  return check === expected ? null : "checksum"
}

/** IBAN для показу: групи по 4 символи — «UA21 3223 1300 0002 6007 2335 6600 1». */
export function formatIban(value: string): string {
  return normalizeIban(value).replace(/(.{4})(?=.)/g, "$1 ")
}

/** Код банку (МФО) з IBAN UA: символи 5–10. */
export function ibanBankCode(value: string): string | null {
  const iban = normalizeIban(value)
  return iban.length >= 10 ? iban.slice(4, 10) : null
}
