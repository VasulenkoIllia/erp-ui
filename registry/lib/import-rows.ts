import {
  IMPORT_MAX_COLUMNS,
  type ImportCheck,
  type ImportRow,
  type ImportRowAction,
  type ImportRowError,
} from "@/registry/lib/imports"
import {
  hasValue,
  isEmptyCell,
  type SpreadsheetCell,
  type SpreadsheetRow,
  type SpreadsheetSheet,
} from "@/registry/lib/spreadsheet"

/**
 * Від клітинок файла до рядків контракту (PF07, ADR-0049): зіставлення колонок, розбір значень,
 * звіт помилок. Лише чисті функції, стан тримає `hooks/use-import-wizard`.
 *
 * - Порожня клітинка не стає значенням: оновлення наявного запису не стирає його поле.
 * - Номер рядка — той, що в Excel: порожні рядки не зсувають нумерацію.
 * - Число «1,234» — помилка, а не здогад: це 1234 в англійському файлі й 1,234 в українському, а
 *   мовчки хибна сума гірша за питання.
 */
export type ImportFieldType =
  "text" | "number" | "integer" | "boolean" | "date" | "enum"

export type ImportParsed =
  { readonly value: unknown } | { readonly code: string }

export interface ImportField {
  /** Ключ у `values` рядка: поле запису. */
  readonly key: string
  /** Підпис мовою інтерфейсу. */
  readonly label: string
  readonly required?: boolean
  /** Типово `text`. */
  readonly type?: ImportFieldType
  /** Для `enum`: значення запису й підпис, який людина пише у файлі. */
  readonly options?: readonly { value: string; label: string }[]
  /** Інші назви колонки, які зіставляються з полем самі. */
  readonly aliases?: readonly string[]
  /** Приклад для шаблону файла. */
  readonly example?: SpreadsheetCell
  /** Свій розбір клітинки (телефон у E.164, ЄДРПОУ): замість типу. */
  readonly parse?: (raw: SpreadsheetCell) => ImportParsed
}

export interface ImportTarget {
  /** Ресурс API. */
  readonly resource: string
  readonly label: string
  readonly fields: readonly ImportField[]
  /** Поле, за яким шукається наявний запис. Без нього кожен рядок — новий запис. */
  readonly matchField?: string
  /** Текст помилки за кодом модуля; загальні коди кіт знає сам. */
  readonly errorLabel?: (code: string) => string | undefined
}

/** Колонка файла → ключ поля; немає ключа — колонка не імпортується. */
export type ImportMapping = Readonly<Record<number, string>>

export type SheetIssue = "too_many_rows" | "too_many_columns" | "no_rows"

export interface ImportValueText {
  readonly yes: string
  readonly no: string
  readonly number: (value: number) => string
  readonly date: (value: string) => string
}

/** Значення для перегляду: мовою людини, а не так, як воно піде на сервер. */
export function fieldValueText(
  field: ImportField,
  value: unknown,
  text: ImportValueText,
): string {
  if (typeof value === "boolean") return value ? text.yes : text.no
  if (typeof value === "number") return text.number(value)
  if (typeof value !== "string") return ""
  if (field.type === "date") return text.date(value)
  return field.options?.find((item) => item.value === value)?.label ?? value
}

/**
 * Серед скількох перших рядків файла шукати заголовки: шапка над таблицею коротка. Рахуємо й порожні
 * рядки, бо читання файла бере рівно такий запас понад межу.
 */
export const HEADER_ROW_CHOICES = 20
/** Скільки клітинок і символів рядка видно у виборі: досить, щоб упізнати рядок. */
const HEADER_PREVIEW_CELLS = 4
const HEADER_PREVIEW_CHARS = 60

export interface HeaderRowChoice {
  /** Індекс у рядках аркуша: номер в Excel на одиницю більший. */
  readonly index: number
  readonly preview: string
}

/** Перший заповнений рядок файла: заголовки, доки людина не вибрала інший. */
export function headerRowIndex(rows: readonly SpreadsheetRow[]): number {
  return rows.findIndex(hasValue)
}

/** Рядки, які людина може вибрати заголовками: заповнені серед перших, у порядку файла. */
export function headerRowChoices(
  rows: readonly SpreadsheetRow[],
): HeaderRowChoice[] {
  const choices: HeaderRowChoice[] = []
  for (const [index, row] of rows.slice(0, HEADER_ROW_CHOICES).entries()) {
    if (!hasValue(row)) continue
    const preview = row
      .map(cellText)
      .filter(Boolean)
      .slice(0, HEADER_PREVIEW_CELLS)
      .join(", ")
    choices.push({
      index,
      preview:
        preview.length > HEADER_PREVIEW_CHARS
          ? `${preview.slice(0, HEADER_PREVIEW_CHARS)}…`
          : preview,
    })
  }
  return choices
}

/** Скільки рядків із даними під заголовком. */
export function dataRowCount(
  rows: readonly SpreadsheetRow[],
  header: number = headerRowIndex(rows),
): number {
  return rows.slice(header + 1).filter(hasValue).length
}

/** Чому цей аркуш не можна імпортувати; `null` — можна. */
export function sheetIssue(
  sheet: SpreadsheetSheet,
  maxRows: number,
  header: number = headerRowIndex(sheet.rows),
): SheetIssue | null {
  if (sheet.truncated) return "too_many_rows"
  const columns = sheet.rows[header] ?? []
  if (columns.length > IMPORT_MAX_COLUMNS) return "too_many_columns"
  const count = dataRowCount(sheet.rows, header)
  if (count > maxRows) return "too_many_rows"
  return count === 0 ? "no_rows" : null
}

/** Перше значення колонки під заголовком: приклад для зіставлення. */
export function columnSample(
  rows: readonly SpreadsheetRow[],
  column: number,
  header: number = headerRowIndex(rows),
): string {
  const row = rows
    .slice(header + 1)
    .find((cells) => !isEmptyCell(cells[column]))
  return cellText(row?.[column])
}

/** Текст клітинки заголовка чи прикладу. */
export function cellText(cell: SpreadsheetCell | undefined): string {
  if (cell === null || cell === undefined) return ""
  if (cell instanceof Date) return cell.toISOString().slice(0, 10)
  return String(cell).trim()
}

/** «Ім'я», «ім’я» й «ІМ Я» — одна назва. */
const normalizeHeader = (text: string) =>
  text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")

/** Поля, які збігаються з назвами колонок. Одне поле — лише першій колонці. */
export function suggestMapping(
  headers: readonly SpreadsheetCell[],
  fields: readonly ImportField[],
): ImportMapping {
  const byName = new Map<string, string>()
  for (const field of fields)
    for (const name of [field.key, field.label, ...(field.aliases ?? [])]) {
      const normalized = normalizeHeader(name)
      if (normalized && !byName.has(normalized))
        byName.set(normalized, field.key)
    }
  const mapping: Record<number, string> = {}
  const taken = new Set<string>()
  headers.forEach((header, column) => {
    const key = byName.get(normalizeHeader(cellText(header)))
    if (key === undefined || taken.has(key)) return
    taken.add(key)
    mapping[column] = key
  })
  return mapping
}

export interface MappingIssues {
  /** Обов'язкові поля без колонки. */
  readonly missing: readonly ImportField[]
  /** Поля, на які вказує кілька колонок. */
  readonly repeated: ReadonlySet<string>
}

export function mappingIssues(
  mapping: ImportMapping,
  fields: readonly ImportField[],
): MappingIssues {
  const counts = new Map<string, number>()
  for (const key of Object.values(mapping))
    counts.set(key, (counts.get(key) ?? 0) + 1)
  return {
    missing: fields.filter((field) => field.required && !counts.has(field.key)),
    repeated: new Set(
      [...counts].filter(([, count]) => count > 1).map(([key]) => key),
    ),
  }
}

const THOUSANDS_OR_DECIMAL = /^-?[1-9]\d{0,2},\d{3}$/

function parseNumber(raw: SpreadsheetCell): ImportParsed {
  if (typeof raw === "number") return { value: raw }
  if (typeof raw !== "string") return { code: "invalid" }
  const text = raw.replace(/\s/g, "")
  if (THOUSANDS_OR_DECIMAL.test(text)) return { code: "ambiguous_number" }
  // Кома дробова, лише якщо вона одна й стоїть після крапки; інакше коми групують тисячі.
  const isDecimalComma =
    text.indexOf(",") === text.lastIndexOf(",") &&
    text.lastIndexOf(",") > text.lastIndexOf(".")
  const plain = isDecimalComma
    ? text.replace(/\./g, "").replace(",", ".")
    : text.replace(/,/g, "")
  const value = plain === "" ? Number.NaN : Number(plain)
  return Number.isFinite(value) ? { value } : { code: "invalid" }
}

const TRUE_WORDS = new Set(["так", "yes", "true", "1", "+"])
const FALSE_WORDS = new Set(["ні", "no", "false", "0", "-"])

function parseBoolean(raw: SpreadsheetCell): ImportParsed {
  if (typeof raw === "boolean") return { value: raw }
  const text = cellText(raw).toLowerCase()
  if (TRUE_WORDS.has(text)) return { value: true }
  if (FALSE_WORDS.has(text)) return { value: false }
  return { code: "invalid" }
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/
const DOTTED_DATE = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/

function calendarDate(year: number, month: number, day: number): ImportParsed {
  const date = new Date(Date.UTC(year, month - 1, day))
  const real =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  return real ? { value: date.toISOString().slice(0, 10) } : { code: "invalid" }
}

/** Дата без часу: `YYYY-MM-DD`. Excel дає півночі UTC, тож частини беруться в UTC. */
function parseDate(raw: SpreadsheetCell): ImportParsed {
  if (raw instanceof Date)
    return Number.isNaN(raw.getTime())
      ? { code: "invalid" }
      : { value: raw.toISOString().slice(0, 10) }
  const text = cellText(raw)
  const iso = ISO_DATE.exec(text)
  if (iso) return calendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  const dotted = DOTTED_DATE.exec(text)
  if (dotted)
    return calendarDate(Number(dotted[3]), Number(dotted[2]), Number(dotted[1]))
  return { code: "invalid" }
}

function parseEnum(field: ImportField, raw: SpreadsheetCell): ImportParsed {
  const text = cellText(raw).toLowerCase()
  const option = field.options?.find(
    ({ value, label }) =>
      value.toLowerCase() === text || label.toLowerCase() === text,
  )
  return option ? { value: option.value } : { code: "invalid" }
}

/** Значення клітинки за типом поля. Порожню клітинку сюди не передають. */
export function parseCell(
  field: ImportField,
  raw: SpreadsheetCell,
): ImportParsed {
  if (field.parse) return field.parse(raw)
  switch (field.type) {
    case "number":
      return parseNumber(raw)
    case "integer": {
      const parsed = parseNumber(raw)
      return "value" in parsed && !Number.isInteger(parsed.value)
        ? { code: "invalid" }
        : parsed
    }
    case "boolean":
      return parseBoolean(raw)
    case "date":
      return parseDate(raw)
    case "enum":
      return parseEnum(field, raw)
    default:
      return { value: cellText(raw) }
  }
}

export interface BuiltRows {
  /** Рядки без помилок: вони йдуть на сервер. */
  readonly rows: readonly ImportRow[]
  /** Помилки розбору за номером рядка: ці рядки на сервер не йдуть. */
  readonly invalid: ReadonlyMap<number, readonly ImportRowError[]>
}

/** Рядки файла після заголовка: значення за зіставленням і помилки розбору. */
export function buildRows(
  fileRows: readonly SpreadsheetRow[],
  mapping: ImportMapping,
  fields: readonly ImportField[],
  header: number = headerRowIndex(fileRows),
): BuiltRows {
  const byKey = new Map(fields.map((field) => [field.key, field]))
  const columns = Object.entries(mapping).flatMap(([column, key]) => {
    const field = byKey.get(key)
    return field ? [{ column: Number(column), field }] : []
  })
  const required = fields.filter((field) => field.required)
  const rows: ImportRow[] = []
  const invalid = new Map<number, ImportRowError[]>()
  const start = header + 1
  fileRows.slice(start).forEach((cells, offset) => {
    const present = columns.filter(({ column }) => !isEmptyCell(cells[column]))
    if (!present.length) return
    const row = start + offset + 1
    const values: Record<string, unknown> = {}
    const errors: ImportRowError[] = []
    for (const { column, field } of present) {
      const parsed = parseCell(field, cells[column] ?? null)
      if ("value" in parsed) values[field.key] = parsed.value
      else errors.push({ field: field.key, code: parsed.code })
    }
    for (const field of required)
      if (!present.some((item) => item.field === field))
        errors.push({ field: field.key, code: "required" })
    if (errors.length) invalid.set(row, errors)
    else rows.push({ row, values })
  })
  return { rows, invalid }
}

export interface CheckedRow {
  readonly row: number
  readonly action: ImportRowAction
  readonly errors: readonly ImportRowError[]
  /** Значення, якщо рядок пройшов розбір. */
  readonly values?: ImportRow["values"]
}

/**
 * Перевірка браузера й сервера разом, у порядку файла. Рядок без відповіді сервера не застосовується
 * наосліп: він стає помилкою, яку людина бачить. Зайві відповіді нічого не змінюють.
 */
export function mergeCheck(built: BuiltRows, check: ImportCheck): CheckedRow[] {
  const answers = new Map(check.rows.map((item) => [item.row, item]))
  const fromServer = built.rows.map((sent): CheckedRow => {
    const answer = answers.get(sent.row)
    if (!answer)
      return {
        row: sent.row,
        action: "invalid",
        errors: [{ code: "no_answer" }],
      }
    return {
      row: sent.row,
      action: answer.action,
      errors: answer.errors ?? [],
      values: sent.values,
    }
  })
  const local = [...built.invalid].map(([row, errors]): CheckedRow => ({
    row,
    action: "invalid",
    errors,
  }))
  return [...fromServer, ...local].sort((a, b) => a.row - b.row)
}

export type ImportCounts = Readonly<Record<ImportRowAction, number>>

export function countActions(rows: readonly CheckedRow[]): ImportCounts {
  const counts = { create: 0, update: 0, skip: 0, invalid: 0 }
  for (const { action } of rows) counts[action] += 1
  return counts
}

/** Рядки, які застосовуються: лише без помилок. Пропуск вирішує сервер у момент запису. */
export const applicableRows = (rows: readonly CheckedRow[]): ImportRow[] =>
  rows.flatMap(({ row, values, action }) =>
    values && action !== "invalid" ? [{ row, values }] : [],
  )

/**
 * Рядки для файла помилок: шапка файла, початкові клітинки, текст помилки в останній колонці. Людина
 * править файл і завантажує його знову, зайва колонка не заважає: вона лишається не зіставленою.
 */
export function errorReportRows(
  fileRows: readonly SpreadsheetRow[],
  checked: readonly CheckedRow[],
  errorText: (error: ImportRowError) => string,
  errorHeader: string,
  header: number = headerRowIndex(fileRows),
): SpreadsheetRow[] {
  const columns = fileRows[header] ?? []
  const invalid = checked.filter(({ action }) => action === "invalid")
  return [
    [...columns, errorHeader],
    // Рядки CSV бувають коротші за шапку: помилка має лишитись у своїй колонці.
    ...invalid.map(({ row, errors }) => [
      ...columns.map((_, column) => fileRows[row - 1]?.[column] ?? null),
      errors.map(errorText).join("; "),
    ]),
  ]
}

/** Порожній файл із заголовками й рядком прикладу. */
export function templateRows(fields: readonly ImportField[]): SpreadsheetRow[] {
  const examples = fields.map((field) => field.example ?? null)
  return [
    fields.map((field) => field.label),
    ...(examples.some((example) => example !== null) ? [examples] : []),
  ]
}
