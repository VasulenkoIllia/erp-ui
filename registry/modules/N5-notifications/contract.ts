/**
 * Контракт модуля N5 «Сповіщення» (SPEC §14, §17; ADR-0013, ADR-0014, ADR-0046).
 *
 * Адреси центру сповіщень і налаштувань уже є в кіті: `lib/notifications`, `lib/notification-settings`.
 * Модуль додає підписку пристрою на web push, `lib/web-push`, під `/api/v1`, для людини, що ввійшла:
 *
 * - `GET /me/push/public-key` → `{ publicKey }`: відкритий ключ VAPID (base64url).
 * - `POST /me/push/subscriptions` `{ endpoint, expirationTime, keys: { p256dh, auth } }` → 204. Запис
 *   один на `endpoint`, повтор його оновлює. Мова push — з `Accept-Language`.
 * - `POST /me/push/subscriptions/remove` `{ endpoint }` → 204, зокрема для невідомої адреси.
 * - `POST /me/push/test` `{ endpoint }` → 204, невідома адреса — 404.
 * - Сервер надсилає JSON `{ id, title, body?, link?, icon? }` шифром `aes128gcm`, до 4 КБ, сам дотримує
 *   вибору каналів і тихих годин; 404 і 410 служби браузера — видалити підписку; 429 і 5xx — повтор.
 */
export { NOTIFICATIONS, NOTIFICATIONS_RESOURCES } from "./resources"
export {
  notificationSchema,
  type AppNotification,
  type InboxApi,
  type NotificationsPage,
} from "@/lib/notifications"
export {
  notificationSettingsSchema,
  type NotificationSettings,
  type NotificationSettingsUpdate,
} from "@/lib/notification-settings"
export type { DevicePushSubscription, PushApi } from "@/lib/web-push"
