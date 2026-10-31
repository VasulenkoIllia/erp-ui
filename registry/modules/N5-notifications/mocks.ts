/**
 * Моки модуля N5 (ADR-0013, ADR-0014, ADR-0046). Центр сповіщень, налаштування й підписку push
 * віддають моки платформи (`lib/mock-inbox`, `lib/mock-notifications`, `lib/mock-push`), модуль їх не
 * дублює: він дає лише початкові сповіщення для `inboxSeeds`.
 *
 *   const notifications = createNotificationsMocks({ users: ["u-olena"] })
 *   setupWorker(...createPlatformHandlers({ inboxSeeds: notifications.seeds }))
 *
 * Сценарії `success`, `error`, `empty`, `slow`, `conflict`, `forbidden`, `offline` — ресурс
 * `notifications` (`lib/mock-scenarios`, панель розробника) на всіх цих адресах. `empty` дає порожній
 * список і нуль непрочитаних; `conflict` — 409 на запис. Події налаштувань дає проект, тож там
 * `empty` працює як `success`.
 */
import {
  createNotificationsFixtures,
  type NotificationsFixtureOptions,
} from "./fixtures"

export type NotificationsMocksOptions = NotificationsFixtureOptions

export function createNotificationsMocks(
  options: NotificationsMocksOptions = {},
) {
  return { seeds: createNotificationsFixtures(options) }
}
