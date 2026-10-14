/**
 * Мок особистих збережених видів (ADR-0017): `/me/views` за контрактом lib/saved-views.
 *
 * - Види живуть у localStorage (`erp-ui:mock-views:<id користувача>`), як вподобання:
 *   переживають перезавантаження сторінки.
 * - Сценарій — ресурсу `views` (панель розробника): помилка, офлайн, повільно, без доступу,
 *   порожньо; конфлікт — вид один раз «змінили в іншій вкладці» перед збереженням (409).
 */
import { http, type HttpHandler } from "msw/http"
import { z } from "zod"

import { API_PREFIX } from "@/registry/lib/api"
import { scenarioFor } from "@/registry/lib/mock-scenarios"
import {
  applyScenario,
  currentMockUser,
  errorResponse,
  json,
  noContent,
  randomToken,
  unauthenticated,
} from "@/registry/lib/mock-server"
import {
  DUPLICATE_VIEW_NAME,
  sameViewName,
  SAVED_VIEWS_PER_PAGE,
  savedViewSchema,
  upsertView,
  type SavedView,
} from "@/registry/lib/saved-views"

/** Ресурс для сценаріїв панелі розробника. */
export const MOCK_VIEWS_RESOURCE = "views"

const KEY = (userId: string) => `erp-ui:mock-views:${userId}`
const inputSchema = savedViewSchema.pick({
  resource: true,
  name: true,
  params: true,
  isDefault: true,
})

function read(userId: string): SavedView[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY(userId))
    const stored: unknown = raw ? JSON.parse(raw) : []
    // Зіпсований запис пропускаємо, решта видів лишається.
    return (Array.isArray(stored) ? stored : []).flatMap((item) => {
      const parsed = savedViewSchema.safeParse(item)
      return parsed.success ? [parsed.data] : []
    })
  } catch {
    return []
  }
}

function write(userId: string, views: SavedView[]): void {
  try {
    globalThis.localStorage?.setItem(KEY(userId), JSON.stringify(views))
  } catch {
    // Без сховища — до перезавантаження сторінки мок однаково відповідає успіхом.
  }
}

const collator = new Intl.Collator("uk", { sensitivity: "base" })

const validation = (fieldErrors: Record<string, string>) =>
  errorResponse(422, {
    code: "validation",
    message: "Validation failed",
    fieldErrors,
  })

const issuesByField = (error: z.ZodError) =>
  validation(
    Object.fromEntries(
      error.issues.map((issue) => [issue.path.join(".") || "_", issue.message]),
    ),
  )

const notFound = () =>
  errorResponse(404, { code: "not_found", message: "View not found" })

/** Інша назва того самого ресурсу вже зайнята? */
const taken = (views: SavedView[], view: SavedView) =>
  views.some(
    (other) =>
      other.id !== view.id &&
      other.resource === view.resource &&
      sameViewName(other.name, view.name),
  )

/** Вид, з якого зняли позначку «за замовчуванням», теж змінився: нова версія. */
const bump = (view: SavedView): SavedView => ({
  ...view,
  version: view.version + 1,
})

export function createSavedViewHandlers({
  baseUrl = API_PREFIX,
}: { baseUrl?: string } = {}): HttpHandler[] {
  const url = `${baseUrl}/me/views`
  /** Види, для яких сценарій conflict уже імітував зміну в іншій вкладці. */
  const changedElsewhere = new Set<string>()

  /** Сценарій і сесія: відмова або id користувача. */
  async function guard(): Promise<Response | string> {
    const early = await applyScenario(scenarioFor(MOCK_VIEWS_RESOURCE))
    if (early) return early
    return currentMockUser()?.id ?? unauthenticated()
  }

  return [
    http.get(url, async ({ request }) => {
      const userId = await guard()
      if (typeof userId !== "string") return userId
      if (scenarioFor(MOCK_VIEWS_RESOURCE) === "empty")
        return json({ data: [], total: 0 })
      const params = new URL(request.url).searchParams
      const resource = params.get("resource")
      const perPage = Math.min(
        SAVED_VIEWS_PER_PAGE,
        Math.max(1, Number(params.get("perPage")) || SAVED_VIEWS_PER_PAGE),
      )
      const page = Math.max(1, Number(params.get("page")) || 1)
      const views = read(userId)
        .filter((view) => !resource || view.resource === resource)
        .sort((a, b) => collator.compare(a.name, b.name))
      const start = (page - 1) * perPage
      return json({
        data: views.slice(start, start + perPage),
        total: views.length,
      })
    }),

    http.post(url, async ({ request }) => {
      const userId = await guard()
      if (typeof userId !== "string") return userId
      const parsed = inputSchema.safeParse(await request.json())
      if (!parsed.success) return issuesByField(parsed.error)
      const views = read(userId)
      const view: SavedView = {
        ...parsed.data,
        id: `view-${randomToken().slice(0, 12)}`,
        version: 1,
      }
      if (taken(views, view)) return validation({ name: DUPLICATE_VIEW_NAME })
      write(userId, upsertView(views, view, bump))
      return json(view, { status: 201 })
    }),

    http.patch(`${url}/:id`, async ({ params, request }) => {
      const userId = await guard()
      if (typeof userId !== "string") return userId
      let views = read(userId)
      const stored = views.find((view) => view.id === params.id)
      if (!stored) return notFound()
      const { version, ...changes } = (await request.json()) as Record<
        string,
        unknown
      >
      // Один раз на вид, тож повторне збереження з новою версією проходить.
      if (
        scenarioFor(MOCK_VIEWS_RESOURCE) === "conflict" &&
        !changedElsewhere.delete(stored.id)
      ) {
        changedElsewhere.add(stored.id)
        views = upsertView(views, bump(stored))
        write(userId, views)
      }
      const current = views.find((view) => view.id === stored.id) ?? stored
      if (version !== current.version) {
        return errorResponse(409, {
          code: "conflict",
          message: "View was changed elsewhere",
          current,
        })
      }
      const parsed = savedViewSchema.safeParse({
        ...current,
        ...changes,
        id: current.id,
        resource: current.resource,
        version: current.version + 1,
      })
      if (!parsed.success) return issuesByField(parsed.error)
      if (taken(views, parsed.data))
        return validation({ name: DUPLICATE_VIEW_NAME })
      write(userId, upsertView(views, parsed.data, bump))
      return json(parsed.data)
    }),

    http.delete(`${url}/:id`, async ({ params }) => {
      const userId = await guard()
      if (typeof userId !== "string") return userId
      const views = read(userId)
      if (!views.some((view) => view.id === params.id)) return notFound()
      write(
        userId,
        views.filter((view) => view.id !== params.id),
      )
      return noContent()
    }),
  ]
}
