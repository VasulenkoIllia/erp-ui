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

import { createApiClient, isApiError } from "@/registry/lib/api"
import { setCompanyId } from "@/registry/lib/company-scope"
import { createDataProvider } from "@/registry/lib/data-provider"
import { addDays, todayIn } from "@/registry/lib/dates"
import type { DocumentBodyLine } from "@/registry/lib/document-lines"
import { createNumberingMocks } from "@/registry/lib/mock-numbering"
import { resetScenarios, setScenario } from "@/registry/lib/mock-scenarios"
import {
  createPlatformHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"
import { createSalesModule, SALES_MODULE_ID } from "@/registry/modules/B3-sales"
import {
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

/** Модуль B3, частина «Пропозиції» (ADR-0065): фабрика, фікстури, контракт, дії графа й сценарії. */
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
  it("адреси від basePath, сторінки списку, форми, картки й друку, пункт навігації з правом", () => {
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
      "/sales/",
    ])
    expect(module.nav).toEqual([
      expect.objectContaining({
        id: "B3-quotes",
        href: "/sales/quotes",
        access: { resource: QUOTES, action: "read" },
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
    expect(module.routes).toHaveLength(5)
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

  it("засів серії: шаблон у кожній компанії й лічильники фікстур", () => {
    expect(seeds.series).toEqual([
      { companyId: COMPANY, resource: QUOTES, template: "КП-{YYYY}-{####}" },
      { companyId: OTHER, resource: QUOTES, template: "КП-{YYYY}-{####}" },
    ])
    expect(seeds.counters.every((counter) => counter.resource === QUOTES)).toBe(
      true,
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
})
