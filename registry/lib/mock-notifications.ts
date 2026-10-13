/**
 * Мок налаштувань сповіщень (ADR-0013): події проекту, канали, вибір користувача, тихі години.
 *
 * - Вибір кожного користувача живе в localStorage (`erp-ui:mock-notifications:<id>`).
 * - Назви подій і розділів — мовами; мок віддає їх мовою `Accept-Language`.
 */
import { http, type HttpHandler } from "msw/http"

import { API_PREFIX } from "@/registry/lib/api"
import { localizedText, type LocalizedText } from "@/registry/lib/auth"
import {
  currentMockUser,
  errorResponse,
  json,
  unauthenticated,
  type MockUser,
} from "@/registry/lib/mock-server"
import {
  quietHoursSchema,
  type NotificationEvent,
  type QuietHours,
} from "@/registry/lib/notification-settings"

export interface MockNotificationEvent extends Omit<
  NotificationEvent,
  "group" | "label" | "description"
> {
  group: LocalizedText
  label: LocalizedText
  description?: LocalizedText
}

export interface NotificationsMockOptions {
  baseUrl?: string
  /** Канали проекту; назви відомих каналів перекладає кіт. */
  channels?: { id: string; label?: LocalizedText }[]
  events?: MockNotificationEvent[]
}

/** Без подій проекту — лише безпека: лист про новий вхід обов'язковий. */
export const DEFAULT_MOCK_NOTIFICATION_EVENTS: MockNotificationEvent[] = [
  {
    id: "security.new_sign_in",
    group: { uk: "Безпека", en: "Security" },
    label: { uk: "Вхід з нового пристрою", en: "Sign-in from a new device" },
    channels: ["email", "in_app"],
    required: ["email"],
    defaults: ["email", "in_app"],
  },
  {
    id: "security.password_changed",
    group: { uk: "Безпека", en: "Security" },
    label: { uk: "Пароль змінено", en: "Password changed" },
    channels: ["email", "in_app"],
    required: ["email"],
    defaults: ["email"],
  },
]

interface StoredSettings {
  settings: Record<string, string[]>
  quietHours: QuietHours
}

const KEY = (userId: string) => `erp-ui:mock-notifications:${userId}`
const DEFAULT_QUIET: QuietHours = { enabled: false, from: "22:00", to: "08:00" }

const languageOf = (request: Request) =>
  (request.headers.get("Accept-Language") ?? "uk").slice(0, 2)

/** Події проекту — і для обробників, і для інших моків (центр сповіщень). */
let configured: MockNotificationEvent[] = DEFAULT_MOCK_NOTIFICATION_EVENTS

function readSettings(userId: string): StoredSettings {
  const base: StoredSettings = {
    settings: Object.fromEntries(
      configured.map((e) => [e.id, [...e.defaults]]),
    ),
    quietHours: DEFAULT_QUIET,
  }
  try {
    const raw = globalThis.localStorage?.getItem(KEY(userId))
    if (!raw) return base
    const stored = JSON.parse(raw) as Partial<StoredSettings>
    return {
      // Нові події проекту — з типовими каналами.
      settings: { ...base.settings, ...stored.settings },
      quietHours: stored.quietHours ?? base.quietHours,
    }
  } catch {
    return base
  }
}

/** Чи хоче користувач цей канал для події (невідома подія — так; обов'язкові — завжди). */
export function mockChannelEnabled(
  userId: string,
  eventId: string,
  channel: string,
): boolean {
  const event = configured.find((e) => e.id === eventId)
  if (!event) return true
  if (event.required?.includes(channel)) return true
  return readSettings(userId).settings[eventId]?.includes(channel) ?? false
}

export function createNotificationHandlers({
  baseUrl = API_PREFIX,
  channels = [{ id: "in_app" }, { id: "email" }, { id: "push" }],
  events = DEFAULT_MOCK_NOTIFICATION_EVENTS,
}: NotificationsMockOptions = {}): HttpHandler[] {
  configured = events
  const read = (user: MockUser) => readSettings(user.id)

  const response = (user: MockUser, language: string) => {
    const stored = read(user)
    return json({
      channels: channels.map(({ id, label }) => {
        const text = localizedText(label, language)
        return text ? { id, label: text } : { id }
      }),
      events: events.map(({ group, label, description, ...event }) => {
        const text = localizedText(description, language)
        return {
          ...event,
          group: localizedText(group, language) ?? "",
          label: localizedText(label, language) ?? event.id,
          ...(text ? { description: text } : {}),
        }
      }),
      settings: stored.settings,
      quietHours: stored.quietHours,
    })
  }

  return [
    http.get(`${baseUrl}/me/notification-settings`, ({ request }) => {
      const user = currentMockUser()
      if (!user) return unauthenticated()
      return response(user, languageOf(request))
    }),

    http.put(`${baseUrl}/me/notification-settings`, async ({ request }) => {
      const user = currentMockUser()
      if (!user) return unauthenticated()
      const body = (await request.json()) as Partial<StoredSettings>
      const fields: Record<string, string> = {}
      const next = read(user)
      for (const [eventId, selected] of Object.entries(body.settings ?? {})) {
        const event = events.find((e) => e.id === eventId)
        if (
          !event ||
          !Array.isArray(selected) ||
          selected.some((c) => !event.channels.includes(c))
        ) {
          fields[`settings.${eventId}`] = "invalid"
          continue
        }
        if ((event.required ?? []).some((c) => !selected.includes(c))) {
          fields[`settings.${eventId}`] = "required"
          continue
        }
        next.settings[eventId] = [...new Set(selected)]
      }
      if (body.quietHours !== undefined) {
        const parsed = quietHoursSchema.safeParse(body.quietHours)
        if (parsed.success) next.quietHours = parsed.data
        else fields.quietHours = "invalid"
      }
      if (Object.keys(fields).length)
        return errorResponse(422, {
          code: "validation",
          message: "Validation failed",
          fieldErrors: fields,
        })
      try {
        globalThis.localStorage?.setItem(KEY(user.id), JSON.stringify(next))
      } catch {
        // Без сховища — до перезавантаження.
      }
      return response(user, languageOf(request))
    }),
  ]
}
