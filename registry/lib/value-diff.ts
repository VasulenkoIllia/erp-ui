/**
 * Різниця двох значень для «було → стало» (ADR-0045): текст порівнюється за словами, список — за
 * елементами, решта (число, так чи ні, порожньо) міняється цілком. Лише розрахунок, показ —
 * `erp/audit-changes`.
 */

/** Значення зміни: те саме, що `AuditValue` журналу, тут без схем контракту. */
export type DiffValue =
  string | number | boolean | null | readonly (string | number)[]

export interface DiffPart {
  readonly text: string
  /** Цього шматка немає в другому значенні. */
  readonly changed: boolean
}

export interface ValueDiff {
  readonly before: readonly DiffPart[]
  readonly after: readonly DiffPart[]
}

/** Слово, пробіли чи один розділовий знак: `2026-0007` і `2026-0008` різняться лише кінцем. */
const TOKEN = /\s+|[\p{L}\p{M}\p{N}]+|[^\s\p{L}\p{M}\p{N}]/gu

/** Межа на значення: таблиця порівняння росте квадратично, довший текст міняється цілком. */
export const MAX_DIFF_TOKENS = 500

const LIST_SEPARATOR = ", "
/** Показ порожнього значення. */
const EMPTY_TEXT = "—"

const tokensOf = (text: string) => text.match(TOKEN) ?? []

/** Що спільного на початку й у кінці: це не треба порівнювати. */
function commonEdges(a: readonly string[], b: readonly string[]) {
  const limit = Math.min(a.length, b.length)
  let head = 0
  while (head < limit && a[head] === b[head]) head += 1
  let tail = 0
  while (
    tail < limit - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  )
    tail += 1
  return { head, tail }
}

/** Найдовша спільна послідовність: які елементи `a` і `b` лишились на місці. */
function keptIndexes(a: readonly string[], b: readonly string[]) {
  const width = b.length + 1
  const lengths = new Uint16Array((a.length + 1) * width)
  const at = (i: number, j: number) => lengths[i * width + j] ?? 0
  for (let i = a.length - 1; i >= 0; i -= 1)
    for (let j = b.length - 1; j >= 0; j -= 1)
      lengths[i * width + j] =
        a[i] === b[j]
          ? at(i + 1, j + 1) + 1
          : Math.max(at(i + 1, j), at(i, j + 1))
  const keptA = new Set<number>()
  const keptB = new Set<number>()
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      keptA.add(i)
      keptB.add(j)
      i += 1
      j += 1
    } else if (at(i + 1, j) >= at(i, j + 1)) i += 1
    else j += 1
  }
  return { keptA, keptB }
}

/** Сусідні шматки разом; пробіл між двома змінами — теж зміна, інакше виділення рябить. */
function joinParts(parts: readonly DiffPart[]): DiffPart[] {
  const bridged = parts.map((part, index) => {
    const isBridge =
      !part.changed &&
      !part.text.trim() &&
      parts[index - 1]?.changed === true &&
      parts[index + 1]?.changed === true
    return isBridge ? { ...part, changed: true } : part
  })
  const joined: DiffPart[] = []
  for (const part of bridged) {
    const last = joined.at(-1)
    if (last?.changed === part.changed)
      joined[joined.length - 1] = { ...last, text: last.text + part.text }
    else joined.push(part)
  }
  return joined
}

/** Позначає шматки значення; `separator` — між елементами списку. */
function markParts(
  tokens: readonly string[],
  isKept: (index: number) => boolean,
  separator: string,
): DiffPart[] {
  return joinParts(
    tokens.flatMap((text, index) => [
      ...(index && separator ? [{ text: separator, changed: false }] : []),
      { text, changed: !isKept(index) },
    ]),
  )
}

function diffTokens(
  before: readonly string[],
  after: readonly string[],
  separator = "",
): ValueDiff {
  const { head, tail } = commonEdges(before, after)
  const middleBefore = before.slice(head, before.length - tail)
  const middleAfter = after.slice(head, after.length - tail)
  const { keptA, keptB } = keptIndexes(middleBefore, middleAfter)
  const isKept =
    (kept: ReadonlySet<number>, length: number) => (index: number) =>
      index < head || index >= length - tail || kept.has(index - head)
  return {
    before: markParts(before, isKept(keptA, before.length), separator),
    after: markParts(after, isKept(keptB, after.length), separator),
  }
}

const wholeChange = (before: string, after: string): ValueDiff => ({
  before: [{ text: before, changed: true }],
  after: [{ text: after, changed: true }],
})

/** Два тексти за словами; надто довгий — цілком. */
export function diffText(before: string, after: string): ValueDiff {
  const tokensBefore = tokensOf(before)
  const tokensAfter = tokensOf(after)
  const { head, tail } = commonEdges(tokensBefore, tokensAfter)
  const isTooLong =
    Math.max(tokensBefore.length, tokensAfter.length) - head - tail >
    MAX_DIFF_TOKENS
  return isTooLong
    ? wholeChange(before, after)
    : diffTokens(tokensBefore, tokensAfter)
}

/** Скільки разів кожен елемент є в другому списку: зайвий дублікат — теж зміна. */
function countOf(items: readonly string[]) {
  const counts = new Map<string, number>()
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1)
  return counts
}

function markList(items: readonly string[], other: readonly string[]) {
  const left = countOf(other)
  const kept = items.map((item) => {
    const count = left.get(item) ?? 0
    left.set(item, count - 1)
    return count > 0
  })
  return markParts(items, (index) => kept[index] ?? false, LIST_SEPARATOR)
}

/** Два списки за елементами, порядок не важить: зайвий елемент — зміна, переставлений — ні. */
export function diffList(
  before: readonly (string | number)[],
  after: readonly (string | number)[],
): ValueDiff {
  const itemsBefore = before.map(String)
  const itemsAfter = after.map(String)
  return {
    before: markList(itemsBefore, itemsAfter),
    after: markList(itemsAfter, itemsBefore),
  }
}

const isList = (
  value: DiffValue | undefined,
): value is readonly (string | number)[] => Array.isArray(value)

const isEmpty = (value: DiffValue | undefined) =>
  value === undefined ||
  value === null ||
  value === "" ||
  (isList(value) && value.length === 0)

function valueText(
  value: DiffValue | undefined,
  booleanText: (value: boolean) => string,
): string {
  if (isEmpty(value)) return EMPTY_TEXT
  if (typeof value === "boolean") return booleanText(value)
  return isList(value) ? value.join(LIST_SEPARATOR) : String(value)
}

/**
 * Різниця значень події журналу. `booleanText` дає «так» чи «ні» мовою інтерфейсу; порожнє значення —
 * прочерк без виділення: виділяти нічого.
 */
export function diffAuditValues(
  from: DiffValue | undefined,
  to: DiffValue | undefined,
  booleanText: (value: boolean) => string,
): ValueDiff {
  if (typeof from === "string" && typeof to === "string" && from && to)
    return diffText(from, to)
  if (isList(from) && isList(to) && from.length && to.length)
    return diffList(from, to)
  const side = (value: DiffValue | undefined) => [
    { text: valueText(value, booleanText), changed: !isEmpty(value) },
  ]
  return { before: side(from), after: side(to) }
}
