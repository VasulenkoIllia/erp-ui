/**
 * Суми кредит-ноти (ADR-0072): чиста функція без React, її бере «сервер» моків і форма кредит-ноти для
 * попереднього розрахунку. Джерело правди — сервер.
 *
 * - Рядок кредит-ноти — частка рядка рахунку за кількістю, а не новий розрахунок «кількість × ціна»: так у
 *   ньому вже є частка знижки документа рахунку, а ПДВ не округлюється вдруге.
 * - Частка накопичувальна: кредит-нота, що повертає кількість понад уже повернену виставленими `before`, бере
 *   `частка(before + quantity) − уже повернені суми`, де `частка(q) = сума × q / кількість у рахунку` з
 *   математичним округленням. Тож сума кредит-нот не більша за рахунок, а повне повернення частинами дає рівно
 *   суму рахунку: остання частина бере залишок (10,03 × 2 з ПДВ 4,01 — дві кредит-ноти з ПДВ 2,01 і 2,00).
 *   Віднімаються саме повернені суми, а не `частка(before)`: після сторно однієї з кредит-нот суми решти не
 *   збігаються з часткою їхньої кількості, і різниця часток дала б понад рахунок на копійку.
 * - Частки беруться від невід'ємних складових рядка рахунку — знижки рядка, частки знижки документа, нетто й
 *   податку (ADR-0074); сума до знижки й разом складаються з них так само, як у `lib/document-totals`:
 *   `total = net + tax`, `amount = net + знижки`, з податком у ціні ще `+ tax`. Окремо округлена частка суми
 *   до знижки мінус частки знижок давала від'ємне нетто, коли повернена частина дешевша за копійку-дві.
 * - Кількість — десятковий рядок контракту (до трьох знаків), рахуємо в тисячних BigInt.
 */
import type {
  SavedDocumentLine,
  SavedDocumentTotals,
} from "@/lib/document-lines"
import {
  lineDiscountOf,
  type TaxTotal,
  type Totals,
} from "@/lib/document-totals"

/** Тисячні: кількість має до трьох знаків після коми (`QUANTITY_DECIMALS_MAX`). */
const QUANTITY_SCALE = 1000n
const QUANTITY = /^(\d+)(?:\.(\d{1,3}))?$/

/** Кількість десятковим рядком → тисячні; не за контрактом — RangeError. */
export function quantityUnits(quantity: string): bigint {
  const match = QUANTITY.exec(quantity)
  if (!match) throw new RangeError(`Некоректна кількість: ${quantity}`)
  const [, whole = "0", fraction = ""] = match
  return BigInt(whole) * QUANTITY_SCALE + BigInt(fraction.padEnd(3, "0"))
}

/** Тисячні → канонічний рядок контракту без зайвих нулів: 1500n → "1.5", 0n → "0". */
export function quantityText(units: bigint): string {
  if (units < 0n) throw new RangeError("Від'ємна кількість")
  const whole = units / QUANTITY_SCALE
  const fraction = (units % QUANTITY_SCALE)
    .toString()
    .padStart(3, "0")
    .replace(/0+$/, "")
  return fraction ? `${whole.toString()}.${fraction}` : whole.toString()
}

/** Частка невід'ємної суми `amount` на `part` з `whole` з математичним округленням. */
function shareOf(amount: number, part: bigint, whole: bigint): bigint {
  if (!Number.isSafeInteger(amount) || amount < 0)
    throw new RangeError(`Некоректна сума: ${String(amount)}`)
  return (2n * BigInt(amount) * part + whole) / (2n * whole)
}

/** Рядок рахунку-підстави: кількість і суми, які рахував сервер рахунку. */
export interface CreditedLineBasis {
  readonly quantity: string
  readonly totals: Totals
}

/** Уже повернене з рядка рахунку виставленими кредит-нотами: кількість і суми їхніх рядків. */
export interface CreditedPart {
  readonly quantity: string
  readonly totals: Totals
}

const NO_TOTALS: Totals = {
  amount: 0,
  discount: 0,
  documentDiscount: 0,
  net: 0,
  tax: 0,
  total: 0,
}

/** З рядка ще нічого не повернули. */
export const NOTHING_CREDITED: CreditedPart = {
  quantity: "0",
  totals: NO_TOTALS,
}

/**
 * Суми рядка кредит-ноти, що повертає `quantity` після вже поверненого `before` з рядка рахунку `basis`.
 * `taxIncluded` — податок у ціні рядка. Кількість понад рахунок — RangeError: її відхиляє перевірка раніше.
 */
export function creditedLineTotals(
  basis: CreditedLineBasis,
  before: CreditedPart,
  quantity: string,
  taxIncluded: boolean,
): Totals {
  const whole = quantityUnits(basis.quantity)
  const to = quantityUnits(before.quantity) + quantityUnits(quantity)
  if (whole === 0n || to > whole)
    throw new RangeError("Кількість кредит-ноти більша за рахунок")
  // Повернені суми бувають на копійку більші за частку своєї кількості (після сторно): частина не від'ємна.
  const part = (amount: number, credited: number) =>
    Math.max(0, Number(shareOf(amount, to, whole)) - credited)
  const { totals } = basis
  const documentDiscount = part(
    totals.documentDiscount,
    before.totals.documentDiscount,
  )
  const discount =
    part(lineDiscountOf(totals), lineDiscountOf(before.totals)) +
    documentDiscount
  const net = part(totals.net, before.totals.net)
  const tax = part(totals.tax, before.totals.tax)
  const total = net + tax
  return {
    amount: (taxIncluded ? total : net) + discount,
    discount,
    documentDiscount,
    net,
    tax,
    total,
  }
}

const TOTALS_KEYS = [
  "amount",
  "discount",
  "documentDiscount",
  "net",
  "tax",
  "total",
] as const satisfies readonly (keyof Totals)[]

/** Сума двох наборів сум рядка. */
export const addTotals = (a: Totals, b: Totals): Totals => {
  const sum = { ...a }
  for (const key of TOTALS_KEYS) sum[key] += b[key]
  return sum
}

/** Підсумки кредит-ноти: сума рядків і підсумки за ставками, як у `lib/document-totals`. */
export function creditNoteTotals(
  lines: readonly SavedDocumentLine[],
): SavedDocumentTotals {
  let sum = NO_TOTALS
  const taxes = new Map<string, TaxTotal>()
  for (const line of lines) {
    sum = addTotals(sum, line.totals)
    if (!line.tax) continue
    const { id, rate, included } = line.tax
    const key = `${id}|${String(rate)}|${String(included)}`
    const group = taxes.get(key) ?? {
      taxId: id,
      rate,
      included,
      net: 0,
      tax: 0,
    }
    taxes.set(key, {
      ...group,
      net: group.net + line.totals.net,
      tax: group.tax + line.totals.tax,
    })
  }
  return { ...sum, taxes: [...taxes.values()] }
}

/**
 * Рядок кредит-ноти з рядка рахунку: назва, ціна, одиниця, податок і знижка відсотком — рахунку, кількість —
 * повернена, суми — частка (`creditedLineTotals`). Знижка рядка сумою — її частка: поле й суми сходяться.
 */
export function creditedLine(
  line: SavedDocumentLine,
  before: CreditedPart,
  quantity: string,
): SavedDocumentLine {
  const totals = creditedLineTotals(
    line,
    before,
    quantity,
    line.tax?.included ?? false,
  )
  return {
    ...line,
    quantity,
    discountAmount:
      line.discountAmount > 0 ? totals.discount - totals.documentDiscount : 0,
    totals,
  }
}

/**
 * Рядок рахунку для форми: до `CreditedLineBasis` — скільки ще можна повернути разом із цією кредит-нотою й
 * суми, які вже повернули інші виставлені кредит-ноти.
 */
export interface CreditNoteLineBasis extends CreditedLineBasis {
  readonly available: string
  readonly credited: Totals
}

/** Кількість у формі за контрактом і не більша за залишок рахунку. */
export function isWithinBasis(basis: CreditNoteLineBasis, quantity: string) {
  if (!QUANTITY.test(quantity)) return false
  const units = quantityUnits(quantity)
  return units > 0n && units <= quantityUnits(basis.available)
}

/**
 * Суми рядка у формі до збереження, як порахує сервер: кількість не змінено — збережені суми, інакше частка
 * рядка рахунку після вже повернених іншими кредит-нотами. Кількість не за контрактом чи понад залишок —
 * `null`: сум немає, біля поля помилка.
 */
export function creditNoteLinePreview(
  line: SavedDocumentLine,
  basis: CreditNoteLineBasis | undefined,
  quantity: string,
): Totals | null {
  if (quantity === line.quantity) return line.totals
  if (!basis || !isWithinBasis(basis, quantity)) return null
  const before: CreditedPart = {
    quantity: quantityText(
      quantityUnits(basis.quantity) - quantityUnits(basis.available),
    ),
    totals: basis.credited,
  }
  return creditedLineTotals(
    basis,
    before,
    quantity,
    line.tax?.included ?? false,
  )
}
