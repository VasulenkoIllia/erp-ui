import { setupServer } from "msw/node"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest"
import { z } from "zod"

import { amendDocument, makeDocuments, reverseDocument } from "@/data/documents"
import { ApiError, createApiClient, recordBaseSchema } from "@/registry/lib/api"
import type { AuditEvent } from "@/registry/lib/audit"
import { createDataProvider } from "@/registry/lib/data-provider"
import { addDays, todayIn } from "@/registry/lib/dates"
import { documentLifecycleSchema } from "@/registry/lib/document-lifecycle"
import { createPeriodLockMocks } from "@/registry/lib/mock-period-lock"
import { resetScenarios, setScenario } from "@/registry/lib/mock-scenarios"
import {
  createTransitionHandlers,
  documentDeniedActions,
} from "@/registry/lib/mock-transitions"
import {
  createPlatformHandlers,
  createResourceHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"
import {
  exceptionUntilIssue,
  fiscalYears,
  isPeriodLocked,
  PERIOD_LOCK,
  PERIOD_LOCK_EXCEPTIONS,
  PERIOD_LOCK_ID,
  PERIOD_LOCKED,
  previousMonthEnd,
  reopensPeriod,
  type PeriodLock,
  type PeriodLockException,
} from "@/registry/lib/period-lock"
import type { StatusTransition } from "@/registry/lib/statuses"

/**
 * Крок PF13 (ADR-0069): контракт закритих періодів, роки компанії, мок дати закриття й винятків і
 * правила сервера для документів модуля — позначка `period_locked`, 422 біля поля дати, сторно
 * дозволене, зміна за винятком у журналі.
 */
const BASE = "http://erp.test/api/v1"
const HOUR_MS = 3_600_000
const today = todayIn()
const lockedThrough = addDays(today, -10)
const closedDay = addDays(today, -15)
const openDay = addDays(today, -5)

describe("контракт (lib/period-lock)", () => {
  it("дата в закритому періоді — по дату закриття включно", () => {
    expect(isPeriodLocked("2026-10-20", "2026-10-20")).toBe(true)
    expect(isPeriodLocked("2026-10-19", "2026-10-20")).toBe(true)
    expect(isPeriodLocked("2026-10-21", "2026-10-20")).toBe(false)
    expect(isPeriodLocked("2026-10-19", null)).toBe(false)
    expect(isPeriodLocked("19.10.2026", "2026-10-20")).toBe(false)
  })

  it("відкрити знову — дата раніше чи порожня після дати", () => {
    expect(reopensPeriod("2026-10-20", "2026-09-30")).toBe(true)
    expect(reopensPeriod("2026-10-20", null)).toBe(true)
    expect(reopensPeriod("2026-10-20", "2026-10-31")).toBe(false)
    expect(reopensPeriod(null, "2026-10-31")).toBe(false)
  })

  it("кінець винятку: у майбутньому й не далі ніж за 7 днів", () => {
    const now = Date.parse("2026-11-09T10:00:00Z")
    expect(exceptionUntilIssue("2026-11-09T11:00:00Z", now)).toBeNull()
    expect(exceptionUntilIssue("2026-11-16T10:00:00Z", now)).toBeNull()
    expect(exceptionUntilIssue("2026-11-16T10:00:01Z", now)).toBe("too_far")
    expect(exceptionUntilIssue("2026-11-09T10:00:00Z", now)).toBe("past")
    expect(exceptionUntilIssue("завтра", now)).toBe("invalid")
  })

  it("роки компанії з січня: поточний і два попередні зі станом закриття", () => {
    expect(
      fiscalYears({
        startMonth: 1,
        lockedThrough: "2026-10-20",
        today: "2026-11-09",
      }),
    ).toEqual([
      {
        label: "2026",
        start: "2026-01-01",
        end: "2026-12-31",
        status: "partly",
        isCurrent: true,
      },
      {
        label: "2025",
        start: "2025-01-01",
        end: "2025-12-31",
        status: "closed",
        isCurrent: false,
      },
      {
        label: "2024",
        start: "2024-01-01",
        end: "2024-12-31",
        status: "closed",
        isCurrent: false,
      },
    ])
  })

  it("рік із квітня — «2026/27», межі через новий рік; хибний місяць — січень", () => {
    const years = fiscalYears({
      startMonth: 4,
      lockedThrough: null,
      today: "2026-02-10",
    })
    expect(
      years.map(({ label, start, end, status }) => [label, start, end, status]),
    ).toEqual([
      ["2025/26", "2025-04-01", "2026-03-31", "open"],
      ["2024/25", "2024-04-01", "2025-03-31", "open"],
      ["2023/24", "2023-04-01", "2024-03-31", "open"],
    ])
    expect(
      fiscalYears({
        startMonth: 13,
        lockedThrough: null,
        today: "2026-02-10",
      })[0]?.start,
    ).toBe("2026-01-01")
  })

  it("кінець минулого місяця", () => {
    expect(previousMonthEnd("2026-11-09")).toBe("2026-10-31")
    expect(previousMonthEnd("2026-03-01")).toBe("2026-02-28")
    expect(previousMonthEnd("2026-01-15")).toBe("2025-12-31")
  })
})

const docSchema = recordBaseSchema
  .extend({
    companyId: z.string().nullable().optional(),
    date: z.string(),
    status: z.string(),
  })
  .extend(documentLifecycleSchema.shape)
type Doc = z.infer<typeof docSchema>

const GRAPH: readonly StatusTransition[] = [
  { id: "submit", from: ["draft"], to: "submitted" },
  { id: "cancel", from: ["submitted"], to: "cancelled" },
  { id: "reverse", from: ["submitted"], to: "reversed" },
]

let clock = Date.now()
const periodLock = createPeriodLockMocks({
  baseUrl: BASE,
  now: () => clock,
  seeds: [
    {
      companyId: null,
      lockedThrough,
      exceptions: [
        {
          userId: "lucky",
          userName: "lucky",
          until: new Date(clock + HOUR_MS).toISOString(),
          reason: "Виправити акт",
          grantedBy: { id: "admin", name: "admin" },
          grantedAt: new Date(clock).toISOString(),
        },
      ],
    },
  ],
})
const rules = periodLock.forResource<Doc>({
  resource: "docs",
  dateField: "date",
  actions: GRAPH.map((transition) => transition.id),
})

const docs = createResourceHandlers<Doc>({
  baseUrl: BASE,
  resource: "docs",
  schema: docSchema,
  data: () => [
    {
      id: "open",
      version: 1,
      date: openDay,
      status: "draft",
      docStatus: "draft",
    },
    {
      id: "closed",
      version: 1,
      date: closedDay,
      status: "draft",
      docStatus: "draft",
    },
    {
      id: "posted",
      version: 1,
      date: closedDay,
      status: "submitted",
      docStatus: "submitted",
    },
  ],
  deniedActions: (actor, doc) => {
    const denied = {
      ...rules.deniedActions(actor, doc),
      ...documentDeniedActions(doc),
    }
    return Object.keys(denied).length ? denied : undefined
  },
  validateWrite: rules.validateWrite,
  afterWrite: rules.afterWrite,
})

const user = (id: string, permissions: string[]): MockUser => ({
  id,
  name: id,
  email: `${id}@test.example`,
  password: "demo",
  totpCode: "111111",
  roles: [],
  permissions,
  companies: [],
  companyId: null,
  factors: [],
})

const server = setupServer(
  ...createPlatformHandlers({
    baseUrl: BASE,
    users: [
      user("admin", ["docs:*", "period-lock:*", "period-lock-exceptions:*"]),
      user("viewer", ["docs:*"]),
      user("lucky", ["docs:*"]),
    ],
  }),
  ...createTransitionHandlers({
    baseUrl: BASE,
    resource: "docs",
    db: docs.db,
    transitions: GRAPH,
    reverse: () => ({ status: "submitted", date: today }),
    afterTransition: rules.afterTransition,
  }),
  ...docs.handlers,
  ...periodLock.handlers,
)
const data = createDataProvider(createApiClient({ baseUrl: BASE }))

beforeAll(() => {
  server.listen()
})
beforeEach(() => {
  clock = Date.now()
  localStorage.clear()
  docs.db.reset()
  periodLock.reset()
  resetScenarios()
  signInMock("admin")
})
afterEach(() => {
  server.resetHandlers()
})
afterAll(() => {
  server.close()
})

const failure = async (promise: Promise<unknown>) => {
  const error: unknown = await promise.catch((caught: unknown) => caught)
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

const readLock = async () =>
  (await data.getOne<PeriodLock>(PERIOD_LOCK, { id: PERIOD_LOCK_ID })).data

const patchLock = (changes: Record<string, unknown>, version = 1) =>
  data.update<PeriodLock>(PERIOD_LOCK, {
    id: PERIOD_LOCK_ID,
    data: changes,
    previousData: { id: PERIOD_LOCK_ID, version } as PeriodLock,
  })

const grant = (body: Record<string, unknown>) =>
  data.create<PeriodLockException>(PERIOD_LOCK_EXCEPTIONS, { data: body })

/** Документ, як його бачить той, хто питає: з позначкою заборон сервера. */
type SeenDoc = Doc & { deniedActions?: Record<string, string> }
const doc = async (id: string) =>
  (await data.getOne<SeenDoc>("docs", { id })).data

const audit = (): AuditEvent[] =>
  JSON.parse(localStorage.getItem("erp-ui:mock-audit") ?? "[]") as AuditEvent[]

describe("дата закриття (lib/mock-period-lock)", () => {
  it("читає кожен; свій чинний виняток — лише тому, хто питає", async () => {
    signInMock("viewer")
    expect(await readLock()).toMatchObject({ lockedThrough, exception: null })
    signInMock("lucky")
    expect((await readLock()).exception).toMatchObject({
      reason: "Виправити акт",
    })
  })

  it("змінює лише право period-lock:update", async () => {
    signInMock("viewer")
    const error = await failure(patchLock({ lockedThrough: openDay }))
    expect(error.status).toBe(403)
  })

  it("сьогодні не закривається: 422 future", async () => {
    const error = await failure(patchLock({ lockedThrough: today }))
    expect(error.fieldErrors).toEqual({ lockedThrough: "future" })
  })

  it("відкрити знову — лише з причиною; зміна в журналі", async () => {
    const error = await failure(patchLock({ lockedThrough: closedDay }))
    expect(error.fieldErrors).toEqual({ reason: "required" })
    const { data: saved } = await patchLock({
      lockedThrough: closedDay,
      reason: "Пропущений акт",
    })
    expect(saved).toMatchObject({ lockedThrough: closedDay, version: 2 })
    expect(audit()[0]).toMatchObject({
      action: "period_lock.updated",
      reason: "Пропущений акт",
      changes: [{ field: "lockedThrough", from: lockedThrough, to: closedDay }],
    })
  })

  it("закрити далі причини не просить; стара версія — 409 з current", async () => {
    await patchLock({ lockedThrough: openDay })
    const error = await failure(patchLock({ lockedThrough: openDay }, 1))
    expect(error.status).toBe(409)
    expect(error.current).toMatchObject({ lockedThrough: openDay, version: 2 })
  })

  it("сценарій conflict — колега змінив запис один раз", async () => {
    setScenario("conflict", PERIOD_LOCK)
    expect((await failure(patchLock({ lockedThrough: openDay }))).status).toBe(
      409,
    )
    const { data: saved } = await patchLock({ lockedThrough: openDay }, 2)
    expect(saved.lockedThrough).toBe(openDay)
  })
})

describe("винятки (lib/mock-period-lock)", () => {
  const until = () => new Date(clock + HOUR_MS).toISOString()

  it("лише з правом, з причиною, людині компанії, не далі ніж за тиждень", async () => {
    signInMock("viewer")
    expect(
      (await failure(grant({ userId: "admin", until: until(), reason: "x" })))
        .status,
    ).toBe(403)
    signInMock("admin")
    expect(
      (await failure(grant({ userId: "nobody", until: until(), reason: "x" })))
        .fieldErrors,
    ).toEqual({ userId: "not_found" })
    expect(
      (await failure(grant({ userId: "viewer", until: until(), reason: " " })))
        .fieldErrors,
    ).toEqual({ reason: "required" })
    expect(
      (
        await failure(
          grant({
            userId: "viewer",
            until: new Date(clock + 8 * 24 * HOUR_MS).toISOString(),
            reason: "x",
          }),
        )
      ).fieldErrors,
    ).toEqual({ until: "too_far" })
    expect(
      (await failure(grant({ userId: "lucky", until: until(), reason: "x" })))
        .fieldErrors,
    ).toEqual({ userId: "duplicate" })
    // Мить без поясу сервер і браузер прочитали б по-різному.
    expect(
      (
        await failure(
          grant({ userId: "viewer", until: "2026-11-12T10:00", reason: "x" }),
        )
      ).fieldErrors,
    ).toEqual({ until: "invalid" })
  })

  it("видача й відкликання — у журналі; прострочений не видно", async () => {
    const { data: created } = await grant({
      userId: "viewer",
      until: until(),
      reason: "Акт за жовтень",
    })
    expect(created).toMatchObject({
      userId: "viewer",
      grantedBy: { id: "admin" },
    })
    expect(audit()[0]).toMatchObject({
      action: "period_lock.exception_granted",
      reason: "Акт за жовтень",
      target: { type: "users", id: "viewer" },
    })
    const list = async () =>
      (
        await data.getList<PeriodLockException>(PERIOD_LOCK_EXCEPTIONS, {
          pagination: { page: 1, perPage: 50 },
          sort: { field: "until", order: "ASC" },
          filter: {},
        })
      ).data.map((exception) => exception.userId)
    expect(await list()).toEqual(["lucky", "viewer"])
    await data.delete(PERIOD_LOCK_EXCEPTIONS, {
      id: created.id,
      previousData: created,
    })
    expect(audit()[0]).toMatchObject({
      action: "period_lock.exception_revoked",
    })
    clock += 2 * HOUR_MS
    expect(await list()).toEqual([])
  })
})

describe("документи модуля (forResource)", () => {
  it("закритий документ: позначка period_locked, крім сторно; життєвий цикл важливіший", async () => {
    expect((await doc("closed")).deniedActions).toEqual({
      update: PERIOD_LOCKED,
      delete: PERIOD_LOCKED,
      submit: PERIOD_LOCKED,
      cancel: PERIOD_LOCKED,
    })
    expect((await doc("posted")).deniedActions).toEqual({
      update: "submitted",
      delete: "submitted",
      submit: PERIOD_LOCKED,
      cancel: PERIOD_LOCKED,
    })
    expect((await doc("open")).deniedActions).toBeUndefined()
  })

  it("дата в закритому періоді — 422 біля поля, і для нового документа", async () => {
    const changed = await failure(
      data.update<Doc>("docs", {
        id: "open",
        data: { date: closedDay },
        previousData: await doc("open"),
      }),
    )
    expect(changed.fieldErrors).toEqual({ date: PERIOD_LOCKED })
    const created = await failure(
      data.create<Doc>("docs", {
        data: { date: closedDay, status: "draft", docStatus: "draft" },
      }),
    )
    expect(created.fieldErrors).toEqual({ date: PERIOD_LOCKED })
  })

  it("дія над закритим документом — 403 з current; сторно проходить", async () => {
    const posted = await doc("posted")
    const refused = await failure(
      data.runTransition("docs", "posted", "cancel", {
        version: posted.version,
      }),
    )
    expect(refused.status).toBe(403)
    expect(refused.current).toMatchObject({
      deniedActions: { cancel: PERIOD_LOCKED },
    })
    const reversal = await data.runTransition("docs", "posted", "reverse", {
      version: posted.version,
    })
    expect(reversal).toMatchObject({ date: today, reversalOf: "posted" })
  })

  it("з винятком закрите змінюється, а кожна зміна — у журналі з причиною винятку", async () => {
    signInMock("lucky")
    const closed = await doc("closed")
    expect(closed.deniedActions).toBeUndefined()
    await data.update<Doc>("docs", {
      id: "closed",
      data: { date: addDays(closedDay, 1) },
      previousData: closed,
    })
    await data.runTransition("docs", "closed", "submit", { version: 2 })
    const used = audit().filter(
      (event) => event.action === "period_lock.exception_used",
    )
    expect(used).toHaveLength(2)
    expect(used[0]).toMatchObject({
      category: "data",
      reason: "Виправити акт",
      target: { type: "docs", id: "closed" },
    })
  })
})

describe("документи демо", () => {
  it("сторно й виправлена копія — «сьогодні» демо, а в закритому періоді — перший відкритий день", () => {
    const [first] = makeDocuments()
    expect(reverseDocument(first).date).toBe("2026-11-02")
    expect(reverseDocument(first, "2026-10-21").date).toBe("2026-11-02")
    expect(reverseDocument(first, "2026-11-10").date).toBe("2026-11-10")
    expect(amendDocument(first, "2026-11-10").date).toBe("2026-11-10")
  })
})
