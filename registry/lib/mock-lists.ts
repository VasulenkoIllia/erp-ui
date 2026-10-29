/**
 * Мок особистого в списках (ADR-0024): закріплення записів (lib/pins) і налаштування списків
 * (lib/list-settings).
 *
 * - `createResourceHandlers({ pins: true })` (lib/mocks) бере `mockPinStore` і `createPinHandlers`:
 *   `PUT`/`DELETE /<ресурс>/:id/pin`, позначка `pinned` і порядок «закріплені спершу».
 * - `createListSettingsHandlers` — `GET`/`PATCH /me/list-settings/<ресурс>`; сценарій — ресурсу
 *   `list-settings` (панель розробника): помилка, офлайн, повільно, без доступу.
 * - Усе живе в localStorage окремо для кожного користувача (ресурс → значення), як збережені види:
 *   переживає перезавантаження сторінки. Видалений запис відкріплюється в усіх користувачів цього
 *   браузера.
 */
import { http, type HttpHandler } from "msw/http"
import type { z } from "zod"

import { API_PREFIX } from "@/registry/lib/api"
import {
  LIST_SETTINGS_PATH,
  listSettingsSchema,
  type ListSettings,
} from "@/registry/lib/list-settings"
import { scenarioFor } from "@/registry/lib/mock-scenarios"
import {
  applyScenario,
  currentMockUser,
  errorResponse,
  json,
  noContent,
  unauthenticated,
} from "@/registry/lib/mock-server"
import { PIN_LIMIT, PIN_LIMIT_CODE, PIN_PATH } from "@/registry/lib/pins"

/** Ресурс налаштувань списків для сценаріїв панелі розробника. */
export const MOCK_LIST_SETTINGS_RESOURCE = "list-settings"

const PINS_PREFIX = "erp-ui:mock-pins:"
const SETTINGS_PREFIX = "erp-ui:mock-list-settings:"

/**
 * Значення користувача за ресурсом у localStorage (`<prefix><id користувача>`). Зіпсоване значення
 * ресурсу пропускається (`parse` → undefined), решта лишається.
 */
function userStore<V>(
  prefix: string,
  parse: (value: unknown) => V | undefined,
) {
  const read = (userId: string): Record<string, V> => {
    try {
      const raw = globalThis.localStorage?.getItem(prefix + userId)
      const stored: unknown = raw ? JSON.parse(raw) : {}
      if (typeof stored !== "object" || stored === null) return {}
      return Object.fromEntries(
        Object.entries(stored).flatMap(([resource, value]) => {
          const parsed = parse(value)
          return parsed === undefined ? [] : [[resource, parsed] as const]
        }),
      )
    } catch {
      return {}
    }
  }
  const write = (userId: string, all: Record<string, V>): void => {
    try {
      globalThis.localStorage?.setItem(prefix + userId, JSON.stringify(all))
    } catch {
      // Без сховища — до перезавантаження сторінки мок однаково відповідає успіхом.
    }
  }
  /** Користувачі, у яких щось збережено. */
  const users = (): string[] => {
    try {
      return Object.keys(globalThis.localStorage ?? {})
        .filter((key) => key.startsWith(prefix))
        .map((key) => key.slice(prefix.length))
    } catch {
      return []
    }
  }
  return { read, write, users }
}

/** Значення ресурсу, а не успадковане (`constructor` з адреси). */
const own = <V>(all: Record<string, V>, resource: string): V | undefined =>
  Object.hasOwn(all, resource) ? all[resource] : undefined

const pinStore = userStore<string[]>(PINS_PREFIX, (value) =>
  Array.isArray(value) && value.every((id) => typeof id === "string")
    ? value
    : undefined,
)

/** Закріплення одного ресурсу (порядок — порядок закріплення). */
export function mockPinStore(resource: string) {
  return {
    /** Id закріплених користувачем записів у порядку закріплення. */
    ids: (userId: string): string[] =>
      own(pinStore.read(userId), resource) ?? [],
    /** Закріпити (у кінець блоку) чи відкріпити; повторна дія нічого не змінює. */
    set: (userId: string, id: string, pinned: boolean): void => {
      const all = pinStore.read(userId)
      const ids = own(all, resource) ?? []
      if (ids.includes(id) === pinned) return
      pinStore.write(userId, {
        ...all,
        [resource]: pinned ? [...ids, id] : ids.filter((other) => other !== id),
      })
    },
    /** Запис видалили — відкріпити в усіх користувачів цього браузера. */
    forget: (id: string): void => {
      for (const userId of pinStore.users()) {
        const all = pinStore.read(userId)
        const ids = own(all, resource)
        if (ids?.includes(id))
          pinStore.write(userId, {
            ...all,
            [resource]: ids.filter((other) => other !== id),
          })
      }
    },
  }
}

export type MockPinStore = ReturnType<typeof mockPinStore>

/**
 * `PUT`/`DELETE <url>/:id/pin`. `guard` — сценарій, сесія й право на читання в компанії запиту (як
 * для списку); `exists` — чи бачить користувач запис у компанії запиту (інакше 404).
 */
export function createPinHandlers({
  url,
  store,
  guard,
  exists,
}: {
  url: string
  store: MockPinStore
  guard: (request: Request) => Promise<Response | null>
  exists: (id: string, request: Request) => boolean
}): HttpHandler[] {
  const toggle = async (id: string, request: Request, pinned: boolean) => {
    const denied = await guard(request)
    if (denied) return denied
    const userId = currentMockUser()?.id
    if (!userId || !exists(id, request))
      return errorResponse(404, { code: "not_found", message: "Not found" })
    const ids = store.ids(userId)
    if (pinned && !ids.includes(id) && ids.length >= PIN_LIMIT)
      return errorResponse(422, {
        code: PIN_LIMIT_CODE,
        message: `At most ${String(PIN_LIMIT)} pinned records`,
      })
    store.set(userId, id, pinned)
    return noContent()
  }
  return [
    http.put(`${url}/:id/${PIN_PATH}`, ({ params, request }) =>
      toggle(String(params.id), request, true),
    ),
    http.delete(`${url}/:id/${PIN_PATH}`, ({ params, request }) =>
      toggle(String(params.id), request, false),
    ),
  ]
}

const settingsStore = userStore<ListSettings>(SETTINGS_PREFIX, (value) => {
  const parsed = listSettingsSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
})
const NO_SETTINGS: ListSettings = { perPage: null }
const patchSchema = listSettingsSchema.partial().strict()

const fieldErrorsOf = (error: z.ZodError) =>
  Object.fromEntries(
    error.issues.map((issue) => [issue.path.join(".") || "_", issue.message]),
  )

export function createListSettingsHandlers({
  baseUrl = API_PREFIX,
}: { baseUrl?: string } = {}): HttpHandler[] {
  const url = `${baseUrl}/${LIST_SETTINGS_PATH}/:resource`

  /** Сценарій і сесія: відмова або id користувача. */
  async function guard(): Promise<Response | string> {
    const early = await applyScenario(scenarioFor(MOCK_LIST_SETTINGS_RESOURCE))
    if (early) return early
    return currentMockUser()?.id ?? unauthenticated()
  }

  return [
    http.get(url, async ({ params }) => {
      const userId = await guard()
      if (typeof userId !== "string") return userId
      return json(
        own(settingsStore.read(userId), String(params.resource)) ?? NO_SETTINGS,
      )
    }),

    http.patch(url, async ({ params, request }) => {
      const userId = await guard()
      if (typeof userId !== "string") return userId
      const parsed = patchSchema.safeParse(await request.json())
      if (!parsed.success)
        return errorResponse(422, {
          code: "validation",
          message: "Validation failed",
          fieldErrors: fieldErrorsOf(parsed.error),
        })
      const all = settingsStore.read(userId)
      const resource = String(params.resource)
      const next = { ...NO_SETTINGS, ...own(all, resource), ...parsed.data }
      settingsStore.write(userId, { ...all, [resource]: next })
      return json(next)
    }),
  ]
}
