/**
 * Центр сповіщень (ADR-0014, PF10/UI02): сповіщення в застосунку — дзвіник із лічильником і
 * інбокс. Які події й якими каналами — налаштування користувача (lib/notification-settings).
 *
 * Контракт (під `/api/v1`, для користувача, що увійшов):
 * - `GET /notifications?status=all|unread&page=&perPage=` → { data, total, unread }, новіші першими;
 * - `GET /notifications/unread-count` → { count } — для дзвіника: перечитується за подією
 *   `notifications.created` каналу реального часу (lib/realtime), без каналу — раз на хвилину. Запит
 *   фоновий (`X-Background-Request: 1`): сервер не продовжує ним ковзну сесію;
 * - `PATCH /notifications/:id` { read } → сповіщення; `POST /notifications/read-all` → 204;
 * - сповіщення: тип (подія з налаштувань), заголовок і текст мовою `Accept-Language`, важливість,
 *   хто спричинив, `link` — шлях у застосунку, куди веде клік;
 * - підписка пристрою на web push — `inbox.push`, контракт у `lib/web-push` (ADR-0046).
 */
import { z } from "zod"

import type { ApiClient } from "@/registry/lib/api"
import { createPushApi, type PushApi } from "@/registry/lib/web-push"

/** Ресурс сповіщень: подія каналу реального часу, сценарії моків. */
export const NOTIFICATIONS_RESOURCE = "notifications"

export const NOTIFICATION_SEVERITIES = [
  "info",
  "success",
  "warning",
  "error",
] as const

export const notificationSchema = z.object({
  id: z.string(),
  /** Подія: `invoices.overdue`, `security.new_sign_in`. */
  type: z.string(),
  title: z.string(),
  body: z.string().optional(),
  createdAt: z.string(),
  readAt: z.string().nullable(),
  severity: z.enum(NOTIFICATION_SEVERITIES).optional(),
  actor: z.object({ name: z.string() }).optional(),
  /** Шлях у застосунку: `/invoices/42`. */
  link: z.string().optional(),
})
export type AppNotification = z.infer<typeof notificationSchema>

const pageSchema = z.object({
  data: z.array(notificationSchema),
  total: z.number().int().min(0),
  unread: z.number().int().min(0),
})
export type NotificationsPage = z.infer<typeof pageSchema>

const countSchema = z.object({ count: z.number().int().min(0) })

export interface InboxApi {
  list: (
    status: "all" | "unread",
    page: number,
    perPage: number,
  ) => Promise<NotificationsPage>
  unreadCount: () => Promise<number>
  markRead: (id: string, read: boolean) => Promise<AppNotification>
  markAllRead: () => Promise<void>
  /** Web push на цьому пристрої. */
  push: PushApi
}

export function createInboxApi(client: ApiClient): InboxApi {
  return {
    list: (status, page, perPage) =>
      client.get("/notifications", {
        query: { status, page: String(page), perPage: String(perPage) },
        schema: pageSchema,
      }),
    async unreadCount() {
      const { count } = await client.get("/notifications/unread-count", {
        schema: countSchema,
        background: true,
      })
      return count
    },
    markRead: (id, read) =>
      client.patch(
        `/notifications/${encodeURIComponent(id)}`,
        { read },
        { schema: notificationSchema },
      ),
    async markAllRead() {
      await client.post("/notifications/read-all")
    },
    push: createPushApi(client),
  }
}

export const INBOX_QUERY_KEYS = {
  all: ["erp-ui", "inbox"],
  count: ["erp-ui", "inbox", "count"],
  list: (status: "all" | "unread") => ["erp-ui", "inbox", "list", status],
} as const
