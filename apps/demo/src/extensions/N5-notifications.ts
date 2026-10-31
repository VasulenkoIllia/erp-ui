import type { NotificationsExtension } from "@/registry/modules/N5-notifications"

/**
 * Розширення модуля N5 «Сповіщення» під клієнта (ADR-0020, ADR-0025) — так виглядає файл проекту
 * `src/extensions/N5-notifications.ts`: менше сповіщень на сторінку, ніж типово.
 */
export const notificationsExtension: NotificationsExtension = {
  inbox: { perPage: 10 },
}
