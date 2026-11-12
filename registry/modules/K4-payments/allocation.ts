/**
 * Рознесення оплати чи повернення у формі (ADR-0073, ADR-0083): чисті функції без запитів. Сервер перевіряє
 * те саме: кожному рахунку не більше за межу (борг для оплати, переплата для повернення), сума документа
 * дорівнює сумі рознесення.
 */

/** Рахунок у рознесенні: `id` і межа суми, мінорні одиниці. */
export interface AllocationTarget {
  readonly id: string
  /** Скільки можна рознести на рахунок: борг для оплати, переплата для повернення. */
  readonly limit: number
}

/** Рахунок клієнта у формі: номер, дати, валюта, підсумок і межа суми з рахунків сервера. */
export interface AllocationInvoice extends AllocationTarget {
  readonly number: string
  readonly date: string
  readonly dueDate: string
  readonly currency: string
  readonly total: number
}

/** Суми рахунків форми за `id`; порожнє поле — `null`. */
export type AllocationAmounts = Readonly<Record<string, number | null>>

/** Розписано: сума введених сум рахунків. */
export const allocatedTotal = (amounts: AllocationAmounts) =>
  Object.values(amounts).reduce<number>((sum, value) => sum + (value ?? 0), 0)

/**
 * «Розписати від найстаршого»: сума документа по рахунках у їхньому порядку (від найранішої «Сплатити до»),
 * кожному — не більше за межу; на решту рахунків — порожньо.
 */
export function allocateOldestFirst(
  amount: number,
  targets: readonly AllocationTarget[],
): Record<string, number | null> {
  let left = Math.max(0, amount)
  return Object.fromEntries(
    targets.map((target) => {
      const share = Math.min(left, target.limit)
      left -= share
      return [target.id, share > 0 ? share : null]
    }),
  )
}

/** Рахунки з сумою для тіла запиту: у порядку рахунків, лише з сумою понад нуль. */
export function allocationsOf(
  amounts: AllocationAmounts,
  targets: readonly AllocationTarget[],
): { invoiceId: string; amount: number }[] {
  return targets
    .map((target) => ({
      invoiceId: target.id,
      amount: amounts[target.id] ?? 0,
    }))
    .filter(({ amount }) => amount > 0)
}
