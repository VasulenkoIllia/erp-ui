/**
 * Моки модуля N1 (ADR-0053, ADR-0054). Адреси стрічки однієї картки дає `lib/mock-timeline`, модуль додає
 * `GET /me/activities`: дії людини через усі записи цілей, які вона бачить у компанії запиту.
 *
 *   const timeline = createTimelineMocks({
 *     targets: [timelineTargetMock({ resource: "contacts", db, title: (contact) => contact.name })],
 *     seeds: createTimelineFixtures({ records, people }),
 *   })
 *   setupWorker(...createPlatformHandlers(…), ...timeline.handlers)
 *
 * Сценарії `success`, `error`, `empty`, `slow`, `conflict`, `forbidden`, `offline` — ресурс `timeline`
 * (`lib/mock-scenarios`, панель розробника) на всіх цих адресах. `empty` дає порожні списки, `conflict` —
 * чуже збереження один раз на запис, тож «Зберегти мої зміни» далі проходить.
 */
import { http, type HttpHandler } from "msw/http"

import { API_PREFIX } from "@/lib/api"
import { mockRequestPermissions } from "@/lib/mock-company-roles"
import { scenarioFor } from "@/lib/mock-scenarios"
import {
  applyScenario,
  currentMockUser,
  json,
  unauthenticated,
  type MockUser,
} from "@/lib/mock-server"
import { createTimelineHandlers } from "@/lib/mock-timeline"
import {
  readMockTimelineRecords,
  type MockTimelineSeeds,
  type MockTimelineTarget,
} from "@/lib/mock-timeline-store"
import { TIMELINE_MAX_PER_PAGE, TIMELINE_PER_PAGE } from "@/lib/timeline"

import { TIMELINE, type TimelineMyActivity } from "./contract"

/** Дії людини на записах цілі, які вона бачить; закриті дії мок зі стану прибирає сам. */
function activitiesOf(
  target: MockTimelineTarget,
  user: MockUser,
  access: { permissions: readonly string[]; companyId: string | null },
): TimelineMyActivity[] {
  const prefix = `${target.resource}/`
  return Object.entries(readMockTimelineRecords()).flatMap(([key, record]) => {
    if (!key.startsWith(prefix)) return []
    const id = key.slice(prefix.length)
    if (!target.sees(user, access.permissions, access.companyId, id)) return []
    const title = target.titleOf?.(id, access.companyId)
    return record.activities
      .filter((activity) => activity.assignee.id === user.id)
      .map((activity) => ({
        ...activity,
        record: { resource: target.resource, id, title },
      }))
  })
}

function myActivitiesHandler(
  targets: readonly MockTimelineTarget[],
  baseUrl: string,
): HttpHandler {
  return http.get(`${baseUrl}/me/activities`, async ({ request }) => {
    const scenario = scenarioFor(TIMELINE)
    const early = await applyScenario(scenario)
    if (early) return early
    const user = currentMockUser(request)
    if (!user) return unauthenticated()
    const access = mockRequestPermissions(request, user)
    if (access instanceof Response) return access
    if (scenario === "empty") return json({ data: [], total: 0 })
    const params = new URL(request.url).searchParams
    const dueFrom = params.get("dueFrom")
    const dueTo = params.get("dueTo")
    const all = targets
      .flatMap((target) => activitiesOf(target, user, access))
      .filter(
        ({ dueDate }) =>
          (!dueFrom || dueDate >= dueFrom) && (!dueTo || dueDate <= dueTo),
      )
      .sort(
        (a, b) =>
          a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id),
      )
    const page = Math.max(1, Number(params.get("page")) || 1)
    const perPage = Math.min(
      TIMELINE_MAX_PER_PAGE,
      Math.max(1, Number(params.get("perPage")) || TIMELINE_PER_PAGE),
    )
    const start = (page - 1) * perPage
    return json({ data: all.slice(start, start + perPage), total: all.length })
  })
}

export interface TimelineMocksOptions {
  /** Ресурси зі стрічкою: `timelineTargetMock` з `lib/mock-timeline-store`. */
  readonly targets: readonly MockTimelineTarget[]
  readonly seeds?: MockTimelineSeeds
  readonly baseUrl?: string
}

export function createTimelineMocks({
  targets,
  seeds,
  baseUrl = API_PREFIX,
}: TimelineMocksOptions) {
  return {
    handlers: [
      myActivitiesHandler(targets, baseUrl),
      ...createTimelineHandlers({ targets, seeds, baseUrl }),
    ],
  }
}
