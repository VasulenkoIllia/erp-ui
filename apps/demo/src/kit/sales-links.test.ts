import { setupServer } from "msw/node"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { createApiClient, isApiError } from "@/registry/lib/api"
import { setCompanyId } from "@/registry/lib/company-scope"
import { createDataProvider } from "@/registry/lib/data-provider"
import { copiedDocumentLines } from "@/registry/lib/document-lines"
import type { Job } from "@/registry/lib/jobs"
import { createDocumentFlowHandlers } from "@/registry/lib/mock-document-flow"
import { createJobHandlers } from "@/registry/lib/mock-jobs"
import { createNumberingMocks } from "@/registry/lib/mock-numbering"
import { resetScenarios, setScenario } from "@/registry/lib/mock-scenarios"
import {
  createPlatformHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"
import {
  CREATE_ORDER,
  orderCardSchemaFor,
  ORDERS,
  quoteCardSchemaFor,
  QUOTES,
  type OrderCard,
  type QuoteCard,
} from "@/registry/modules/B3-sales/contract"
import { createSalesFixtures } from "@/registry/modules/B3-sales/fixtures"
import {
  createSalesMocks,
  salesNumberingSeeds,
} from "@/registry/modules/B3-sales/mocks"

/**
 * Модуль B3, зв'язок пропозиції із замовленням (ADR-0067, крок B3b2): «Створити замовлення» з прийнятої
 * пропозиції, повтор і скасування під кодом `linked`, звільнення пропозиції після видалення чернетки,
 * потік документів обох видів.
 */
const BASE = "http://erp-sales-links.test/api/v1"
const COMPANY = "c1"
const OTHER = "c2"
const TODAY = "2026-11-08"
/** Прийнята пропозиція засіву без замовлення і з замовленням `so-c1-08`. */
const ACCEPTED = "qt-c1-05"
const ORDERED = "qt-c1-10"
const SEED_ORDER = "so-c1-08"

const person = (id: string, permissions: string[]): MockUser => ({
  id,
  name: id,
  email: `${id}@test.example`,
  password: "demo-password",
  totpCode: "111111",
  roles: [],
  permissions,
  companies: [
    { id: COMPANY, name: "ТОВ «Тест»" },
    { id: OTHER, name: "ФОП Тестенко" },
  ],
  companyId: COMPANY,
  factors: [],
})
const MANAGER = person("manager", ["quotes:*", "orders:*"])
/** Може «Створити замовлення» в пропозиції, але не створює замовлень. */
const NO_ORDERS = person("no-orders", ["quotes:*", "orders:read"])
/** Створює замовлення, але без дії пропозиції `order`. */
const NO_ACTION = person("no-action", [
  "quotes:read",
  "quotes:cancel",
  "orders:*",
])

const options = { companies: [COMPANY, OTHER], today: TODAY } as const
const seeds = salesNumberingSeeds(options)
const numbering = createNumberingMocks({
  baseUrl: BASE,
  series: [...seeds.series],
  counters: [...seeds.counters],
})
const mocks = createSalesMocks({ ...options, baseUrl: BASE, numbering })
const server = setupServer(
  ...createPlatformHandlers({
    users: [MANAGER, NO_ORDERS, NO_ACTION],
    baseUrl: BASE,
  }),
  ...numbering.handlers,
  ...createJobHandlers({ baseUrl: BASE }),
  ...createDocumentFlowHandlers({
    sources: mocks.flowSources,
    baseUrl: BASE,
  }),
  ...mocks.handlers,
)
const provider = createDataProvider(
  createApiClient({ baseUrl: BASE, getLanguage: () => "uk" }),
)

const quoteSchema = quoteCardSchemaFor()
const orderSchema = orderCardSchemaFor()
/** Позначки сервера схема контракту відкидає: беремо їх із відповіді поруч із розібраним записом. */
type Denied = { deniedActions?: Readonly<Record<string, string>> }
const quote = (id: string) =>
  provider.getOne<QuoteCard & Denied>(QUOTES, { id }).then(({ data }) => ({
    ...quoteSchema.parse(data),
    deniedActions: data.deniedActions,
  }))
const order = (id: string) =>
  provider
    .getOne<OrderCard>(ORDERS, { id })
    .then(({ data }) => orderSchema.parse(data))
const run = (resource: string, id: string, action: string, body: object) =>
  provider.runTransition(resource, id, action, body as never)
const createOrder = async (id: string) => {
  const source = await quote(id)
  return orderSchema.parse(
    await run(QUOTES, id, CREATE_ORDER, { version: source.version }),
  )
}
const failureOf = async (promise: Promise<unknown>) => {
  const error: unknown = await promise.catch((caught: unknown) => caught)
  if (!isApiError(error)) throw new Error("expected ApiError")
  return error
}
const storedOrders = () =>
  mocks.db.orders.all().filter((item) => item.companyId === COMPANY)
const namesOf = (lines: readonly { kind: string; id: string }[]) =>
  lines.map((line) => ("name" in line ? line.name : line.kind))

describe("модуль B3: фікстури зв'язку", () => {
  const { quotes, orders } = createSalesFixtures(options)
  const ordered = quotes.find((item) => item.id === ORDERED)
  const seeded = orders.find((item) => item.id === SEED_ORDER)

  it("виконане замовлення створено з прийнятої пропозиції: клієнт, рядки й суми — її, зв'язок в обидва боки", () => {
    expect(ordered).toMatchObject({ status: "accepted", orderId: SEED_ORDER })
    expect(seeded).toMatchObject({
      status: "completed",
      quoteId: ORDERED,
      clientId: ordered?.clientId,
      total: ordered?.total,
    })
    expect(namesOf(seeded?.lines ?? [])).toEqual(namesOf(ordered?.lines ?? []))
    expect(seeded?.lines.every((line) => line.id.startsWith(SEED_ORDER))).toBe(
      true,
    )
    // Замовлення — після пропозиції, і обидва проходять схеми контракту.
    expect((seeded?.date ?? "") > (ordered?.date ?? "")).toBe(true)
    expect(() => quoteSchema.parse(ordered)).not.toThrow()
    expect(() => orderSchema.parse(seeded)).not.toThrow()
    // Друга прийнята пропозиція — без замовлення.
    expect(quotes.find((item) => item.id === ACCEPTED)?.orderId).toBeUndefined()
  })
})

describe("модуль B3: замовлення з пропозиції (мок)", () => {
  beforeAll(() => {
    server.listen({ onUnhandledFrame: "error" })
  })
  beforeEach(() => {
    localStorage.clear()
    mocks.db.quotes.reset()
    mocks.db.orders.reset()
    setCompanyId(COMPANY)
    signInMock(MANAGER.id)
  })
  afterEach(() => {
    resetScenarios()
    server.resetHandlers()
  })
  afterAll(() => {
    server.close()
    setCompanyId(null)
  })

  it("«Створити замовлення»: 201, чернетка без номера з клієнтом, рядками й знижкою; пропозиція лишається «Прийнято»", async () => {
    const source = await quote(ACCEPTED)
    const before = storedOrders().length
    const created = await createOrder(ACCEPTED)
    expect(created).toMatchObject({
      status: "draft",
      docStatus: "draft",
      number: null,
      quoteId: ACCEPTED,
      clientId: source.clientId,
      clientName: source.clientName,
      currency: source.currency,
      discountPercent: source.discountPercent,
      total: source.total,
    })
    expect(namesOf(created.lines)).toEqual(namesOf(source.lines))
    expect(created.dueDate >= created.date).toBe(true)
    expect(storedOrders()).toHaveLength(before + 1)
    const after = await quote(ACCEPTED)
    expect(after).toMatchObject({
      status: "accepted",
      orderId: created.id,
      deniedActions: { [CREATE_ORDER]: "linked", cancel: "linked" },
    })
  })

  it("повтор — 403 з позначкою `linked`: другого замовлення немає", async () => {
    await createOrder(ACCEPTED)
    const count = storedOrders().length
    const seen = await quote(ACCEPTED)
    const refused = await failureOf(
      run(QUOTES, ACCEPTED, CREATE_ORDER, { version: seen.version }),
    )
    expect(refused.status).toBe(403)
    expect(refused.current).toMatchObject({
      deniedActions: { [CREATE_ORDER]: "linked" },
    })
    expect(storedOrders()).toHaveLength(count)
  })

  it("засів: пропозицію з виконаним замовленням не скасувати й не створити замовлення вдруге", async () => {
    const seen = await quote(ORDERED)
    expect(seen.deniedActions).toEqual({
      update: "submitted",
      delete: "submitted",
      [CREATE_ORDER]: "linked",
      cancel: "linked",
    })
    const refused = await failureOf(
      run(QUOTES, ORDERED, "cancel", {
        version: seen.version,
        reason: "Клієнт передумав",
      }),
    )
    expect(refused.status).toBe(403)
    expect((await quote(ORDERED)).status).toBe("accepted")
  })

  it("лише з прийнятої: з надісланої — 422 `transition_not_allowed`", async () => {
    const sent = await quote("qt-c1-03")
    const refused = await failureOf(
      run(QUOTES, sent.id, CREATE_ORDER, { version: sent.version }),
    )
    expect(refused.status).toBe(422)
    expect(refused.code).toBe("transition_not_allowed")
  })

  it("права: без `quotes:order` чи без `orders:create` — 403, замовлення немає", async () => {
    const count = storedOrders().length
    for (const user of [NO_ACTION, NO_ORDERS]) {
      signInMock(user.id)
      const seen = await quote(ACCEPTED)
      const refused = await failureOf(
        run(QUOTES, ACCEPTED, CREATE_ORDER, { version: seen.version }),
      )
      expect(refused.status).toBe(403)
    }
    expect(storedOrders()).toHaveLength(count)
  })

  it("видалена чернетка замовлення звільняє пропозицію: її знову можна скасувати чи дати замовлення", async () => {
    const created = await createOrder(ACCEPTED)
    await provider.delete(ORDERS, { id: created.id })
    const released = await quote(ACCEPTED)
    expect(released.orderId).toBeNull()
    expect(released.deniedActions?.[CREATE_ORDER]).toBeUndefined()
    expect(released.deniedActions?.cancel).toBeUndefined()
    expect((await createOrder(ACCEPTED)).quoteId).toBe(ACCEPTED)
  })

  it("скасоване замовлення не тримає пропозицію: її можна скасувати, а друге замовлення — ні; виправлена копія замовлення лишається на підставі пропозиції", async () => {
    const seeded = await order(SEED_ORDER)
    const cancelled = orderSchema.parse(
      await run(ORDERS, SEED_ORDER, "cancel", {
        version: seeded.version,
        reason: "Помилка в рядках",
      }),
    )
    const free = await quote(ORDERED)
    expect(free.deniedActions?.cancel).toBeUndefined()
    expect(free.deniedActions?.[CREATE_ORDER]).toBe("linked")
    const copy = orderSchema.parse(
      await run(ORDERS, SEED_ORDER, "amend", { version: cancelled.version }),
    )
    expect(copy).toMatchObject({ quoteId: ORDERED, amendedFrom: SEED_ORDER })
    // Нова чернетка на підставі пропозиції знову тримає її від скасування.
    expect((await quote(ORDERED)).deniedActions?.cancel).toBe("linked")
  })

  it("виправлена копія пропозиції не бере замовлення першої", async () => {
    const seen = await quote(ACCEPTED)
    const cancelled = quoteSchema.parse(
      await run(QUOTES, ACCEPTED, "cancel", {
        version: seen.version,
        reason: "Нові ціни",
      }),
    )
    const copy = quoteSchema.parse(
      await run(QUOTES, ACCEPTED, "amend", { version: cancelled.version }),
    )
    expect(copy.orderId).toBeUndefined()
    expect(copy.status).toBe("draft")
  })

  it("зв'язок ставить лише сервер: `quoteId` у створенні замовлення й `orderId` у зміні пропозиції не беруться", async () => {
    const seeded = await order(SEED_ORDER)
    const { data: created } = await provider.create<OrderCard>(ORDERS, {
      data: {
        clientId: seeded.clientId,
        clientName: seeded.clientName,
        currency: seeded.currency,
        date: TODAY,
        dueDate: TODAY,
        lines: copiedDocumentLines(seeded.lines),
        discountPercent: seeded.discountPercent,
        discountAmount: seeded.discountAmount,
        quoteId: ACCEPTED,
      },
    })
    expect(orderSchema.parse(created).quoteId).toBeUndefined()
    expect((await quote(ACCEPTED)).deniedActions?.cancel).toBeUndefined()

    const draft = mocks.db.quotes
      .all()
      .find((item) => item.companyId === COMPANY && item.docStatus === "draft")
    if (!draft) throw new Error("no draft quote")
    const { data: patched } = await provider.update<QuoteCard>(QUOTES, {
      id: draft.id,
      data: { clientName: "Інший клієнт", orderId: SEED_ORDER },
      previousData: draft,
    })
    const saved = quoteSchema.parse(patched)
    expect(saved.clientName).toBe("Інший клієнт")
    expect(saved.orderId).toBeUndefined()
  })

  it("масове «Скасувати»: пропозиція із замовленням — невдача `linked`, решта скасована", async () => {
    const orderedNumber = (await quote(ORDERED)).number
    const { jobId } = await provider.startBulk(
      QUOTES,
      "cancel",
      { ids: [ORDERED, ACCEPTED] },
      { reason: "Клієнт закрив тендер" },
    )
    let job: Job = await provider.getJob(jobId)
    await vi.waitFor(
      async () => {
        job = await provider.getJob(jobId)
        expect(job.status).toBe("done")
      },
      { timeout: 3000, interval: 50 },
    )
    expect(job).toMatchObject({ succeeded: 1, failed: 1 })
    expect(job.failures).toEqual([
      expect.objectContaining({
        code: "linked",
        items: [expect.objectContaining({ title: orderedNumber })],
      }),
    ])
    expect((await quote(ORDERED)).status).toBe("accepted")
    expect((await quote(ACCEPTED)).status).toBe("cancelled")
  })

  it("потік: пропозиція, потім замовлення «на підставі» — однаковий з обох карток", async () => {
    const fromQuote = await provider.getDocumentFlow(QUOTES, ORDERED)
    const fromOrder = await provider.getDocumentFlow(ORDERS, SEED_ORDER)
    for (const flow of [fromQuote, fromOrder]) {
      expect(flow.truncated).toBe(false)
      expect(
        flow.documents.map(({ resource, id, access }) => ({
          resource,
          id,
          access,
        })),
      ).toEqual([
        { resource: QUOTES, id: ORDERED, access: "granted" },
        { resource: ORDERS, id: SEED_ORDER, access: "granted" },
      ])
      expect(flow.documents[1]?.links).toEqual([
        { kind: "basedOn", resource: QUOTES, id: ORDERED },
      ])
    }
    expect(fromQuote.documents[0]).toMatchObject({
      status: "accepted",
      docStatus: "submitted",
      total: { currency: "UAH" },
    })
  })

  it("потік: нове замовлення з'являється одразу, виправлена копія — «виправлено з»", async () => {
    const created = await createOrder(ACCEPTED)
    const flow = await provider.getDocumentFlow(QUOTES, ACCEPTED)
    expect(flow.documents.map((node) => node.id)).toEqual([
      ACCEPTED,
      created.id,
    ])
    expect(flow.documents[1]).toMatchObject({ number: null, status: "draft" })
    const amended = await provider.getDocumentFlow(QUOTES, "qt-c1-08")
    expect(amended.documents.map((node) => node.id)).toEqual([
      "qt-c1-07",
      "qt-c1-08",
    ])
    expect(amended.documents[1]?.links).toEqual([
      { kind: "amendedFrom", resource: QUOTES, id: "qt-c1-07" },
    ])
  })

  it("потік: сценарій ресурсу запиту й документ іншої компанії", async () => {
    setScenario("error", QUOTES)
    expect(
      (await failureOf(provider.getDocumentFlow(QUOTES, ORDERED))).status,
    ).toBe(500)
    resetScenarios()
    expect(
      (await failureOf(provider.getDocumentFlow(QUOTES, "qt-c2-10"))).status,
    ).toBe(404)
  })
})
