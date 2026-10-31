/**
 * Мок підписки web push (ADR-0046): підписки кожного користувача, перевірочний push.
 *
 * - Підписки живуть у localStorage (`erp-ui:mock-push:<id>`).
 * - Служби браузера в моках немає: перевірку показує сама сторінка через реєстрацію фонового файла.
 *   Сторінка в обробнику MSW — та сама, що викликала запит, тож дозвіл уже є.
 * - Сценарії — ресурс `notifications`.
 */
import { http, type HttpHandler } from "msw/http"

import { API_PREFIX } from "@/registry/lib/api"
import { localizedText, type LocalizedText } from "@/registry/lib/auth"
import {
  languageOf,
  notificationsScenario,
} from "@/registry/lib/mock-notifications"
import {
  currentMockUser,
  errorResponse,
  json,
  noContent,
  randomToken,
  unauthenticated,
} from "@/registry/lib/mock-server"
import { PUSH_SW_SCOPE } from "@/registry/lib/push-device"

/** Справжня точка P-256, але закритого ключа ніхто не має: браузер приймає, сервера немає. */
export const MOCK_PUSH_PUBLIC_KEY =
  "BCZlOGPgTVxpFUwVXpEx3YuRYdc3HtAaKZhdApNlhEIem16lolHQW9i9bHXhHwGBc0fs0VVpZzI4-eeLs7OtoLY"

const TEST_TITLE: LocalizedText = {
  uk: "Перевірка сповіщень",
  en: "Notification test",
}
const TEST_BODY: LocalizedText = {
  uk: "Push на цьому пристрої працює.",
  en: "Push works on this device.",
}

const KEY = (userId: string) => `erp-ui:mock-push:${userId}`

function readEndpoints(userId: string): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY(userId))
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function writeEndpoints(userId: string, endpoints: string[]): void {
  try {
    globalThis.localStorage?.setItem(KEY(userId), JSON.stringify(endpoints))
  } catch {
    // Без сховища — до перезавантаження.
  }
}

async function showTestPush(language: string): Promise<void> {
  const registration =
    await globalThis.navigator?.serviceWorker?.getRegistration(PUSH_SW_SCOPE)
  await registration?.showNotification(
    localizedText(TEST_TITLE, language) ?? "",
    // Свій `tag` щоразу: інакше повторна перевірка тихо замінила б першу.
    {
      body: localizedText(TEST_BODY, language),
      tag: `erp-ui-push-test-${randomToken().slice(0, 8)}`,
    },
  )
}

export function createPushHandlers({
  baseUrl = API_PREFIX,
}: { baseUrl?: string } = {}): HttpHandler[] {
  return [
    http.get(`${baseUrl}/me/push/public-key`, async () => {
      const early = await notificationsScenario()
      if (early) return early
      if (!currentMockUser()) return unauthenticated()
      return json({ publicKey: MOCK_PUSH_PUBLIC_KEY })
    }),

    http.post(`${baseUrl}/me/push/subscriptions`, async ({ request }) => {
      const early = await notificationsScenario({ write: true })
      if (early) return early
      const user = currentMockUser()
      if (!user) return unauthenticated()
      const { endpoint } = (await request.json()) as { endpoint?: string }
      if (!endpoint?.startsWith("https://"))
        return errorResponse(422, {
          code: "validation",
          message: "Validation failed",
          fieldErrors: { endpoint: "invalid" },
        })
      const others = readEndpoints(user.id).filter((e) => e !== endpoint)
      writeEndpoints(user.id, [...others, endpoint])
      return noContent()
    }),

    http.post(
      `${baseUrl}/me/push/subscriptions/remove`,
      async ({ request }) => {
        const early = await notificationsScenario({ write: true })
        if (early) return early
        const user = currentMockUser()
        if (!user) return unauthenticated()
        const { endpoint } = (await request.json()) as { endpoint?: string }
        writeEndpoints(
          user.id,
          readEndpoints(user.id).filter((e) => e !== endpoint),
        )
        return noContent()
      },
    ),

    http.post(`${baseUrl}/me/push/test`, async ({ request }) => {
      const early = await notificationsScenario({ write: true })
      if (early) return early
      const user = currentMockUser()
      if (!user) return unauthenticated()
      const { endpoint } = (await request.json()) as { endpoint?: string }
      if (!endpoint || !readEndpoints(user.id).includes(endpoint))
        return errorResponse(404, { code: "not_found", message: "Not found" })
      await showTestPush(languageOf(request))
      return noContent()
    }),
  ]
}
