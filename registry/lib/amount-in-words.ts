/**
 * Сума прописом для документів (SPEC §11, журнал 1.6; ADR-0015): рахунки, акти, договори.
 *
 * - «Сорок вісім тисяч шістсот гривень 00 копійок» · "Forty-eight thousand six hundred hryvnias 00 kopiykas".
 * - Сума — цілі мінорні одиниці (`Money` з `lib/format`), тож копійки не губляться навіть у великих сумах.
 * - Гривня, долар США, євро — у всіх формах числа (1 гривня, 2 гривні, 5 гривень, 21 гривня); «євро» —
 *   чоловічого роду й не змінюється («один євро»). Іншу валюту передайте в `currencies`.
 * - Мова документа задається явно: вона може відрізнятися від мови інтерфейсу (SPEC §11).
 * - Англійська — британська: "one hundred and five", короткі шкали (billion = 10⁹).
 */
import { currencyDigits, type Money } from "@/registry/lib/format"
import type { Language } from "@/registry/lib/i18n"

type Gender = "masculine" | "feminine"

/** Слова валюти мовою документа: форми однини й множини для основної та мінорної одиниці. */
export interface CurrencyWords {
  /** uk — [1 гривня, 2 гривні, 5 гривень]; en — [one, other]. */
  major: readonly string[]
  minor: readonly string[]
  /** Рід для «один/одна», «два/дві» (лише uk). */
  majorGender?: Gender
  minorGender?: Gender
}

export const CURRENCY_WORDS: Record<
  Language,
  Readonly<Record<string, CurrencyWords>>
> = {
  uk: {
    UAH: {
      major: ["гривня", "гривні", "гривень"],
      minor: ["копійка", "копійки", "копійок"],
      majorGender: "feminine",
      minorGender: "feminine",
    },
    USD: {
      major: ["долар США", "долари США", "доларів США"],
      minor: ["цент", "центи", "центів"],
    },
    EUR: {
      major: ["євро", "євро", "євро"],
      minor: ["євроцент", "євроценти", "євроцентів"],
    },
  },
  en: {
    UAH: { major: ["hryvnia", "hryvnias"], minor: ["kopiyka", "kopiykas"] },
    USD: { major: ["US dollar", "US dollars"], minor: ["cent", "cents"] },
    EUR: { major: ["euro", "euros"], minor: ["cent", "cents"] },
  },
}

export interface AmountInWordsOptions {
  /** Копійки цифрами («00 копійок», за замовчуванням) чи словами («нуль копійок»). */
  minor?: "digits" | "words"
  /** Велика перша літера (за замовчуванням так — сума часто починає речення в документі). */
  capitalize?: boolean
  /** Слова інших валют чи заміна наявних: { PLN: { major: [...], minor: [...] } }. */
  currencies?: Readonly<Record<string, CurrencyWords>>
}

/** Скільки форм слова валюти потрібно: uk — 1, 2, 5; en — однина й множина. */
const FORMS_COUNT: Record<Language, number> = { uk: 3, en: 2 }

const UK_ONES = [
  "",
  "один",
  "два",
  "три",
  "чотири",
  "п'ять",
  "шість",
  "сім",
  "вісім",
  "дев'ять",
]
const UK_FEMININE: Record<number, string> = { 1: "одна", 2: "дві" }
const UK_TEENS = [
  "десять",
  "одинадцять",
  "дванадцять",
  "тринадцять",
  "чотирнадцять",
  "п'ятнадцять",
  "шістнадцять",
  "сімнадцять",
  "вісімнадцять",
  "дев'ятнадцять",
]
const UK_TENS = [
  "",
  "",
  "двадцять",
  "тридцять",
  "сорок",
  "п'ятдесят",
  "шістдесят",
  "сімдесят",
  "вісімдесят",
  "дев'яносто",
]
const UK_HUNDREDS = [
  "",
  "сто",
  "двісті",
  "триста",
  "чотириста",
  "п'ятсот",
  "шістсот",
  "сімсот",
  "вісімсот",
  "дев'ятсот",
]
/** Розряди: тисяча — жіночого роду, решта — чоловічого. */
const UK_SCALES: { forms: readonly string[]; gender: Gender }[] = [
  { forms: ["тисяча", "тисячі", "тисяч"], gender: "feminine" },
  { forms: ["мільйон", "мільйони", "мільйонів"], gender: "masculine" },
  { forms: ["мільярд", "мільярди", "мільярдів"], gender: "masculine" },
  { forms: ["трильйон", "трильйони", "трильйонів"], gender: "masculine" },
]

const EN_ONES = [
  "",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
]
const EN_TENS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
]
const EN_SCALES = ["thousand", "million", "billion", "trillion"]

/** Форма слова після числа (uk): 1, 21 → 0; 2–4, 22 → 1; 0, 5–20, 25 → 2. */
function ukForm(value: bigint): 0 | 1 | 2 {
  const lastTwo = Number(value % 100n)
  const last = lastTwo % 10
  if (lastTwo >= 11 && lastTwo <= 14) return 2
  if (last === 1) return 0
  if (last >= 2 && last <= 4) return 1
  return 2
}

/** Тризначна група uk: 0–999. */
function ukGroup(value: number, gender: Gender): string[] {
  const words = [UK_HUNDREDS[Math.floor(value / 100)]]
  const rest = value % 100
  if (rest >= 10 && rest < 20) words.push(UK_TEENS[rest - 10])
  else {
    words.push(UK_TENS[Math.floor(rest / 10)])
    const one = rest % 10
    words.push(
      gender === "feminine" ? (UK_FEMININE[one] ?? UK_ONES[one]) : UK_ONES[one],
    )
  }
  return words.filter(Boolean)
}

/** Розбиття на групи по три цифри, від молодшої. */
function groupsOf(value: bigint): number[] {
  const groups: number[] = []
  let rest = value
  do {
    groups.push(Number(rest % 1000n))
    rest /= 1000n
  } while (rest > 0n)
  if (groups.length > UK_SCALES.length + 1)
    throw new RangeError(`Завелике число для запису словами: ${value}`)
  return groups
}

function ukNumber(value: bigint, gender: Gender): string {
  if (value === 0n) return "нуль"
  const groups = groupsOf(value)
  const words: string[] = []
  for (let i = groups.length - 1; i >= 0; i--) {
    const group = groups[i]
    if (group === 0) continue
    if (i === 0) {
      words.push(...ukGroup(group, gender))
      continue
    }
    const scale = UK_SCALES[i - 1]
    words.push(
      ...ukGroup(group, scale.gender),
      scale.forms[ukForm(BigInt(group))],
    )
  }
  return words.join(" ")
}

/** Тризначна група en: "six hundred and five". */
function enGroup(value: number): string {
  const hundreds = Math.floor(value / 100)
  const rest = value % 100
  const restWords =
    rest < 20
      ? EN_ONES[rest]
      : [EN_TENS[Math.floor(rest / 10)], EN_ONES[rest % 10]]
          .filter(Boolean)
          .join("-")
  if (!hundreds) return restWords
  return restWords
    ? `${EN_ONES[hundreds]} hundred and ${restWords}`
    : `${EN_ONES[hundreds]} hundred`
}

function enNumber(value: bigint): string {
  if (value === 0n) return "zero"
  const groups = groupsOf(value)
  const words: string[] = []
  for (let i = groups.length - 1; i >= 0; i--) {
    const group = groups[i]
    if (group === 0) continue
    // Британська норма: "one thousand and five" — «and» перед останніми десятками без сотень.
    const and = i === 0 && group < 100 && words.length > 0 ? "and " : ""
    words.push(`${and}${enGroup(group)}${i > 0 ? ` ${EN_SCALES[i - 1]}` : ""}`)
  }
  return words.join(" ")
}

/** Ціле число словами мовою документа; рід — для uk («одна тисяча», «два долари»). */
export function numberInWords(
  value: number | bigint,
  language: Language,
  gender: Gender = "masculine",
): string {
  if (typeof value === "number" && !Number.isSafeInteger(value))
    throw new RangeError(`Очікується ціле число, отримано ${String(value)}`)
  const big = BigInt(value)
  const abs = big < 0n ? -big : big
  const words = language === "uk" ? ukNumber(abs, gender) : enNumber(abs)
  if (big >= 0n) return words
  return `${language === "uk" ? "мінус" : "minus"} ${words}`
}

function unitWord(
  forms: readonly string[],
  value: bigint,
  language: Language,
): string {
  if (language === "uk") return forms[ukForm(value)]
  return value === 1n ? forms[0] : forms[1]
}

/**
 * Сума прописом: { amount: 4860000, currency: "UAH" }, "uk" → «Сорок вісім тисяч шістсот гривень 00 копійок».
 * Невідома валюта без `currencies` — RangeError: сума в документі не може бути без назви валюти.
 */
export function amountInWords(
  money: Money,
  language: Language,
  {
    minor = "digits",
    capitalize = true,
    currencies,
  }: AmountInWordsOptions = {},
): string {
  const currency = money.currency.toUpperCase()
  const words = currencies?.[currency] ?? CURRENCY_WORDS[language][currency]
  if (!words)
    throw new RangeError(`Немає слів для валюти ${currency} (${language})`)
  // Без усіх форм у документ потрапило б «П'ять  00 » — краще помилка.
  const formsCount = FORMS_COUNT[language]
  if (words.major.length < formsCount || words.minor.length < formsCount)
    throw new RangeError(
      `Для валюти ${currency} (${language}) потрібно ${String(formsCount)} форми слова`,
    )
  if (typeof money.amount === "number" && !Number.isSafeInteger(money.amount))
    throw new RangeError(
      `Сума має бути цілим числом мінорних одиниць, отримано ${String(money.amount)}`,
    )
  const digits = currencyDigits(currency)
  const amount = BigInt(money.amount)
  const negative = amount < 0n
  const abs = negative ? -amount : amount
  const scale = 10n ** BigInt(digits)
  const major = abs / scale
  const minorValue = abs % scale

  const parts = [
    numberInWords(major, language, words.majorGender),
    unitWord(words.major, major, language),
  ]
  if (digits > 0) {
    parts.push(
      minor === "words"
        ? numberInWords(minorValue, language, words.minorGender)
        : minorValue.toString().padStart(digits, "0"),
      unitWord(words.minor, minorValue, language),
    )
  }
  if (negative) parts.unshift(language === "uk" ? "мінус" : "minus")
  const text = parts.join(" ")
  return capitalize ? text.charAt(0).toUpperCase() + text.slice(1) : text
}
