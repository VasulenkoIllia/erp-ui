/**
 * Мок стрічки запису (PF05, ADR-0053): нотатки, повідомлення, файли, підписники й заплановані дії
 * поверх записів ресурсів, що їх передає проект (`timelineTargetMock`).
 *
 * - Стан і цілі — `lib/mock-timeline-store`. `body` у засіві — документ або простий рядок: обидва
 *   шляхи контракту (ADR-0052).
 * - Писати може кожен, хто бачить запис, як на справжньому сервері; нотатку й файл змінює автор.
 * - Зміни полів мок не зберігає: бере з журналу аудиту запису (`mockRecordChanges`).
 * - Повідомлення приходить зі станом `queued`, за `MESSAGE_SEND_MS` стає `sent`, і йде подія каналу.
 * - Сценарії — ресурс `timeline`: `empty` дає порожню стрічку, `conflict` імітує чуже збереження один
 *   раз на запис, тож «Зберегти мої зміни» далі проходить.
 */
import { http, type HttpHandler } from "msw/http"

import { API_PREFIX } from "@/registry/lib/api"
import type { AuditEvent } from "@/registry/lib/audit"
import { mockRecordChanges } from "@/registry/lib/mock-audit"
import { mockRequestPermissions } from "@/registry/lib/mock-company-roles"
import { scenarioFor } from "@/registry/lib/mock-scenarios"
import {
  addActivity,
  patchActivity,
} from "@/registry/lib/mock-timeline-activities"
import {
  bumpMockTimelineItem,
  changeMockTimeline,
  colleagueOf,
  handledTimelineRequests,
  invalidTimeline,
  notifyMockTimeline,
  readMockTimeline,
  setMockTimelineSeeds,
  timelineConflict,
  timelineNotFound,
  type MockTimelineEntry,
  type MockTimelineRequest,
  type MockTimelineSeeds,
  type MockTimelineTarget,
} from "@/registry/lib/mock-timeline-store"
import {
  applyScenario,
  currentMockUser,
  errorResponse,
  json,
  noContent,
  randomToken,
  unauthenticated,
  type MockUser,
} from "@/registry/lib/mock-server"
import { RECORD_DENIAL_REASONS } from "@/registry/lib/record-access"
import { isRichTextEmpty, richTextSchema } from "@/registry/lib/rich-text"
import {
  TIMELINE_MAX_FILE_BYTES,
  TIMELINE_PER_PAGE,
  TIMELINE_POST_KINDS,
  TIMELINE_SCENARIO_RESOURCE,
  type TimelineActivity,
  type TimelinePostKind,
} from "@/registry/lib/timeline"

const MESSAGE_SEND_MS = 800

/* --------------------------------- Відповіді --------------------------------- */

const OWN_ONLY = {
  update: RECORD_DENIAL_REASONS.own,
  delete: RECORD_DENIAL_REASONS.own,
}

/** Нотатку й файл змінює лише автор: позначка для того, хто питає (ADR-0037). */
const forReader = (entry: MockTimelineEntry, user: MockUser) =>
  (entry.kind === "note" || entry.kind === "file") &&
  entry.author.id !== user.id
    ? { ...entry, deniedActions: OWN_ONLY }
    : entry

const changeEntry = (event: AuditEvent) => ({
  id: event.id,
  at: event.at,
  kind: "change",
  author: event.actor,
  changes: event.changes ?? [],
})

const isEmptyScenario = () =>
  scenarioFor(TIMELINE_SCENARIO_RESOURCE) === "empty"

/* --------------------------------- Обробники --------------------------------- */

const pageOf = (params: URLSearchParams) => ({
  page: Math.max(1, Number(params.get("page")) || 1),
  perPage: Math.min(
    100,
    Math.max(1, Number(params.get("perPage")) || TIMELINE_PER_PAGE),
  ),
})

/** Людина й запис запиту або готова відмова: сценарій, сесія, права, чи бачить запис. */
function createGuard(targets: readonly MockTimelineTarget[]) {
  return async (
    request: Request,
    params: Record<string, unknown>,
  ): Promise<MockTimelineRequest | Response> => {
    const early = await applyScenario(scenarioFor(TIMELINE_SCENARIO_RESOURCE))
    if (early) return early
    const user = currentMockUser(request)
    if (!user) return unauthenticated()
    const access = mockRequestPermissions(request, user)
    if (access instanceof Response) return access
    const resource = String(params.resource)
    const id = String(params.id)
    const target = targets.find((item) => item.resource === resource)
    if (!target?.sees(user, access.permissions, access.companyId, id))
      return timelineNotFound()
    const { companyId } = access
    return { user, companyId, resource, id, key: `${resource}/${id}` }
  }
}

function listEntries(request: Request, access: MockTimelineRequest) {
  if (isEmptyScenario()) return json({ data: [], total: 0 })
  const params = new URL(request.url).searchParams
  const language = (request.headers.get("Accept-Language") ?? "uk").slice(0, 2)
  const changes = mockRecordChanges(
    { type: access.resource, id: access.id },
    access.companyId,
    language,
  ).map(changeEntry)
  const kind = params.get("kind")
  const all = [...readMockTimeline(access.key).entries, ...changes]
    .filter((entry) => !kind || entry.kind === kind)
    .sort((a, b) => b.at.localeCompare(a.at))
  const { page, perPage } = pageOf(params)
  const start = (page - 1) * perPage
  return json({
    data: all
      .slice(start, start + perPage)
      .map((entry) =>
        "changes" in entry ? entry : forReader(entry, access.user),
      ),
    total: all.length,
  })
}

/** Вихідне повідомлення сервер надсилає сам: стан змінюється після відповіді. */
function sendLater(access: MockTimelineRequest, entryId: string): void {
  setTimeout(() => {
    changeMockTimeline(access.key, ({ entries }) => {
      const entry = entries.find((item) => item.id === entryId)
      if (entry) entry.status = "sent"
    })
    notifyMockTimeline(access.resource, access.id, access.companyId)
  }, MESSAGE_SEND_MS)
}

async function postEntry(request: Request, access: MockTimelineRequest) {
  const { requestId, kind, body } = (await request.json()) as {
    requestId?: string
    kind?: TimelinePostKind
    body?: unknown
  }
  const onceKey = `${access.key}/${String(requestId)}`
  if (handledTimelineRequests.has(onceKey))
    return json(handledTimelineRequests.get(onceKey), { status: 201 })
  if (!requestId || !kind || !TIMELINE_POST_KINDS.includes(kind))
    return invalidTimeline("kind")
  const parsed = richTextSchema.safeParse(body)
  if (!parsed.success || isRichTextEmpty(parsed.data))
    return invalidTimeline("body")
  const { user } = access
  const base = {
    id: `tl-${randomToken().slice(0, 12)}`,
    at: new Date().toISOString(),
    kind,
    author: { id: user.id, name: user.name },
    body: parsed.data,
  }
  const entry: MockTimelineEntry =
    kind === "note"
      ? { ...base, version: 1 }
      : { ...base, direction: "outgoing", status: "queued" }
  changeMockTimeline(access.key, ({ entries }) => {
    entries.unshift(entry)
  })
  handledTimelineRequests.set(onceKey, entry)
  notifyMockTimeline(access.resource, access.id, access.companyId)
  if (kind === "message") sendLater(access, entry.id)
  return json(entry, { status: 201 })
}

async function patchNote(
  request: Request,
  access: MockTimelineRequest,
  entryId: unknown,
) {
  const { version, body } = (await request.json()) as {
    version: number
    body?: unknown
  }
  const parsed = richTextSchema.safeParse(body)
  if (!parsed.success || isRichTextEmpty(parsed.data))
    return invalidTimeline("body")
  const { user } = access
  const result = changeMockTimeline(access.key, ({ entries }) => {
    const note = entries.find(
      (item) => item.id === entryId && item.kind === "note",
    )
    if (!note) return timelineNotFound()
    if (note.author.id !== user.id)
      return errorResponse(403, { code: "forbidden", message: "Not yours" })
    bumpMockTimelineItem(note)
    if (version !== note.version) return timelineConflict(forReader(note, user))
    note.body = parsed.data
    note.version = version + 1
    note.editedAt = new Date().toISOString()
    return json(note)
  })
  if (result.ok)
    notifyMockTimeline(access.resource, access.id, access.companyId)
  return result
}

function removeEntry(access: MockTimelineRequest, entryId: unknown) {
  const { user } = access
  const result = changeMockTimeline(access.key, ({ entries }) => {
    const index = entries.findIndex((item) => item.id === entryId)
    const entry = entries[index]
    if (!entry || (entry.kind !== "note" && entry.kind !== "file"))
      return timelineNotFound()
    if (entry.author.id !== user.id)
      return errorResponse(403, { code: "forbidden", message: "Not yours" })
    entries.splice(index, 1)
    return noContent()
  })
  if (result.ok)
    notifyMockTimeline(access.resource, access.id, access.companyId)
  return result
}

async function uploadFile(request: Request, access: MockTimelineRequest) {
  const form = await request.formData()
  const file = form.get("file")
  if (!file || typeof file === "string") return invalidTimeline("file")
  const onceKey = `${access.key}/${form.get("requestId") as string}`
  if (handledTimelineRequests.has(onceKey))
    return json(handledTimelineRequests.get(onceKey), { status: 201 })
  if (file.size > TIMELINE_MAX_FILE_BYTES)
    return invalidTimeline("file", "too_large")
  const id = `file-${randomToken().slice(0, 12)}`
  const { user } = access
  const entry: MockTimelineEntry = {
    id: `tl-${randomToken().slice(0, 12)}`,
    at: new Date().toISOString(),
    kind: "file",
    author: { id: user.id, name: user.name },
    file: {
      id,
      name: file.name,
      size: file.size,
      type: file.type,
      url: `https://files.example/${id}/${encodeURIComponent(file.name)}`,
    },
  }
  changeMockTimeline(access.key, ({ entries }) => {
    entries.unshift(entry)
  })
  handledTimelineRequests.set(onceKey, entry)
  notifyMockTimeline(access.resource, access.id, access.companyId)
  return json(entry, { status: 201 })
}

const byDueDate = (a: TimelineActivity, b: TimelineActivity) =>
  a.dueDate.localeCompare(b.dueDate)

export function createTimelineHandlers({
  targets,
  seeds: initial = {},
  baseUrl = API_PREFIX,
}: {
  targets: readonly MockTimelineTarget[]
  seeds?: MockTimelineSeeds
  baseUrl?: string
}): HttpHandler[] {
  setMockTimelineSeeds(initial)
  const guard = createGuard(targets)
  const record = `${baseUrl}/:resource/:id`

  return [
    http.get(`${record}/timeline`, async ({ request, params }) => {
      const access = await guard(request, params)
      return access instanceof Response ? access : listEntries(request, access)
    }),
    http.post(`${record}/timeline`, async ({ request, params }) => {
      const access = await guard(request, params)
      return access instanceof Response ? access : postEntry(request, access)
    }),
    http.patch(`${record}/timeline/:entryId`, async ({ request, params }) => {
      const access = await guard(request, params)
      if (access instanceof Response) return access
      return patchNote(request, access, params.entryId)
    }),
    http.delete(`${record}/timeline/:entryId`, async ({ request, params }) => {
      const access = await guard(request, params)
      if (access instanceof Response) return access
      return removeEntry(access, params.entryId)
    }),
    http.post(`${record}/files`, async ({ request, params }) => {
      const access = await guard(request, params)
      return access instanceof Response ? access : uploadFile(request, access)
    }),

    http.get(`${record}/followers`, async ({ request, params }) => {
      const access = await guard(request, params)
      if (access instanceof Response) return access
      return json({
        data: isEmptyScenario() ? [] : readMockTimeline(access.key).followers,
      })
    }),
    http.put(`${record}/followers/:userId`, async ({ request, params }) => {
      const access = await guard(request, params)
      if (access instanceof Response) return access
      const person = colleagueOf(access, params.userId)
      if (!person) return timelineNotFound()
      changeMockTimeline(access.key, ({ followers }) => {
        if (!followers.some((item) => item.id === person.id))
          followers.push({ id: person.id, name: person.name })
      })
      notifyMockTimeline(access.resource, access.id, access.companyId)
      return noContent()
    }),
    http.delete(`${record}/followers/:userId`, async ({ request, params }) => {
      const access = await guard(request, params)
      if (access instanceof Response) return access
      changeMockTimeline(access.key, (state) => {
        state.followers = state.followers.filter(
          (item) => item.id !== params.userId,
        )
      })
      notifyMockTimeline(access.resource, access.id, access.companyId)
      return noContent()
    }),

    http.get(`${record}/activities`, async ({ request, params }) => {
      const access = await guard(request, params)
      if (access instanceof Response) return access
      return json({
        data: isEmptyScenario()
          ? []
          : [...readMockTimeline(access.key).activities].sort(byDueDate),
      })
    }),
    http.post(`${record}/activities`, async ({ request, params }) => {
      const access = await guard(request, params)
      return access instanceof Response ? access : addActivity(request, access)
    }),
    http.patch(
      `${record}/activities/:activityId`,
      async ({ request, params }) => {
        const access = await guard(request, params)
        if (access instanceof Response) return access
        return patchActivity(request, access, params.activityId)
      },
    ),
  ]
}
