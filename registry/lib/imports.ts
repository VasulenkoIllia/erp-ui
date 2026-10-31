/**
 * Контракт імпорту з файла (PF07, ADR-0049). Файл читає браузер (`lib/spreadsheet`), на сервер ідуть
 * рядки JSON: серверу не потрібна своя бібліотека xlsx.
 *
 * Під `/api/v1`, конвенції ADR-0002:
 * - `POST /<ресурс>/import/check` — перевірка без запису. Тіло `importRequestSchema`, відповідь
 *   `{ rows: [...] }`: на кожен надісланий рядок його `row` і що з ним буде (`create`, `update`,
 *   `skip`, `invalid`), для `invalid` — помилки з полем і кодом. Другий рядок із тим самим значенням
 *   бачить перший: при `skip` він `skip`, а при `update` — `invalid` з кодом `duplicate`, бо файл не
 *   каже, який рядок правильний. Право — як на `POST`.
 * - `POST /<ресурс>/import` — застосувати. Те саме тіло без рядків із помилками → 202 `{ jobId }`
 *   (фонова задача, ADR-0018). Рядок, що не пройшов під час запису, — невдача задачі, `items[].id`
 *   — номер рядка файла. Лічильники `outcomes` задачі кажуть, скільки створено, оновлено й
 *   пропущено.
 * - `requestId` робить запуск ідемпотентним: той самий ключ повертає ту саму задачу, загублена
 *   відповідь не створює записи двічі. Клієнт міняє ключ, лише коли змінився сам імпорт: файл,
 *   аркуш, рядок заголовків, колонки чи дія з дублями.
 * - Права: `<ресурс>:create`, а для `onDuplicate: "update"` ще й `<ресурс>:update`. Обсяг — як в
 *   інших запитах (ADR-0039): запис, якого людина не бачить, не знаходиться, а запис, який не може
 *   змінити, — `invalid` з кодом `forbidden`.
 * - Рядок без необов'язкової клітинки не несе поля: новий запис сервер заповнює так само, як форму
 *   без цього поля (порожній рядок, значення за замовчуванням), а наявний запис це поле не міняє.
 * - Межа тіла: `IMPORT_MAX_ROWS` рядків. Сервер проекту має приймати такий JSON (близько 2 МБ на
 *   10 000 рядків із дванадцятьма полями).
 */
import { z } from "zod"

/** Більше рядків за раз: фонова задача на сервері йде довго, а тіло запиту росте. */
export const IMPORT_MAX_ROWS = 10_000
/** Більше колонок у файлі: зіставлення перестає бути посильним для людини. */
export const IMPORT_MAX_COLUMNS = 100
/** Скільки клієнт чекає перевірку чи запуск: тіло на весь файл довго йде з телефона. */
export const IMPORT_REQUEST_TIMEOUT_MS = 120_000

/** Ключ ідемпотентності запуску: без `randomUUID`, бо той вимагає HTTPS. */
export function newImportRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  )
}

export const IMPORT_DUPLICATE_MODES = ["skip", "update"] as const
export type ImportDuplicateMode = (typeof IMPORT_DUPLICATE_MODES)[number]

export const IMPORT_ROW_ACTIONS = [
  "create",
  "update",
  "skip",
  "invalid",
] as const
export type ImportRowAction = (typeof IMPORT_ROW_ACTIONS)[number]

export const importRowSchema = z.object({
  /** Номер рядка у файлі, з одиниці: людина шукає його в Excel. */
  row: z.number().int().min(1),
  values: z.record(z.string(), z.unknown()),
})
export type ImportRow = z.infer<typeof importRowSchema>

export const importRequestSchema = z.object({
  requestId: z.string().min(1),
  /** Назва файла для журналу. */
  fileName: z.string().optional(),
  /** Поле, за яким шукається наявний запис. Без нього кожен рядок — новий запис. */
  matchField: z.string().optional(),
  onDuplicate: z.enum(IMPORT_DUPLICATE_MODES).optional(),
  rows: z.array(importRowSchema).min(1).max(IMPORT_MAX_ROWS),
})
export type ImportRequest = z.infer<typeof importRequestSchema>

export const importRowErrorSchema = z.object({
  /** Поле; немає — помилка всього рядка. */
  field: z.string().optional(),
  /** Код: загальний (`required`, `invalid`, `duplicate`, `forbidden`) чи модуля. */
  code: z.string().min(1),
})
export type ImportRowError = z.infer<typeof importRowErrorSchema>

export const importCheckSchema = z.object({
  rows: z.array(
    z.object({
      row: z.number().int().min(1),
      action: z.enum(IMPORT_ROW_ACTIONS),
      errors: z.array(importRowErrorSchema).optional(),
    }),
  ),
})
export type ImportCheck = z.infer<typeof importCheckSchema>
