/**
 * Мок дій над записом за графом переходів (lib/statuses) і життєвим циклом документа
 * (lib/document-lifecycle, ADR-0057): `POST /<ресурс>/:id/<дія>`.
 *
 * - Перевірки — у порядку контракту: сценарій, сесія, право `<ресурс>:<дія>` у компанії запиту,
 *   запис (404), позначка запису (403 з `current`), тіло (422), версія (409 з `current`), дія з
 *   поточного статусу й стану документа (422 `transition_not_allowed`), причина (422
 *   `fieldErrors.reason`).
 * - Дії, якої немає в графі, обробник не бере: запит іде далі (`/<ресурс>/bulk/<дія>`, імпорт). Тож
 *   реєструйте його перед обробниками ресурсу, а дії графа не називайте `bulk` чи `import`.
 * - Сценарій `conflict` ресурсу імітує, що колега змінив запис (`conflictChange`) — один раз на версію,
 *   тож повтор із новою версією проходить, як у PATCH, а після `db.reset()` конфлікт знову є.
 * - Зміни йдуть через `db.patch` і `db.insert`: нова версія, журнал, подія каналу; причина — окремою
 *   подією журналу запису з дією й причиною.
 * - `documentDeniedActions` — позначки життєвого циклу для опції `deniedActions` ресурсу.
 */
import { http, type HttpHandler } from "msw/http"

import { API_PREFIX } from "@/registry/lib/api"
import {
  createsDocument,
  DOCUMENT_STATE_AFTER,
  isDocumentAction,
  lifecycleAllows,
  transitionBodySchema,
  type DocumentLifecycle,
  type TransitionBody,
} from "@/registry/lib/document-lifecycle"
import { recordAudit } from "@/registry/lib/mock-audit"
import { mockRequestPermissions } from "@/registry/lib/mock-company-roles"
import { fieldErrors } from "@/registry/lib/mock-records"
import { scenarioFor } from "@/registry/lib/mock-scenarios"
import {
  mockDeniedAction,
  mockGrantsRecords,
  withMockDeniedActions,
} from "@/registry/lib/mock-scope"
import {
  applyScenario,
  currentMockUser,
  errorResponse,
  json,
  unauthenticated,
  type MockUser,
} from "@/registry/lib/mock-server"
import type { MockRecord, MockResourceDb } from "@/registry/lib/mocks"
import {
  RECORD_DENIAL_REASONS,
  type RecordDeniedActions,
} from "@/registry/lib/record-access"
import { findTransition, type StatusTransition } from "@/registry/lib/statuses"

/** Запис зі статусом; документ має ще поля життєвого циклу. */
export type MockTransitionRecord = MockRecord & {
  readonly status: string
} & Partial<DocumentLifecycle>

export interface MockTransitionOptions<T extends MockTransitionRecord> {
  resource: string
  db: MockResourceDb<T>
  /** Граф модуля зі змінами розширення (`mergeTransitions`). */
  transitions: readonly StatusTransition[]
  /**
   * Тіло виправленої копії скасованого документа (`amend`) — статус нової чернетки й що копіювати; кіт
   * додає `docStatus` і `amendedFrom`.
   */
  amend?: (record: T) => Record<string, unknown>
  /** Тіло документа-сторно (`reverse`): що й як дзеркалити, вирішує модуль; кіт додає `docStatus` і `reversalOf`. */
  reverse?: (record: T) => Record<string, unknown>
  /** Що змінює колега в сценарії `conflict`; за замовчуванням лише версія. */
  conflictChange?: (record: T) => Partial<T>
  baseUrl?: string
}

/** Позначки життєвого циклу (ADR-0057): правило сервера, яке моки модуля зводять зі своїми. */
export function documentDeniedActions(
  record: Partial<DocumentLifecycle>,
): RecordDeniedActions | undefined {
  const denied: Record<string, string> = {}
  if (record.docStatus === "submitted" || record.docStatus === "cancelled") {
    denied.update = RECORD_DENIAL_REASONS[record.docStatus]
    denied.delete = RECORD_DENIAL_REASONS[record.docStatus]
  }
  if (record.amendedBy) denied.amend = RECORD_DENIAL_REASONS.amended
  if (record.reversedBy) {
    denied.cancel = RECORD_DENIAL_REASONS.reversed
    denied.reverse = RECORD_DENIAL_REASONS.reversed
  }
  return Object.keys(denied).length ? denied : undefined
}

const notFound = (resource: string) =>
  errorResponse(404, { code: "not_found", message: `${resource}: not found` })

const validation = (errors: Record<string, string>) =>
  errorResponse(422, {
    code: "validation",
    message: "Validation failed",
    fieldErrors: errors,
  })

interface Actor {
  readonly companyId: string | null
  readonly user: MockUser
}

/** Новий документ (`amend`, `reverse`) і позначка на першому; відповідь — новий. */
function createFrom<T extends MockTransitionRecord>(
  db: MockResourceDb<T>,
  record: T,
  body: Record<string, unknown>,
  mark: (id: string) => Record<string, unknown>,
  actor: Actor,
) {
  const created = db.insert(body, actor.companyId, actor.user)
  if (!("record" in created)) return created
  const marked = db.patch(record.id, mark(created.record.id))
  return marked && "fieldErrors" in marked ? marked : created
}

/** Дія над записом: новий документ із позначкою на першому чи новий статус і стан документа. */
function applyTransition<T extends MockTransitionRecord>(
  { db, amend, reverse }: MockTransitionOptions<T>,
  record: T,
  transition: StatusTransition,
  actor: Actor,
) {
  const status = transition.to ?? record.status
  if (transition.id === "amend" && amend)
    return createFrom(
      db,
      record,
      { ...amend(record), docStatus: "draft", amendedFrom: record.id },
      (id) => ({ amendedBy: id }),
      actor,
    )
  if (transition.id === "reverse" && reverse)
    return createFrom(
      db,
      record,
      { ...reverse(record), docStatus: "submitted", reversalOf: record.id },
      (id) => ({ reversedBy: id, status }),
      actor,
    )
  const state = isDocumentAction(transition.id)
    ? DOCUMENT_STATE_AFTER[transition.id]
    : undefined
  return db.patch(record.id, { status, ...(state ? { docStatus: state } : {}) })
}

/**
 * Перевірки після позначки запису, у порядку контракту: тіло, версія, дія з поточного статусу й стану,
 * причина. Відповідь помилки чи тіло й перехід для дії.
 */
function checkTransition<T extends MockTransitionRecord>(
  { resource, transitions, amend, reverse }: MockTransitionOptions<T>,
  record: T,
  action: string,
  raw: unknown,
  current: () => unknown,
): Response | { body: TransitionBody; transition: StatusTransition } {
  const parsed = transitionBodySchema.safeParse(raw)
  if (!parsed.success) return validation(fieldErrors(parsed.error))
  const body = parsed.data
  if (body.version !== record.version)
    return errorResponse(409, {
      code: "conflict",
      message: "Record was changed by someone else",
      current: current(),
    })
  const transition = findTransition(transitions, record.status, action)
  if (!transition || !lifecycleAllows(action, record.docStatus))
    return errorResponse(422, {
      code: "transition_not_allowed",
      message: `${resource}: ${action} from ${record.status}`,
      current: current(),
    })
  if (transition.reason === "required" && !body.reason)
    return validation({ reason: "required" })
  if (createsDocument(action) && !(action === "amend" ? amend : reverse))
    return errorResponse(500, {
      code: "server",
      message: `Mock: ${resource} has no ${action} body`,
    })
  return { body, transition }
}

/** `POST /<ресурс>/:id/<дія>` за графом модуля. */
export function createTransitionHandlers<T extends MockTransitionRecord>(
  options: MockTransitionOptions<T>,
): HttpHandler[] {
  const { resource, db, transitions, conflictChange } = options
  const actions = new Set(transitions.map((transition) => transition.id))
  /** Версії записів (`id:version`), які сценарій `conflict` уже дав колезі: з ними повтор проходить. */
  const bumped = new Set<string>()
  /** Колега змінив запис перед нами — один раз на версію. */
  const colleagueChanges = (record: T): T => {
    if (
      scenarioFor(resource) !== "conflict" ||
      bumped.delete(`${record.id}:${String(record.version)}`)
    )
      return record
    const result = db.patch(record.id, conflictChange?.(record) ?? {})
    if (!result || !("record" in result)) return record
    bumped.add(`${result.record.id}:${String(result.record.version)}`)
    return result.record
  }

  return [
    http.post(
      `${options.baseUrl ?? API_PREFIX}/${resource}/:id/:action`,
      async ({ params, request }) => {
        const action = String(params.action)
        if (!actions.has(action)) return undefined
        const early = await applyScenario(scenarioFor(resource))
        if (early) return early
        const user = currentMockUser()
        if (!user) return unauthenticated()
        const access = mockRequestPermissions(request, user)
        if (access instanceof Response) return access
        const rules = db.accessOf(user, access.permissions)
        if (!mockGrantsRecords(rules, action))
          return errorResponse(403, {
            code: "forbidden",
            message: `Missing permission ${resource}:${action}`,
          })
        const id = String(params.id)
        const found = db.select({ id }, access.companyId, rules)[0]
        if (!found) return notFound(resource)
        const record = colleagueChanges(found)
        const current = () => withMockDeniedActions(rules, db.card(record))
        // Позначка — раніше за версію (ADR-0037): причину видно й тоді, коли запис уже інший.
        const denial = mockDeniedAction(rules, record, action)
        if (denial)
          return errorResponse(403, {
            code: "forbidden",
            message: `${resource}: ${denial}`,
            current: current(),
          })
        const raw: unknown = await request.json().catch(() => undefined)
        const checked = checkTransition(options, record, action, raw, current)
        if (checked instanceof Response) return checked
        const result = applyTransition(options, record, checked.transition, {
          companyId: access.companyId,
          user,
        })
        if (!result) return notFound(resource)
        if ("fieldErrors" in result) return validation(result.fieldErrors)
        if (checked.body.reason)
          recordAudit({
            action: `${resource}.${action}`,
            category: "data",
            ...(record.companyId ? { companyId: record.companyId } : {}),
            target: { type: resource, id: record.id },
            reason: checked.body.reason,
          })
        return json(withMockDeniedActions(rules, db.card(result.record)), {
          status: createsDocument(action) ? 201 : 200,
        })
      },
    ),
  ]
}
