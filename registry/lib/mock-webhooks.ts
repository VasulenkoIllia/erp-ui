/**
 * Мок вебхуків (ADR-0013): підписки, секрет підпису, тестова подія й журнал доставок.
 *
 * - Підписки й доставки живуть у localStorage (`erp-ui:mock-webhooks`), як дані сервера. У пачці
 *   змін (`mockBatch`, масова дія) стан читається й пишеться в сховище раз.
 * - Події — із шини мок-сервера (`emitMockEvent`): зміни записів (`invoices.updated`) потрапляють
 *   до підписок, що на них чекають.
 * - Мок не ходить у мережу: хост `*.invalid` — помилка DNS, шлях із `/fail` — відповідь 500,
 *   решта — 200.
 * - Підписки — компанії запиту (A2c1): список, зміни, тест і доставки — лише свої, іншої — 404;
 *   подія йде підпискам компанії, якої вона стосується (`inMockScope`). Підписка без компанії —
 *   як запис без компанії: спільна.
 */
import { http, type HttpHandler } from "msw/http"

import { API_PREFIX } from "@/registry/lib/api"
import { localizedText, type LocalizedText } from "@/registry/lib/auth"
import { recordAudit } from "@/registry/lib/mock-audit"
import { mockRequestPermissions } from "@/registry/lib/mock-company-roles"
import { scenarioFor } from "@/registry/lib/mock-scenarios"
import {
  applyScenario,
  batchedMockState,
  currentMockUser,
  errorResponse,
  impersonationForbidden,
  json,
  noContent,
  randomToken,
  subscribeMockEvents,
  unauthenticated,
  type MockEvent,
  type MockScope,
  type MockUser,
} from "@/registry/lib/mock-server"
import {
  inMockScope,
  mockGrantsService,
  ownedByMockCompany,
  withoutMockScope,
} from "@/registry/lib/mock-scope"
import {
  webhookUrlIssue,
  type Webhook,
  type WebhookDelivery,
} from "@/registry/lib/webhooks"

/* ----------------------------------- Стан ----------------------------------- */

interface MockWebhook extends Webhook {
  /** Мок тримає секрет відкрито; справжній сервер — зашифрованим. */
  secret: string
  /** Компанія підписки; немає — спільна (застосунок без компаній). */
  companyId?: string | null
}

interface MockWebhooksState {
  webhooks: MockWebhook[]
  deliveries: WebhookDelivery[]
}

/** Початкова підписка демо: без секрету (мок створить), з доставками. */
export type MockWebhookSeed = Omit<
  MockWebhook,
  "secret" | "secretPrefix" | "failures" | "lastDelivery"
> & {
  deliveries?: Omit<WebhookDelivery, "webhookId" | "request">[]
}

/** Подія, на яку можна підписатися: назва й розділ мовами. */
export interface MockWebhookEventType {
  label: LocalizedText
  group?: LocalizedText
}

const STATE_KEY = "erp-ui:mock-webhooks"
const DELIVERY_LIMIT = 200

let seeds: MockWebhookSeed[] = []

function newSecret(): string {
  return `whsec_${randomToken()}${randomToken()}`
}

const prefixOf = (secret: string) => `${secret.slice(0, 10)}…`

function seedState(): MockWebhooksState {
  const webhooks: MockWebhook[] = []
  const deliveries: WebhookDelivery[] = []
  for (const { deliveries: seeded = [], ...seed } of seeds) {
    const secret = newSecret()
    const own = seeded.map((delivery) => ({
      ...delivery,
      webhookId: seed.id,
      request: requestOf(delivery.event, delivery.id, delivery.at, {}),
    }))
    deliveries.push(...own)
    const last = own[0]
    webhooks.push({
      ...seed,
      secret,
      secretPrefix: prefixOf(secret),
      lastDelivery: last
        ? {
            at: last.at,
            status: last.status === "success" ? "success" : "failed",
            ...(last.statusCode ? { statusCode: last.statusCode } : {}),
          }
        : null,
      failures:
        own.findIndex((d) => d.status === "success") === -1
          ? own.length
          : own.findIndex((d) => d.status === "success"),
    })
  }
  return { webhooks, deliveries }
}

export function setMockWebhookSeeds(value: MockWebhookSeed[]): void {
  seeds = value
}

function loadState(): MockWebhooksState {
  try {
    const raw = globalThis.localStorage?.getItem(STATE_KEY)
    if (raw) return JSON.parse(raw) as MockWebhooksState
  } catch {
    // Пошкоджений стан — з початкового.
  }
  const state = seedState()
  saveState(state)
  return state
}

function saveState(state: MockWebhooksState): void {
  try {
    globalThis.localStorage?.setItem(
      STATE_KEY,
      JSON.stringify({
        ...state,
        deliveries: state.deliveries.slice(0, DELIVERY_LIMIT),
      }),
    )
  } catch {
    // Без сховища — до перезавантаження.
  }
}

const webhooksStore = batchedMockState(loadState, saveState)
const readState = () => webhooksStore.read()
// Ліміт і в пам'яті: у пачці змін доставки не ростуть з кожною подією.
const writeState = (state: MockWebhooksState) => {
  webhooksStore.write({
    ...state,
    deliveries: state.deliveries.slice(0, DELIVERY_LIMIT),
  })
}

function requestOf(
  event: string,
  deliveryId: string,
  at: string,
  data: Record<string, unknown>,
): WebhookDelivery["request"] {
  const body = JSON.stringify(
    { id: `evt_${deliveryId}`, type: event, createdAt: at, data },
    null,
    2,
  )
  const t = Math.floor(Date.parse(at) / 1000)
  return {
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "erp-ui-webhooks/1.0",
      "X-Erp-Event": event,
      "X-Erp-Delivery": deliveryId,
      // Мок не рахує HMAC — показує форму заголовка.
      "X-Erp-Signature": `t=${String(t)},v1=${randomToken()}${randomToken()}`,
    },
    body,
  }
}

/** «Надіслати» подію на адресу: результат за правилами мока (див. вгорі). */
function deliver(
  webhook: MockWebhook,
  event: string,
  data: Record<string, unknown>,
  attempt = 1,
): WebhookDelivery {
  const id = `dlv_${randomToken().slice(0, 12)}`
  const at = new Date().toISOString()
  const url = new URL(webhook.url)
  const base = {
    id,
    webhookId: webhook.id,
    event,
    at,
    attempt,
    request: requestOf(event, id, at, data),
  }
  if (url.hostname.endsWith(".invalid"))
    return {
      ...base,
      status: "failed",
      error: `getaddrinfo ENOTFOUND ${url.hostname}`,
    }
  if (url.pathname.includes("/fail"))
    return {
      ...base,
      status: "failed",
      statusCode: 500,
      durationMs: 1840,
      response: { body: '{"error":"Internal Server Error"}' },
    }
  return {
    ...base,
    status: "success",
    statusCode: 200,
    durationMs: 120 + Math.round(Math.random() * 180),
    response: { body: '{"ok":true}' },
  }
}

function saveDelivery(
  state: MockWebhooksState,
  delivery: WebhookDelivery,
): void {
  state.deliveries = [delivery, ...state.deliveries]
  state.webhooks = state.webhooks.map((w) =>
    w.id === delivery.webhookId
      ? {
          ...w,
          lastDelivery: {
            at: delivery.at,
            status: delivery.status === "success" ? "success" : "failed",
            ...(delivery.statusCode ? { statusCode: delivery.statusCode } : {}),
          },
          failures: delivery.status === "success" ? 0 : w.failures + 1,
        }
      : w,
  )
}

const publicWebhook = (webhook: MockWebhook): Webhook => {
  const { secret, ...item } = withoutMockScope(webhook)
  void secret
  return item
}

/**
 * Чи бачить компанія запиту підписку: лише свою; підписку застосунку (без компанії) налаштовує
 * платформа, компанії її не бачать і не змінюють (ADR-0036); `null` — застосунок без компаній.
 */
const ownedBy =
  (access: { user: MockUser; companyId: string | null }) =>
  (webhook: MockWebhook) =>
    ownedByMockCompany(access.user, webhook.companyId, access.companyId)

/**
 * Подія підписки для журналу — компанії підписки; підписки застосунку — поза компаніями (`null`): її
 * адреси не видно в журналах компаній (ADR-0036).
 */
const scopeOf = (webhook: MockWebhook): MockScope => ({
  companyId: webhook.companyId ?? null,
})

/* --------------------------------- Обробники --------------------------------- */

export interface WebhooksMockOptions {
  baseUrl?: string
  /** Події для підписки: { "invoices.paid": { label: { uk: "Рахунок оплачено", … } } }. */
  events?: Record<string, MockWebhookEventType>
  reauthRequired: () => Response | null
}

const validation = (fields: Record<string, string>) =>
  errorResponse(422, {
    code: "validation",
    message: "Validation failed",
    fieldErrors: fields,
  })

const notFound = () =>
  errorResponse(404, { code: "not_found", message: "Not found" })

const languageOf = (request: Request) =>
  (request.headers.get("Accept-Language") ?? "uk").slice(0, 2)

let unsubscribe: (() => void) | null = null

export function createWebhookHandlers({
  baseUrl = API_PREFIX,
  events = {},
  reauthRequired,
}: WebhooksMockOptions): HttpHandler[] {
  // Події записів → доставки підпискам (одна підписка на шину, навіть після повторного виклику).
  unsubscribe?.()
  unsubscribe = subscribeMockEvents((event: MockEvent) => {
    const state = readState()
    const targets = state.webhooks.filter(
      (w) =>
        w.active &&
        w.events.includes(event.type) &&
        (!w.companyId || inMockScope(event.scope, w.companyId)),
    )
    if (!targets.length) return
    for (const webhook of targets)
      saveDelivery(state, deliver(webhook, event.type, event.data))
    writeState(state)
  })

  /** Право на вебхуки в компанії запиту (A2c1); зміни — ще й не «Увійти як…». */
  const allowed = async (
    request: Request,
    action: "read" | "update",
  ): Promise<{ user: MockUser; companyId: string | null } | Response> => {
    const early = await applyScenario(scenarioFor("webhooks"))
    if (early) return early
    const user = currentMockUser()
    if (!user) return unauthenticated()
    const access = mockRequestPermissions(request, user)
    if (access instanceof Response) return access
    if (!mockGrantsService(access.permissions, "webhooks", action))
      return errorResponse(403, {
        code: "forbidden",
        message: `Missing webhooks:${action}`,
      })
    if (action === "update") {
      const denied = impersonationForbidden()
      if (denied) return denied
    }
    return { user, companyId: access.companyId }
  }

  const known = new Set(Object.keys(events))

  /** Перевірка полів підписки; повертає помилки полів. */
  const check = (body: {
    url?: unknown
    events?: unknown
    description?: unknown
  }) => {
    const fields: Record<string, string> = {}
    if (body.url !== undefined) {
      const issue = webhookUrlIssue(
        typeof body.url === "string" ? body.url : "",
      )
      if (issue) fields.url = issue
    }
    if (body.events !== undefined) {
      const list = Array.isArray(body.events) ? (body.events as unknown[]) : []
      if (!list.length) fields.events = "required"
      else if (list.some((e) => typeof e !== "string" || !known.has(e)))
        fields.events = "invalid"
    }
    if (typeof body.description === "string" && body.description.length > 200)
      fields.description = "tooLong"
    return fields
  }

  /** Підписка компанії запиту; іншої компанії — як невідома. */
  const find = (
    state: MockWebhooksState,
    id: unknown,
    access: { user: MockUser; companyId: string | null },
  ) => state.webhooks.filter(ownedBy(access)).find((w) => w.id === id)

  return [
    http.get(`${baseUrl}/webhooks`, async ({ request }) => {
      const access = await allowed(request, "read")
      if (access instanceof Response) return access
      const language = languageOf(request)
      return json({
        webhooks: readState()
          .webhooks.filter(ownedBy(access))
          .map(publicWebhook),
        events: Object.entries(events).map(([id, type]) => ({
          id,
          label: localizedText(type.label, language) ?? id,
          ...(type.group
            ? { group: localizedText(type.group, language) ?? "" }
            : {}),
        })),
      })
    }),

    http.post(`${baseUrl}/webhooks`, async ({ request }) => {
      const access = await allowed(request, "update")
      if (access instanceof Response) return access
      const reauth = reauthRequired()
      if (reauth) return reauth
      const body = (await request.json()) as {
        url?: string
        description?: string
        events?: string[]
        active?: boolean
      }
      const fields = check({
        url: body.url ?? "",
        events: body.events ?? [],
        description: body.description,
      })
      if (Object.keys(fields).length) return validation(fields)
      const secret = newSecret()
      const webhook: MockWebhook = {
        id: `wh_${randomToken().slice(0, 10)}`,
        url: (body.url ?? "").trim(),
        ...(body.description?.trim()
          ? { description: body.description.trim() }
          : {}),
        events: body.events ?? [],
        active: body.active ?? true,
        secret,
        secretPrefix: prefixOf(secret),
        createdAt: new Date().toISOString(),
        lastDelivery: null,
        failures: 0,
        companyId: access.companyId,
      }
      const state = readState()
      state.webhooks = [webhook, ...state.webhooks]
      writeState(state)
      recordAudit({
        action: "integrations.webhook_created",
        category: "integrations",
        ...scopeOf(webhook),
        target: { type: "webhooks", id: webhook.id, name: webhook.url },
      })
      return json({ webhook: publicWebhook(webhook), secret }, { status: 201 })
    }),

    http.patch(`${baseUrl}/webhooks/:id`, async ({ params, request }) => {
      const access = await allowed(request, "update")
      if (access instanceof Response) return access
      const body = (await request.json()) as Partial<{
        url: string
        description: string
        events: string[]
        active: boolean
      }>
      const state = readState()
      const current = find(state, params.id, access)
      if (!current) return notFound()
      if (body.url !== undefined && body.url.trim() !== current.url) {
        // Нова адреса — туди підуть дані компанії: як і створення, після підтвердження.
        const reauth = reauthRequired()
        if (reauth) return reauth
      }
      const fields = check(body)
      if (Object.keys(fields).length) return validation(fields)
      const next: MockWebhook = {
        ...current,
        ...(body.url !== undefined ? { url: body.url.trim() } : {}),
        ...(body.description !== undefined
          ? { description: body.description.trim() || undefined }
          : {}),
        ...(body.events !== undefined ? { events: body.events } : {}),
        ...(body.active !== undefined
          ? { active: body.active, ...(body.active ? { failures: 0 } : {}) }
          : {}),
      }
      state.webhooks = state.webhooks.map((w) => (w.id === next.id ? next : w))
      writeState(state)
      recordAudit({
        action: "integrations.webhook_updated",
        category: "integrations",
        ...scopeOf(next),
        target: { type: "webhooks", id: next.id, name: next.url },
        changes: (["url", "description", "events", "active"] as const)
          .filter(
            (key) =>
              JSON.stringify(current[key] ?? null) !==
              JSON.stringify(next[key] ?? null),
          )
          .map((key) => ({
            field: key,
            from: current[key] ?? null,
            to: next[key] ?? null,
          })),
      })
      return json(publicWebhook(next))
    }),

    http.delete(`${baseUrl}/webhooks/:id`, async ({ params, request }) => {
      const access = await allowed(request, "update")
      if (access instanceof Response) return access
      const state = readState()
      const current = find(state, params.id, access)
      if (!current) return notFound()
      state.webhooks = state.webhooks.filter((w) => w.id !== current.id)
      state.deliveries = state.deliveries.filter(
        (d) => d.webhookId !== current.id,
      )
      writeState(state)
      recordAudit({
        action: "integrations.webhook_deleted",
        category: "integrations",
        ...scopeOf(current),
        target: { type: "webhooks", id: current.id, name: current.url },
      })
      return noContent()
    }),

    http.post(
      `${baseUrl}/webhooks/:id/rotate-secret`,
      async ({ params, request }) => {
        const access = await allowed(request, "update")
        if (access instanceof Response) return access
        const state = readState()
        const current = find(state, params.id, access)
        if (!current) return notFound()
        const reauth = reauthRequired()
        if (reauth) return reauth
        const secret = newSecret()
        state.webhooks = state.webhooks.map((w) =>
          w.id === current.id
            ? { ...w, secret, secretPrefix: prefixOf(secret) }
            : w,
        )
        writeState(state)
        recordAudit({
          action: "integrations.webhook_secret_rotated",
          category: "integrations",
          ...scopeOf(current),
          target: { type: "webhooks", id: current.id, name: current.url },
        })
        return json({ secret })
      },
    ),

    http.post(`${baseUrl}/webhooks/:id/test`, async ({ params, request }) => {
      const access = await allowed(request, "update")
      if (access instanceof Response) return access
      const state = readState()
      const current = find(state, params.id, access)
      if (!current) return notFound()
      const delivery = deliver(current, "ping", {
        message: "Test event from erp-ui",
        sentBy: access.user.name,
      })
      saveDelivery(state, delivery)
      writeState(state)
      return json(delivery)
    }),

    http.get(
      `${baseUrl}/webhooks/:id/deliveries`,
      async ({ params, request }) => {
        const access = await allowed(request, "read")
        if (access instanceof Response) return access
        const state = readState()
        if (!find(state, params.id, access)) return notFound()
        const search = new URL(request.url).searchParams
        const page = Math.max(1, Number(search.get("page")) || 1)
        const perPage = Math.min(
          100,
          Math.max(1, Number(search.get("perPage")) || 20),
        )
        const own = state.deliveries.filter((d) => d.webhookId === params.id)
        const start = (page - 1) * perPage
        return json({
          data: own.slice(start, start + perPage),
          total: own.length,
        })
      },
    ),

    http.post(
      `${baseUrl}/webhook-deliveries/:id/redeliver`,
      async ({ params, request }) => {
        const access = await allowed(request, "update")
        if (access instanceof Response) return access
        const state = readState()
        const original = state.deliveries.find((d) => d.id === params.id)
        const webhook = original
          ? find(state, original.webhookId, access)
          : undefined
        if (!original || !webhook) return notFound()
        const sameAttempts = state.deliveries.filter(
          (d) =>
            d.webhookId === original.webhookId &&
            d.request.headers["X-Erp-Delivery"] ===
              original.request.headers["X-Erp-Delivery"],
        ).length
        const payload = JSON.parse(original.request.body) as {
          data?: Record<string, unknown>
        }
        const retry = deliver(
          webhook,
          original.event,
          payload.data ?? {},
          sameAttempts + 1,
        )
        // Повтор — та сама доставка для одержувача: той самий X-Erp-Delivery.
        const delivery: WebhookDelivery = {
          ...retry,
          request: {
            ...retry.request,
            headers: {
              ...retry.request.headers,
              "X-Erp-Delivery":
                original.request.headers["X-Erp-Delivery"] ?? original.id,
            },
          },
        }
        saveDelivery(state, delivery)
        writeState(state)
        return json(delivery)
      },
    ),
  ]
}
