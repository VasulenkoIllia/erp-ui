/**
 * Підсумки документа (UI05, ADR-0056): чиста функція без React і без залежностей, її можна перенести
 * на сервер. Джерело правди — сервер; браузер тим самим правилом показує попередній розрахунок.
 *
 * - Вхід — десяткові рядки кількості й ціни, вихід — цілі мінорні одиниці. Рахуємо в BigInt: двійковий
 *   дріб 1.005 менший за 1,005, і копійка зникала б на округленні.
 * - Округлення математичне (половина вгору) і лише до мінорної одиниці.
 * - Порядок у рядку: кількість × ціна, знижка, податок. Кожне значення округлюється окремо, тому
 *   колонки сходяться: `net + tax = total` у рядку й у документі.
 * - Податок округлюється за рядком, підсумок — сума рядків (рішення власника 02.11.2026).
 * - Податок поверх ціни: `tax = net × rate`. Податок уже в ціні (`included`, знімок з довідника
 *   ставок): `tax = total × rate / (100 + rate)`. В одному документі можуть бути обидва випадки.
 * - Від'ємних кількостей і цін контракт не має, тож функція їх не приймає: некоректний рядок — RangeError.
 */

const MAX_AMOUNT = BigInt(Number.MAX_SAFE_INTEGER)
/** 100 % у сотих відсотка: ставки й знижки мають два знаки після коми. */
const FULL_PERCENT = 10_000n
const DECIMAL = /^\d+(\.\d+)?$/

export interface TotalsLineTax {
  /** Значення довідника ставок. */
  id: string
  /** Ставка у відсотках, 0–100, два знаки: 20, 7, 0. */
  rate: number
  /** Податок уже в ціні. */
  included: boolean
}

export interface TotalsLine {
  /** Кількість, десятковий рядок: "1.5". */
  quantity: string
  /** Ціна за одиницю в основних одиницях валюти, десятковий рядок: "0.1234". */
  price: string
  /** Знижка у відсотках, 0–100, два знаки. */
  discountPercent: number
  /** null — рядок без податку. */
  tax: TotalsLineTax | null
}

/** Суми в мінорних одиницях. */
export interface Totals {
  /** Кількість × ціна, до знижки. */
  amount: number
  discount: number
  /** Без податку. */
  net: number
  tax: number
  /** З податком. */
  total: number
}

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

type ExactTotals = Record<keyof Totals, bigint>

const emptyTotals = (): ExactTotals => ({
  amount: 0n,
  discount: 0n,
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
  if (!(percent >= 0 && percent <= 100))
    throw new RangeError(`Некоректний відсоток: ${String(percent)}`)
  return BigInt(Math.round(percent * 100))
}

/** Ділення невід'ємних цілих із математичним округленням. */
const divideRounded = (value: bigint, divisor: bigint) =>
  (2n * value + divisor) / (2n * divisor)

function lineTotals(line: TotalsLine, digits: number): ExactTotals {
  const quantity = parseDecimal(line.quantity)
  const price = parseDecimal(line.price)
  const amount = divideRounded(
    quantity.units * price.units * 10n ** BigInt(digits),
    quantity.scale * price.scale,
  )
  const discount = divideRounded(
    amount * percentHundredths(line.discountPercent),
    FULL_PERCENT,
  )
  const payable = amount - discount
  const rate = line.tax ? percentHundredths(line.tax.rate) : 0n
  if (line.tax?.included) {
    const tax = divideRounded(payable * rate, FULL_PERCENT + rate)
    return { amount, discount, net: payable - tax, tax, total: payable }
  }
  const tax = divideRounded(payable * rate, FULL_PERCENT)
  return { amount, discount, net: payable, tax, total: payable + tax }
}

function addTotals(sum: ExactTotals, line: ExactTotals) {
  sum.amount += line.amount
  sum.discount += line.discount
  sum.net += line.net
  sum.tax += line.tax
  sum.total += line.total
}

const toNumbers = (totals: ExactTotals): Totals => ({
  amount: Number(totals.amount),
  discount: Number(totals.discount),
  net: Number(totals.net),
  tax: Number(totals.tax),
  total: Number(totals.total),
})

/**
 * Рядки → суми рядків і документа. `digits` — знаків після коми у валюти (`currencyDigits` з lib/format).
 * null — сума вийшла за межу контракту (`moneyAmountSchema`): такий документ не можна ні показати
 * точно, ні надіслати, тому рішення лишається за викликом, а не за винятком посеред рендера.
 */
export function computeDocumentTotals(
  lines: readonly TotalsLine[],
  digits: number,
): DocumentTotals | null {
  const sum = emptyTotals()
  const byTax = new Map<string, { tax: TotalsLineTax; sum: ExactTotals }>()
  const exactLines = lines.map((line) => {
    const totals = lineTotals(line, digits)
    addTotals(sum, totals)
    if (line.tax) {
      const key = `${line.tax.id}|${String(line.tax.rate)}|${String(line.tax.included)}`
      const group = byTax.get(key) ?? { tax: line.tax, sum: emptyTotals() }
      addTotals(group.sum, totals)
      byTax.set(key, group)
    }
    return totals
  })
  // Усі значення невід'ємні, тож рядки й ставки не більші за відповідну суму документа.
  if (Object.values(sum).some((value) => value > MAX_AMOUNT)) return null
  return {
    ...toNumbers(sum),
    lines: exactLines.map(toNumbers),
    taxes: [...byTax.values()].map((group) => ({
      taxId: group.tax.id,
      rate: group.tax.rate,
      included: group.tax.included,
      net: Number(group.sum.net),
      tax: Number(group.sum.tax),
    })),
  }
}
