/**
 * Контракт модуля A4 «Імпорт і експорт» (SPEC §14, §17; ADR-0002, ADR-0018, ADR-0049, ADR-0050).
 *
 * Сам імпорт — контракт кіта `lib/imports`: кожна ціль — ресурс іншого модуля чи проекту, у якого є
 * `POST /<ресурс>/import/check` і `POST /<ресурс>/import`. Експорт — сторінки звичайного
 * `GET /<ресурс>` (`lib/exports`). Модуль додає лише один ресурс:
 *
 * - `import-runs` — історія запусків компанії запиту, лише читання. `GET /import-runs` (фільтри
 *   `target`, `status`, пошук `q` за назвою файла, сортування `startedAt`), `GET /import-runs/:id`.
 *   Запуск створює сервер у `POST /<ресурс>/import`: один запис на один `requestId`, повтор того самого
 *   ключа нового запису не дає. Лічильники й стан сервер оновлює разом із задачею ADR-0018.
 * - `status`: `running` — задача йде, `done` — усі рядки застосовано, `partial` — частина рядків не
 *   пройшла, `failed` — задача не виконалась зовсім.
 * - `failures` — невдачі задачі, форма та сама, що в `GET /jobs/:id`: `code`, `count`, перші рядки в
 *   `items` (`id` — номер рядка файла). Відповідь не росте з кількістю невдач.
 * - Права: `import-runs:read` — уся історія компанії, `import-runs:read:own` — лише свої запуски
 *   (`startedBy`, ADR-0039).
 *
 * Рядок без необов'язкової клітинки не несе поля, тож новий запис сервер заповнює так само, як форму
 * без цього поля (порожній рядок, значення за замовчуванням).
 */
import { z } from "zod"

import { recordBaseSchema } from "@/lib/api"
import { jobFailureGroupSchema } from "@/lib/jobs"

export { IMPORT_EXPORT_RESOURCES, IMPORT_RUNS } from "./resources"

export const IMPORT_RUN_STATUSES = [
  "running",
  "done",
  "partial",
  "failed",
] as const
export type ImportRunStatus = (typeof IMPORT_RUN_STATUSES)[number]

const rowCount = z.number().int().min(0)

export const importRunSchema = recordBaseSchema.extend({
  companyId: z.string().nullable().optional(),
  /** Ресурс-ціль: `contacts`. */
  target: z.string().min(1),
  /** Порожня — клієнт не передав назву файла. */
  fileName: z.string(),
  status: z.enum(IMPORT_RUN_STATUSES),
  /** Скільки рядків пішло на запис. */
  total: rowCount,
  created: rowCount,
  updated: rowCount,
  skipped: rowCount,
  failed: rowCount,
  failures: z.array(jobFailureGroupSchema),
  /** `id` людини: обсяг `read:own`. */
  startedBy: z.string().min(1),
  /** Ім'я на момент запуску: людину могли вилучити. */
  startedByName: z.string(),
  startedAt: z.iso.datetime({ offset: true }),
  finishedAt: z.iso.datetime({ offset: true }).nullable(),
})
export type ImportRun = z.infer<typeof importRunSchema>

/** Запуск уже закінчився: лічильники більше не зміняться. */
export const isRunFinished = ({ status }: Pick<ImportRun, "status">) =>
  status !== "running"
