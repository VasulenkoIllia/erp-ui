/**
 * Налаштування сповіщень користувача (ADR-0013, PF10): про які події й якими каналами повідомляти,
 * тихі години.
 *
 * Контракт (під `/api/v1`, для користувача, що увійшов):
 * - `GET /me/notification-settings` → { channels, events, settings, quietHours }:
 *   - `channels` — канали проекту (`in_app`, `email`, `push`, `sms`, `telegram`, `viber` чи свої);
 *   - `events` — події проекту з розділом, назвою, доступними й обов'язковими каналами
 *     (обов'язкові — напр. лист про вхід з нового пристрою — вимкнути не можна) і типовими;
 *   - `settings` — { [подія]: канали }, `quietHours` — { enabled, from, to } за часовим поясом
 *     профілю (ADR-0012).
 * - `PUT /me/notification-settings` { settings, quietHours } → те саме, що GET; помилки — 422
 *   `fieldErrors` (`settings.<подія>`: `required` чи `invalid`, `quietHours`: `invalid`).
 * - Тихі години: без push і повідомлень у месенджери; у застосунку й листом — як завжди;
 *   обов'язкові (безпека) — завжди.
 * - Назви подій і розділів — мовою з `Accept-Language`; назви відомих каналів перекладає кіт.
 */
import { z } from "zod"

/** Канали, назви яких знає кіт; проект може мати свої (з `label`). */
export const NOTIFICATION_CHANNELS = [
  "in_app",
  "email",
  "push",
  "sms",
  "telegram",
  "viber",
] as const
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number]

/** «22:00» — години й хвилини. */
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)

export const quietHoursSchema = z.object({
  enabled: z.boolean(),
  from: timeSchema,
  to: timeSchema,
})
export type QuietHours = z.infer<typeof quietHoursSchema>

export const notificationEventSchema = z.object({
  id: z.string(),
  group: z.string(),
  label: z.string(),
  description: z.string().optional(),
  /** Якими каналами можна повідомляти про цю подію. */
  channels: z.array(z.string()).min(1),
  /** Канали, які не вимкнути (безпека). */
  required: z.array(z.string()).optional(),
  /** Типові канали — для «Повернути типові». */
  defaults: z.array(z.string()),
})
export type NotificationEvent = z.infer<typeof notificationEventSchema>

export const notificationSettingsSchema = z.object({
  channels: z.array(z.object({ id: z.string(), label: z.string().optional() })),
  events: z.array(notificationEventSchema),
  settings: z.record(z.string(), z.array(z.string())),
  quietHours: quietHoursSchema,
})
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>

export interface NotificationSettingsUpdate {
  settings: Record<string, string[]>
  quietHours: QuietHours
}

/** Канали, які тихі години приглушують. */
export const QUIET_HOURS_CHANNELS: readonly string[] = [
  "push",
  "sms",
  "telegram",
  "viber",
]
