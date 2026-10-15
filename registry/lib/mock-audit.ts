/**
 * Мок журналу аудиту (ADR-0013): мок-сервер сам записує, хто що зробив — входи, безпеку,
 * користувачів, інтеграції й зміни записів (`createResourceHandlers`).
 *
 * - Журнал живе в localStorage (`erp-ui:mock-audit`), як дані сервера; початкові події — `seeds`.
 *   У пачці змін (`mockBatch`, масова дія) журнал читається й пишеться в сховище раз.
 * - Назви дій проекту й полів — мовами (`LocalizedText`); мок віддає їх мовою `Accept-Language`.
 * - Хто й звідки — із сесії (зокрема «Увійти як…»), якщо не передано явно.
 */
import { http, HttpResponse, type HttpHandler } from "msw/http"

import { API_PREFIX } from "@/registry/lib/api"
import {
  auditToCsv,
  type AuditEvent,
  type AuditValue,
} from "@/registry/lib/audit"
import {
  hasPermission,
  localizedText,
  type LocalizedText,
} from "@/registry/lib/auth"
import { scenarioFor } from "@/registry/lib/mock-scenarios"
import {
  applyScenario,
  batchedMockState,
  CURRENT_IP,
  CURRENT_LOCATION,
  currentDevice,
  currentMockUser,
  errorResponse,
  getMockSession,
  json,
  mockUsersList,
  randomToken,
  unauthenticated,
} from "@/registry/lib/mock-server"

/* ----------------------------------- Стан ----------------------------------- */

interface StoredChange {
  field: string
  label?: LocalizedText
  from?: AuditValue
  to?: AuditValue
}

/** Подія, як її зберігає мок: назви й місце — мовами. */
export type MockAuditEvent = Omit<
  AuditEvent,
  "actionLabel" | "location" | "changes"
> & {
  actionLabel?: LocalizedText
  location?: LocalizedText
  changes?: StoredChange[]
}

const AUDIT_KEY = "erp-ui:mock-audit"
const AUDIT_LIMIT = 1000

let seeds: MockAuditEvent[] = []

export function setMockAuditSeeds(value: MockAuditEvent[]): void {
  seeds = value
}

function loadEvents(): MockAuditEvent[] {
  try {
    const raw = globalThis.localStorage?.getItem(AUDIT_KEY)
    return raw ? (JSON.parse(raw) as MockAuditEvent[]) : [...seeds]
  } catch {
    return [...seeds]
  }
}

function saveEvents(events: MockAuditEvent[]): void {
  try {
    globalThis.localStorage?.setItem(
      AUDIT_KEY,
      JSON.stringify(events.slice(0, AUDIT_LIMIT)),
    )
  } catch {
    // Без сховища журнал живе до перезавантаження.
  }
}

const auditStore = batchedMockState(loadEvents, saveEvents)
const readEvents = () => auditStore.read()
// Ліміт і в пам'яті: у пачці змін журнал не росте з кожним записом.
const writeEvents = (events: MockAuditEvent[]) => {
  auditStore.write(events.slice(0, AUDIT_LIMIT))
}

/** Значення для «було → стало»: прості як є, решта — JSON. */
export function auditValue(value: unknown): AuditValue {
  if (value === undefined || value === null) return null
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return value
  if (
    Array.isArray(value) &&
    value.every((v) => typeof v === "string" || typeof v === "number")
  )
    return value
  return JSON.stringify(value)
}

/** Що змінилося між двома версіями (без службових полів). */
export function auditChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  labels: Record<string, LocalizedText> = {},
  skip: readonly string[] = ["id", "version", "updatedAt"],
): StoredChange[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...keys]
    .filter((key) => !skip.includes(key))
    .filter(
      (key) =>
        JSON.stringify(before[key] ?? null) !==
        JSON.stringify(after[key] ?? null),
    )
    .map((key) => ({
      field: key,
      ...(labels[key] ? { label: labels[key] } : {}),
      from: auditValue(before[key]),
      to: auditValue(after[key]),
    }))
}

/** Хто діє зараз: користувач сесії (і адміністратор «Увійти як…») або система. */
function sessionActor(): Pick<MockAuditEvent, "actor" | "impersonatedBy"> {
  const session = getMockSession()
  const user =
    session?.stage === "authenticated"
      ? mockUsersList().find((u) => u.id === session.userId)
      : undefined
  if (!user) return { actor: { type: "system", name: "System" } }
  const admin = session?.impersonatorId
    ? mockUsersList().find((u) => u.id === session.impersonatorId)
    : undefined
  return {
    actor: { type: "user", id: user.id, name: user.name },
    ...(admin ? { impersonatedBy: admin.name } : {}),
  }
}

export type MockAuditInput = Omit<
  MockAuditEvent,
  "id" | "at" | "actor" | "ip" | "location" | "device"
> & {
  /** За замовчуванням — із сесії. */
  actor?: MockAuditEvent["actor"]
}

/** Записати подію в журнал (час, адреса й пристрій — поточні). */
export function recordAudit(input: MockAuditInput): void {
  const who = input.actor ? { actor: input.actor } : sessionActor()
  const event: MockAuditEvent = {
    id: `aud-${randomToken().slice(0, 12)}`,
    at: new Date().toISOString(),
    ip: CURRENT_IP,
    location: CURRENT_LOCATION,
    device: currentDevice(),
    ...input,
    ...who,
  }
  writeEvents([event, ...readEvents()])
}

/* --------------------------------- Обробники --------------------------------- */

const languageOf = (request: Request) =>
  (request.headers.get("Accept-Language") ?? "uk").slice(0, 2)

function localize(event: MockAuditEvent, language: string): AuditEvent {
  const { actionLabel, location, changes, ...rest } = event
  const label = localizedText(actionLabel, language)
  const place = localizedText(location, language)
  return {
    ...rest,
    ...(label ? { actionLabel: label } : {}),
    ...(place ? { location: place } : {}),
    ...(changes
      ? {
          changes: changes.map(({ label: fieldLabel, ...change }) => {
            const text = localizedText(fieldLabel, language)
            return text ? { ...change, label: text } : change
          }),
        }
      : {}),
  }
}

function filtered(request: Request): AuditEvent[] {
  const params = new URL(request.url).searchParams
  const language = languageOf(request)
  const q = params.get("q")?.trim().toLocaleLowerCase("uk") ?? ""
  const categories = params.getAll("category")
  const from = params.get("at_gte")
  const to = params.get("at_lte")
  const exact = (key: string, value: string | undefined) => {
    const wanted = params.get(key)
    return !wanted || wanted === value
  }
  return readEvents()
    .map((event) => localize(event, language))
    .filter((event) => {
      if (categories.length && !categories.includes(event.category))
        return false
      if (!exact("action", event.action)) return false
      if (!exact("actorId", event.actor.id)) return false
      if (!exact("targetType", event.target?.type)) return false
      if (!exact("targetId", event.target?.id)) return false
      if (from && event.at < from) return false
      if (to && event.at > to) return false
      if (!q) return true
      return [
        event.actor.name,
        event.impersonatedBy,
        event.target?.name,
        event.reason,
        event.action,
        event.actionLabel,
        event.ip,
      ].some((text) => text?.toLocaleLowerCase("uk").includes(q))
    })
    .sort((a, b) => b.at.localeCompare(a.at))
}

export function createAuditHandlers({
  baseUrl = API_PREFIX,
}: { baseUrl?: string } = {}): HttpHandler[] {
  const guard = async (): Promise<Response | null> => {
    const early = await applyScenario(scenarioFor("audit"))
    if (early) return early
    const user = currentMockUser()
    if (!user) return unauthenticated()
    if (!hasPermission(user.permissions, "audit", "read"))
      return errorResponse(403, {
        code: "forbidden",
        message: "Missing audit:read",
      })
    return null
  }

  return [
    http.get(`${baseUrl}/audit-events/export`, async ({ request }) => {
      const denied = await guard()
      if (denied) return denied
      return new HttpResponse(auditToCsv(filtered(request)), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="audit.csv"',
        },
      })
    }),

    http.get(`${baseUrl}/audit-events`, async ({ request }) => {
      const denied = await guard()
      if (denied) return denied
      if (scenarioFor("audit") === "empty") return json({ data: [], total: 0 })
      const params = new URL(request.url).searchParams
      const page = Math.max(1, Number(params.get("page")) || 1)
      const perPage = Math.min(
        100,
        Math.max(1, Number(params.get("perPage")) || 20),
      )
      const events = filtered(request)
      const start = (page - 1) * perPage
      return json({
        data: events.slice(start, start + perPage),
        total: events.length,
      })
    }),
  ]
}
