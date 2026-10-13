/**
 * Мок центру сповіщень (ADR-0014): сповіщення в застосунку для кожного користувача.
 *
 * - Живуть у localStorage (`erp-ui:mock-inbox:<id>`); початкові — `seeds`.
 * - `pushMockNotification` — інші моки повідомляють користувачів (запит на відновлення доступу,
 *   прийняте запрошення); поважає налаштування «У застосунку» (lib/mock-notifications).
 * - Заголовки й тексти — мовами; мок віддає їх мовою `Accept-Language`.
 */
import { http, type HttpHandler } from "msw/http"

import { API_PREFIX } from "@/registry/lib/api"
import { localizedText, type LocalizedText } from "@/registry/lib/auth"
import { mockChannelEnabled } from "@/registry/lib/mock-notifications"
import {
  currentMockUser,
  errorResponse,
  json,
  noContent,
  randomToken,
  unauthenticated,
} from "@/registry/lib/mock-server"
import type { AppNotification } from "@/registry/lib/notifications"

export type MockInboxItem = Omit<AppNotification, "title" | "body"> & {
  title: LocalizedText
  body?: LocalizedText
}

const KEY = (userId: string) => `erp-ui:mock-inbox:${userId}`
const LIMIT = 200

let seeds: Record<string, MockInboxItem[]> = {}

export function setMockInboxSeeds(value: Record<string, MockInboxItem[]>) {
  seeds = value
}

function read(userId: string): MockInboxItem[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY(userId))
    if (raw) return JSON.parse(raw) as MockInboxItem[]
  } catch {
    // Пошкоджений стан — з початкового.
  }
  // Копія: позначки прочитаного не змінюють самі початкові дані.
  return structuredClone(seeds[userId] ?? [])
}

function write(userId: string, items: MockInboxItem[]): void {
  try {
    globalThis.localStorage?.setItem(
      KEY(userId),
      JSON.stringify(items.slice(0, LIMIT)),
    )
  } catch {
    // Без сховища — до перезавантаження.
  }
}

/** Повідомити користувача в застосунку, якщо він не вимкнув цей канал для події. */
export function pushMockNotification(
  userId: string,
  input: Omit<MockInboxItem, "id" | "createdAt" | "readAt">,
): void {
  if (!mockChannelEnabled(userId, input.type, "in_app")) return
  write(userId, [
    {
      id: `ntf-${randomToken().slice(0, 12)}`,
      createdAt: new Date().toISOString(),
      readAt: null,
      ...input,
    },
    ...read(userId),
  ])
}

const languageOf = (request: Request) =>
  (request.headers.get("Accept-Language") ?? "uk").slice(0, 2)

function localize(item: MockInboxItem, language: string): AppNotification {
  const { title, body, ...rest } = item
  const text = localizedText(body, language)
  return {
    ...rest,
    title: localizedText(title, language) ?? item.type,
    ...(text ? { body: text } : {}),
  }
}

export function createInboxHandlers({
  baseUrl = API_PREFIX,
}: { baseUrl?: string } = {}): HttpHandler[] {
  return [
    http.get(`${baseUrl}/notifications/unread-count`, ({ request }) => {
      // Опитування дзвіника — фоновий запит: сесію не продовжує.
      const user = currentMockUser(request)
      if (!user) return unauthenticated()
      return json({
        count: read(user.id).filter((item) => !item.readAt).length,
      })
    }),

    http.get(`${baseUrl}/notifications`, ({ request }) => {
      const user = currentMockUser()
      if (!user) return unauthenticated()
      const params = new URL(request.url).searchParams
      const page = Math.max(1, Number(params.get("page")) || 1)
      const perPage = Math.min(
        100,
        Math.max(1, Number(params.get("perPage")) || 20),
      )
      const all = read(user.id).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      )
      const unread = all.filter((item) => !item.readAt)
      const list = params.get("status") === "unread" ? unread : all
      const start = (page - 1) * perPage
      const language = languageOf(request)
      return json({
        data: list
          .slice(start, start + perPage)
          .map((item) => localize(item, language)),
        total: list.length,
        unread: unread.length,
      })
    }),

    http.patch(`${baseUrl}/notifications/:id`, async ({ params, request }) => {
      const user = currentMockUser()
      if (!user) return unauthenticated()
      const { read: isRead } = (await request.json()) as { read?: boolean }
      const items = read(user.id)
      const item = items.find((i) => i.id === params.id)
      if (!item)
        return errorResponse(404, { code: "not_found", message: "Not found" })
      item.readAt = isRead ? new Date().toISOString() : null
      write(user.id, items)
      return json(localize(item, languageOf(request)))
    }),

    http.post(`${baseUrl}/notifications/read-all`, () => {
      const user = currentMockUser()
      if (!user) return unauthenticated()
      const now = new Date().toISOString()
      write(
        user.id,
        read(user.id).map((item) =>
          item.readAt ? item : { ...item, readAt: now },
        ),
      )
      return noContent()
    }),
  ]
}
