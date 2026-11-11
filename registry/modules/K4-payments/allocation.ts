/**
 * Рознесення оплати у формі (ADR-0073): чисті функції без запитів. Сервер перевіряє те саме: кожному рахунку
 * не більше за борг, сума оплати дорівнює сумі рознесення.
 */

/** Рахунок у рознесенні: `id` і борг, мінорні одиниці. */
export interface AllocationTarget {
  readonly id: string
  readonly debt: number
}

/** Суми рахунків форми за `id`; порожнє поле — `null`. */
export type AllocationAmounts = Readonly<Record<string, number | null>>

/** Розписано: сума введених сум рахунків. */
export const allocatedTotal = (amounts: AllocationAmounts) =>
  Object.values(amounts).reduce<number>((sum, value) => sum + (value ?? 0), 0)

/**
 * «Розписати від найстаршого»: сума оплати по рахунках у їхньому порядку (від найранішої «Сплатити до»),
 * кожному — не більше за борг; на решту рахунків — порожньо.
 */
export function allocateOldestFirst(
  amount: number,
  targets: readonly AllocationTarget[],
): Record<string, number | null> {
  let left = Math.max(0, amount)
  return Object.fromEntries(
    targets.map((target) => {
      const share = Math.min(left, target.debt)
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
