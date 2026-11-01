import type { MockTimelineSeeds } from "@/lib/mock-timeline-store"

import type { TimelineActivity, TimelineTarget } from "./contract"

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000

/** Види й терміни прикладів: прострочене, сьогодні й наступні дні. */
const SAMPLES = [
  { type: "call", title: "Передзвонити щодо умов договору", days: -3 },
  { type: "email", title: "Надіслати комерційну пропозицію", days: -1 },
  { type: "task", title: "Звірити реквізити", days: 0 },
  { type: "meeting", title: "Зустріч щодо нового замовлення", days: 0 },
  { type: "call", title: "Уточнити дату оплати", days: 1 },
  { type: "task", title: "Підготувати акт звірки", days: 4 },
  { type: "email", title: "Надіслати підсумки зустрічі", days: 7 },
] as const

export interface TimelineFixturePerson {
  readonly id: string
  readonly name: string
}

export interface TimelineFixtureOptions {
  /** Записи, на які лягають приклади. */
  readonly records?: readonly TimelineTarget[]
  /** Виконавці по черзі; порожньо — прикладів немає. */
  readonly people?: readonly TimelineFixturePerson[]
  /** Момент відліку, щоб тест не залежав від годинника. */
  readonly now?: number
}

const dateAfter = (days: number, now: number) =>
  new Date(now + days * DAY_MS).toISOString().slice(0, 10)

/**
 * Приклади стрічки: на кожен запис одна дія, підписник і нотатка. Дії йдуть по колу через види й
 * терміни, виконавці — через людей, тож «Мої справи» мають приклади на всіх вкладках.
 */
export function createTimelineFixtures({
  records = [],
  people = [],
  now = Date.now(),
}: TimelineFixtureOptions = {}): MockTimelineSeeds {
  return Object.fromEntries(
    records.flatMap(({ resource, id }, index) => {
      const sample = SAMPLES[index % SAMPLES.length]
      const person = people[index % people.length]
      if (!sample || !person) return []
      const assignee = { id: person.id, name: person.name }
      const key = `${resource}/${id}`
      const activity: TimelineActivity = {
        id: `n1-${key}`,
        version: 1,
        type: sample.type,
        title: sample.title,
        dueDate: dateAfter(sample.days, now),
        assignee,
      }
      return [
        [
          key,
          {
            followers: [assignee],
            activities: [activity],
            entries: [
              {
                id: `n1-note-${key}`,
                at: new Date(now - 3 * HOUR_MS).toISOString(),
                kind: "note",
                author: assignee,
                version: 1,
                body: "Клієнт просить зв'язуватись після обіду.",
              },
            ],
          },
        ],
      ]
    }),
  )
}
