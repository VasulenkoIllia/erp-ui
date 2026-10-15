/**
 * Масові дії фоновою задачею сервера (SPEC §8.1, стани 12–14; §8.2; основа PF15; ADR-0018).
 *
 * Контракт (під `/api/v1`, конвенції ADR-0002):
 * - `POST /<ресурс>/bulk/<дія>` з вибором — `{ ids: [...] }` або `{ filter: {…}, exclude?: [...] }`
 *   (усі записи за фільтром списку, крім знятих) → 202 `{ jobId }`. Фільтр — ті самі плоскі поля,
 *   що й у `GET /<ресурс>` (ADR-0002), компанія — `X-Company-Id`. Без права `<ресурс>:<дія>` — 403,
 *   порожній вибір — 422.
 * - `GET /jobs/:id` → задача: стан, скільки всього, оброблено, вдалося; невдачі згруповано за
 *   причиною (`code`): кількість, чи можна повторити, перші записи групи. Відповідь не росте з
 *   кількістю невдач: 8 000 «не чернетка» — одна група.
 * - `POST /jobs/:id/retry` → 202 `{ jobId }`: нова задача лише для невдач, які можна повторити
 *   (запис зайнятий, конфлікт версії); таких немає — 422. Повтор ідемпотентний: повторний запит
 *   (друга вкладка, загублена відповідь) повертає ту саму задачу повтору.
 * - Чужа задача — 404. Клієнт опитує раз на секунду (`JOB_POLL_MS`), поки задача в черзі чи
 *   виконується; опитування — фоновий запит, сесію не продовжує (ADR-0014). Відповідь клієнт
 *   чекає до 10 с (`JOB_POLL_TIMEOUT_MS`), далі — тимчасовий збій і новий запит.
 * - Причину невдачі людина бачить за кодом мовою інтерфейсу: загальні коди API (`conflict`,
 *   `not_found`, `forbidden`…) знає кіт, коди модуля (`invalid_status`) — модуль.
 */
import { z } from "zod"

import type { FilterValue } from "@/registry/lib/api"

/** Шлях API задач (`/jobs/:id`). */
export const JOBS_PATH = "jobs"
/** Як часто клієнт питає про задачу, що ще йде. */
export const JOB_POLL_MS = 1000
/**
 * Скільки клієнт чекає відповідь `GET /jobs/:id`. Сервер чи проксі, що мовчить, — тимчасовий збій,
 * як обрив мережі: наступна спроба за `JOB_POLL_MS`. Без межі запит, що завис, тримав би
 * опитування без кінця: новий запит не йде, поки старий не закінчився.
 */
export const JOB_POLL_TIMEOUT_MS = 10_000
/** Скільки записів кожної групи невдач сервер повертає для показу. */
export const JOB_FAILURE_SAMPLE = 20

export const JOB_STATUSES = ["queued", "running", "done", "failed"] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

export const jobFailureGroupSchema = z.object({
  /** Причина: код помилки API чи модуля (`invalid_status`). */
  code: z.string().min(1),
  /** Технічний текст для журналу; людині — текст за кодом. */
  message: z.string().optional(),
  count: z.number().int().min(1),
  /** Повтор може пройти: запис був зайнятий, змінився між читанням і записом. */
  retryable: z.boolean(),
  /** Перші записи групи: id і назва для людини (номер рахунку). */
  items: z.array(z.object({ id: z.string(), title: z.string().optional() })),
})
export type JobFailureGroup = z.infer<typeof jobFailureGroupSchema>

export const jobSchema = z
  .object({
    id: z.string().min(1),
    /** Ресурс і дія: після завершення клієнт оновлює дані цього ресурсу. */
    resource: z.string().min(1),
    action: z.string().min(1),
    status: z.enum(JOB_STATUSES),
    total: z.number().int().min(0),
    processed: z.number().int().min(0),
    succeeded: z.number().int().min(0),
    failed: z.number().int().min(0),
    failures: z.array(jobFailureGroupSchema),
    /** Задача не виконалась зовсім (не окремі записи): код і текст помилки. */
    error: z.object({ code: z.string(), message: z.string() }).optional(),
  })
  // Лічильники мають сходитись: інакше пропущені записи виглядали б успіхом.
  .superRefine((job, ctx) => {
    const grouped = job.failures.reduce((sum, group) => sum + group.count, 0)
    if (
      job.processed > job.total ||
      job.succeeded + job.failed !== job.processed ||
      grouped !== job.failed ||
      (job.status === "done" && job.processed !== job.total)
    )
      ctx.addIssue({ code: "custom", message: "Inconsistent job counters" })
  })
export type Job = z.infer<typeof jobSchema>

export const jobStartedSchema = z.object({ jobId: z.string().min(1) })
export type JobStarted = z.infer<typeof jobStartedSchema>

/** Що обрано для масової дії: конкретні записи або всі за фільтром, крім знятих. */
export type BulkSelection =
  | { ids: string[] }
  | { filter: Record<string, FilterValue>; exclude?: string[] }

/** Задача ще йде: клієнт питає далі. */
export function isJobActive(job: Pick<Job, "status">): boolean {
  return job.status === "queued" || job.status === "running"
}

/** Скільки невдач можна повторити. */
export function retryableCount(job: Pick<Job, "failures">): number {
  return job.failures.reduce(
    (sum, group) => sum + (group.retryable ? group.count : 0),
    0,
  )
}
