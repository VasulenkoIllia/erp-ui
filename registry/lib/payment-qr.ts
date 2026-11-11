/**
 * QR-код платіжної інструкції НБУ для рахунку (K2a, ADR-0070; рішення власника на кроці PF08a): посилання,
 * яке банківський застосунок відкриває заповненим переказом — отримувач, IBAN, код, сума й призначення.
 *
 * Формат 003 (з 01.11.2025), як його будують відкриті бібліотеки формату: 17 рядків через LF — `BCD`, `003`, кодування `1` (UTF-8), функція `UCT` (кредитовий переказ), порожній
 * ідентифікатор, назва отримувача (до 140), IBAN `UA` + 27 цифр, сума `UAH<гривні>[.<копійки>]` без зайвих
 * нулів (порожня — суму вводить платник), код ЄДРПОУ (8) чи РНОКПП (10), порожня категорія й референс,
 * призначення (до 420), порожні відображення, маска полів, строк дії, дата створення й підпис. Байти UTF-8
 * кодуються base64url без `=` і йдуть після `NBU_QR_URL_PREFIX`.
 *
 * Лише гривня: інша валюта чи неповні реквізити — причина (`issue`), а не код, який банк не прочитає.
 * Перед першим проектом код перевіряють скануванням у банківських застосунках (`docs/using-erp-ui.md`).
 */
import { validateUaId, normalizeIban } from "@/registry/lib/ua-ids"

/** Початок посилання платіжного QR НБУ; дані — після нього. */
export const NBU_QR_URL_PREFIX = "https://bank.gov.ua/qr/"

/** Межі формату 003 у символах. */
export const NBU_QR_LIMITS = { name: 140, purpose: 420 } as const

/** Найбільша сума, яку приймає формат: 999 999 999,99 грн у копійках. */
const MAX_AMOUNT_KOPECKS = 99_999_999_999

/**
 * Керівні символи й роздільники рядків Unicode: рядки інструкції йдуть через LF, тож перенос у назві чи
 * призначенні зсунув би решту полів (на місці IBAN став би текст із назви).
 */
const CONTROL_CHARS = /[\p{Cc}\p{Zl}\p{Zp}]/u

/** Текст поля без керівних символів і в межах довжини. */
const isPlainText = (text: string, limit: number) =>
  text !== "" && [...text].length <= limit && !CONTROL_CHARS.test(text)

export interface PaymentQrInput {
  /** Назва отримувача, як у банку. */
  readonly name: string
  readonly iban: string
  /** ЄДРПОУ (8 цифр) чи РНОКПП (10). */
  readonly code: string
  /** Сума в копійках; `null` — суму вводить платник. */
  readonly amount: number | null
  readonly currency: string
  /** Призначення платежу: «Оплата за рахунком № … від …, у т.ч. ПДВ …». */
  readonly purpose: string
}

/**
 * Чому QR не будується: не гривня, немає чи хибні IBAN, код, назва, призначення (порожні, задовгі, з
 * переносом рядка чи іншим керівним символом), сума поза межами.
 */
export type PaymentQrIssue =
  "currency" | "iban" | "code" | "name" | "purpose" | "amount"

export type PaymentQr =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly issue: PaymentQrIssue }

/** «UAH1500», «UAH1500.5», «UAH1500.05»: копійки без зайвих нулів, як у бібліотек формату. */
function amountField(kopecks: number): string {
  const whole = Math.trunc(kopecks / 100)
  const cents = kopecks % 100
  if (cents === 0) return `UAH${String(whole)}`
  const fraction = String(cents).padStart(2, "0").replace(/0$/, "")
  return `UAH${String(whole)}.${fraction}`
}

function base64Url(text: string): string {
  let binary = ""
  for (const byte of new TextEncoder().encode(text))
    binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function issueOf(input: PaymentQrInput): PaymentQrIssue | null {
  if (input.currency !== "UAH") return "currency"
  if (!input.iban.trim() || validateUaId("iban", input.iban)) return "iban"
  const code = input.code.trim()
  const kind = code.length === 8 ? "edrpou" : "rnokpp"
  if (!/^\d{8}(\d{2})?$/.test(code) || validateUaId(kind, code)) return "code"
  if (!isPlainText(input.name.trim(), NBU_QR_LIMITS.name)) return "name"
  if (!isPlainText(input.purpose.trim(), NBU_QR_LIMITS.purpose))
    return "purpose"
  if (
    input.amount !== null &&
    (!Number.isSafeInteger(input.amount) ||
      input.amount <= 0 ||
      input.amount > MAX_AMOUNT_KOPECKS)
  )
    return "amount"
  return null
}

/** Посилання платіжного QR НБУ формату 003 чи причина, чому його немає. */
export function nbuPaymentQr(input: PaymentQrInput): PaymentQr {
  const issue = issueOf(input)
  if (issue) return { ok: false, issue }
  const lines = [
    "BCD",
    "003",
    "1",
    "UCT",
    "",
    input.name.trim(),
    normalizeIban(input.iban),
    input.amount === null ? "" : amountField(input.amount),
    input.code.trim(),
    "",
    "",
    input.purpose.trim(),
    "",
    "",
    "",
    "",
    "",
  ]
  return { ok: true, url: NBU_QR_URL_PREFIX + base64Url(lines.join("\n")) }
}
