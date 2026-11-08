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
import { addDays, todayIn } from "@/registry/lib/dates"
import type { DocumentBodyLine } from "@/registry/lib/document-lines"
import type { Job } from "@/registry/lib/jobs"
import { createJobHandlers } from "@/registry/lib/mock-jobs"
import { createNumberingMocks } from "@/registry/lib/mock-numbering"
import { resetScenarios, setScenario } from "@/registry/lib/mock-scenarios"
import {
  createPlatformHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"
import { createSalesModule, SALES_MODULE_ID } from "@/registry/modules/B3-sales"
import {
  ORDERS,
  QUOTE_STATUSES,
  QUOTES,
  quoteCardSchemaFor,
  type QuoteCard,
} from "@/registry/modules/B3-sales/contract"
import { createSalesFixtures } from "@/registry/modules/B3-sales/fixtures"
import {
  createSalesMocks,
  salesNumberingSeeds,
} from "@/registry/modules/B3-sales/mocks"

import { salesMockExtension } from "@/extensions/B3-sales-fields"

/**
 * Модуль B3, частина «Пропозиції» (ADR-0065): фабрика, фікстури, контракт, дії графа й сценарії.
 * Замовлення — `orders-module.test.ts`.
 */
const BASE = "http://erp-sales.test/api/v1"
const COMPANY = "c1"
const OTHER = "c2"
const TODAY = "2026-11-08"

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
const MANAGER = person("manager", ["quotes:*"])
const SELLER = person("seller", [
  "quotes:read",
  "quotes:create",
  "quotes:update",
  "quotes:submit",
])

const options = { companies: [COMPANY, OTHER], today: TODAY } as const
const seeds = salesNumberingSeeds(options)
const numbering = createNumberingMocks({
  baseUrl: BASE,
  series: [...seeds.series],
  counters: [...seeds.counters],
})
const mocks = createSalesMocks({
  ...options,
  baseUrl: BASE,
  numbering,
  extension: salesMockExtension,
})
const server = setupServer(
  ...createPlatformHandlers({ users: [MANAGER, SELLER], baseUrl: BASE }),
  ...numbering.handlers,
  ...createJobHandlers({ baseUrl: BASE }),
  ...mocks.handlers,
)
const provider = createDataProvider(
  createApiClient({ baseUrl: BASE, getLanguage: () => "uk" }),
)

const cardSchema = quoteCardSchemaFor(salesMockExtension.quotes)
const one = (id: string) =>
  provider
    .getOne<QuoteCard>(QUOTES, { id })
    .then(({ data }) => cardSchema.parse(data))
const run = (id: string, action: string, body: object) =>
  provider.runTransition(QUOTES, id, action, body as never) as Promise<
    QuoteCard & { amendedFrom?: string }
  >
const failureOf = async (promise: Promise<unknown>) => {
  const error: unknown = await promise.catch((caught: unknown) => caught)
  if (!isApiError(error)) throw new Error("expected ApiError")
  return error
}
const stored = (id: string) =>
  mocks.db.quotes.all().find((quote) => quote.id === id)

const line = (overrides: Partial<DocumentBodyLine> = {}): DocumentBodyLine =>
  ({
    kind: "item",
    id: "new-l1",
    name: "Сервісне обслуговування",
    itemId: null,
    quantity: "2",
    unit: { id: null, name: "год" },
    price: "1000",
    discountPercent: 0,
    discountAmount: 0,
    tax: { id: "vat-20", name: "ПДВ 20%", rate: 20, included: false },
    ...overrides,
  }) as DocumentBodyLine

const draft = (overrides: Record<string, unknown> = {}) => ({
  clientId: "client-1",
  clientName: "ТОВ «Зелена долина»",
  date: TODAY,
  validUntil: addDays(TODAY, 14),
  currency: "UAH",
  discountPercent: 0,
  discountAmount: 0,
  lines: [line()],
  // Сума з форми — лише підказка: сервер рахує сам.
  total: 1,
  ...overrides,
})

describe("модуль B3: фабрика", () => {
  it("адреси від basePath, сторінки списку, форми, картки й друку обох документів, пункти навігації з правом", () => {
    const module = createSalesModule({ basePath: "/sales/" })
    expect(module.id).toBe(SALES_MODULE_ID)
    expect(module.paths.editQuote("q1")).toBe("/sales/quotes/q1/edit")
    expect(module.paths.printQuote("q1")).toBe("/sales/quotes/q1/print")
    expect(module.routes.map((route) => route.path)).toEqual([
      "/sales/quotes",
      "/sales/quotes/new",
      "/sales/quotes/:id",
      "/sales/quotes/:id/edit",
      "/sales/quotes/:id/print",
      "/sales/orders",
      "/sales/orders/new",
      "/sales/orders/:id",
      "/sales/orders/:id/edit",
      "/sales/orders/:id/print",
      "/sales/",
    ])
    expect(module.paths.printOrder("o1")).toBe("/sales/orders/o1/print")
    expect(module.nav).toEqual([
      expect.objectContaining({
        id: "B3-quotes",
        href: "/sales/quotes",
        access: { resource: QUOTES, action: "read" },
      }),
      expect.objectContaining({
        id: "B3-orders",
        href: "/sales/orders",
        access: { resource: ORDERS, action: "read" },
      }),
    ])
    expect(
      module.resources.find((resource) => resource.name === QUOTES)?.actions,
    ).toEqual(
      expect.arrayContaining([
        "submit",
        "accept",
        "decline",
        "cancel",
        "amend",
      ]),
    )
  })

  it("без basePath — адреси від кореня й без переходу з адреси модуля", () => {
    const module = createSalesModule()
    expect(module.routes).toHaveLength(10)
    expect(module.routes[0]?.path).toBe("/quotes")
  })
})

describe("модуль B3: фікстури", () => {
  const { quotes, counters } = createSalesFixtures(options)
  const company = quotes.filter((quote) => quote.companyId === COMPANY)

  it("десять пропозицій на компанію з усіма статусами модуля й відповідною позначкою життєвого циклу", () => {
    expect(company).toHaveLength(10)
    expect(new Set(company.map((quote) => quote.status))).toEqual(
      new Set(QUOTE_STATUSES),
    )
    for (const quote of company) {
      expect(quote.docStatus).toBe(
        quote.status === "draft"
          ? "draft"
          : quote.status === "cancelled"
            ? "cancelled"
            : "submitted",
      )
      expect(quote.number === null).toBe(quote.docStatus === "draft")
      expect(() => cardSchema.parse(quote)).not.toThrow()
    }
  })

  it("номери зростають разом із датою, лічильник — останній виданий номер року", () => {
    const numbered = company
      .filter((quote) => quote.number !== null)
      .sort((a, b) => a.date.localeCompare(b.date))
    expect(numbered.map((quote) => quote.number)).toEqual(
      numbered.map(
        (_, index) => `КП-2026-${String(index + 1).padStart(4, "0")}`,
      ),
    )
    expect(counters).toContainEqual({
      resource: QUOTES,
      companyId: COMPANY,
      year: 2026,
      value: numbered.length,
    })
  })

  it("надіслана з минулим строком, скасована з виправленою копією для того самого клієнта, великий документ", () => {
    expect(
      company.some(
        (quote) => quote.status === "sent" && quote.validUntil < TODAY,
      ),
    ).toBe(true)
    const cancelled = company.find((quote) => quote.status === "cancelled")
    const copy = company.find((quote) => quote.id === cancelled?.amendedBy)
    expect(copy).toMatchObject({
      amendedFrom: cancelled?.id,
      clientId: cancelled?.clientId,
      status: "draft",
    })
    const lines = Math.max(...company.map((quote) => quote.lines.length))
    expect(lines).toBeGreaterThanOrEqual(12)
  })

  it("англійські дані — свій шаблон номера й назви", () => {
    const english = createSalesFixtures({ locale: "en", today: TODAY })
    expect(english.quotes.find((quote) => quote.number)?.number).toMatch(
      /^QT-2026-\d{4}$/,
    )
    expect(english.quotes[0]?.clientName).toMatch(/[A-Za-z]/)
  })

  it("засів серій: шаблони пропозицій і замовлень у кожній компанії й лічильники фікстур", () => {
    expect(seeds.series).toEqual([
      { companyId: COMPANY, resource: QUOTES, template: "КП-{YYYY}-{####}" },
      { companyId: OTHER, resource: QUOTES, template: "КП-{YYYY}-{####}" },
      { companyId: COMPANY, resource: ORDERS, template: "ЗМ-{YYYY}-{####}" },
      { companyId: OTHER, resource: ORDERS, template: "ЗМ-{YYYY}-{####}" },
    ])
    expect(new Set(seeds.counters.map((counter) => counter.resource))).toEqual(
      new Set([QUOTES, ORDERS]),
    )
  })
})

describe("модуль B3: моки", () => {
  beforeAll(() => {
    server.listen({ onUnhandledFrame: "error" })
  })
  beforeEach(() => {
    localStorage.clear()
    mocks.db.quotes.reset()
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

  it("список — шапки компанії запиту без рядків, із полем і статусом розширення", async () => {
    const { data, total } = await provider.getList<QuoteCard>(QUOTES, {
      filter: {},
      pagination: { page: 1, perPage: 50 },
      sort: { field: "date", order: "DESC" },
    })
    expect(total).toBe(10)
    expect(data.every((quote) => quote.companyId === COMPANY)).toBe(true)
    expect(data.every((quote) => !("lines" in quote))).toBe(true)
    // Кожна третя надіслана засіву — уже в переговорах (`mockEvery: 3`).
    expect(data.filter((quote) => quote.status === "negotiation")).toHaveLength(
      1,
    )
    expect(data.some((quote) => "channel" in quote)).toBe(true)
  })

  it("нова пропозиція — чернетка без номера, суми рахує сервер, а не форма", async () => {
    const { data } = await provider.create<QuoteCard>(QUOTES, {
      data: draft(),
    })
    const created = cardSchema.parse(data)
    expect(created).toMatchObject({
      number: null,
      status: "draft",
      docStatus: "draft",
      // Суми — цілі копійки (ADR-0056): 2 × 1 000 + ПДВ 20%.
      total: 240000,
    })
    expect(created.totals).toMatchObject({
      amount: 200000,
      net: 200000,
      tax: 40000,
      total: 240000,
    })
    expect(created.lines[0]).toMatchObject({ totals: { total: 240000 } })
  })

  it("номер, стан документа й статус із запиту на створення сервер не бере: нова — завжди чернетка", async () => {
    const { data } = await provider.create<QuoteCard>(QUOTES, {
      data: draft({
        number: "КП-2026-9999",
        docStatus: "submitted",
        status: "accepted",
      }),
    })
    expect(data).toMatchObject({
      number: null,
      docStatus: "draft",
      status: "draft",
    })
  })

  it("знижка документа понад 100% — 422 лише біля поля знижки", async () => {
    const error = await failureOf(
      provider.create(QUOTES, { data: draft({ discountPercent: 150 }) }),
    )
    expect(error.status).toBe(422)
    expect(Object.keys(error.fieldErrors ?? {})).toEqual(["discountPercent"])
  })

  it("строк раніше дати, порожній клієнт і хибна ціна рядка — 422 біля полів", async () => {
    const early = await failureOf(
      provider.create(QUOTES, {
        data: draft({ validUntil: addDays(TODAY, -1) }),
      }),
    )
    expect(early.status).toBe(422)
    expect(early.fieldErrors).toEqual({ validUntil: "before_date" })
    const broken = await failureOf(
      provider.create(QUOTES, {
        data: draft({ clientId: "", lines: [line({ price: "abc" })] }),
      }),
    )
    expect(broken.status).toBe(422)
    expect(broken.fieldErrors).toHaveProperty("clientId")
    expect(broken.fieldErrors).toHaveProperty(["lines.0.price"])
  })

  it("надіслати: номер серії компанії, далі зміна заборонена з причиною `submitted`", async () => {
    const quote = await one("qt-c1-01")
    const sent = await run(quote.id, "submit", { version: quote.version })
    expect(sent).toMatchObject({
      status: "sent",
      docStatus: "submitted",
      number: "КП-2026-0008",
      deniedActions: { update: "submitted" },
    })
    const update = await failureOf(
      provider.update(QUOTES, {
        id: quote.id,
        data: { validUntil: addDays(TODAY, 30), version: sent.version },
        previousData: sent,
      }),
    )
    expect(update.status).toBe(403)
  })

  it("відповідь клієнта: прийняв без причини, відхилив з причиною за бажанням", async () => {
    const sent = await one("qt-c1-03")
    expect(sent.status).toBe("sent")
    expect(
      await run(sent.id, "accept", { version: sent.version }),
    ).toMatchObject({ status: "accepted", docStatus: "submitted" })
    const other = await one("qt-c1-04")
    expect(
      await run(other.id, "decline", {
        version: other.version,
        reason: "Задорого",
      }),
    ).toMatchObject({ status: "declined" })
  })

  it("скасувати без причини — 422; виправити — нова чернетка з тим самим клієнтом, рядками й полем розширення", async () => {
    const accepted = await one("qt-c1-05")
    const noReason = await failureOf(
      run(accepted.id, "cancel", { version: accepted.version }),
    )
    expect(noReason.fieldErrors).toEqual({ reason: "required" })
    const cancelled = await run(accepted.id, "cancel", {
      version: accepted.version,
      reason: "Нові ціни",
    })
    expect(cancelled).toMatchObject({
      status: "cancelled",
      docStatus: "cancelled",
    })
    const copy = cardSchema.parse(
      await run(accepted.id, "amend", { version: cancelled.version }),
    )
    const today = todayIn()
    expect(copy).toMatchObject({
      number: null,
      status: "draft",
      docStatus: "draft",
      amendedFrom: accepted.id,
      clientId: accepted.clientId,
      date: today,
      validUntil: addDays(today, 14),
      total: accepted.total,
    })
    expect(copy.lines.map((item) => item.id)).toEqual(
      accepted.lines.map((item) => item.id),
    )
    expect((copy as Record<string, unknown>).channel).toBe(
      (accepted as Record<string, unknown>).channel,
    )
    expect(stored(accepted.id)?.amendedBy).toBe(copy.id)
  })

  it("дія розширення: «Почати переговори» з надісланої, з переговорів — відповідь клієнта", async () => {
    const sent = await one("qt-c1-03")
    const talks = await run(sent.id, "negotiate", { version: sent.version })
    expect(talks).toMatchObject({
      status: "negotiation",
      docStatus: "submitted",
    })
    expect(
      await run(sent.id, "accept", { version: talks.version }),
    ).toMatchObject({ status: "accepted" })
  })

  it("без права на дію — 403; невідома опція поля розширення — 422", async () => {
    signInMock(SELLER.id)
    const sent = await one("qt-c1-03")
    expect(
      (await failureOf(run(sent.id, "accept", { version: sent.version })))
        .status,
    ).toBe(403)
    const invalid = await failureOf(
      provider.create(QUOTES, { data: draft({ channel: "fax" }) }),
    )
    expect(invalid.status).toBe(422)
    expect(invalid.fieldErrors).toHaveProperty("channel")
  })

  it("сценарій `conflict`: колега продовжує строк на тиждень, повтор із новою версією проходить", async () => {
    setScenario("conflict", QUOTES)
    const sent = await one("qt-c1-03")
    const conflict = await failureOf(
      run(sent.id, "accept", { version: sent.version }),
    )
    expect(conflict.status).toBe(409)
    expect(conflict.current).toMatchObject({
      validUntil: addDays(sent.validUntil, 7),
    })
    const retried = await run(sent.id, "accept", {
      version: sent.version + 1,
    })
    expect(retried).toMatchObject({ status: "accepted" })
  })

  it("сценарії ресурсу: порожньо, помилка сервера, немає доступу, офлайн", async () => {
    const list = () =>
      provider.getList(QUOTES, {
        filter: {},
        pagination: { page: 1, perPage: 10 },
        sort: { field: "date", order: "DESC" },
      })
    setScenario("empty", QUOTES)
    expect((await list()).total).toBe(0)
    setScenario("error", QUOTES)
    expect((await failureOf(list())).status).toBe(500)
    setScenario("forbidden", QUOTES)
    expect((await failureOf(list())).status).toBe(403)
    setScenario("offline", QUOTES)
    expect((await failureOf(list())).code).toBe("offline")
  })

  describe("масові дії й видалення (ADR-0066)", () => {
    const startBulk = (action: string, ids: string[], reason?: string) =>
      provider.startBulk(
        QUOTES,
        action,
        { ids },
        reason === undefined ? undefined : { reason },
      )
    /** Мок доробляє записи з часом (lib/mock-jobs): чекаємо кінця задачі. */
    const finished = async (jobId: string): Promise<Job> => {
      let job = await provider.getJob(jobId)
      await vi.waitFor(
        async () => {
          job = await provider.getJob(jobId)
          expect(job.status).toBe("done")
        },
        { timeout: 3000, interval: 50 },
      )
      return job
    }
    /** Невдачі за причиною: код → назви записів у звіті. */
    const failedBy = (job: Job) =>
      Object.fromEntries(
        job.failures.map((group) => [
          group.code,
          group.items.map((item) => item.title),
        ]),
      )
    const numberOf = (id: string) => stored(id)?.number

    it("«Надіслати»: чернетки отримують різні номери, надіслана — невдача `transition_not_allowed` з номером", async () => {
      const sentNumber = numberOf("qt-c1-03")
      const { jobId } = await startBulk("submit", [
        "qt-c1-01",
        "qt-c1-02",
        "qt-c1-03",
      ])
      const job = await finished(jobId)
      expect(job).toMatchObject({ total: 3, succeeded: 2, failed: 1 })
      expect(failedBy(job)).toEqual({ transition_not_allowed: [sentNumber] })
      const sent = ["qt-c1-01", "qt-c1-02"].map((id) => stored(id))
      for (const quote of sent)
        expect(quote).toMatchObject({ status: "sent", docStatus: "submitted" })
      const numbers = sent.map((quote) => quote?.number)
      expect(
        numbers.every((number) => /^КП-2026-\d{4}$/.test(number ?? "")),
      ).toBe(true)
      expect(new Set(numbers).size).toBe(2)
    })

    it("«Скасувати» без причини не починається; з причиною — одна на всі, чернетка й скасована — невдачі", async () => {
      for (const reason of [undefined, "   "]) {
        const refused = await failureOf(
          startBulk("cancel", ["qt-c1-03"], reason),
        )
        expect(refused.status).toBe(422)
        expect(refused.fieldErrors).toEqual({ reason: "required" })
      }
      expect(stored("qt-c1-03")?.status).toBe("sent")
      const draftClient = stored("qt-c1-01")?.clientName
      const cancelledNumber = numberOf("qt-c1-07")
      const { jobId } = await startBulk(
        "cancel",
        ["qt-c1-03", "qt-c1-05", "qt-c1-01", "qt-c1-07"],
        "Клієнт закрив тендер",
      )
      const job = await finished(jobId)
      expect(job).toMatchObject({ succeeded: 2, failed: 2 })
      expect(failedBy(job)).toEqual({
        transition_not_allowed: [draftClient, cancelledNumber],
      })
      expect(stored("qt-c1-05")).toMatchObject({
        status: "cancelled",
        docStatus: "cancelled",
      })
    })

    it("без права на дію — 403 до запуску", async () => {
      signInMock(SELLER.id)
      expect(
        (await failureOf(startBulk("cancel", ["qt-c1-03"], "Причина"))).status,
      ).toBe(403)
      expect((await failureOf(startBulk("delete", ["qt-c1-01"]))).status).toBe(
        403,
      )
    })

    it("«Видалити»: лише чернетка; надіслана й скасована — невдачі з кодом стану документа", async () => {
      const sentNumber = numberOf("qt-c1-03")
      const cancelledNumber = numberOf("qt-c1-07")
      const { jobId } = await startBulk("delete", [
        "qt-c1-01",
        "qt-c1-03",
        "qt-c1-07",
      ])
      const job = await finished(jobId)
      expect(job).toMatchObject({ succeeded: 1, failed: 2 })
      expect(failedBy(job)).toEqual({
        submitted: [sentNumber],
        cancelled: [cancelledNumber],
      })
      expect(stored("qt-c1-01")).toBeUndefined()
      expect(stored("qt-c1-03")?.status).toBe("sent")
    })

    it("«Видалити чернетку» з картки: надіслану — 403; видалена виправлена копія звільняє скасовану", async () => {
      const refused = await failureOf(
        provider.delete(QUOTES, { id: "qt-c1-03" }),
      )
      expect(refused.status).toBe(403)
      const accepted = await one("qt-c1-05")
      const cancelled = await run(accepted.id, "cancel", {
        version: accepted.version,
        reason: "Нові ціни",
      })
      const copy = await run(accepted.id, "amend", {
        version: cancelled.version,
      })
      await provider.delete(QUOTES, { id: copy.id })
      expect(stored(copy.id)).toBeUndefined()
      const original = await one(accepted.id)
      expect(original.amendedBy ?? null).toBeNull()
      const again = await run(accepted.id, "amend", {
        version: original.version,
      })
      expect(again).toMatchObject({ status: "draft", amendedFrom: accepted.id })
    })
  })
})
