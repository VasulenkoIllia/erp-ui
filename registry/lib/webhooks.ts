/**
 * Вебхуки (ADR-0013, PF11/PF17): сервер повідомляє зовнішні системи (банк, 1С, CRM) про події —
 * запис створено, оплачено, змінено.
 *
 * Контракт (під `/api/v1`, право `webhooks:read` / `webhooks:update`):
 * - `GET /webhooks` → { webhooks, events }: підписки й події, на які можна підписатися.
 * - `POST /webhooks` { url, description, events, active } → { webhook, secret } — секрет підпису
 *   показується один раз; після повторного підтвердження (ADR-0010).
 * - `PATCH /webhooks/:id` { url?, description?, events?, active? } → webhook; зміна адреси — після
 *   повторного підтвердження. `DELETE /webhooks/:id` → 204.
 * - `POST /webhooks/:id/rotate-secret` → { secret } (повторне підтвердження).
 * - `POST /webhooks/:id/test` → доставка тестової події `ping`.
 * - `GET /webhooks/:id/deliveries?page=&perPage=` → { data, total }, новіші першими;
 *   `POST /webhook-deliveries/:id/redeliver` → нова спроба тієї ж доставки.
 * - Адреса — лише `https://` (для розробки — `http://localhost`); інакше 422 `url: "insecure"`.
 *
 * Запит до адреси підписки (для бекенду проекту):
 * - `POST`, тіло — JSON `{ id, type, createdAt, data }`;
 * - заголовки `X-Erp-Event`, `X-Erp-Delivery`, `X-Erp-Signature: t=<unix>,v1=<hex>`, де `v1` —
 *   HMAC-SHA256 секрету від рядка `<t>.<тіло>`; одержувач відкидає запити старші за 5 хв;
 * - успіх — будь-який 2xx за 10 с; інакше повтори з паузою (1 хв, 5 хв, 30 хв, 2 год, 6 год);
 * - після 3 діб невдач підписка вимикається, адміністратор отримує лист.
 */
import { z } from "zod"

import { listResultSchema, type ApiClient } from "@/registry/lib/api"

/* --------------------------------- Схеми --------------------------------- */

export const webhookSchema = z.object({
  id: z.string(),
  url: z.string(),
  description: z.string().optional(),
  events: z.array(z.string()),
  active: z.boolean(),
  /** Початок секрету, щоб розрізнити: «whsec_3f9a…». */
  secretPrefix: z.string(),
  createdAt: z.string(),
  lastDelivery: z
    .object({
      at: z.string(),
      status: z.enum(["success", "failed"]),
      statusCode: z.number().int().optional(),
    })
    .nullable(),
  /** Невдалих доставок поспіль. */
  failures: z.number().int().min(0),
})
export type Webhook = z.infer<typeof webhookSchema>

export const webhookEventTypeSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** Розділ для групування: «Рахунки». */
  group: z.string().optional(),
  description: z.string().optional(),
})
export type WebhookEventType = z.infer<typeof webhookEventTypeSchema>

const webhooksSchema = z.object({
  webhooks: z.array(webhookSchema),
  events: z.array(webhookEventTypeSchema),
})
export type Webhooks = z.infer<typeof webhooksSchema>

const createdSchema = z.object({ webhook: webhookSchema, secret: z.string() })
export type WebhookCreated = z.infer<typeof createdSchema>

const secretSchema = z.object({ secret: z.string() })

export const webhookDeliverySchema = z.object({
  id: z.string(),
  webhookId: z.string(),
  event: z.string(),
  at: z.string(),
  status: z.enum(["success", "failed", "pending"]),
  statusCode: z.number().int().optional(),
  durationMs: z.number().int().min(0).optional(),
  /** Котра спроба (1 — перша). */
  attempt: z.number().int().min(1),
  /** Чому не вдалося без відповіді: «Timeout», «DNS». */
  error: z.string().optional(),
  request: z.object({
    headers: z.record(z.string(), z.string()),
    body: z.string(),
  }),
  response: z
    .object({
      body: z.string().optional(),
    })
    .optional(),
})
export type WebhookDelivery = z.infer<typeof webhookDeliverySchema>

const deliveriesPageSchema = listResultSchema(webhookDeliverySchema)
export type WebhookDeliveriesPage = z.infer<typeof deliveriesPageSchema>

export interface WebhookInput {
  url: string
  description?: string
  events: string[]
  active: boolean
}

/** Адреса підписки: https, а для розробки — http://localhost. */
export function webhookUrlIssue(
  value: string,
): "required" | "invalid" | "insecure" | null {
  const text = value.trim()
  if (!text) return "required"
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return "invalid"
  }
  if (url.protocol === "https:") return url.hostname ? null : "invalid"
  if (url.protocol !== "http:") return "invalid"
  return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    ? null
    : "insecure"
}

/* -------------------------------- Клієнт API -------------------------------- */

export interface WebhooksApi {
  list: () => Promise<Webhooks>
  create: (input: WebhookInput) => Promise<WebhookCreated>
  update: (id: string, patch: Partial<WebhookInput>) => Promise<Webhook>
  remove: (id: string) => Promise<void>
  rotateSecret: (id: string) => Promise<string>
  /** Надіслати тестову подію `ping`. */
  test: (id: string) => Promise<WebhookDelivery>
  getDeliveries: (
    id: string,
    page: number,
    perPage: number,
  ) => Promise<WebhookDeliveriesPage>
  redeliver: (deliveryId: string) => Promise<WebhookDelivery>
}

const encoded = (id: string) => encodeURIComponent(id)

export function createWebhooksApi(client: ApiClient): WebhooksApi {
  return {
    list: () => client.get("/webhooks", { schema: webhooksSchema }),
    create: (input) =>
      client.post("/webhooks", input, { schema: createdSchema }),
    update: (id, patch) =>
      client.patch(`/webhooks/${encoded(id)}`, patch, {
        schema: webhookSchema,
      }),
    async remove(id) {
      await client.delete(`/webhooks/${encoded(id)}`)
    },
    async rotateSecret(id) {
      const { secret } = await client.post(
        `/webhooks/${encoded(id)}/rotate-secret`,
        undefined,
        { schema: secretSchema },
      )
      return secret
    },
    test: (id) =>
      client.post(`/webhooks/${encoded(id)}/test`, undefined, {
        schema: webhookDeliverySchema,
      }),
    getDeliveries: (id, page, perPage) =>
      client.get(`/webhooks/${encoded(id)}/deliveries`, {
        query: { page: String(page), perPage: String(perPage) },
        schema: deliveriesPageSchema,
      }),
    redeliver: (deliveryId) =>
      client.post(
        `/webhook-deliveries/${encoded(deliveryId)}/redeliver`,
        undefined,
        { schema: webhookDeliverySchema },
      ),
  }
}

export const WEBHOOK_QUERY_KEYS = {
  list: ["erp-ui", "webhooks"],
  deliveries: (id: string) => ["erp-ui", "webhooks", id, "deliveries"],
} as const
