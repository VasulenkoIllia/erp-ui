/**
 * Мок закритих періодів (lib/period-lock, PF13, ADR-0069): `GET` і `PATCH /period-lock/current` та
 * винятки `period-lock-exceptions` у пам'яті моку, окремо для кожної компанії запиту.
 *
 *   const periodLock = createPeriodLockMocks({ seeds: [{ companyId: "zoriana", lockedThrough: "2026-10-20" }] })
 *   const rules = periodLock.forResource({ resource: "invoices", dateField: "date", actions: ["submit", "cancel"] })
 *   createResourceHandlers({ ..., deniedActions: rules.deniedActions, validateWrite: rules.validateWrite,
 *     afterWrite: rules.afterWrite })
 *   createTransitionHandlers({ ..., afterTransition: rules.afterTransition })
 *
 * - Перевірки — за контрактом: сценарій, сесія, компанія запиту, право, тіло (422), версія (409 з
 *   `current`), дата в майбутньому, причина відкриття. Сценарії — ресурси `period-lock` і
 *   `period-lock-exceptions` (панель розробника); `conflict` — колега змінив запис один раз на версію.
 * - Прострочений виняток мок не показує ні у списку, ні в записі того, хто питає.
 * - `forResource` — правила сервера для документів модуля: позначка `period_locked` на записі
 *   (`deniedActions`, крім дій `PERIOD_LOCK_ALLOWED_ACTIONS`), 422 біля поля дати (`validateWrite`),
 *   зміна за винятком — у журнал (`afterWrite`, `afterTransition`). Позначки життєвого циклу документа
 *   важливіші: `deniedActions` додає лише дії, яких запис ще не забороняє.
 */
import { http, type HttpHandler } from "msw/http"

import { API_PREFIX } from "@/registry/lib/api"
import { hasPermission } from "@/registry/lib/auth"
import { todayIn, type CalendarDate } from "@/registry/lib/dates"
import { validation } from "@/registry/lib/mock-account-state"
import { recordAudit } from "@/registry/lib/mock-audit"
import { mockRequestPermissions } from "@/registry/lib/mock-company-roles"
import { fieldErrors } from "@/registry/lib/mock-records"
import { scenarioFor } from "@/registry/lib/mock-scenarios"
import {
  applyScenario,
  currentMockUser,
  errorResponse,
  isMockCompanyMember,
  json,
  mockUsersList,
  noContent,
  randomToken,
  unauthenticated,
  type MockUser,
} from "@/registry/lib/mock-server"
import type { MockDeniedRule } from "@/registry/lib/mock-scope"
import type { MockWrite } from "@/registry/lib/mocks"
import {
  exceptionUntilIssue,
  isExceptionActive,
  isLockDateTooLate,
  isPeriodLocked,
  PERIOD_LOCK,
  PERIOD_LOCK_ALLOWED_ACTIONS,
  PERIOD_LOCK_EXCEPTIONS,
  PERIOD_LOCK_ID,
  PERIOD_LOCKED,
  periodLockExceptionInputSchema,
  periodLockUpdateSchema,
  reopensPeriod,
  type PeriodLock,
  type PeriodLockException,
} from "@/registry/lib/period-lock"
import type { RecordDeniedActions } from "@/registry/lib/record-access"
import type { MockTransitionActor } from "@/registry/lib/mock-transitions"

export interface MockPeriodLockSeed {
  readonly companyId: string | null
  readonly lockedThrough: CalendarDate | null
  readonly exceptions?: readonly Omit<PeriodLockException, "id">[]
}

interface CompanyLock {
  lockedThrough: CalendarDate | null
  version: number
  exceptions: PeriodLockException[]
}

/** Правила сервера для документів модуля, якого стосується закриття: опції моків ресурсу й переходів. */
export interface MockPeriodLockRules<T> {
  readonly deniedActions: MockDeniedRule<T>
  readonly validateWrite: (
    next: Readonly<Record<string, unknown>>,
    write: MockWrite<T>,
  ) => Record<string, string> | undefined
  readonly afterWrite: (next: T | undefined, write: MockWrite<T>) => void
  readonly afterTransition: (
    record: T,
    action: string,
    actor: MockTransitionActor,
  ) => void
}

export interface MockPeriodLockOptions {
  readonly seeds?: readonly MockPeriodLockSeed[]
  readonly baseUrl?: string
  /** Годинник моку: тести ставлять свій. */
  readonly now?: () => number
}

const companyKey = (companyId: string | null | undefined) => companyId ?? ""

const forbidden = (action: string) =>
  errorResponse(403, {
    code: "forbidden",
    message: `Missing permission ${action}`,
  })

/** Запис компанії для того, хто питає: чинний виняток — лише його. */
function viewOf(lock: CompanyLock, user: MockUser, now: number): PeriodLock {
  const own = lock.exceptions.find(
    (exception) =>
      exception.userId === user.id && isExceptionActive(exception, now),
  )
  return {
    id: PERIOD_LOCK_ID,
    version: lock.version,
    lockedThrough: lock.lockedThrough,
    exception: own ? { until: own.until, reason: own.reason } : null,
  }
}

/** Людина компанії, якій дають виняток; `null` — такої в компанії немає. */
function memberOf(userId: string, companyId: string | null): MockUser | null {
  const user = mockUsersList().find((candidate) => candidate.id === userId)
  if (!user) return null
  return companyId === null || isMockCompanyMember(user, companyId)
    ? user
    : null
}

export function createPeriodLockMocks({
  seeds = [],
  baseUrl = API_PREFIX,
  now = Date.now,
}: MockPeriodLockOptions = {}) {
  let store: Map<string, CompanyLock> | null = null
  const locks = () =>
    (store ??= new Map(
      seeds.map((seed) => [
        companyKey(seed.companyId),
        {
          lockedThrough: seed.lockedThrough,
          version: 1,
          exceptions: (seed.exceptions ?? []).map((exception) => ({
            ...exception,
            // Як після POST: мить у UTC, тож список сортується рядком.
            until: new Date(Date.parse(exception.until)).toISOString(),
            id: `ple-${randomToken(6)}`,
          })),
        },
      ]),
    ))
  const lockOf = (companyId: string | null | undefined): CompanyLock => {
    const key = companyKey(companyId)
    let lock = locks().get(key)
    if (!lock) {
      lock = { lockedThrough: null, version: 1, exceptions: [] }
      locks().set(key, lock)
    }
    return lock
  }
  /** Версії (`компанія:версія`), які сценарій `conflict` уже дав колезі. */
  const bumped = new Set<string>()

  /** Сценарій, сесія й компанія запиту: людина, компанія й права в ній чи відповідь-відмова. */
  async function access(request: Request, resource: string) {
    const early = await applyScenario(scenarioFor(resource))
    if (early) return early
    const user = currentMockUser()
    if (!user) return unauthenticated()
    const scoped = mockRequestPermissions(request, user)
    if (scoped instanceof Response) return scoped
    return { user, ...scoped }
  }

  /** Чинний виняток людини в компанії; `undefined` — немає. */
  const activeException = (
    companyId: string | null | undefined,
    userId: string,
  ) =>
    lockOf(companyId).exceptions.find(
      (exception) =>
        exception.userId === userId && isExceptionActive(exception, now()),
    )

  /** Дата закрита для людини: у закритому періоді й без чинного винятку. */
  const isClosedFor = (
    companyId: string | null | undefined,
    userId: string,
    date: unknown,
  ) =>
    isPeriodLocked(date, lockOf(companyId).lockedThrough) &&
    !activeException(companyId, userId)

  /** Зміна в закритому періоді за винятком — у журнал з причиною винятку. */
  function auditExceptionUse(
    companyId: string | null | undefined,
    user: MockUser,
    target: { type: string; id: string },
    dates: readonly unknown[],
  ) {
    const lock = lockOf(companyId)
    if (!dates.some((date) => isPeriodLocked(date, lock.lockedThrough))) return
    const exception = activeException(companyId, user.id)
    if (!exception) return
    recordAudit({
      action: "period_lock.exception_used",
      category: "data",
      ...(companyId ? { companyId } : {}),
      target,
      reason: exception.reason,
      details: { until: exception.until },
    })
  }

  function forResource<T extends { id: string; companyId?: string | null }>({
    resource,
    dateField,
    actions = [],
  }: {
    resource: string
    /** Поле дати документа, за яким він лежить у періоді: `date`. */
    dateField: keyof T & string
    /** Дії графа модуля, окрім `update` і `delete`: їх теж мітить позначка. */
    actions?: readonly string[]
  }): MockPeriodLockRules<T> {
    const marked = ["update", "delete", ...actions].filter(
      (action) => !PERIOD_LOCK_ALLOWED_ACTIONS.includes(action),
    )
    return {
      deniedActions: (actor, record): RecordDeniedActions | undefined =>
        isClosedFor(record.companyId, actor.id, record[dateField])
          ? Object.fromEntries(marked.map((action) => [action, PERIOD_LOCKED]))
          : undefined,
      validateWrite: (next, { user, companyId, previous }) =>
        isClosedFor(previous?.companyId ?? companyId, user.id, next[dateField])
          ? { [dateField]: PERIOD_LOCKED }
          : undefined,
      afterWrite: (next, { user, companyId, previous }) => {
        const record = next ?? previous
        if (!record) return
        auditExceptionUse(
          record.companyId ?? companyId,
          user,
          { type: resource, id: record.id },
          [previous?.[dateField], next?.[dateField]],
        )
      },
      afterTransition: (record, action, { user, companyId }) => {
        if (PERIOD_LOCK_ALLOWED_ACTIONS.includes(action)) return
        auditExceptionUse(
          record.companyId ?? companyId,
          user,
          { type: resource, id: record.id },
          [record[dateField]],
        )
      },
    }
  }

  const lockUrl = `${baseUrl}/${PERIOD_LOCK}/${PERIOD_LOCK_ID}`
  const exceptionsUrl = `${baseUrl}/${PERIOD_LOCK_EXCEPTIONS}`

  const handlers: HttpHandler[] = [
    http.get(lockUrl, async ({ request }) => {
      const scoped = await access(request, PERIOD_LOCK)
      if (scoped instanceof Response) return scoped
      return json(viewOf(lockOf(scoped.companyId), scoped.user, now()))
    }),

    http.patch(lockUrl, async ({ request }) => {
      const scoped = await access(request, PERIOD_LOCK)
      if (scoped instanceof Response) return scoped
      if (!hasPermission(scoped.permissions, PERIOD_LOCK, "update"))
        return forbidden(`${PERIOD_LOCK}:update`)
      const raw: unknown = await request.json().catch(() => undefined)
      const lock = lockOf(scoped.companyId)
      const key = `${companyKey(scoped.companyId)}:${String(lock.version)}`
      if (scenarioFor(PERIOD_LOCK) === "conflict" && !bumped.has(key)) {
        lock.version += 1
        bumped.add(`${companyKey(scoped.companyId)}:${String(lock.version)}`)
      }
      const version =
        typeof raw === "object" && raw !== null && "version" in raw
          ? raw.version
          : undefined
      if (version !== lock.version)
        return errorResponse(409, {
          code: "conflict",
          message: "Period lock was changed by someone else",
          current: viewOf(lock, scoped.user, now()),
        })
      const parsed = periodLockUpdateSchema.safeParse(raw)
      if (!parsed.success) return validation(fieldErrors(parsed.error))
      const { reason } = parsed.data
      const lockedThrough =
        parsed.data.lockedThrough === undefined
          ? lock.lockedThrough
          : parsed.data.lockedThrough
      if (
        lockedThrough &&
        isLockDateTooLate(lockedThrough, todayIn(undefined, new Date(now())))
      )
        return validation({ lockedThrough: "future" })
      if (reopensPeriod(lock.lockedThrough, lockedThrough) && !reason)
        return validation({ reason: "required" })
      if (lockedThrough !== lock.lockedThrough) {
        recordAudit({
          action: "period_lock.updated",
          category: "company",
          ...(scoped.companyId ? { companyId: scoped.companyId } : {}),
          target: { type: PERIOD_LOCK, id: PERIOD_LOCK_ID },
          changes: [
            {
              field: "lockedThrough",
              label: { uk: "Закрито по", en: "Closed through" },
              from: lock.lockedThrough,
              to: lockedThrough,
            },
          ],
          ...(reason ? { reason } : {}),
        })
        lock.lockedThrough = lockedThrough
        lock.version += 1
      }
      return json(viewOf(lock, scoped.user, now()))
    }),

    http.get(exceptionsUrl, async ({ request }) => {
      const scoped = await access(request, PERIOD_LOCK_EXCEPTIONS)
      if (scoped instanceof Response) return scoped
      if (!hasPermission(scoped.permissions, PERIOD_LOCK_EXCEPTIONS, "read"))
        return forbidden(`${PERIOD_LOCK_EXCEPTIONS}:read`)
      if (scenarioFor(PERIOD_LOCK_EXCEPTIONS) === "empty")
        return json({ data: [], total: 0 })
      const data = lockOf(scoped.companyId)
        .exceptions.filter((exception) => isExceptionActive(exception, now()))
        .sort((a, b) => a.until.localeCompare(b.until))
      return json({ data, total: data.length })
    }),

    http.post(exceptionsUrl, async ({ request }) => {
      const scoped = await access(request, PERIOD_LOCK_EXCEPTIONS)
      if (scoped instanceof Response) return scoped
      if (!hasPermission(scoped.permissions, PERIOD_LOCK_EXCEPTIONS, "create"))
        return forbidden(`${PERIOD_LOCK_EXCEPTIONS}:create`)
      const parsed = periodLockExceptionInputSchema.safeParse(
        await request.json().catch(() => undefined),
      )
      if (!parsed.success) return validation(fieldErrors(parsed.error))
      const { userId, until, reason } = parsed.data
      const user = memberOf(userId, scoped.companyId)
      const errors: Record<string, string> = {}
      if (!user) errors.userId = "not_found"
      else if (activeException(scoped.companyId, user.id))
        errors.userId = "duplicate"
      const untilIssue = exceptionUntilIssue(until, now())
      if (untilIssue) errors.until = untilIssue
      if (!user || Object.keys(errors).length) return validation(errors)
      const exception: PeriodLockException = {
        id: `ple-${randomToken(6)}`,
        userId: user.id,
        userName: user.name,
        until: new Date(Date.parse(until)).toISOString(),
        reason,
        grantedBy: { id: scoped.user.id, name: scoped.user.name },
        grantedAt: new Date(now()).toISOString(),
      }
      lockOf(scoped.companyId).exceptions.push(exception)
      recordAudit({
        action: "period_lock.exception_granted",
        category: "company",
        ...(scoped.companyId ? { companyId: scoped.companyId } : {}),
        target: { type: "users", id: user.id, name: user.name },
        reason,
        details: { until: exception.until },
      })
      return json(exception, { status: 201 })
    }),

    http.delete(`${exceptionsUrl}/:id`, async ({ params, request }) => {
      const scoped = await access(request, PERIOD_LOCK_EXCEPTIONS)
      if (scoped instanceof Response) return scoped
      if (!hasPermission(scoped.permissions, PERIOD_LOCK_EXCEPTIONS, "delete"))
        return forbidden(`${PERIOD_LOCK_EXCEPTIONS}:delete`)
      const lock = lockOf(scoped.companyId)
      const found = lock.exceptions.find(
        (exception) =>
          exception.id === params.id && isExceptionActive(exception, now()),
      )
      if (!found)
        return errorResponse(404, {
          code: "not_found",
          message: `${PERIOD_LOCK_EXCEPTIONS}: not found`,
        })
      lock.exceptions = lock.exceptions.filter(
        (exception) => exception !== found,
      )
      recordAudit({
        action: "period_lock.exception_revoked",
        category: "company",
        ...(scoped.companyId ? { companyId: scoped.companyId } : {}),
        target: { type: "users", id: found.userId, name: found.userName },
        reason: found.reason,
      })
      return noContent()
    }),
  ]

  return {
    handlers,
    forResource,
    /** Дата закриття компанії: для тестів і сторінки демо. */
    lockedThrough: (companyId: string | null) =>
      lockOf(companyId).lockedThrough,
    reset: () => {
      store = null
      bumped.clear()
    },
  }
}
