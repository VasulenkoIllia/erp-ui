/**
 * Фікстури модуля A4: історія запусків кожної компанії, щоб сторінка мала що показати без імпорту. Час —
 * відносно зараз. `companies` не задано — записи без компанії (застосунок без `X-Company-Id`). Без
 * `lib/mocks`, тож у тестах і застосунку їх можна взяти без MSW.
 */
import type { ImportRun, ImportRunStatus } from "./contract"

export interface ImportExportFixtureOptions {
  /** Компанії: у кожної своя історія. */
  readonly companies?: readonly string[]
  /** Годинник (тести). */
  readonly now?: number
}

const HOUR_MS = 60 * 60 * 1000
/** Кілька хвилин на запуск: у списку час закінчення видно поруч із початком. */
const RUN_MS = 3 * 60 * 1000

const STARTED_BY = { id: "fixture-manager", name: "Олена Коваль" }

interface RunRow {
  readonly target: string
  readonly fileName: string
  readonly status: ImportRunStatus
  readonly hoursAgo: number
  readonly counts?: Partial<
    Pick<ImportRun, "created" | "updated" | "skipped" | "failed">
  >
  readonly failures?: ImportRun["failures"]
}

const RUN_ROWS: readonly RunRow[] = [
  {
    target: "contacts",
    fileName: "контакти-жовтень.xlsx",
    status: "done",
    hoursAgo: 3,
    counts: { created: 118, updated: 12, skipped: 4 },
  },
  {
    target: "organizations",
    fileName: "контрагенти.csv",
    status: "partial",
    hoursAgo: 26,
    counts: { created: 40, failed: 3 },
    failures: [
      {
        code: "duplicate",
        count: 2,
        retryable: false,
        items: [
          { id: "12", title: "12345678" },
          { id: "31", title: "12345678" },
        ],
      },
      { code: "invalid", count: 1, retryable: false, items: [{ id: "44" }] },
    ],
  },
  {
    target: "units",
    fileName: "одиниці.xlsx",
    status: "done",
    hoursAgo: 75,
    counts: { created: 6, skipped: 5 },
  },
  {
    target: "taxes",
    fileName: "податки.csv",
    status: "failed",
    hoursAgo: 120,
  },
]

function runRecord(
  row: RunRow,
  index: number,
  companyId: string | null,
  now: number,
): ImportRun {
  const started = now - row.hoursAgo * HOUR_MS
  const counts = {
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    ...row.counts,
  }
  return {
    id: companyId ? `run-${index + 1}-${companyId}` : `run-${index + 1}`,
    version: 1,
    companyId,
    target: row.target,
    fileName: row.fileName,
    status: row.status,
    total: counts.created + counts.updated + counts.skipped + counts.failed,
    ...counts,
    failures: row.failures ? [...row.failures] : [],
    startedBy: STARTED_BY.id,
    startedByName: STARTED_BY.name,
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date(started + RUN_MS).toISOString(),
  }
}

export function createImportExportFixtures({
  companies,
  now = Date.now(),
}: ImportExportFixtureOptions = {}) {
  const owners: readonly (string | null)[] = companies?.length
    ? companies
    : [null]
  return {
    runs: owners.flatMap((companyId) =>
      RUN_ROWS.map((row, index) => runRecord(row, index, companyId, now)),
    ),
  }
}
