/**
 * Мок запланованих дій стрічки запису (PF05, ADR-0053): створення й зміна; закрита дія зникає зі
 * списку й лишає запис у стрічці. Обробники — `lib/mock-timeline`.
 */
import { isCalendarDate } from "@/registry/lib/dates"
import {
  bumpMockTimelineItem,
  changeMockTimeline,
  colleagueOf,
  handledTimelineRequests,
  invalidTimeline,
  notifyMockTimeline,
  timelineConflict,
  timelineNotFound,
  type MockTimelineRecord,
  type MockTimelineRequest,
} from "@/registry/lib/mock-timeline-store"
import { json, randomToken, type MockUser } from "@/registry/lib/mock-server"
import {
  timelineActivityInputSchema,
  type TimelineActivity,
  type TimelineActivityPatch,
} from "@/registry/lib/timeline"

export async function addActivity(
  request: Request,
  access: MockTimelineRequest,
) {
  const payload = (await request.json()) as { requestId?: string }
  const onceKey = `${access.key}/${String(payload.requestId)}`
  if (handledTimelineRequests.has(onceKey))
    return json(handledTimelineRequests.get(onceKey), { status: 201 })
  const parsed = timelineActivityInputSchema.safeParse(payload)
  if (!parsed.success) return invalidTimeline("title")
  const { assigneeId, ...fields } = parsed.data
  if (!isCalendarDate(fields.dueDate))
    return invalidTimeline("dueDate", "invalid")
  const assignee = colleagueOf(access, assigneeId)
  if (!assignee) return invalidTimeline("assigneeId", "invalid")
  const activity: TimelineActivity = {
    ...fields,
    id: `act-${randomToken().slice(0, 12)}`,
    version: 1,
    assignee: { id: assignee.id, name: assignee.name },
  }
  changeMockTimeline(access.key, ({ activities }) => {
    activities.push(activity)
  })
  handledTimelineRequests.set(onceKey, activity)
  notifyMockTimeline(access.resource, access.id, access.companyId)
  return json(activity, { status: 201 })
}

/** Закрита дія зникає зі списку й лишає запис у стрічці. */
function closeActivity(
  record: MockTimelineRecord,
  activity: TimelineActivity,
  status: "done" | "cancelled",
  user: MockUser,
) {
  record.activities = record.activities.filter(
    (item) => item.id !== activity.id,
  )
  record.entries.unshift({
    id: `tl-${randomToken().slice(0, 12)}`,
    at: new Date().toISOString(),
    kind: "activity",
    author: { id: user.id, name: user.name },
    activity: { type: activity.type, title: activity.title, status },
  })
}

export async function patchActivity(
  request: Request,
  access: MockTimelineRequest,
  activityId: unknown,
) {
  const { version, status, assigneeId, ...fields } =
    (await request.json()) as TimelineActivityPatch
  const assignee = assigneeId ? colleagueOf(access, assigneeId) : undefined
  if (assigneeId && !assignee) return invalidTimeline("assigneeId", "invalid")
  const result = changeMockTimeline(access.key, (record) => {
    const activity = record.activities.find((item) => item.id === activityId)
    if (!activity) return timelineNotFound()
    bumpMockTimelineItem(activity)
    if (version !== activity.version) return timelineConflict(activity)
    if (status) closeActivity(record, activity, status, access.user)
    Object.assign(activity, fields, { version: version + 1 })
    if (assignee) activity.assignee = { id: assignee.id, name: assignee.name }
    return json(activity)
  })
  if (result.ok)
    notifyMockTimeline(access.resource, access.id, access.companyId)
  return result
}
