/**
 * Журнал аудиту (ADR-0013, основа модуля A5): хто, що, коли й звідки зробив — входи, безпека,
 * користувачі, інтеграції, зміни записів. Журнал лише читається; пише його сервер.
 *
 * Контракт (під `/api/v1`, право `audit:read`):
 * - `GET /audit-events` → { data, total }, новіші першими. Плоскі фільтри (ADR-0002):
 *   `q` (хто, над чим, причина), `category` (кілька), `action`, `actorId`, `targetType`, `targetId`,
 *   `at_gte` / `at_lte` (ISO), `page`, `perPage`.
 * - `GET /audit-events/export` з тими самими фільтрами → CSV (UTF-8 з BOM), усі події без сторінок.
 * - Подія:
 *   - `action` — `<розділ>.<дія>`: `auth.sign_in`, `security.factors_reset`, `invoices.updated`;
 *   - `category` — `auth`, `security`, `users`, `company`, `integrations`, `data` або своя;
 *   - `actor` — користувач, токен API чи система; `impersonatedBy` — адміністратор «Увійти як…»;
 *   - `target` — над чим; `changes` — що змінилося (було → стало); `reason` — причина від людини;
 *   - `actionLabel` / `changes[].label` — назви мовою з `Accept-Language` для дій і полів проекту.
 */
import { z } from "zod"

import { deviceSchema } from "@/registry/lib/account"
import { listResultSchema, type ApiClient } from "@/registry/lib/api"

/* --------------------------------- Схеми --------------------------------- */

/** Розділи журналу, які знає кіт; проект може додати свої. */
export const AUDIT_CATEGORIES = [
  "auth",
  "security",
  "users",
  "company",
  "integrations",
  "data",
] as const
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number]

const auditValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.union([z.string(), z.number()])),
])
export type AuditValue = z.infer<typeof auditValueSchema>

export const auditEventSchema = z.object({
  id: z.string(),
  at: z.string(),
  action: z.string(),
  category: z.string(),
  /** Назва дії від сервера (для дій проекту); дії кіту перекладає сам кіт. */
  actionLabel: z.string().optional(),
  /** failure — спроба не вдалася (невірний пароль, заборонено). */
  result: z.enum(["success", "failure"]).optional(),
  actor: z.object({
    type: z.enum(["user", "api_token", "system"]),
    id: z.string().optional(),
    name: z.string(),
  }),
  /** Адміністратор, що працював від імені `actor` («Увійти як…»). */
  impersonatedBy: z.string().optional(),
  target: z
    .object({
      type: z.string(),
      id: z.string(),
      name: z.string().optional(),
    })
    .optional(),
  ip: z.string().optional(),
  device: deviceSchema.optional(),
  location: z.string().optional(),
  reason: z.string().optional(),
  changes: z
    .array(
      z.object({
        field: z.string(),
        label: z.string().optional(),
        from: auditValueSchema.optional(),
        to: auditValueSchema.optional(),
      }),
    )
    .optional(),
  /** Інші подробиці: { event: "invoices.paid", statusCode: 500 }. */
  details: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
})
export type AuditEvent = z.infer<typeof auditEventSchema>

const auditPageSchema = listResultSchema(auditEventSchema)
export type AuditPage = z.infer<typeof auditPageSchema>

export interface AuditFilter {
  q?: string
  category?: string[]
  action?: string
  actorId?: string
  /** Історія одного запису: `{ targetType: "invoices", targetId: "42" }`. */
  targetType?: string
  targetId?: string
  /** Межі періоду (ISO). */
  from?: string
  to?: string
}

/** Фільтр → параметри запиту (ADR-0002). */
export function auditQuery(
  filter: AuditFilter,
  page?: { page: number; perPage: number },
): URLSearchParams {
  const query = new URLSearchParams()
  if (filter.q?.trim()) query.set("q", filter.q.trim())
  for (const category of filter.category ?? [])
    query.append("category", category)
  if (filter.action) query.set("action", filter.action)
  if (filter.actorId) query.set("actorId", filter.actorId)
  if (filter.targetType) query.set("targetType", filter.targetType)
  if (filter.targetId) query.set("targetId", filter.targetId)
  if (filter.from) query.set("at_gte", filter.from)
  if (filter.to) query.set("at_lte", filter.to)
  if (page) {
    query.set("page", String(page.page))
    query.set("perPage", String(page.perPage))
  }
  return query
}

/* -------------------------------- Клієнт API -------------------------------- */

export interface AuditApi {
  getEvents: (
    filter: AuditFilter,
    page: number,
    perPage: number,
  ) => Promise<AuditPage>
  /** CSV з усіма подіями за фільтром. */
  exportEvents: (filter: AuditFilter) => Promise<Blob>
}

export function createAuditApi(client: ApiClient): AuditApi {
  return {
    getEvents: (filter, page, perPage) =>
      client.get("/audit-events", {
        query: auditQuery(filter, { page, perPage }),
        schema: auditPageSchema,
      }),
    exportEvents: (filter) =>
      client.get<Blob>("/audit-events/export", {
        query: auditQuery(filter),
        responseType: "blob",
      }),
  }
}

export const AUDIT_QUERY_KEYS = {
  events: ["erp-ui", "audit", "events"],
} as const

/* ------------------------------------ CSV ------------------------------------ */

function plain(value: unknown): string {
  if (value === undefined || value === null) return ""
  if (Array.isArray(value)) return value.join(", ")
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return String(value)
  return JSON.stringify(value)
}

/** Початок клітинки, який Excel і LibreOffice читають як формулу (OWASP CSV Injection). */
const FORMULA_START = /^[=+\-@\t\r]/

const csvCell = (value: unknown): string => {
  const raw = plain(value)
  // Ім'я на кшталт `=HYPERLINK(…)` з профілю інакше виконається в таблиці адміністратора.
  // Числа лишаються числами: від'ємна сума — не формула.
  const text =
    typeof value !== "number" && FORMULA_START.test(raw) ? `'${raw}` : raw
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Події → CSV (для серверів на TS і мока): BOM, щоб Excel відкрив UTF-8. */
export function auditToCsv(events: readonly AuditEvent[]): string {
  const header = [
    "at",
    "action",
    "category",
    "result",
    "actor",
    "impersonatedBy",
    "targetType",
    "targetId",
    "targetName",
    "ip",
    "reason",
    "changes",
  ]
  const rows = events.map((event) =>
    [
      event.at,
      event.action,
      event.category,
      event.result ?? "success",
      event.actor.name,
      event.impersonatedBy,
      event.target?.type,
      event.target?.id,
      event.target?.name,
      event.ip,
      event.reason,
      event.changes
        ?.map(
          (change) =>
            `${change.field}: ${plain(change.from)} → ${plain(change.to)}`,
        )
        .join("; "),
    ]
      .map(csvCell)
      .join(","),
  )
  return `\uFEFF${[header.join(","), ...rows].join("\r\n")}\r\n`
}
