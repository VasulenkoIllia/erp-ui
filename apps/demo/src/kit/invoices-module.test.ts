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
import { addDays } from "@/registry/lib/dates"
import type { DocumentBodyLine } from "@/registry/lib/document-lines"
import { createDocumentFlowHandlers } from "@/registry/lib/mock-document-flow"
import { createJobHandlers } from "@/registry/lib/mock-jobs"
import { createNumberingMocks } from "@/registry/lib/mock-numbering"
import { createPeriodLockMocks } from "@/registry/lib/mock-period-lock"
import { resetScenarios } from "@/registry/lib/mock-scenarios"
import {
  createPlatformHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"
import type { ExtensionField } from "@/registry/lib/extension-fields"
import {
  CREATE_INVOICE,
  orderCardSchemaFor,
  ORDERS,
  type OrderCard,
} from "@/registry/modules/B3-sales/contract"
import {
  createSalesMocks,
  salesNumberingSeeds,
} from "@/registry/modules/B3-sales/mocks"
import { createInvoicesModule } from "@/registry/modules/K2-invoices"
import {
  CREDIT_NOTES,
  INVOICE_DUE_DAYS,
  invoiceCardSchemaFor,
  INVOICES,
  type InvoiceCard,
} from "@/registry/modules/K2-invoices/contract"
import { createInvoiceFixtures } from "@/registry/modules/K2-invoices/fixtures"
import {
  createInvoicesMocks,
  invoicesNumberingSeeds,
  type InvoiceMockRates,
} from "@/registry/modules/K2-invoices/mocks"

/**
 * Модуль K2 «Рахунки клієнтам» (ADR-0070, крок K2a): фабрика, фікстури, моки — створення, виставлення з
 * номером, сторно з мінусом, закритий період (PF13), рахунок із замовлення B3 з полями розширення, один
 * рахунок на замовлення й звільнення після видалення чернетки, потік документів; рахунок у валюті з сумою
 * в базовій (ADR-0071, крок K2b).
 */
const BASE = "http://erp-invoices.test/api/v1"
const COMPANY = "c1"
const OTHER = "c2"
const TODAY = "2026-11-08"
const LOCKED_THROUGH = "2026-10-20"
/** Засів: виставлений свіжий, давній у закритому періоді; підтверджене замовлення B3. */
const ISSUED = "inv-c1-03"
const ISSUED_CLOSED = "inv-c1-10"
const CONFIRMED_ORDER = "so-c1-02"

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
const ACCOUNTANT = person("accountant", [
  "quotes:*",
  "orders:*",
  "sales-invoices:*",
])
/** Бачить рахунки, але не створює: «Виставити рахунок» на замовленні — 403. */
const VIEWER = person("viewer", ["orders:*", "sales-invoices:read"])

/** Те саме поле в замовленні й рахунку: значення переходить у рахунок (ADR-0070). */
const channel: ExtensionField = {
  id: "channel",
  type: "options",
  label: { uk: "Канал", en: "Channel" },
  options: [{ value: "website", label: { uk: "Сайт", en: "Website" } }],
  mockValues: ["website"],
}

/** Поле рядка рахунку (ADR-0086): засів із `mockValues`, значення зберігається в рядку. */
const hsCode: ExtensionField = {
  id: "hsCode",
  type: "text",
  label: { uk: "Код УКТЗЕД", en: "HS code" },
  mockValues: ["8471 30 00 00"],
}

/** Таблиця курсів тестів (ADR-0071): `<валюта>:<дата>` → гривень за одиницю; злотих немає. */
const RATE_SEEDS: readonly (readonly [string, number])[] = [
  ["USD:2026-11-07", 41.25],
  ["USD:2026-11-08", 41.5],
  ["EUR:2026-11-08", 48],
]
const rateTable = new Map(RATE_SEEDS)
const rates: InvoiceMockRates = {
  baseCurrency: () => "UAH",
  rateOn: (_companyId, currency, date) => {
    const found = [...rateTable]
      .map(([key, rate]) => ({ key, rate, date: key.slice(4) }))
      .filter((row) => row.key.startsWith(`${currency}:`) && row.date <= date)
      .sort((a, b) => a.date.localeCompare(b.date))
      .at(-1)
    return found ? { rate: found.rate, date: found.date } : null
  },
}

const options = { companies: [COMPANY, OTHER], today: TODAY, rates } as const
const salesSeeds = salesNumberingSeeds(options)
const invoiceSeeds = invoicesNumberingSeeds(options)
const numbering = createNumberingMocks({
  baseUrl: BASE,
  series: [...salesSeeds.series, ...invoiceSeeds.series],
  counters: [...salesSeeds.counters, ...invoiceSeeds.counters],
})
// Друга компанія закрита по сьогодні: новий документ сервера — першим відкритим днем, завтра.
const periodLock = createPeriodLockMocks({
  baseUrl: BASE,
  seeds: [
    { companyId: COMPANY, lockedThrough: LOCKED_THROUGH },
    { companyId: OTHER, lockedThrough: TODAY },
  ],
})
const invoices = createInvoicesMocks({
  ...options,
  baseUrl: BASE,
  numbering,
  periodLock,
  extension: { invoices: { fields: [channel], lineFields: [hsCode] } },
  releaseOrder: (removed) => {
    sales.releaseOrderInvoice(removed)
  },
})
const sales = createSalesMocks({
  ...options,
  baseUrl: BASE,
  numbering,
  extension: { orders: { fields: [channel] } },
  invoices: { create: invoices.fromOrder, hasActive: invoices.hasActive },
})
const server = setupServer(
  ...createPlatformHandlers({ users: [ACCOUNTANT, VIEWER], baseUrl: BASE }),
  ...numbering.handlers,
  ...periodLock.handlers,
  ...createJobHandlers({ baseUrl: BASE }),
  ...createDocumentFlowHandlers({
    sources: [...sales.flowSources, ...invoices.flowSources],
    baseUrl: BASE,
  }),
  ...sales.handlers,
  ...invoices.handlers,
)
const provider = createDataProvider(
  createApiClient({ baseUrl: BASE, getLanguage: () => "uk" }),
)

const cardSchema = invoiceCardSchemaFor({
  fields: [channel],
  lineFields: [hsCode],
})
const orderSchema = orderCardSchemaFor({ fields: [channel] })
type Denied = { deniedActions?: Readonly<Record<string, string>> }
const invoice = (id: string) =>
  provider.getOne<InvoiceCard & Denied>(INVOICES, { id }).then(({ data }) => ({
    ...cardSchema.parse(data),
    deniedActions: data.deniedActions,
  }))
const order = (id: string) =>
  provider.getOne<OrderCard & Denied>(ORDERS, { id }).then(({ data }) => ({
    ...orderSchema.parse(data),
    deniedActions: data.deniedActions,
  }))
const run = (resource: string, id: string, action: string, body: object) =>
  provider.runTransition(resource, id, action, body as never)
const failureOf = async (promise: Promise<unknown>) => {
  const error: unknown = await promise.catch((caught: unknown) => caught)
  if (!isApiError(error)) throw new Error("expected ApiError")
  return error
}
const invoiceFromOrder = async (id: string) => {
  const source = await order(id)
  return cardSchema.parse(
    await run(ORDERS, id, CREATE_INVOICE, { version: source.version }),
  )
}
const namesOf = (lines: readonly DocumentBodyLine[]) =>
  lines.map((line) => ("name" in line ? line.name : line.kind))

const line: DocumentBodyLine = {
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
}
const draft = (overrides: Record<string, unknown> = {}) => ({
  clientId: "client-1",
  clientName: "ТОВ «Зелена долина»",
  date: TODAY,
  dueDate: addDays(TODAY, INVOICE_DUE_DAYS),
  currency: "UAH",
  discountPercent: 0,
  discountAmount: 0,
  supplier: { kind: "legal", name: "ТОВ «Тест»", code: "41726300" },
  buyer: { kind: "legal", name: "ТОВ «Зелена долина»" },
  lines: [line],
  ...overrides,
})

describe("модуль K2: фабрика", () => {
  it("адреси від basePath, сторінки списку, форми, картки й друку рахунків і кредит-нот, пункти навігації з правом читання", () => {
    const module = createInvoicesModule({ basePath: "/finance/" })
    expect(module.paths.invoice("i1")).toBe("/finance/invoices/i1")
    expect(module.paths.printInvoice("i1")).toBe("/finance/invoices/i1/print")
    expect(module.routes.map((route) => route.path)).toEqual([
      "/finance/invoices",
      "/finance/invoices/new",
      "/finance/invoices/:id",
      "/finance/invoices/:id/edit",
      "/finance/invoices/:id/print",
      "/finance/credit-notes",
      "/finance/credit-notes/:id",
      "/finance/credit-notes/:id/edit",
      "/finance/credit-notes/:id/print",
      "/finance/",
    ])
    expect(module.nav.map(({ id, access }) => ({ id, access }))).toEqual([
      { id: "K2-invoices", access: { resource: INVOICES, action: "read" } },
      {
        id: "K2-credit-notes",
        access: { resource: CREDIT_NOTES, action: "read" },
      },
    ])
  })
})

describe("модуль K2: фікстури", () => {
  const { invoices: seeded, counters } = createInvoiceFixtures(options)
  const company = seeded.filter((item) => item.companyId === COMPANY)

  it("усі статуси за контрактом; номери серії зростають із датою, чернетки без номера", () => {
    expect(new Set(company.map((item) => item.status))).toEqual(
      new Set(["draft", "issued", "cancelled", "reversed", "reversal"]),
    )
    for (const item of seeded)
      expect(() => cardSchema.parse(item)).not.toThrow()
    const numbered = company
      .filter((item) => item.number !== null)
      .sort((a, b) => a.date.localeCompare(b.date))
    expect(numbered.map((item) => item.number)).toEqual(
      numbered.map(
        (_, index) => `РХ-2026-${String(index + 1).padStart(4, "0")}`,
      ),
    )
    expect(counters).toContainEqual({
      resource: INVOICES,
      companyId: COMPANY,
      year: 2026,
      value: numbered.length,
    })
  })

  it("рахунки у валюті: долар і євро з курсом на дату, злоті без курсу, гривневі — без блоку курсу", () => {
    const byId = (id: string) => company.find((item) => item.id === id)
    expect(byId("inv-c1-11")).toMatchObject({
      currency: "USD",
      exchange: { baseCurrency: "UAH", rate: 41.25, rateDate: "2026-11-07" },
    })
    const eur = byId("inv-c1-12")
    expect(eur).toMatchObject({ status: "issued", currency: "EUR" })
    expect(eur?.exchange?.baseTotal).toBe((eur?.total ?? 0) * 48)
    expect(byId("inv-c1-13")?.exchange).toEqual({
      baseCurrency: "UAH",
      rate: null,
      rateDate: null,
      baseTotal: null,
    })
    for (const item of company.filter((row) => row.currency === "UAH"))
      expect(item.exchange).toBeNull()
  })

  it("сторно — ті самі рядки й підсумки з мінусом у шапці; пари сторно й виправленої копії зв'язані", () => {
    const reversed = company.find((item) => item.status === "reversed")
    const reversal = company.find((item) => item.status === "reversal")
    expect(reversed?.reversedBy).toBe(reversal?.id)
    expect(reversal?.reversalOf).toBe(reversed?.id)
    expect(reversal?.total).toBe(-(reversed?.total ?? 0))
    expect(reversal?.totals).toEqual(reversed?.totals)
    const cancelled = company.find((item) => item.status === "cancelled")
    expect(cancelled?.amendedBy).toBeDefined()
    expect(
      company.find((item) => item.id === cancelled?.amendedBy)?.amendedFrom,
    ).toBe(cancelled?.id)
  })
})

describe("модуль K2: моки рахунків", () => {
  beforeAll(() => {
    server.listen({ onUnhandledFrame: "error" })
  })
  beforeEach(() => {
    localStorage.clear()
    rateTable.clear()
    for (const [key, rate] of RATE_SEEDS) rateTable.set(key, rate)
    invoices.db.reset()
    sales.db.orders.reset()
    sales.db.quotes.reset()
    setCompanyId(COMPANY)
    signInMock(ACCOUNTANT.id)
  })
  afterEach(() => {
    resetScenarios()
    server.resetHandlers()
  })
  afterAll(() => {
    server.close()
    setCompanyId(null)
  })

  it("створення — чернетка без номера, суми рахує сервер, сторони зберігаються цілими", async () => {
    const { data } = await provider.create<InvoiceCard>(INVOICES, {
      data: draft({ number: "РХ-2026-9999", status: "issued", total: 1 }),
    })
    const created = cardSchema.parse(data)
    expect(created).toMatchObject({
      number: null,
      status: "draft",
      docStatus: "draft",
      // 2 × 1 000 грн + ПДВ 20%, у копійках.
      total: 240_000,
      supplier: { name: "ТОВ «Тест»", code: "41726300", iban: "" },
    })
  })

  it("рахунок у валюті: курс чернетки — свіжий на кожен запис, «Виставити» закріплює курс і суму", async () => {
    const { data } = await provider.create<InvoiceCard>(INVOICES, {
      data: draft({ currency: "USD" }),
    })
    const created = cardSchema.parse(data)
    // 2 × 1 000 $ + ПДВ 20% = 2 400 $ × 41,5.
    expect(created.exchange).toEqual({
      baseCurrency: "UAH",
      rate: 41.5,
      rateDate: TODAY,
      baseTotal: 9_960_000,
    })
    const { data: moved } = await provider.update<InvoiceCard>(INVOICES, {
      id: created.id,
      data: { date: "2026-11-07", version: created.version },
      previousData: created,
    })
    const draftAgain = cardSchema.parse(moved)
    expect(draftAgain.exchange).toMatchObject({
      rate: 41.25,
      rateDate: "2026-11-07",
      baseTotal: 9_900_000,
    })
    // Курс виправили до виставлення — «Виставити» бере свіжий і закріплює.
    rateTable.set("USD:2026-11-07", 42)
    const issued = cardSchema.parse(
      await run(INVOICES, created.id, "submit", {
        version: draftAgain.version,
      }),
    )
    expect(issued.exchange).toMatchObject({ rate: 42, baseTotal: 10_080_000 })
    rateTable.set("USD:2026-11-07", 43)
    const reversal = cardSchema.parse(
      await run(INVOICES, created.id, "reverse", {
        version: issued.version,
        reason: "Помилка в ціні",
      }),
    )
    expect((await invoice(created.id)).exchange).toMatchObject({ rate: 42 })
    // Сторно — за курсом першого рахунку, сума в базовій з мінусом.
    expect(reversal.exchange).toEqual({
      baseCurrency: "UAH",
      rate: 42,
      rateDate: "2026-11-07",
      baseTotal: -10_080_000,
    })
  })

  it("гривня — без блоку курсу, його з запиту не беруть; валюта без курсу — порожні курс і сума, виставити можна", async () => {
    const { data } = await provider.create<InvoiceCard>(INVOICES, {
      data: draft({
        exchange: {
          baseCurrency: "UAH",
          rate: 1,
          rateDate: TODAY,
          baseTotal: 1,
        },
      }),
    })
    expect(cardSchema.parse(data).exchange).toBeNull()
    const { data: zloty } = await provider.create<InvoiceCard>(INVOICES, {
      data: draft({ currency: "PLN" }),
    })
    const pln = cardSchema.parse(zloty)
    const issued = cardSchema.parse(
      await run(INVOICES, pln.id, "submit", { version: pln.version }),
    )
    expect(issued.number).toMatch(/^РХ-2026-\d{4}$/)
    expect(issued.exchange).toEqual({
      baseCurrency: "UAH",
      rate: null,
      rateDate: null,
      baseTotal: null,
    })
  })

  it("«Сплатити до» раніше дати — 422 `before_date`; дата в закритому періоді — 422 `period_locked`", async () => {
    const early = await failureOf(
      provider.create(INVOICES, {
        data: draft({ dueDate: addDays(TODAY, -1) }),
      }),
    )
    expect(early.fieldErrors).toEqual({ dueDate: "before_date" })
    const closed = await failureOf(
      provider.create(INVOICES, { data: draft({ date: LOCKED_THROUGH }) }),
    )
    expect(closed.fieldErrors).toMatchObject({ date: "period_locked" })
  })

  it("«Виставити» — номер серії; виставлений не змінюють і не видаляють", async () => {
    const seen = await invoice("inv-c1-01")
    const issued = cardSchema.parse(
      await run(INVOICES, seen.id, "submit", { version: seen.version }),
    )
    expect(issued).toMatchObject({ status: "issued", docStatus: "submitted" })
    expect(issued.number).toMatch(/^РХ-2026-\d{4}$/)
    expect((await invoice(seen.id)).deniedActions).toMatchObject({
      update: "submitted",
      delete: "submitted",
    })
  })

  it("«Сторнувати» — проведений рахунок «Сторно» з номером, датою сьогодні й сумою з мінусом; перший — «Сторновано»", async () => {
    const seen = await invoice(ISSUED)
    const reversal = cardSchema.parse(
      await run(INVOICES, ISSUED, "reverse", {
        version: seen.version,
        reason: "Помилка в ціні",
      }),
    )
    expect(reversal).toMatchObject({
      status: "reversal",
      docStatus: "submitted",
      reversalOf: ISSUED,
      date: TODAY,
      total: -seen.total,
      totals: seen.totals,
      clientId: seen.clientId,
      supplier: seen.supplier,
    })
    // Замовлення лишається за першим рахунком.
    expect(reversal.orderId ?? null).toBeNull()
    expect(reversal.number).toMatch(/^РХ-2026-\d{4}$/)
    const original = await invoice(ISSUED)
    expect(original).toMatchObject({
      status: "reversed",
      reversedBy: reversal.id,
      deniedActions: { cancel: "reversed", reverse: "reversed" },
    })
    // Сторно дій не має.
    const again = await failureOf(
      run(INVOICES, reversal.id, "reverse", {
        version: reversal.version,
        reason: "Ще раз",
      }),
    )
    expect(again.status).toBe(422)
  })

  it("закритий період: дії, крім сторно, — `period_locked`; сторно давнього рахунку — дата сьогодні", async () => {
    const closed = await invoice(ISSUED_CLOSED)
    expect(closed.deniedActions).toMatchObject({
      cancel: "period_locked",
      amend: "period_locked",
      update: "submitted",
    })
    expect(closed.deniedActions?.reverse).toBeUndefined()
    const refused = await failureOf(
      run(INVOICES, ISSUED_CLOSED, "cancel", {
        version: closed.version,
        reason: "Клієнт відмовився",
      }),
    )
    expect(refused.status).toBe(403)
    const reversal = cardSchema.parse(
      await run(INVOICES, ISSUED_CLOSED, "reverse", {
        version: closed.version,
        reason: "Повернення",
      }),
    )
    expect(reversal.date).toBe(TODAY)
  })

  it("компанія закрита по сьогодні: сторно — першим відкритим днем", async () => {
    setCompanyId(OTHER)
    const seen = await invoice("inv-c2-03")
    const reversal = cardSchema.parse(
      await run(INVOICES, seen.id, "reverse", {
        version: seen.version,
        reason: "Повернення",
      }),
    )
    expect(reversal.date).toBe(addDays(TODAY, 1))
  })

  it("поле рядка розширення: засів із `mockValues`, створений рахунок зберігає значення, не той тип — 422", async () => {
    const codesOf = (lines: readonly DocumentBodyLine[]) =>
      lines.flatMap((one) =>
        one.kind === "item" ? [Reflect.get(one, "hsCode") as unknown] : [],
      )
    expect(codesOf((await invoice(ISSUED)).lines)).toContain("8471 30 00 00")
    const { data } = await provider.create<InvoiceCard>(INVOICES, {
      data: draft({ lines: [{ ...line, hsCode: "8443 32 10 00" }] }),
    })
    const created = cardSchema.parse(data)
    expect(codesOf(created.lines)).toEqual(["8443 32 10 00"])
    expect(codesOf((await invoice(created.id)).lines)).toEqual([
      "8443 32 10 00",
    ])
    const failure = await failureOf(
      provider.create(INVOICES, {
        data: draft({ lines: [{ ...line, hsCode: 8443 }] }),
      }),
    )
    expect(failure.status).toBe(422)
  })

  it("рахунок із замовлення: чернетка з клієнтом, рядками, сумою й полем розширення, датою сьогодні й сторонами", async () => {
    const source = await order(CONFIRMED_ORDER)
    expect(source).toMatchObject({ channel: "website" })
    const created = await invoiceFromOrder(CONFIRMED_ORDER)
    expect(created).toMatchObject({
      status: "draft",
      docStatus: "draft",
      number: null,
      orderId: CONFIRMED_ORDER,
      clientId: source.clientId,
      clientName: source.clientName,
      currency: source.currency,
      total: source.total,
      date: TODAY,
      dueDate: addDays(TODAY, INVOICE_DUE_DAYS),
      channel: "website",
      supplier: { name: "ТОВ «Кавовий двір»", code: "41726300" },
      buyer: { name: source.clientName },
    })
    expect(namesOf(created.lines)).toEqual(namesOf(source.lines))
    expect(await order(CONFIRMED_ORDER)).toMatchObject({
      invoiceId: created.id,
      deniedActions: { [CREATE_INVOICE]: "linked", cancel: "linked" },
    })
    expect(invoices.hasActive(CONFIRMED_ORDER)).toBe(true)
  })

  it("один рахунок на замовлення: повтор — 403 `linked`; видалена чернетка звільняє замовлення", async () => {
    const created = await invoiceFromOrder(CONFIRMED_ORDER)
    const seen = await order(CONFIRMED_ORDER)
    const refused = await failureOf(
      run(ORDERS, CONFIRMED_ORDER, CREATE_INVOICE, { version: seen.version }),
    )
    expect(refused.status).toBe(403)
    await provider.delete(INVOICES, { id: created.id })
    const released = await order(CONFIRMED_ORDER)
    expect(released.invoiceId).toBeNull()
    expect(released.deniedActions?.[CREATE_INVOICE]).toBeUndefined()
    expect(released.deniedActions?.cancel).toBeUndefined()
  })

  it("без права створювати рахунки — 403, рахунку немає", async () => {
    signInMock(VIEWER.id)
    const count = invoices.db.all().length
    const seen = await order(CONFIRMED_ORDER)
    const refused = await failureOf(
      run(ORDERS, CONFIRMED_ORDER, CREATE_INVOICE, { version: seen.version }),
    )
    expect(refused.status).toBe(403)
    expect(invoices.db.all()).toHaveLength(count)
  })

  it("потік: замовлення, потім рахунок «на підставі»", async () => {
    const created = await invoiceFromOrder(CONFIRMED_ORDER)
    const flow = await provider.getDocumentFlow(INVOICES, created.id)
    expect(
      flow.documents.map(({ resource, id }) => ({ resource, id })),
    ).toEqual([
      { resource: ORDERS, id: CONFIRMED_ORDER },
      { resource: INVOICES, id: created.id },
    ])
    expect(flow.documents[1]?.links).toEqual([
      { kind: "basedOn", resource: ORDERS, id: CONFIRMED_ORDER },
    ])
  })
})
