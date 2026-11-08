/**
 * Групи повторюваних рядків `erp/repeating-rows` (UI05d, ADR-0064): рядок-голова (розділ документа)
 * відкриває групу, що триває до наступної голови. Меню голови переносить групу цілком: вона міняється
 * місцями із сусідньою групою. Рядки до першої голови ні до якої групи не належать і з місця не рушають,
 * тому першу групу вище не перенести: інакше вони опинились би в ній.
 */

export type RowGroupDirection = "up" | "down"

/** Місця голів груп у порядку рядків. */
export function groupHeadsOf<TRow>(
  rows: readonly TRow[],
  isHead: (row: TRow) => boolean,
): number[] {
  return rows.flatMap((row, index) => (isHead(row) ? [index] : []))
}

/** Що може голова групи в меню: `null` — рядок не голова. */
export function rowGroupFlags(heads: readonly number[], index: number) {
  const position = heads.indexOf(index)
  return position < 0
    ? null
    : { canUp: position > 0, canDown: position < heads.length - 1 }
}

/** Перенесення групи: рядки по одному (`move` форми), нове місце голови й рядків у групі. */
export interface RowGroupMove {
  readonly moves: readonly (readonly [from: number, to: number])[]
  readonly head: number
  readonly size: number
}

/**
 * Як поміняти групу з головою `head` місцями із сусідньою групою вище чи нижче. Рядки переносяться по
 * одному, щоб кожен зберіг свій ключ і стан; переноситься менша з двох груп. `null` — сусідньої групи
 * немає.
 */
export function rowGroupMove(
  heads: readonly number[],
  count: number,
  head: number,
  direction: RowGroupDirection,
): RowGroupMove | null {
  const position = heads.indexOf(head)
  const upper = direction === "up" ? position - 1 : position
  if (position < 0 || upper < 0) return null
  const start = heads[upper]
  const middle = heads[upper + 1]
  if (start === undefined || middle === undefined) return null
  const end = heads[upper + 2] ?? count
  // Значення й склад рядків форми на мить можуть розійтись: план без рядків нічого не переносить.
  if (end > count) return null
  const upperSize = middle - start
  const lowerSize = end - middle
  // Нижня група стає на місце верхньої: її рядки по черзі вгору або рядки верхньої по черзі в кінець.
  const moves: (readonly [number, number])[] =
    lowerSize <= upperSize
      ? Array.from({ length: lowerSize }, (_, offset) => [
          middle + offset,
          start + offset,
        ])
      : Array.from({ length: upperSize }, () => [start, end - 1])
  return direction === "up"
    ? { moves, head: start, size: lowerSize }
    : { moves, head: start + lowerSize, size: upperSize }
}
