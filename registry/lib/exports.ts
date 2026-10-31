import { MAX_PER_PAGE } from "@/registry/lib/api"
import type {
  SpreadsheetCell,
  SpreadsheetRow,
} from "@/registry/lib/spreadsheet"

/**
 * Збір записів для файла експорту (PF07, ADR-0049). Браузер проходить сторінки звичайного
 * `GET /<ресурс>`, тож експорт працює на будь-якому бекенді, а обсяг `read:own` діє сам.
 *
 * - Над межею `EXPORT_MAX_ROWS` файл не збирається: обрізаний експорт виглядав би повним. З тієї ж
 *   причини файл не збирається, коли сервер віддав менше записів, ніж пообіцяв.
 * - Сторінки йдуть послідовно: паралельні запити вперлися б у ліміт сервера.
 * - Запис, доданий під час збору, може зсунути сторінки. Для файла це прийнятно: експорт — знімок
 *   «приблизно зараз», а не транзакція.
 */
export const EXPORT_MAX_ROWS = 50_000
/** Розмір сторінки збору: найбільший, який дозволяє контракт. */
export const EXPORT_PAGE_SIZE = MAX_PER_PAGE

export interface ExportColumn<T> {
  readonly id: string
  readonly label: string
  /** Значення клітинки: числа й дати лишайте типами, Excel рахуватиме їх. */
  readonly value: (record: T) => SpreadsheetCell
  /** Не вибрана спочатку: службові чи рідкісні колонки. */
  readonly optional?: boolean
}

export interface ExportSource<T> {
  /** Сторінка записів і скільки їх усього. */
  readonly fetchPage: (
    page: number,
    perPage: number,
    signal: AbortSignal,
  ) => Promise<{ data: readonly T[]; total: number }>
}

export class ExportLimitError extends Error {
  readonly total: number

  constructor(total: number) {
    super(`Export: ${total} rows over the limit`)
    this.name = "ExportLimitError"
    this.total = total
  }
}

/** Сервер обіцяв більше записів, ніж віддав: неповний файл виглядав би повним. */
export class ExportIncompleteError extends Error {
  readonly done: number
  readonly total: number

  constructor(done: number, total: number) {
    super(`Export: ${done} of ${total} rows returned`)
    this.name = "ExportIncompleteError"
    this.done = done
    this.total = total
  }
}

/** Усі записи джерела. `onProgress` — після кожної сторінки. */
export async function collectRecords<T>(
  source: ExportSource<T>,
  {
    maxRows = EXPORT_MAX_ROWS,
    signal,
    onProgress,
  }: {
    maxRows?: number
    signal: AbortSignal
    onProgress?: (done: number, total: number) => void
  },
): Promise<T[]> {
  const records: T[] = []
  for (let page = 1; ; page += 1) {
    const { data, total } = await source.fetchPage(
      page,
      EXPORT_PAGE_SIZE,
      signal,
    )
    if (total > maxRows) throw new ExportLimitError(total)
    records.push(...data)
    onProgress?.(records.length, total)
    if (records.length >= total) return records
    // Видалені під час збору записи зменшують `total`, тож сюди приводить лише розбіжність сервера.
    if (!data.length) throw new ExportIncompleteError(records.length, total)
  }
}

/** Заголовок і рядки файла за вибраними колонками. */
export function exportRows<T>(
  records: readonly T[],
  columns: readonly ExportColumn<T>[],
): SpreadsheetRow[] {
  return [
    columns.map((column) => column.label),
    ...records.map((record) => columns.map((column) => column.value(record))),
  ]
}
