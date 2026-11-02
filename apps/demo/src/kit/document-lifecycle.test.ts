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

import { ApiError, createApiClient, recordBaseSchema } from "@/registry/lib/api"
import { createDataProvider } from "@/registry/lib/data-provider"
import {
  createsDocument,
  documentLifecycleSchema,
  lifecycleAllows,
  transitionBodySchema,
} from "@/registry/lib/document-lifecycle"
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
  findTransition,
  mergeTransitions,
  transitionsFrom,
  type StatusTransition,
} from "@/registry/lib/statuses"

/**
 * Крок PF03a (ADR-0057): граф переходів із розширенням у lib/statuses, контракт життєвого циклу й мок
 * `POST /<ресурс>/:id/<дія>` у порядку перевірок контракту.
 */
const BASE = "http://erp.test/api/v1"

const GRAPH = [
  { id: "submit", from: ["draft"], to: "submitted" },
  { id: "markPaid", from: ["submitted"], to: "paid" },
  {
    id: "cancel",
    from: ["submitted", "paid"],
    to: "cancelled",
    reason: "required",
  },
  { id: "reverse", from: ["submitted", "paid"], to: "reversed" },
  { id: "amend", from: ["cancelled"] },
] as const satisfies readonly StatusTransition[]

const docSchema = recordBaseSchema
  .extend({ number: z.string(), status: z.string(), dueDate: z.string() })
  .extend(documentLifecycleSchema.shape)
type Doc = z.infer<typeof docSchema>

const seed = (): Doc[] => [
  {
    id: "d1",
    version: 1,
    number: "1",
    status: "draft",
    docStatus: "draft",
    dueDate: "2026-11-10",
  },
  {
    id: "d2",
    version: 1,
    number: "2",
    status: "submitted",
    docStatus: "submitted",
    dueDate: "2026-11-10",
  },
  {
    id: "d3",
    version: 1,
    number: "3",
    status: "paid",
    docStatus: "submitted",
    dueDate: "2026-11-10",
  },
  {
    id: "d4",
    version: 1,
    number: "4",
    status: "cancelled",
    docStatus: "cancelled",
    dueDate: "2026-11-10",
  },
]

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

const docs = createResourceHandlers<Doc>({
  baseUrl: BASE,
  resource: "docs",
  schema: docSchema,
  data: seed,
  deniedActions: (_, doc) => {
    const denied = { ...documentDeniedActions(doc) }
    if (doc.status === "paid") denied.cancel ??= "linked"
    return Object.keys(denied).length ? denied : undefined
  },
})

const server = setupServer(
  ...createPlatformHandlers({
    baseUrl: BASE,
    users: [user("full", ["docs:*"]), user("reader", ["docs:read"])],
  }),
  ...createTransitionHandlers({
    baseUrl: BASE,
    resource: "docs",
    db: docs.db,
    transitions: GRAPH,
    amend: (doc) => ({
      number: `${doc.number}-1`,
      status: "draft",
      dueDate: doc.dueDate,
    }),
    reverse: (doc) => ({
      number: `${doc.number}-С`,
      status: "submitted",
      dueDate: doc.dueDate,
    }),
    conflictChange: () => ({ dueDate: "2026-11-17" }),
  }),
  ...docs.handlers,
)
const data = createDataProvider(createApiClient({ baseUrl: BASE }))

const run = (id: string, action: string, body: object) =>
  data.runTransition("docs", id, action, body as never) as Promise<Doc>
const failure = async (promise: Promise<unknown>) => {
  const error: unknown = await promise.catch((caught: unknown) => caught)
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}
const stored = (id: string) => docs.db.all().find((doc) => doc.id === id)

beforeAll(() => {
  server.listen()
})
beforeEach(() => {
  docs.db.reset()
  resetScenarios()
  signInMock("full")
})
afterEach(() => {
  server.resetHandlers()
})
afterAll(() => {
  server.close()
})

describe("граф переходів (lib/statuses)", () => {
  it("розширення додає дію, ховає дію модуля й змінює `from` і причину без заміни", () => {
    const merged = mergeTransitions(GRAPH, {
      add: [
        {
          id: "review",
          label: { uk: "На перевірку", en: "Review" },
          from: ["draft"],
          to: "review",
          place: { after: "submit" },
        },
      ],
      hide: ["reverse"],
      change: [
        { id: "submit", from: ["draft", "review"] },
        { id: "cancel", reason: "optional" },
      ],
    })
    expect(merged.map(({ id }) => id)).toEqual([
      "submit",
      "review",
      "markPaid",
      "cancel",
      "amend",
    ])
    expect(findTransition(merged, "review", "submit")?.to).toBe("submitted")
    expect(findTransition(merged, "cancelled", "submit")).toBeUndefined()
    expect(findTransition(merged, "paid", "cancel")?.reason).toBe("optional")
    // Підпис — дані розширення для інтерфейсу; граф для сервера його не несе.
    expect(merged.find(({ id }) => id === "review")).toEqual({
      id: "review",
      from: ["draft"],
      to: "review",
      reason: undefined,
    })
  })

  it("`add` з ключем дії модуля не діє: куди веде дія, вирішує модуль", () => {
    const merged = mergeTransitions(GRAPH, {
      add: [
        {
          id: "submit",
          label: { uk: "Провести", en: "Submit" },
          from: ["draft"],
          to: "paid",
        },
      ],
    })
    expect(merged.map(({ id }) => id)).toEqual(GRAPH.map(({ id }) => id))
    expect(findTransition(merged, "draft", "submit")?.to).toBe("submitted")
  })

  it("без змін — той самий список; дії зі статусу — у порядку графа", () => {
    expect(mergeTransitions(GRAPH)).toBe(GRAPH)
    expect(transitionsFrom(GRAPH, "paid").map(({ id }) => id)).toEqual([
      "cancel",
      "reverse",
    ])
    expect(transitionsFrom(GRAPH, "unknown")).toEqual([])
  })
})

describe("контракт (lib/document-lifecycle)", () => {
  it("тіло дії: версія обов'язкова, причина без пробілів по краях і не довша за межу", () => {
    expect(
      transitionBodySchema.parse({ version: 2, reason: "  Помилка " }),
    ).toEqual({
      version: 2,
      reason: "Помилка",
    })
    expect(transitionBodySchema.safeParse({}).success).toBe(false)
    expect(
      transitionBodySchema.safeParse({ version: 1, reason: " " }).success,
    ).toBe(false)
    expect(
      transitionBodySchema.safeParse({ version: 1, reason: "я".repeat(501) })
        .success,
    ).toBe(false)
    const blank = transitionBodySchema.safeParse({ version: 1, reason: "  " })
    expect(blank.error?.issues[0]?.message).toBe("required")
  })

  it("дії кіта — лише зі свого стану документа, дії модуля — за графом", () => {
    expect(lifecycleAllows("submit", "draft")).toBe(true)
    expect(lifecycleAllows("submit", "cancelled")).toBe(false)
    expect(lifecycleAllows("cancel", "draft")).toBe(false)
    expect(lifecycleAllows("amend", "cancelled")).toBe(true)
    expect(lifecycleAllows("reverse", "submitted")).toBe(true)
    expect(lifecycleAllows("markPaid", "cancelled")).toBe(true)
    // Запис без життєвого циклу — лише граф.
    expect(lifecycleAllows("submit", undefined)).toBe(true)
  })

  it("нові документи створюють лише виправлення й сторно", () => {
    expect(
      ["submit", "cancel", "amend", "reverse", "markPaid"].filter(
        createsDocument,
      ),
    ).toEqual(["amend", "reverse"])
  })

  it("позначки життєвого циклу: чернетку можна, проведений і скасований не змінюють", () => {
    expect(documentDeniedActions({ docStatus: "draft" })).toBeUndefined()
    expect(documentDeniedActions({ docStatus: "submitted" })).toEqual({
      update: "submitted",
      delete: "submitted",
    })
    expect(
      documentDeniedActions({ docStatus: "cancelled", amendedBy: "x" }),
    ).toEqual({ update: "cancelled", delete: "cancelled", amend: "amended" })
    expect(
      documentDeniedActions({ docStatus: "submitted", reversedBy: "x" }),
    ).toMatchObject({ cancel: "reversed", reverse: "reversed" })
  })
})

describe("мок POST /<ресурс>/:id/<дія>", () => {
  it("провести: статус графа й `docStatus`, нова версія; проведений не змінюють", async () => {
    const doc = await run("d1", "submit", { version: 1 })
    expect(doc).toMatchObject({
      status: "submitted",
      docStatus: "submitted",
      version: 2,
      deniedActions: { update: "submitted", delete: "submitted" },
    })
    const error = await failure(
      data.update("docs", {
        id: "d1",
        data: { number: "1a", version: 2 },
        previousData: doc,
      }),
    )
    expect(error.status).toBe(403)
  })

  it("без права на дію — 403, невідомий запис — 404", async () => {
    signInMock("reader")
    expect((await failure(run("d1", "submit", { version: 1 }))).status).toBe(
      403,
    )
    signInMock("full")
    expect((await failure(run("nope", "submit", { version: 1 }))).status).toBe(
      404,
    )
  })

  it("позначка запису — 403 з `current` раніше за версію: причину видно й зі старою версією", async () => {
    const error = await failure(
      run("d3", "cancel", { version: 99, reason: "x" }),
    )
    expect(error.status).toBe(403)
    expect(error.current).toMatchObject({
      id: "d3",
      deniedActions: { cancel: "linked" },
    })
    expect(stored("d3")?.status).toBe("paid")
  })

  it("інша версія — 409 з `current`; дія не зі статусу — 422 `transition_not_allowed`", async () => {
    const conflict = await failure(run("d2", "markPaid", { version: 5 }))
    expect(conflict.status).toBe(409)
    expect(conflict.current).toMatchObject({ id: "d2", version: 1 })
    const notAllowed = await failure(run("d2", "submit", { version: 1 }))
    expect(notAllowed.status).toBe(422)
    expect(notAllowed.code).toBe("transition_not_allowed")
  })

  it("граф проекту дозволив провести скасований — сервер однаково відмовляє 422", async () => {
    server.use(
      ...createTransitionHandlers({
        baseUrl: BASE,
        resource: "docs",
        db: docs.db,
        transitions: mergeTransitions(GRAPH, {
          change: [{ id: "submit", from: ["draft", "cancelled"] }],
        }),
      }),
    )
    const error = await failure(run("d4", "submit", { version: 1 }))
    expect(error.status).toBe(422)
    expect(error.code).toBe("transition_not_allowed")
    expect(stored("d4")?.docStatus).toBe("cancelled")
  })

  it("сценарій `conflict`: колега змінює запис один раз, повтор із новою версією проходить", async () => {
    setScenario("conflict", "docs")
    const error = await failure(run("d2", "markPaid", { version: 1 }))
    expect(error.status).toBe(409)
    expect(error.current).toMatchObject({ version: 2, dueDate: "2026-11-17" })
    const doc = await run("d2", "markPaid", { version: 2 })
    expect(doc).toMatchObject({ status: "paid", version: 3 })
    // Після скидання даних конфлікт знову є: позначка колеги — на версію, а не на запис.
    docs.db.reset()
    expect((await failure(run("d2", "markPaid", { version: 1 }))).status).toBe(
      409,
    )
  })

  it("причина, яку граф вимагає, — 422 біля поля; з причиною дія проходить", async () => {
    const error = await failure(run("d2", "cancel", { version: 1 }))
    expect(error.status).toBe(422)
    expect(error.fieldErrors).toEqual({ reason: "required" })
    const invalid = await failure(run("d2", "cancel", { version: "1" }))
    expect(invalid.fieldErrors).toHaveProperty("version")
    const doc = await run("d2", "cancel", { version: 1, reason: "Помилка" })
    expect(doc).toMatchObject({ status: "cancelled", docStatus: "cancelled" })
  })

  it("виправити: нова чернетка з `amendedFrom`, у першого `amendedBy`; вдруге — 403 `amended`", async () => {
    const copy = await run("d4", "amend", { version: 1 })
    expect(copy).toMatchObject({
      number: "4-1",
      status: "draft",
      docStatus: "draft",
      amendedFrom: "d4",
      version: 1,
    })
    expect(stored("d4")).toMatchObject({
      amendedBy: copy.id,
      status: "cancelled",
      version: 2,
    })
    const again = await failure(run("d4", "amend", { version: 2 }))
    expect(again.status).toBe(403)
    expect(again.current).toMatchObject({ deniedActions: { amend: "amended" } })
  })

  it("сторнувати: документ-сторно проведений, перший лишається проведеним зі статусом `to`", async () => {
    const reversal = await run("d2", "reverse", { version: 1 })
    expect(reversal).toMatchObject({
      number: "2-С",
      docStatus: "submitted",
      reversalOf: "d2",
    })
    expect(stored("d2")).toMatchObject({
      docStatus: "submitted",
      status: "reversed",
      reversedBy: reversal.id,
    })
    const cancel = await failure(
      run("d2", "cancel", { version: 2, reason: "x" }),
    )
    expect(cancel.current).toMatchObject({
      deniedActions: { cancel: "reversed" },
    })
  })

  it("сценарії ресурсу: помилка сервера, немає доступу, офлайн", async () => {
    setScenario("error", "docs")
    expect((await failure(run("d1", "submit", { version: 1 }))).status).toBe(
      500,
    )
    setScenario("forbidden", "docs")
    expect((await failure(run("d1", "submit", { version: 1 }))).status).toBe(
      403,
    )
    setScenario("offline", "docs")
    expect((await failure(run("d1", "submit", { version: 1 }))).code).toBe(
      "offline",
    )
    expect(stored("d1")?.status).toBe("draft")
  })
})
