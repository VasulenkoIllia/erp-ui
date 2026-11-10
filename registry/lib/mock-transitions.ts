/**
 * Мок дій над записом за графом переходів (lib/statuses) і життєвим циклом документа
 * (lib/document-lifecycle, ADR-0057): `POST /<ресурс>/:id/<дія>`.
 *
 * - Перевірки — у порядку контракту: сценарій, сесія, право `<ресурс>:<дія>` у компанії запиту,
 *   запис (404), позначка запису (403 з `current`), тіло (422), версія (409 з `current`), дія з
 *   поточного статусу й стану документа (422 `transition_not_allowed`), причина (422
 *   `fieldErrors.reason`).
 * - Дії, якої немає в графі, і масових дій (`/<ресурс>/bulk/<дія>`) обробник не бере: запит іде далі
 *   (масові дії, імпорт). Тож реєструйте його перед обробниками ресурсу, а дії графа не називайте `bulk`
 *   чи `import`.
 * - Масово (`createBulkHandlers` з lib/mock-jobs, ADR-0066) — `bulkTransitionActions`: дія графа над
 *   кожним записом без версії, з його поточного статусу; номер — так само на проведенні.
 * - `releaseAmendedFrom` — опція `afterDelete` ресурсу: видалена виправлена копія звільняє перший
 *   документ, його можна виправити знову.
 * - Сценарій `conflict` ресурсу імітує, що колега змінив запис (`conflictChange`) — один раз на версію,
 *   тож повтор із новою версією проходить, як у PATCH, а після `db.reset()` конфлікт знову є.
 * - Зміни йдуть через `db.patch` і `db.insert`: нова версія, журнал, подія каналу; причина — окремою
 *   подією журналу запису з дією й причиною.
 * - `documentDeniedActions` — позначки життєвого циклу для опції `deniedActions` ресурсу.
 * - `numbering` (PF03b, ADR-0058): номер отримує документ, що стає проведеним, — на `submit` і сторно;
 *   виправлена копія народжується чернеткою без номера.
 * - `submitFields` — що ще сервер закріплює на проведенні (`submit`, і масово): курс і суму в базовій валюті
 *   документа у валюті (ADR-0071). Сторно бере їх від першого документа тілом `reverse`.
 * - Дія з `creates` (документ іншого ресурсу на підставі цього, ADR-0061) — опція `creates` з
 *   `mockCreatedDocument`: новий документ — чернетка того ресурсу, право `<ресурс>:create` теж
 *   потрібне (403), позначка на першому документі (`mark`); відповідь 201 — новий документ.
 * - `afterTransition` — після успішної дії: закриті періоди (PF13, ADR-0069) пишуть у журнал дію над
 *   документом закритого періоду під винятком (`createPeriodLockMocks(...).forResource(...)`).
 */
import { http, type HttpHandler } from "msw/http"

import { API_PREFIX } from "@/registry/lib/api"
import { BULK_PATH } from "@/registry/lib/jobs"
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
import type { MockBulkAction } from "@/registry/lib/mock-jobs"
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

/**
 * Номер документа, що стає проведеним (ADR-0058): поле й наступний номер серії. Дає
 * `createNumberingMocks(...).forResource(...)` з lib/mock-numbering.
 */
export interface MockDocumentNumbering {
  readonly field: string
  readonly assign: (
    document: Readonly<Record<string, unknown>>,
    companyId: string | null,
  ) => string
}

/** Запис зі статусом; документ має ще поля життєвого циклу. */
export type MockTransitionRecord = MockRecord & {
  readonly status: string
} & Partial<DocumentLifecycle>

/** Хто виконує дію: компанія запиту, людина та її права. */
export interface MockTransitionActor {
  readonly companyId: string | null
  readonly user: MockUser
  readonly permissions: string[]
}

/**
 * Документ іншого ресурсу, який дія створює на підставі запису (`creates` переходу): ресурс, право
 * створювати й саме створення. Дає `mockCreatedDocument`; тип запису нового ресурсу схований у ньому.
 */
export interface MockCreatedDocument<T extends MockTransitionRecord> {
  readonly resource: string
  canCreate(actor: MockTransitionActor): boolean
  /**
   * Новий документ: `id` і картка для відповіді з позначками того, хто питає; чи помилки полів. Властивістю, а
   * не методом: тип запису перевіряється строго, тож документ іншого модуля, який чекає більше полів, не
   * пройде перевірку типів.
   */
  readonly create: (
    record: T,
    actor: MockTransitionActor,
  ) =>
    | { readonly id: string; readonly card: object }
    | { readonly fieldErrors: Record<string, string> }
  /** Позначка на першому документі після створення (`{ orderId }`); без неї перший не змінюється. */
  mark?(createdId: string): Record<string, unknown>
}

/**
 * Документ ресурсу `resource` зі сховища `db`, який дія створює на підставі запису `T`: `body` — що
 * перенести й зв'язок (`quoteId`); кіт додає `docStatus: "draft"`. Номер чернетка не отримує.
 */
export function mockCreatedDocument<
  T extends MockTransitionRecord,
  C extends MockTransitionRecord,
>({
  resource,
  db,
  body,
  mark,
}: {
  resource: string
  db: MockResourceDb<C>
  body: (record: T) => Record<string, unknown>
  mark?: (createdId: string) => Record<string, unknown>
}): MockCreatedDocument<T> {
  return {
    resource,
    canCreate: ({ user, permissions }) =>
      mockGrantsRecords(db.accessOf(user, permissions), "create"),
    create: (record, { companyId, user, permissions }) => {
      const created = db.insert(
        { ...body(record), docStatus: "draft" },
        companyId,
        user,
      )
      if (!("record" in created)) return created
      return {
        id: created.record.id,
        card: withMockDeniedActions(
          db.accessOf(user, permissions),
          db.card(created.record),
        ),
      }
    },
    ...(mark ? { mark } : {}),
  }
}

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
  /** Номер документа на проведенні: `createNumberingMocks(...).forResource(...)`. */
  numbering?: MockDocumentNumbering
  /**
   * Поля, які сервер закріплює на проведенні (`submit`, і масово): курс і сума в базовій валюті документа
   * у валюті (ADR-0071). `record` — документ до дії. Статус, стан документа й номер вони не перекривають.
   */
  submitFields?: (record: T) => Partial<T>
  /** Дії з `creates`: документ іншого ресурсу за ключем дії (`mockCreatedDocument`). */
  creates?: Readonly<Record<string, MockCreatedDocument<T>>>
  /**
   * Після успішної дії: що ще пише сервер. `record` — запис до дії. Закриті періоди (PF13): дія за
   * винятком — у журнал (`createPeriodLockMocks(...).forResource(...).afterTransition`).
   */
  afterTransition?: (
    record: T,
    action: string,
    actor: MockTransitionActor,
  ) => void
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

/** Поле номера: документ, що стає проведеним, отримує наступний номер серії, чернетка — жодного. */
function numberedBy(
  numbering: MockDocumentNumbering | undefined,
  companyId: string | null,
) {
  return (
    document: Readonly<Record<string, unknown>>,
    isSubmitted: boolean,
  ): Record<string, unknown> =>
    numbering
      ? {
          [numbering.field]: isSubmitted
            ? numbering.assign(document, companyId)
            : null,
        }
      : {}
}

/**
 * Зміни запису від дії, що не створює документа: статус, стан документа, номер і закріплені поля на
 * проведенні.
 */
function transitionChanges<T extends MockTransitionRecord>(
  {
    numbering,
    submitFields,
  }: Pick<MockTransitionOptions<T>, "numbering" | "submitFields">,
  record: T,
  transition: StatusTransition,
  companyId: string | null,
): Record<string, unknown> {
  const state = isDocumentAction(transition.id)
    ? DOCUMENT_STATE_AFTER[transition.id]
    : undefined
  const submitted = state === "submitted"
  return {
    ...(submitted ? submitFields?.(record) : {}),
    status: transition.to ?? record.status,
    ...(state ? { docStatus: state } : {}),
    ...(submitted
      ? numberedBy(numbering, record.companyId ?? companyId)(record, true)
      : {}),
  }
}

/** Дія над записом: новий документ із позначкою на першому чи новий статус і стан документа. */
function applyTransition<T extends MockTransitionRecord>(
  options: MockTransitionOptions<T>,
  record: T,
  transition: StatusTransition,
  actor: Actor,
) {
  const { db, amend, reverse, numbering } = options
  const status = transition.to ?? record.status
  const numbered = numberedBy(numbering, record.companyId ?? actor.companyId)
  if (transition.id === "amend" && amend) {
    const body = {
      ...amend(record),
      docStatus: "draft",
      amendedFrom: record.id,
    }
    return createFrom(
      db,
      record,
      { ...body, ...numbered(body, false) },
      (id) => ({ amendedBy: id }),
      actor,
    )
  }
  if (transition.id === "reverse" && reverse) {
    const body = {
      ...reverse(record),
      docStatus: "submitted",
      reversalOf: record.id,
    }
    return createFrom(
      db,
      record,
      { ...body, ...numbered(body, true) },
      (id) => ({ reversedBy: id, status }),
      actor,
    )
  }
  return db.patch(
    record.id,
    transitionChanges(options, record, transition, actor.companyId),
  )
}

/**
 * Перевірки після позначки запису, у порядку контракту: тіло, версія, дія з поточного статусу й стану,
 * причина. Відповідь помилки чи тіло й перехід для дії.
 */
function checkTransition<T extends MockTransitionRecord>(
  { resource, transitions, amend, reverse, creates }: MockTransitionOptions<T>,
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
  const hasBody = createsDocument(action)
    ? Boolean(action === "amend" ? amend : reverse)
    : transition.creates === undefined || Boolean(creates?.[action])
  if (!hasBody)
    return errorResponse(500, {
      code: "server",
      message: `Mock: ${resource} has no ${action} body`,
    })
  return { body, transition }
}

/**
 * Документ іншого ресурсу на підставі запису (дія з `creates`): новий документ, позначка на першому;
 * відповідь — 201 з новим документом чи 422 з помилками полів.
 */
function runCreates<T extends MockTransitionRecord>(
  db: MockResourceDb<T>,
  record: T,
  creates: MockCreatedDocument<T>,
  actor: MockTransitionActor,
): Response {
  const created = creates.create(record, actor)
  if ("fieldErrors" in created) return validation(created.fieldErrors)
  const marked = creates.mark
    ? db.patch(record.id, creates.mark(created.id))
    : undefined
  // Схема ресурсу не бере позначку — помилка налаштування моку, а не відповідь сервера.
  if (marked && "fieldErrors" in marked)
    throw new Error(
      `Mock: cannot mark ${record.id}: ${JSON.stringify(marked.fieldErrors)}`,
    )
  return json(created.card, { status: 201 })
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
        if (!actions.has(action) || params.id === BULK_PATH) return undefined
        const early = await applyScenario(scenarioFor(resource))
        if (early) return early
        // Тіло — до запису: далі жодного `await`, тож два одночасні запити до одного документа бачать
        // версію одне одного (другий — 409), як під блокуванням рядка на сервері.
        const raw: unknown = await request.json().catch(() => undefined)
        const user = currentMockUser()
        if (!user) return unauthenticated()
        const access = mockRequestPermissions(request, user)
        if (access instanceof Response) return access
        const rules = db.accessOf(user, access.permissions)
        const actor = { ...access, user }
        const creates = options.creates?.[action]
        if (!mockGrantsRecords(rules, action))
          return errorResponse(403, {
            code: "forbidden",
            message: `Missing permission ${resource}:${action}`,
          })
        if (creates && !creates.canCreate(actor))
          return errorResponse(403, {
            code: "forbidden",
            message: `Missing permission ${creates.resource}:create`,
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
        const checked = checkTransition(options, record, action, raw, current)
        if (checked instanceof Response) return checked
        if (creates) {
          const response = runCreates(db, record, creates, actor)
          if (response.ok) options.afterTransition?.(record, action, actor)
          return response
        }
        const result = applyTransition(options, record, checked.transition, {
          companyId: access.companyId,
          user,
        })
        if (!result) return notFound(resource)
        if ("fieldErrors" in result) return validation(result.fieldErrors)
        options.afterTransition?.(record, action, actor)
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

/**
 * Дії графа для масового запуску (`createBulkHandlers` з lib/mock-jobs, ADR-0066): над кожним записом
 * без версії — з його поточного статусу й стану документа, інакше невдача `transition_not_allowed`;
 * причина — як у графі. Дії, що створюють документ (`amend`, `reverse`, дія з `creates`), масово не
 * запускаються.
 */
export function bulkTransitionActions<T extends MockTransitionRecord>(
  options: Pick<
    MockTransitionOptions<T>,
    "resource" | "transitions" | "numbering" | "submitFields"
  >,
  ids: readonly string[],
): Record<string, MockBulkAction<T>> {
  const { resource, transitions } = options
  const graphOf = (id: string) =>
    transitions.find((transition) => transition.id === id)
  const reasonOf = (id: string) => graphOf(id)?.reason
  return Object.fromEntries(
    ids
      .filter((id) => !createsDocument(id) && !graphOf(id)?.creates)
      .map((id): [string, MockBulkAction<T>] => [
        id,
        {
          reason: reasonOf(id),
          apply: (record, { companyId }) => {
            const transition = findTransition(transitions, record.status, id)
            if (!transition || !lifecycleAllows(id, record.docStatus))
              return {
                code: "transition_not_allowed",
                message: `${resource}: ${id} from ${record.status}`,
              }
            return {
              changes: transitionChanges(
                options,
                record,
                transition,
                companyId,
              ) as Partial<T>,
            }
          },
        },
      ]),
  )
}

/**
 * Видалили виправлену копію (чернетку): перший документ знову можна виправити — сервер знімає з нього
 * `amendedBy` (ADR-0066). Для опції `afterDelete` ресурсу: `(record) => releaseAmendedFrom(db, record)`.
 */
export function releaseAmendedFrom<T extends MockTransitionRecord>(
  db: MockResourceDb<T>,
  removed: Pick<T, "id" | "amendedFrom">,
): void {
  const original = removed.amendedFrom
    ? db.all().find((record) => record.id === removed.amendedFrom)
    : undefined
  if (original?.amendedBy !== removed.id) return
  const result = db.patch(original.id, { amendedBy: null })
  // Схема ресурсу не бере `amendedBy: null` — помилка налаштування моку, а не відповідь сервера.
  if (result && "fieldErrors" in result)
    throw new Error(
      `Mock: cannot release ${original.id}: ${JSON.stringify(result.fieldErrors)}`,
    )
}
