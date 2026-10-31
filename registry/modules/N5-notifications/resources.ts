/**
 * Ресурс модуля N5 без схем: його бере точка входу (`index.ts`) для панелі розробника, не тягнучи
 * zod і схеми контракту в перший екран застосунку.
 */
import type { LocalizedText } from "@/lib/auth"

/** Ресурс сценаріїв моків (`lib/mock-notifications`). Прав немає: людина бачить лише своє. */
export const NOTIFICATIONS = "notifications"

export interface NotificationsResource {
  readonly name: string
  readonly label: LocalizedText
}

export const NOTIFICATIONS_RESOURCES: readonly NotificationsResource[] = [
  { name: NOTIFICATIONS, label: { uk: "Сповіщення", en: "Notifications" } },
]
