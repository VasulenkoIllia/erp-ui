/**
 * Стан моку стрічки запису (ADR-0053): живе в localStorage (`erp-ui:mock-timeline`), початковий стан —
 * засів, ключ `<ресурс>/<id>`. Обробники — `lib/mock-timeline`.
 */
import type { MockRecord, MockResourceDb } from "@/registry/lib/mocks"
import { scenarioFor } from "@/registry/lib/mock-scenarios"
import {
  emitMockEvent,
  errorResponse,
  isMockCompanyMember,
  mockUsersList,
  randomToken,
  type MockUser,
} from "@/registry/lib/mock-server"
import {
  TIMELINE_SCENARIO_RESOURCE,
  timelineEventType,
  type TimelineActivity,
  type TimelineFile,
  type TimelinePerson,
} from "@/registry/lib/timeline"

const STORAGE_KEY = "erp-ui:mock-timeline"

/** Запис, як його зберігає мок: тіло — будь-яке, його перевіряє клієнт. */
export interface MockTimelineEntry {
  id: string
  at: string
  kind: string
  author: { id?: string; name: string }
  body?: unknown
  version?: number
  editedAt?: string
  direction?: "outgoing" | "incoming"
  status?: "queued" | "sent" | "failed"
  party?: string
  file?: TimelineFile
  activity?: { type: string; title: string; status: "done" | "cancelled" }
  text?: string
}

export interface MockTimelineRecord {
  entries: MockTimelineEntry[]
  followers: TimelinePerson[]
  activities: TimelineActivity[]
}
export type MockTimelineSeeds = Record<string, Partial<MockTimelineRecord>>

/** Чи бачить людина запис: права в компанії запиту й правила ресурсу. */
export interface MockTimelineTarget {
  readonly resource: string
  readonly sees: (
    user: MockUser,
    permissions: readonly string[],
    companyId: string | null,
    id: string,
  ) => boolean
  /** Назва запису в «Моїх справах». */
  readonly titleOf?: (
    id: string,
    companyId: string | null,
  ) => string | undefined
}

export function timelineTargetMock<T extends MockRecord>({
  resource,
  db,
  title,
}: {
  resource: string
  db: Pick<MockResourceDb<T>, "accessOf" | "select">
  /** Як назвати запис у «Моїх справах». */
  title?: (record: T) => string
}): MockTimelineTarget {
  return {
    resource,
    sees: (user, permissions, companyId, id) => {
      const rules = db.accessOf(user, [...permissions])
      return db.select({ id }, companyId, rules).length > 0
    },
    titleOf: (id, companyId) => {
      const [record] = db.select({ id }, companyId)
      return record && title?.(record)
    },
  }
}

/* ----------------------------------- Стан ----------------------------------- */

let seeds: MockTimelineSeeds = {}

export function setMockTimelineSeeds(value: MockTimelineSeeds): void {
  seeds = value
}

/** Загублена відповідь: той самий `requestId` повертає той самий запис. */
export const handledTimelineRequests = new Map<string, unknown>()
/** Записи, для яких сценарій `conflict` уже імітував чуже збереження. */
export const bumpedTimelineRecords = new Set<string>()

function readAll(): Record<string, MockTimelineRecord> {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Record<string, MockTimelineRecord>
  } catch {
    // Пошкоджений стан — з початкового.
  }
  return Object.fromEntries(
    Object.entries(structuredClone(seeds)).map(([key, value]) => [
      key,
      { entries: [], followers: [], activities: [], ...value },
    ]),
  )
}

function writeAll(state: Record<string, MockTimelineRecord>): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Без сховища — до перезавантаження.
  }
}

/** Прочитати запис стрічки, змінити й зберегти. */
export function changeMockTimeline<R>(
  key: string,
  edit: (record: MockTimelineRecord) => R,
): R {
  const state = readAll()
  const record = (state[key] ??= { entries: [], followers: [], activities: [] })
  const result = edit(record)
  writeAll(state)
  return result
}

export const readMockTimeline = (key: string): MockTimelineRecord =>
  readAll()[key] ?? { entries: [], followers: [], activities: [] }

/** Стан усіх записів: «Мої справи» йдуть через них. */
export const readMockTimelineRecords = () => readAll()

export function notifyMockTimeline(
  resource: string,
  id: string,
  companyId: string | null,
): void {
  emitMockEvent(timelineEventType(resource), { id }, { companyId })
}

export function resetMockTimeline(): void {
  globalThis.localStorage?.removeItem(STORAGE_KEY)
  handledTimelineRequests.clear()
  bumpedTimelineRecords.clear()
}

/** Запис від колеги чи клієнта: подія, як від справжнього сервера. */
export function addMockTimelineEntry(
  target: { resource: string; id: string; companyId: string | null },
  entry: Omit<MockTimelineEntry, "id" | "at">,
): void {
  const stored: MockTimelineEntry = {
    id: `tl-${randomToken().slice(0, 12)}`,
    at: new Date().toISOString(),
    ...entry,
  }
  changeMockTimeline(`${target.resource}/${target.id}`, (record) => {
    record.entries.unshift(stored)
  })
  notifyMockTimeline(target.resource, target.id, target.companyId)
}

/* --------------------------------- Відповіді --------------------------------- */

/** Хто питає й про який запис: перевірив `guard` обробників. */
export interface MockTimelineRequest {
  readonly user: MockUser
  readonly companyId: string | null
  readonly resource: string
  readonly id: string
  readonly key: string
}

export const timelineNotFound = () =>
  errorResponse(404, { code: "not_found", message: "Not found" })

export const invalidTimeline = (field: string, code = "required") =>
  errorResponse(422, {
    code: "validation",
    message: "Validation failed",
    fieldErrors: { [field]: code },
  })

export const timelineConflict = (current: unknown) =>
  errorResponse(409, {
    code: "conflict",
    message: "Changed by someone else",
    current,
  })

/** Сценарій `conflict`: хтось зберіг перед нами, один раз на запис. */
export function bumpMockTimelineItem(item: {
  id: string
  version?: number
}): void {
  if (scenarioFor(TIMELINE_SCENARIO_RESOURCE) !== "conflict") return
  if (bumpedTimelineRecords.delete(item.id)) return
  bumpedTimelineRecords.add(item.id)
  item.version = (item.version ?? 1) + 1
}

export const colleagueOf = (access: MockTimelineRequest, userId: unknown) =>
  mockUsersList().find(
    (user) => user.id === userId && isMockCompanyMember(user, access.companyId),
  )
