/**
 * Поле «ключ–значення» (UI42, ADR-0047): значення на сервері — об'єкт `{ ключ: значення }`, у формі —
 * рядки `{ key, value }`, бо порядок і незаповнений рядок існують лише, поки людина вводить.
 *
 * - Порожній рядок (обидві клітинки порожні) не є даними: `keyValueRecord` його відкидає, а перевірка
 *   не вимагає його заповнити.
 * - Ключі порівнюємо без пробілів на краях і без урахування регістру: «1С» і «1с» — той самий ключ.
 */
import { z } from "zod"

export interface KeyValueRow {
  key: string
  value: string
}

export type KeyValueRecord = Readonly<Record<string, string>>

/** Межі рядків: об'єкт іде в запис цілком, а поле не задумане як довгий список. */
export const KEY_VALUE_MAX_ROWS = 20
export const KEY_VALUE_KEY_MAX = 60
export const KEY_VALUE_VALUE_MAX = 200

/** Об'єкт із сервера → рядки форми. */
export function keyValueRows(record?: KeyValueRecord | null): KeyValueRow[] {
  return Object.entries(record ?? {}).map(([key, value]) => ({ key, value }))
}

/** Рядки форми → об'єкт для запиту, без порожніх рядків і пробілів на краях. */
export function keyValueRecord(rows: readonly KeyValueRow[]): KeyValueRecord {
  return Object.fromEntries(
    rows
      .map(({ key, value }) => [key.trim(), value.trim()] as const)
      .filter(([key, value]) => key || value),
  )
}

export interface KeyValueMessages {
  readonly required: string
  readonly duplicate: string
  readonly tooLong: string
}

const rowSchema = z.object({ key: z.string(), value: z.string() })

const comparable = (key: string) => key.trim().toLocaleLowerCase()

/** Перевірка рядків: помилка стоїть біля клітинки, яку треба виправити. */
export function keyValueSchema(messages: KeyValueMessages) {
  return z.array(rowSchema).superRefine((rows, context) => {
    const seen = new Set<string>()
    rows.forEach(({ key, value }, index) => {
      const hasKey = key.trim() !== ""
      const hasValue = value.trim() !== ""
      const fail = (field: "key" | "value", message: string) => {
        context.addIssue({ code: "custom", message, path: [index, field] })
      }
      if (hasValue && !hasKey) fail("key", messages.required)
      if (hasKey && !hasValue) fail("value", messages.required)
      if (key.trim().length > KEY_VALUE_KEY_MAX) fail("key", messages.tooLong)
      if (value.trim().length > KEY_VALUE_VALUE_MAX)
        fail("value", messages.tooLong)
      if (!hasKey) return
      if (seen.has(comparable(key))) fail("key", messages.duplicate)
      seen.add(comparable(key))
    })
  })
}

/** Значення для порівняння при конфлікті й журналу: «Бухгалтерія: 0301, ПДВ: 20». */
export function keyValueText(rows: readonly KeyValueRow[]): string | null {
  const entries = Object.entries(keyValueRecord(rows))
  return entries.length
    ? entries.map(([key, value]) => `${key}: ${value}`).join(", ")
    : null
}
