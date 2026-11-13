/**
 * Кошики старіння боргу (ADR-0084): межі днів після «Сплатити до», параметр `buckets` запиту й кошик за
 * днями прострочки. Без zod і схем: межі перевіряє ще фабрика модуля в першому екрані застосунку.
 */

/**
 * Межі кошиків за замовчуванням, днів прострочки (власник, вікторина 13.11.2026): «Строк не настав»,
 * 1–30, 31–60, 61–90 і понад 90.
 */
export const DEFAULT_AGING_BUCKETS: readonly number[] = [30, 60, 90]
/** Найбільше меж у запиті: сім кошиків разом із «Строк не настав» і «понад». */
export const MAX_AGING_BOUNDS = 5
/** Найбільша межа, днів: десять років. */
export const MAX_AGING_DAYS = 3650

/** Межі кошиків: від однієї до `MAX_AGING_BOUNDS` цілих днів, кожна більша за попередню. */
export function isAgingBuckets(bounds: readonly number[]): boolean {
  return (
    bounds.length >= 1 &&
    bounds.length <= MAX_AGING_BOUNDS &&
    bounds.every(
      (bound, index) =>
        Number.isInteger(bound) &&
        bound >= 1 &&
        bound <= MAX_AGING_DAYS &&
        (index === 0 || bound > (bounds[index - 1] ?? 0)),
    )
  )
}

/** Межі в параметрі запиту `buckets`: «30,60,90». */
export const agingBucketsParam = (bounds: readonly number[]) => bounds.join(",")

/** Межа в параметрі `buckets`: лише цифри. */
const BOUND_PATTERN = /^\d+$/

/** Параметр `buckets` → межі; не межі — `null` (сервер відповідає 422). */
export function parseAgingBuckets(param: string): number[] | null {
  const parts = param.split(",")
  // Лише цифри: `Number` прийняв би «1e1», «0x1e» і порожню частину як нуль.
  if (!parts.every((part) => BOUND_PATTERN.test(part))) return null
  const bounds = parts.map(Number)
  return isAgingBuckets(bounds) ? bounds : null
}

/**
 * Кошик за днями прострочки: 0 — строк не настав (сьогодні й раніше «Сплатити до» не минула), далі межі
 * по черзі (1–30 — кошик 1), останній — понад останню межу.
 */
export function agingBucketIndex(
  overdueDays: number,
  bounds: readonly number[],
): number {
  if (overdueDays <= 0) return 0
  const index = bounds.findIndex((bound) => overdueDays <= bound)
  return index === -1 ? bounds.length + 1 : index + 1
}

/** Кошик для підпису колонки: строк не настав, діапазон днів чи понад межу. */
export type AgingBucket =
  | { readonly kind: "notDue" }
  | { readonly kind: "range"; readonly from: number; readonly to: number }
  | { readonly kind: "over"; readonly days: number }

/** Кошики за межами, у порядку `buckets` рядка звіту. */
export function agingBucketsOf(bounds: readonly number[]): AgingBucket[] {
  const last = bounds[bounds.length - 1] ?? 0
  return [
    { kind: "notDue" },
    ...bounds.map((to, index) => ({
      kind: "range" as const,
      from: (bounds[index - 1] ?? 0) + 1,
      to,
    })),
    { kind: "over", days: last },
  ]
}
