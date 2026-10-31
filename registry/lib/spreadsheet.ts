import { FORMULA_START } from "@/registry/lib/audit"

/**
 * Читання й запис таблиць (SPEC §20 №2, ADR-0049). Це єдине місце, де кіт торкається `hucre`:
 * бібліотека вантажиться окремим чанком лише тоді, коли людина читає чи пише файл, а заміна
 * бібліотеки зачепить тільки цей файл.
 *
 * - Читає `.xlsx` і `.csv`. Значення CSV лишаються рядками: «00123456» не втрачає нулі. Кодування
 *   CSV: UTF-8 чи UTF-16 за міткою, інакше windows-1251, у якому Excel зберігає кирилицю.
 * - Приховані аркуші не читаються: людина їх не бачить і не чекає, що вони підуть в імпорт.
 * - Пише `.xlsx` і `.csv` з BOM. Рядок, що починається як формула, у CSV дістає апостроф, а в `.xlsx`
 *   лишається текстом сам (OWASP CSV Injection, ADR-0013).
 * - `readSpreadsheet` кидає `SpreadsheetError` із кодом, який показує людині інтерфейс.
 */
export const SPREADSHEET_FORMATS = ["xlsx", "csv"] as const
export type SpreadsheetFormat = (typeof SPREADSHEET_FORMATS)[number]

/** Що приймає вибір файла. */
export const SPREADSHEET_ACCEPT =
  ".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"

/** Більший файл браузер читає надто довго, і вкладка завмирає. */
export const SPREADSHEET_MAX_BYTES = 20 * 1024 * 1024

/** Найбільше символів, які Excel тримає в клітинці: довший текст файл псує. */
const EXCEL_MAX_CELL_CHARS = 32_767
/** Найдовша назва аркуша в Excel. */
const EXCEL_MAX_SHEET_NAME = 31
/** Символи, заборонені в назві аркуша. */
const SHEET_NAME_FORBIDDEN = /[[\]:*?/\\]/g

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

export type SpreadsheetCell = string | number | boolean | Date | null
export type SpreadsheetRow = readonly SpreadsheetCell[]

export interface SpreadsheetSheet {
  readonly name: string
  readonly rows: readonly SpreadsheetRow[]
  /** Рядків більше за `maxRows`: решту не прочитано. */
  readonly truncated: boolean
}

export const SPREADSHEET_ERROR_CODES = [
  "too_large",
  "unsupported",
  "unreadable",
  "empty",
  "load_failed",
] as const
export type SpreadsheetErrorCode = (typeof SPREADSHEET_ERROR_CODES)[number]

export class SpreadsheetError extends Error {
  readonly code: SpreadsheetErrorCode

  constructor(code: SpreadsheetErrorCode, options?: ErrorOptions) {
    super(`Spreadsheet: ${code}`, options)
    this.name = "SpreadsheetError"
    this.code = code
  }
}

/** Чанк бібліотеки не завантажився (офлайн, застарілий після деплою). */
async function loadChunk<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load()
  } catch (cause) {
    throw new SpreadsheetError("load_failed", { cause })
  }
}

const extensionOf = (name: string) =>
  name.slice(name.lastIndexOf(".") + 1).toLowerCase()

function decodeText(bytes: ArrayBuffer): string {
  const start = new Uint8Array(bytes.slice(0, 2))
  if (start[0] === 0xff && start[1] === 0xfe)
    return new TextDecoder("utf-16le").decode(bytes)
  if (start[0] === 0xfe && start[1] === 0xff)
    return new TextDecoder("utf-16be").decode(bytes)
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder("windows-1251").decode(bytes)
  }
}

async function readXlsxSheets(
  bytes: ArrayBuffer,
  limit: number | undefined,
): Promise<SpreadsheetSheet[]> {
  const { readXlsx } = await loadChunk(() => import("hucre/xlsx"))
  const book = await readXlsx(new Uint8Array(bytes), {
    sheets: (info) => !info.hidden && !info.veryHidden,
    ...(limit === undefined ? {} : { maxRows: limit + 1 }),
  })
  return book.sheets.map((sheet) => ({
    name: sheet.name,
    rows: limit === undefined ? sheet.rows : sheet.rows.slice(0, limit),
    truncated: limit !== undefined && sheet.rows.length > limit,
  }))
}

async function readCsvSheets(
  file: File,
  bytes: ArrayBuffer,
  limit: number | undefined,
): Promise<SpreadsheetSheet[]> {
  const { parseCsv } = await loadChunk(() => import("hucre/csv"))
  const rows = parseCsv(decodeText(bytes))
  return [
    {
      name: file.name,
      rows: limit === undefined ? rows : rows.slice(0, limit),
      truncated: limit !== undefined && rows.length > limit,
    },
  ]
}

/** Аркуші файла. `maxRows` — скільки рядків читати з кожного, разом із заголовком. */
export async function readSpreadsheet(
  file: File,
  { maxRows }: { maxRows?: number } = {},
): Promise<SpreadsheetSheet[]> {
  if (file.size > SPREADSHEET_MAX_BYTES) throw new SpreadsheetError("too_large")
  const extension = extensionOf(file.name)
  if (!(SPREADSHEET_FORMATS as readonly string[]).includes(extension))
    throw new SpreadsheetError("unsupported")
  if (file.size === 0) throw new SpreadsheetError("empty")
  const bytes = await file.arrayBuffer()
  let sheets: SpreadsheetSheet[]
  try {
    sheets =
      extension === "csv"
        ? await readCsvSheets(file, bytes, maxRows)
        : await readXlsxSheets(bytes, maxRows)
  } catch (cause) {
    if (cause instanceof SpreadsheetError) throw cause
    // Биті байти, файл із паролем чи перейменований `.xls`: для людини це один випадок.
    throw new SpreadsheetError("unreadable", { cause })
  }
  if (!sheets.some((sheet) => sheet.rows.some(hasValue)))
    throw new SpreadsheetError("empty")
  return sheets
}

/** Рядок не порожній: порожні рядки посеред файла трапляються, але даних не несуть. */
export function hasValue(row: SpreadsheetRow): boolean {
  return row.some((cell) => cell !== null && cell !== "")
}

const safeCsvCell = (cell: SpreadsheetCell): SpreadsheetCell =>
  typeof cell === "string" && FORMULA_START.test(cell) ? `'${cell}` : cell

const safeXlsxCell = (cell: SpreadsheetCell): SpreadsheetCell =>
  typeof cell === "string" ? cell.slice(0, EXCEL_MAX_CELL_CHARS) : cell

export function sheetName(name: string): string {
  const safe = name.replace(SHEET_NAME_FORBIDDEN, " ").trim()
  return safe.slice(0, EXCEL_MAX_SHEET_NAME) || "Sheet1"
}

export interface WriteSpreadsheetOptions {
  readonly format: SpreadsheetFormat
  /** Перший рядок — заголовки. */
  readonly rows: readonly SpreadsheetRow[]
  readonly sheetName?: string
  /** Роздільник CSV: `;` для української Excel, `,` для англійської. */
  readonly delimiter?: string
}

/** Файл із рядків: клітинки зберігають типи (числа, дати), заголовок виділено й закріплено. */
export async function writeSpreadsheet({
  format,
  rows,
  sheetName: name = "Sheet1",
  delimiter = ",",
}: WriteSpreadsheetOptions): Promise<Blob> {
  if (format === "csv") {
    const { writeCsv } = await loadChunk(() => import("hucre/csv"))
    const text = writeCsv(
      rows.map((row) => row.map(safeCsvCell)),
      { delimiter, bom: true },
    )
    return new Blob([text], { type: "text/csv;charset=utf-8" })
  }
  const { writeXlsx } = await loadChunk(() => import("hucre/xlsx"))
  const [header = [], ...body] = rows
  const bytes = await writeXlsx({
    sheets: [
      {
        name: sheetName(name),
        columns: header.map(() => ({ autoWidth: true })),
        freezePane: { rows: 1 },
        rows: [
          header.map((value) => ({
            value: safeXlsxCell(value),
            style: { font: { bold: true } },
          })),
          ...body.map((row) => row.map(safeXlsxCell)),
        ],
      },
    ],
  })
  // Копія: тип масиву hucre допускає SharedArrayBuffer, а Blob його не приймає.
  return new Blob([bytes.slice()], { type: XLSX_MIME })
}

/** «contacts-2026-10-31.xlsx». */
export function spreadsheetFileName(
  base: string,
  format: SpreadsheetFormat,
  at: Date = new Date(),
): string {
  return `${base}-${at.toISOString().slice(0, 10)}.${format}`
}

/** Віддати файл людині: браузер зберігає його в завантаження. */
export function saveFile(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}
