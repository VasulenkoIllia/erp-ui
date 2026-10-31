/**
 * Моки модуля A4 на MSW (ADR-0002, ADR-0003, ADR-0049, ADR-0050): історія запусків і імпорт у цілі.
 * Сценарії `success`, `error`, `empty`, `slow`, `conflict`, `forbidden`, `offline` — окремо для історії
 * (`import-runs`) і для кожної цілі (`lib/mock-scenarios`, панель розробника).
 *
 *   const importExport = createImportExportMocks({
 *     companies: ["zoriana"],
 *     targets: [importTargetMock({ resource: "contacts", db: contacts.db.contacts })],
 *   })
 *   setupWorker(...platform, ...importExport.handlers)
 *
 * - Імпорт у ціль — `lib/mock-imports`, поверх записів модуля-цілі. Модулі ставляться окремо, тому
 *   `db` цілі передає проект, а цей файл їх не імпортує.
 * - `import-runs` — лише читання, інші методи `createResourceHandlers` контракт не описує. Запуск додає
 *   мок, стан і лічильники він бере з задачі під час читання історії: як і задача, запуск іде далі
 *   лише тоді, коли про нього питають.
 * - Поля, яких немає в рядку, новий запис бере з `TARGET_DEFAULTS`: так сервер заповнює запис без цих
 *   полів, а схема модуля-цілі чекає всі поля форми.
 */
import { http, type HttpHandler } from "msw/http"

import { API_PREFIX } from "@/lib/api"
import { isJobActive, type Job } from "@/lib/jobs"
import {
  createImportHandlers,
  type MockImportOptions,
  type MockImportStart,
} from "@/lib/mock-imports"
import { readMockJob } from "@/lib/mock-jobs"
import { createResourceHandlers, type MockRecord } from "@/lib/mocks"

import {
  IMPORT_EXPORT_RESOURCES,
  IMPORT_RUNS,
  importRunSchema,
  type ImportRun,
  type ImportRunStatus,
} from "./contract"
import {
  createImportExportFixtures,
  type ImportExportFixtureOptions,
} from "./fixtures"

type RunStarted = NonNullable<MockImportOptions<MockRecord>["onStarted"]>

export interface ImportTargetMock {
  readonly handlers: (onStarted: RunStarted) => HttpHandler[]
}

/** Поля форми, які в рядку можуть бути порожніми: для цілей модулів кіта. */
const TARGET_DEFAULTS: Readonly<Record<string, Record<string, unknown>>> = {
  contacts: { position: "", phone: "", email: "", organizationId: null },
  organizations: { code: "", phone: "", email: "", city: "" },
}

/** Ціль імпорту на записах модуля: `db` — із моків B1, A6 чи проекту. */
export function importTargetMock<T extends MockRecord>(
  options: Omit<MockImportOptions<T>, "onStarted">,
): ImportTargetMock {
  return {
    handlers: (onStarted) =>
      createImportHandlers<T>({
        ...options,
        defaults: options.defaults ?? TARGET_DEFAULTS[options.resource],
        onStarted,
      }),
  }
}

export interface ImportExportMocksOptions extends Omit<
  ImportExportFixtureOptions,
  "now"
> {
  readonly targets?: readonly ImportTargetMock[]
  /** Початок адрес API, як у `createResourceHandlers` (за замовчуванням `/api/v1`). */
  readonly baseUrl?: string
  /** Годинник (тести). */
  readonly now?: () => number
}

const runStatus = (job: Job): ImportRunStatus => {
  if (isJobActive(job)) return "running"
  if (job.status === "failed") return "failed"
  return job.failed ? "partial" : "done"
}

/** Те, що запуск бере із задачі. */
const runProgress = (job: Job, at: number) =>
  ({
    status: runStatus(job),
    created: job.outcomes?.created ?? 0,
    updated: job.outcomes?.updated ?? 0,
    skipped: job.outcomes?.skipped ?? 0,
    failed: job.failed,
    failures: job.failures,
    finishedAt: isJobActive(job) ? null : new Date(at).toISOString(),
  }) satisfies Partial<ImportRun>

export function createImportExportMocks({
  targets = [],
  baseUrl = API_PREFIX,
  companies,
  now = Date.now,
}: ImportExportMocksOptions = {}) {
  const runs = createResourceHandlers<ImportRun>({
    resource: IMPORT_RUNS,
    baseUrl,
    schema: importRunSchema,
    // Свіжі фікстури на кожне скидання: запуски змінюють записи на місці.
    data: () => createImportExportFixtures({ companies, now: now() }).runs,
    searchFields: ["fileName"],
    label: IMPORT_EXPORT_RESOURCES[0]?.label,
    responsibleField: "startedBy",
  })
  // Запис без журналу й події: це службовий слід запуску, а не дія людини над записом.
  const recordRun = ({
    jobId,
    resource,
    request,
    user,
    companyId,
    at,
  }: MockImportStart) => {
    runs.db.all().unshift({
      id: jobId,
      version: 1,
      companyId,
      target: resource,
      fileName: request.fileName ?? "",
      status: "running",
      total: request.rows.length,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      failures: [],
      startedBy: user.id,
      startedByName: user.name,
      startedAt: new Date(at).toISOString(),
      finishedAt: null,
    })
  }
  /** Запуски, що йдуть, наздоганяють свою задачу. Запит далі обробляє `createResourceHandlers`. */
  const syncRuns = () => {
    const at = now()
    for (const run of runs.db.all()) {
      if (run.status !== "running") continue
      const job = readMockJob(run.id, at)
      if (job) Object.assign(run, runProgress(job, at))
    }
  }
  const url = `${baseUrl}/${IMPORT_RUNS}`
  return {
    handlers: [
      http.get(url, syncRuns),
      http.get(`${url}/:id`, syncRuns),
      ...runs.handlers,
      ...targets.flatMap((target) => target.handlers(recordRun)),
    ],
    db: { runs: runs.db },
  }
}
