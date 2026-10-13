/**
 * Телефони будь-яких країн (LC12, рішення власника 13.10.2026): google-libphonenumber — дані Google про номери.
 *
 * - Зберігаємо E.164: "+380671234567".
 * - Українські номери показуємо звичними групами 2-3-2-2: «+380 67 123 45 67»;
 *   інші — міжнародним форматом libphonenumber: «+48 512 345 678».
 * - Ввід без «+» вважаємо номером країни за замовчуванням (Україна): «067 123 45 67» → +380671234567.
 */
import lpn from "google-libphonenumber"

const util = lpn.PhoneNumberUtil.getInstance()
const { PhoneNumberFormat, PhoneNumberUtil } = lpn

export const DEFAULT_PHONE_REGION = "UA"
/** Найбільше цифр у номері E.164. */
const MAX_DIGITS = 15

export type PhoneIssue = "incomplete" | "invalid"

export interface PhoneRegion {
  /** Код країни ISO 3166-1: "UA". */
  region: string
  /** Телефонний код країни: 380. */
  callingCode: number
  /** Назва країни мовою інтерфейсу. */
  name: string
}

export function callingCodeOf(region: string): number {
  return util.getCountryCodeForRegion(region)
}

/** Будь-який ввід → "+" і цифри (те, що зберігаємо), або "" для порожнього. */
export function normalizePhone(
  input: string,
  defaultRegion: string = DEFAULT_PHONE_REGION,
): string {
  const text = input.trim()
  let digits = text.replace(/\D/g, "")
  if (!digits) return text.startsWith("+") ? "+" : ""
  if (!text.startsWith("+")) {
    const code = String(callingCodeOf(defaultRegion))
    if (digits.startsWith("00")) digits = digits.slice(2)
    else if (!digits.startsWith(code)) digits = code + digits.replace(/^0/, "")
  }
  return `+${digits.slice(0, MAX_DIGITS)}`
}

/** Регіон за телефонним кодом на початку номера: "+4851…" → "PL". Для незавершеного коду — null. */
export function regionOfPhone(value: string): string | null {
  const digits = value.replace(/\D/g, "")
  if (value.startsWith("+")) {
    try {
      const parsed = util.parse(value)
      const region: string | undefined = util.getRegionCodeForNumber(parsed)
      if (region && region !== "ZZ") return region
    } catch {
      // Незавершений номер — визначаємо регіон за кодом країни нижче.
    }
  }
  // Коди країн префіксно-вільні (1–3 цифри), тож збіг єдиний.
  for (let len = 1; len <= 3 && len <= digits.length; len++) {
    // "ZZ" — невідомий код (у типах @types/google-libphonenumber його не передбачено).
    const region: string = util.getRegionCodeForCountryCode(
      Number(digits.slice(0, len)),
    )
    if (region !== "ZZ") return region
  }
  return null
}

function groupUa(national: string): string {
  const groups = [2, 3, 2, 2]
  const out: string[] = []
  let rest = national
  for (const size of groups) {
    if (!rest) break
    out.push(rest.slice(0, size))
    rest = rest.slice(size)
  }
  if (rest) out.push(rest)
  return out.join(" ")
}

/** Формат під час введення: "+380671234" → «+380 67 123 4», "+48512" → «+48 512». */
export function formatPhoneAsYouType(value: string): string {
  const e164 = normalizePhone(value)
  if (e164.length <= 1) return e164
  if (e164.startsWith("+380")) {
    const national = e164.slice(4)
    return national ? `+380 ${groupUa(national)}` : "+380"
  }
  const formatter = new lpn.AsYouTypeFormatter("ZZ")
  let out = e164
  for (const ch of e164) out = formatter.inputDigit(ch)
  return out
}

/** Номер для показу (картки, таблиці): «+380 67 123 45 67», «+48 512 345 678». */
export function formatPhone(value: string): string {
  const e164 = normalizePhone(value)
  if (!e164 || e164 === "+") return ""
  if (e164.startsWith("+380")) return `+380 ${groupUa(e164.slice(4))}`
  try {
    return util.format(util.parse(e164), PhoneNumberFormat.INTERNATIONAL)
  } catch {
    return formatPhoneAsYouType(e164)
  }
}

/** Перевірка: null — номер існує (за даними Google) або поле порожнє. */
export function validatePhone(value: string): PhoneIssue | null {
  const e164 = normalizePhone(value)
  if (!e164) return null
  if (e164 === "+") return "incomplete"
  let parsed: lpn.PhoneNumber
  try {
    parsed = util.parse(e164)
  } catch {
    return e164.replace(/\D/g, "").length < 4 ? "incomplete" : "invalid"
  }
  const reason = util.isPossibleNumberWithReason(parsed)
  if (reason === PhoneNumberUtil.ValidationResult.TOO_SHORT) return "incomplete"
  if (reason !== PhoneNumberUtil.ValidationResult.IS_POSSIBLE) return "invalid"
  return util.isValidNumber(parsed) ? null : "invalid"
}

/**
 * Країни для вибору: спершу `priority` (Україна, Польща), далі решта за абеткою мови інтерфейсу.
 * `exclude` прибирає країни зі списку; номери з їхніми кодами все одно розбираються.
 */
export function phoneRegions(
  locale: string,
  {
    priority = ["UA", "PL"],
    exclude = [],
  }: { priority?: readonly string[]; exclude?: readonly string[] } = {},
): PhoneRegion[] {
  const names = new Intl.DisplayNames([locale], { type: "region" })
  const collator = new Intl.Collator(locale)
  const all = util
    .getSupportedRegions()
    .filter((region) => !exclude.includes(region))
    .map((region) => ({
      region,
      callingCode: callingCodeOf(region),
      name: names.of(region) ?? region,
    }))
  const first = priority.flatMap((r) => all.filter((it) => it.region === r))
  const rest = all
    .filter((it) => !priority.includes(it.region))
    .sort((a, b) => collator.compare(a.name, b.name))
  return [...first, ...rest]
}
