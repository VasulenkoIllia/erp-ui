/**
 * Підсумки документа (UI05, ADR-0056): чиста функція без React і без залежностей, її можна перенести
 * на сервер. Джерело правди — сервер; браузер тим самим правилом показує попередній розрахунок.
 *
 * - Вхід — десяткові рядки кількості й ціни, вихід — цілі мінорні одиниці. Рахуємо в BigInt: двійковий
 *   дріб 1.005 менший за 1,005, і копійка зникала б на округленні.
 * - Округлення математичне (половина вгору) і лише до мінорної одиниці.
 * - Порядок у рядку: кількість × ціна, знижка рядка, частка знижки документа, податок. Кожне значення
 *   округлюється окремо, тому колонки сходяться: `net + tax = total` у рядку й у документі.
 * - Знижка — відсотком або сумою на весь рядок, одне з двох. Знижка документа так само, рахується від
 *   суми рядків після їхніх знижок і зменшує базу податку (рішення власника 02.11.2026). Вона ділиться
 *   між рядками пропорційно до їхньої суми, копійки залишку — найдорожчому рядку.
 * - Податок округлюється за рядком, підсумок — сума рядків (рішення власника 02.11.2026).
 * - Податок поверх ціни: `tax = net × rate`. Податок уже в ціні (`included`, знімок з довідника
 *   ставок): `tax = total × rate / (100 + rate)`. В одному документі можуть бути обидва випадки.
 * - Від'ємних кількостей і цін контракт не має, тож функція їх не приймає: некоректний рядок — RangeError.
 */

const MAX_AMOUNT = BigInt(Number.MAX_SAFE_INTEGER)
/** 100 % у сотих відсотка: ставки й знижки мають два знаки після коми. */
const FULL_PERCENT = 10_000n
/** Допуск на шум двійкового дробу: 7,07 × 100 не дає рівно 707, а 7,005 — це вже третій знак. */
const PERCENT_NOISE = 1e-9
const DECIMAL = /^\d+(\.\d+)?$/

export interface TotalsLineTax {
  /** Значення довідника ставок. */
  id: string
  /** Ставка у відсотках, 0–100, два знаки: 20, 7, 0. */
  rate: number
  /** Податок уже в ціні. */
  included: boolean
}

/** Знижка рядка чи документа: більша за нуль лише одна з двох. */
export interface TotalsDiscount {
  /** У відсотках, 0–100, два знаки. */
  discountPercent: number
  /** Сумою в мінорних одиницях, на весь рядок чи документ. */
  discountAmount: number
}

export interface TotalsLine extends TotalsDiscount {
  /** Кількість, десятковий рядок: "1.5". */
  quantity: string
  /** Ціна за одиницю в основних одиницях валюти, десятковий рядок: "0.1234". */
  price: string
  /** null — рядок без податку. */
  tax: TotalsLineTax | null
}

export const NO_DISCOUNT: Readonly<TotalsDiscount> = Object.freeze({
  discountPercent: 0,
  discountAmount: 0,
})

/** Суми в мінорних одиницях. */
export interface Totals {
  /** Кількість × ціна, до знижки. */
  amount: number
  /** Уся знижка: рядка й частка знижки документа. */
  discount: number
  /** Частка знижки документа в `discount`. */
  documentDiscount: number
  /** Без податку. */
  net: number
  tax: number
  /** З податком. */
  total: number
}

/** Знижка самих рядків, без частки знижки документа. */
export const lineDiscountOf = (totals: Totals) =>
  totals.discount - totals.documentDiscount

/** Підсумок за ставкою: у документі з двома ставками друкується кожна. */
export interface TaxTotal {
  taxId: string
  rate: number
  included: boolean
  net: number
  tax: number
}

export interface DocumentTotals extends Totals {
  /** Той самий порядок, що в `lines` на вході. */
  lines: Totals[]
  /** Лише рядки з податком, у порядку першої появи. */
  taxes: TaxTotal[]
}

/**
 * Чому документ не рахується в межах контракту. `discount_exceeds` — знижка сумою більша за суму
 * рядка (`line` — його індекс) чи документа (`line: null`).
 */
export type TotalsIssue =
  | { readonly code: "out_of_range" }
  | { readonly code: "discount_exceeds"; readonly line: number | null }

type ExactTotals = Record<keyof Totals, bigint>

const emptyTotals = (): ExactTotals => ({
  amount: 0n,
  discount: 0n,
  documentDiscount: 0n,
  net: 0n,
  tax: 0n,
  total: 0n,
})

function parseDecimal(value: string): { units: bigint; scale: bigint } {
  if (!DECIMAL.test(value))
    throw new RangeError(`Некоректне десяткове число: ${value}`)
  const [whole, fraction = ""] = value.split(".")
  return {
    units: BigInt(`${whole}${fraction}`),
    scale: 10n ** BigInt(fraction.length),
  }
}

function percentHundredths(percent: number): bigint {
  const hundredths = Math.round(percent * 100)
  if (
    !(percent >= 0 && percent <= 100) ||
    Math.abs(percent * 100 - hundredths) > PERCENT_NOISE
  )
    throw new RangeError(`Некоректний відсоток: ${String(percent)}`)
  return BigInt(hundredths)
}

/** Ділення невід'ємних цілих із математичним округленням. */
const divideRounded = (value: bigint, divisor: bigint) =>
  (2n * value + divisor) / (2n * divisor)

/** Знижка від `base`: відсоток округлюється, сума береться як є. Обидві разом — помилка коду. */
function discountOf(discount: TotalsDiscount, base: bigint): bigint {
  const percent = percentHundredths(discount.discountPercent)
  const amount = discount.discountAmount
  if (!(Number.isSafeInteger(amount) && amount >= 0))
    throw new RangeError(`Некоректна знижка сумою: ${String(amount)}`)
  if (percent > 0n && amount > 0)
    throw new RangeError("Знижка або відсотком, або сумою")
  return amount > 0
    ? BigInt(amount)
    : divideRounded(base * percent, FULL_PERCENT)
}

/** Кількість × ціна до знижки. */
function lineAmount(line: TotalsLine, digits: number): bigint {
  const quantity = parseDecimal(line.quantity)
  const price = parseDecimal(line.price)
  return divideRounded(
    quantity.units * price.units * 10n ** BigInt(digits),
    quantity.scale * price.scale,
  )
}

/**
 * Знижка документа між рядками пропорційно до `bases`: частки округлюються вниз, залишок копійок —
 * найдорожчому рядку. Якщо копійок більше, ніж лишилось у ньому (рядки по копійці), решта йде
 * наступному за сумою: частка ніколи не більша за суму рядка.
 */
function splitDiscount(discount: bigint, bases: readonly bigint[]): bigint[] {
  const sum = bases.reduce((total, base) => total + base, 0n)
  if (sum === 0n) return bases.map(() => 0n)
  const shares = bases.map((base) => (discount * base) / sum)
  let rest = discount - shares.reduce((total, share) => total + share, 0n)
  const byBase = bases
    .map((base, index) => ({ base, index }))
    .sort((a, b) =>
      a.base === b.base ? a.index - b.index : a.base > b.base ? -1 : 1,
    )
  for (const { base, index } of byBase) {
    if (rest === 0n) break
    const room = base - shares[index]
    const extra = rest < room ? rest : room
    shares[index] += extra
    rest -= extra
  }
  return shares
}

function lineTotals(
  line: TotalsLine,
  amount: bigint,
  discount: bigint,
  documentDiscount: bigint,
): ExactTotals {
  const payable = amount - discount - documentDiscount
  const discounts = {
    amount,
    discount: discount + documentDiscount,
    documentDiscount,
  }
  const rate = line.tax ? percentHundredths(line.tax.rate) : 0n
  if (line.tax?.included) {
    const tax = divideRounded(payable * rate, FULL_PERCENT + rate)
    return { ...discounts, net: payable - tax, tax, total: payable }
  }
  const tax = divideRounded(payable * rate, FULL_PERCENT)
  return { ...discounts, net: payable, tax, total: payable + tax }
}

function addTotals(sum: ExactTotals, line: ExactTotals) {
  sum.amount += line.amount
  sum.discount += line.discount
  sum.documentDiscount += line.documentDiscount
  sum.net += line.net
  sum.tax += line.tax
  sum.total += line.total
}

const toNumbers = (totals: ExactTotals): Totals => ({
  amount: Number(totals.amount),
  discount: Number(totals.discount),
  documentDiscount: Number(totals.documentDiscount),
  net: Number(totals.net),
  tax: Number(totals.tax),
  total: Number(totals.total),
})

type Calculation =
  | { readonly totals: DocumentTotals; readonly issue: null }
  | { readonly totals: null; readonly issue: TotalsIssue }

function calculate(
  lines: readonly TotalsLine[],
  digits: number,
  discount: TotalsDiscount,
): Calculation {
  const amounts = lines.map((line) => lineAmount(line, digits))
  const discounts = lines.map((line, index) => discountOf(line, amounts[index]))
  const exceeded = discounts.findIndex((value, index) => value > amounts[index])
  if (exceeded !== -1)
    return { totals: null, issue: { code: "discount_exceeds", line: exceeded } }
  const bases = amounts.map((amount, index) => amount - discounts[index])
  const base = bases.reduce((total, value) => total + value, 0n)
  const documentDiscount = discountOf(discount, base)
  if (documentDiscount > base)
    return { totals: null, issue: { code: "discount_exceeds", line: null } }
  const shares = splitDiscount(documentDiscount, bases)

  const sum = emptyTotals()
  const byTax = new Map<string, { tax: TotalsLineTax; sum: ExactTotals }>()
  const exactLines: ExactTotals[] = []
  for (const [index, line] of lines.entries()) {
    const totals = lineTotals(
      line,
      amounts[index],
      discounts[index],
      shares[index],
    )
    exactLines.push(totals)
    addTotals(sum, totals)
    if (!line.tax) continue
    const key = `${line.tax.id}|${String(line.tax.rate)}|${String(line.tax.included)}`
    const group = byTax.get(key) ?? { tax: line.tax, sum: emptyTotals() }
    addTotals(group.sum, totals)
    byTax.set(key, group)
  }
  // Усі значення невід'ємні, тож рядки й ставки не більші за відповідну суму документа.
  if (Object.values(sum).some((value) => value > MAX_AMOUNT))
    return { totals: null, issue: { code: "out_of_range" } }
  return {
    issue: null,
    totals: {
      ...toNumbers(sum),
      lines: exactLines.map(toNumbers),
      taxes: [...byTax.values()].map((group) => ({
        taxId: group.tax.id,
        rate: group.tax.rate,
        included: group.tax.included,
        net: Number(group.sum.net),
        tax: Number(group.sum.tax),
      })),
    },
  }
}

/**
 * Рядки й знижка документа → суми рядків і документа. `digits` — знаків після коми у валюти
 * (`currencyDigits` з lib/format). null — документ не рахується в межах контракту: сума за межею
 * `moneyAmountSchema` чи знижка сумою більша за свою суму; що саме, каже `documentTotalsIssue`.
 * Такий документ не можна ні показати точно, ні надіслати, тому рішення лишається за викликом, а не
 * за винятком посеред рендера.
 */
export function computeDocumentTotals(
  lines: readonly TotalsLine[],
  digits: number,
  discount: TotalsDiscount = NO_DISCOUNT,
): DocumentTotals | null {
  return calculate(lines, digits, discount).totals
}

/** Чому `computeDocumentTotals` дає null; null — документ рахується. Перша причина за порядком рядків. */
export function documentTotalsIssue(
  lines: readonly TotalsLine[],
  digits: number,
  discount: TotalsDiscount = NO_DISCOUNT,
): TotalsIssue | null {
  return calculate(lines, digits, discount).issue
}
