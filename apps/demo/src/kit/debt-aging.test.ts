import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook } from "@testing-library/react"
import { setupServer } from "msw/node"
import type { SortPayload } from "ra-core"
import { createElement, type ReactNode } from "react"
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
import { daysBetween } from "@/registry/lib/dates"
import { createNumberingMocks } from "@/registry/lib/mock-numbering"
import { resetScenarios, setScenario } from "@/registry/lib/mock-scenarios"
import {
  createPlatformHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"
import { createInvoicesModule } from "@/registry/modules/K2-invoices"
import {
  agingBucketIndex,
  agingBucketsOf,
  DEFAULT_AGING_BUCKETS,
  isAgingBuckets,
  parseAgingBuckets,
} from "@/registry/modules/K2-invoices/aging-buckets"
import {
  agingRowSchema,
  INVOICE_AGING,
  INVOICES,
  type AgingRow,
} from "@/registry/modules/K2-invoices/contract"
import { useFreshAging } from "@/registry/modules/K2-invoices/components/use-fresh-aging"
import {
  agingRowsOf,
  baseDebtOf,
  type AgingInvoice,
} from "@/registry/modules/K2-invoices/debt-aging"
import {
  createInvoicesMocks,
  invoicePaymentSeed,
  invoicesNumberingSeeds,
  type InvoiceMockRates,
} from "@/registry/modules/K2-invoices/mocks"
import {
  createPaymentsMocks,
  paymentsNumberingSeeds,
} from "@/registry/modules/K4-payments/mocks"

/**
 * Старіння боргу (ADR-0084, крок K2d): кошики днів після «Сплатити до», борг у базовій валюті за курсом
 * рахунку, рядки за клієнтом і валютою лише з боргом > 0, звіт моків з фільтрами, межами й правами,
 * сторінка й пункт меню лише з оплатами K4.
 */
describe("старіння боргу: кошики", () => {
  it("за замовчуванням: строк не настав, 1–30, 31–60, 61–90, понад 90 — межа входить у свій кошик", () => {
    const at = (days: number) => agingBucketIndex(days, DEFAULT_AGING_BUCKETS)
    expect([-3, 0, 1, 30, 31, 60, 61, 90, 91, 400].map(at)).toEqual([
      0, 0, 1, 1, 2, 2, 3, 3, 4, 4,
    ])
    expect(agingBucketsOf(DEFAULT_AGING_BUCKETS)).toEqual([
      { kind: "notDue" },
      { kind: "range", from: 1, to: 30 },
      { kind: "range", from: 31, to: 60 },
      { kind: "range", from: 61, to: 90 },
      { kind: "over", days: 90 },
    ])
  })

  it("межі: від однієї до п'яти цілих днів за зростанням, не більше 3650; параметр запиту через кому", () => {
    expect(isAgingBuckets([30, 60, 90])).toBe(true)
    expect(isAgingBuckets([1, 2, 3, 4, 3650])).toBe(true)
    for (const bad of [
      [],
      [30, 30],
      [60, 30],
      [0],
      [1.5],
      [3651],
      [1, 2, 3, 4, 5, 6],
    ])
      expect(isAgingBuckets(bad)).toBe(false)
    expect(parseAgingBuckets("15,30,60")).toEqual([15, 30, 60])
    for (const bad of ["", "30,abc", "15, 30", "1e1", "0x1e", "30,,60", "-5"])
      expect(parseAgingBuckets(bad)).toBeNull()
  })

  it("днів між календарними датами: через місяць, рік і перехід на літній час", () => {
    expect(daysBetween("2026-11-01", "2026-11-13")).toBe(12)
    expect(daysBetween("2026-11-13", "2026-11-01")).toBe(-12)
    expect(daysBetween("2025-12-31", "2026-01-01")).toBe(1)
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2)
  })
})

describe("старіння боргу: рядки звіту", () => {
  const TODAY = "2026-11-13"
  const invoice = (patch: Partial<AgingInvoice>): AgingInvoice => ({
    clientId: "client-1",
    clientName: "ТОВ «Альфа»",
    date: "2026-10-01",
    dueDate: "2026-10-06",
    currency: "UAH",
    debt: 10000,
    exchange: null,
    ...patch,
  })
  const rowsOf = (invoices: AgingInvoice[]) =>
    agingRowsOf(invoices, {
      today: TODAY,
      bounds: DEFAULT_AGING_BUCKETS,
      baseCurrency: "UAH",
    })

  it("борг у базовій валюті — за курсом рахунку, половина копійки від нуля; без курсу чи інша база — немає", () => {
    const usd = {
      currency: "USD",
      debt: 12345,
      exchange: {
        baseCurrency: "UAH",
        rate: 41.2534,
        rateDate: "2026-10-01",
        baseTotal: 0,
      },
    }
    expect(baseDebtOf(usd, "UAH")).toBe(509273)
    expect(
      baseDebtOf({ ...usd, exchange: { ...usd.exchange, rate: null } }, "UAH"),
    ).toBeNull()
    expect(baseDebtOf(usd, "EUR")).toBeNull()
    expect(
      baseDebtOf({ currency: "UAH", debt: 500, exchange: null }, "UAH"),
    ).toBe(500)
  })

  it("рядок на клієнта й валюту лише з боргом > 0; переплата іншого рахунку борг не зменшує", () => {
    const rows = rowsOf([
      invoice({ dueDate: "2026-11-20", debt: 100 }),
      invoice({ dueDate: "2026-11-01", debt: 200 }),
      invoice({ dueDate: "2026-09-01", debt: 400 }),
      invoice({ dueDate: "2026-08-01", debt: 800 }),
      invoice({ dueDate: "2026-06-01", debt: 1600 }),
      invoice({ debt: -5000 }),
      invoice({ debt: 0 }),
      invoice({ clientId: "client-2", clientName: "ФОП Бета", debt: 50 }),
    ])
    expect(rows.map((row) => row.id)).toEqual(["UAH:client-1", "UAH:client-2"])
    // Прострочка: −7, 12, 73, 104 і 165 днів.
    expect(rows[0]).toMatchObject({
      buckets: [100, 200, 0, 400, 2400],
      total: 3100,
      baseTotal: 3100,
    })
    for (const row of rows)
      expect(() => agingRowSchema.parse(row)).not.toThrow()
  })

  it("валюта — окремий рядок; без курсу хоч одного рахунку — без суми в базовій; назва з найновішого рахунку", () => {
    const rate = (value: number | null) => ({
      baseCurrency: "UAH",
      rate: value,
      rateDate: value === null ? null : "2026-10-01",
      baseTotal: null,
    })
    const rows = rowsOf([
      invoice({ currency: "EUR", debt: 10000, exchange: rate(48) }),
      invoice({
        currency: "EUR",
        debt: 5000,
        date: "2026-11-01",
        clientName: "ТОВ «Альфа-Нова»",
        exchange: rate(50),
      }),
      invoice({ currency: "USD", debt: 100, exchange: rate(41) }),
      invoice({ currency: "USD", debt: 100, exchange: rate(null) }),
    ])
    const byId = new Map(rows.map((row) => [row.id, row]))
    expect(byId.get("EUR:client-1")).toMatchObject({
      clientName: "ТОВ «Альфа-Нова»",
      total: 15000,
      baseTotal: 730000,
    })
    expect(byId.get("USD:client-1")).toMatchObject({
      total: 200,
      baseTotal: null,
    })
  })
})

const BASE = "http://erp-aging.test/api/v1"
const COMPANY = "c1"
const TODAY = "2026-11-08"

const person = (id: string, permissions: string[]): MockUser => ({
  id,
  name: id,
  email: `${id}@test.example`,
  password: "demo-password",
  totpCode: "111111",
  roles: [],
  permissions,
  companies: [{ id: COMPANY, name: "ТОВ «Тест»" }],
  companyId: COMPANY,
  factors: [],
})
const ACCOUNTANT = person("accountant", [
  "sales-invoices:*",
  "sales-credit-notes:*",
  "sales-payments:*",
  "sales-refunds:*",
])
const CASHIER = person("cashier", ["sales-payments:read"])

const rates: InvoiceMockRates = {
  baseCurrency: () => "UAH",
  rateOn: (_companyId, currency) =>
    currency === "EUR" ? { rate: 48, date: TODAY } : null,
}
const options = { companies: [COMPANY], today: TODAY, rates } as const
const invoiceSeeds = invoicesNumberingSeeds(options)
const paymentSeeds = paymentsNumberingSeeds({
  invoices: invoicePaymentSeed(options),
  companies: options.companies,
  today: TODAY,
  rates,
})
const numbering = createNumberingMocks({
  baseUrl: BASE,
  series: [...invoiceSeeds.series, ...paymentSeeds.series],
  counters: [...invoiceSeeds.counters, ...paymentSeeds.counters],
})
const invoices = createInvoicesMocks({
  ...options,
  baseUrl: BASE,
  numbering,
  payments: {
    paidTotal: (invoiceId) => payments.paidTotal(invoiceId),
    refundedTotal: (invoiceId) => payments.refundedTotal(invoiceId),
  },
})
const payments = createPaymentsMocks({
  invoices: invoices.forPayments,
  baseUrl: BASE,
  numbering,
  rates,
  today: TODAY,
})
const server = setupServer(
  ...createPlatformHandlers({ users: [ACCOUNTANT, CASHIER], baseUrl: BASE }),
  ...numbering.handlers,
  ...invoices.handlers,
  ...payments.handlers,
)
const provider = createDataProvider(
  createApiClient({ baseUrl: BASE, getLanguage: () => "uk" }),
)

const aging = (
  filter: Record<string, string> = {},
  sort: SortPayload = { field: "baseTotal", order: "DESC" },
) =>
  provider
    .getList<AgingRow>(INVOICE_AGING, {
      pagination: { page: 1, perPage: 50 },
      sort,
      filter: { buckets: "30,60,90", ...filter },
    })
    .then(({ data, total }) => ({
      rows: data.map((row) => agingRowSchema.parse(row)),
      total,
    }))
const failureOf = async (promise: Promise<unknown>) => {
  const error: unknown = await promise.catch((caught: unknown) => caught)
  if (!isApiError(error)) throw new Error("expected ApiError")
  return error
}

describe("старіння боргу: моки", () => {
  beforeAll(() => {
    server.listen({ onUnhandledFrame: "error" })
  })
  beforeEach(() => {
    localStorage.clear()
    invoices.db.reset()
    invoices.creditNotesDb.reset()
    payments.db.reset()
    payments.refundsDb.reset()
    setCompanyId(COMPANY)
    signInMock(ACCOUNTANT.id)
  })
  afterEach(() => {
    resetScenarios()
  })
  afterAll(() => {
    server.close()
  })

  it("засів: виставлені рахунки з боргом за клієнтом і валютою, від більшого боргу в базовій валюті", async () => {
    const { rows, total } = await aging()
    expect(total).toBe(5)
    expect(
      rows.map(({ id, buckets, total: debt, baseTotal }) => ({
        id,
        buckets,
        debt,
        baseTotal,
      })),
    ).toEqual([
      // Найстаріший рахунок клієнта: «Сплатити до» минула 40 днів тому.
      {
        id: "UAH:client-2",
        buckets: [0, 0, 4843380, 0, 0],
        debt: 4843380,
        baseTotal: 4843380,
      },
      {
        id: "UAH:client-3",
        buckets: [2844000, 0, 0, 0, 0],
        debt: 2844000,
        baseTotal: 2844000,
      },
      // Частина рахунку в євро оплачена: борг × курс рахунку 48.
      {
        id: "EUR:client-4",
        buckets: [11467, 0, 0, 0, 0],
        debt: 11467,
        baseTotal: 550416,
      },
      // Рахунок із кредит-нотою, оплачений наполовину.
      {
        id: "UAH:client-1",
        buckets: [314441, 0, 0, 0, 0],
        debt: 314441,
        baseTotal: 314441,
      },
      // Прострочений на 7 днів, оплачений наполовину; переплачений рахунок того самого клієнта — не в звіті.
      {
        id: "UAH:client-4",
        buckets: [0, 219000, 0, 0, 0],
        debt: 219000,
        baseTotal: 219000,
      },
    ])
  })

  it("фільтри «Клієнт», «Валюта», пошук і сортування за назвою", async () => {
    expect(
      (await aging({ currency: "EUR" })).rows.map((row) => row.id),
    ).toEqual(["EUR:client-4"])
    expect(
      (await aging({ clientId: "client-4" })).rows.map((row) => row.id),
    ).toEqual(["EUR:client-4", "UAH:client-4"])
    expect((await aging({ q: "сонячний" })).rows.map((row) => row.id)).toEqual([
      "UAH:client-3",
    ])
    const byName = await aging({}, { field: "clientName", order: "ASC" })
    expect(byName.rows.map((row) => row.clientName)).toEqual([
      "ПП «Будмайстер»",
      "ПП «Будмайстер»",
      "ТОВ «Зелена долина»",
      "ТОВ «Сонячний берег»",
      "ФОП Ткаченко Олег Васильович",
    ])
  })

  it("свої межі: кошиків на один більше за межі й «Строк не настав»; хибні межі — 422", async () => {
    const { rows } = await aging({ buckets: "15,30" })
    expect(rows.find((row) => row.id === "UAH:client-2")?.buckets).toEqual([
      0, 0, 0, 4843380,
    ])
    expect(rows.find((row) => row.id === "UAH:client-4")?.buckets).toEqual([
      0, 219000, 0, 0,
    ])
    const error = await failureOf(aging({ buckets: "60,30" }))
    expect(error.status).toBe(422)
    expect(error.fieldErrors).toEqual({ buckets: "invalid" })
  })

  it("без права читати рахунки — 403; сценарії ресурсу рахунків діють і на звіт", async () => {
    signInMock(CASHIER.id)
    expect((await failureOf(aging())).status).toBe(403)
    signInMock(ACCOUNTANT.id)
    setScenario("empty", INVOICES)
    expect(await aging()).toEqual({ rows: [], total: 0 })
    setScenario("error", INVOICES)
    expect((await failureOf(aging())).status).toBe(500)
  })
})

describe("старіння боргу: фабрика модуля", () => {
  const payments = { resource: "sales-payments", register: () => "/pay" }

  it("сторінка й пункт «Борги клієнтів» — лише з оплатами K4 і опцією aging, право читати рахунки", () => {
    const module = createInvoicesModule({
      basePath: "/finance",
      payments,
      aging: {},
    })
    expect(module.paths.debts).toBe("/finance/client-debts")
    expect(module.routes.map((route) => route.path)).toContain(
      "/finance/client-debts",
    )
    expect(module.nav.at(-1)).toMatchObject({
      id: "K2-debts",
      label: { uk: "Борги клієнтів", en: "Client debts" },
      access: { resource: INVOICES, action: "read" },
    })
    for (const without of [
      createInvoicesModule({ basePath: "/finance", aging: {} }),
      createInvoicesModule({ basePath: "/finance", payments }),
    ]) {
      expect(without.routes.map((route) => route.path)).not.toContain(
        "/finance/client-debts",
      )
      expect(without.nav.map((item) => item.id)).not.toContain("K2-debts")
    }
  })

  it("хибні межі кошиків — помилка під час старту", () => {
    expect(() =>
      createInvoicesModule({ payments, aging: { buckets: [60, 30] } }),
    ).toThrow(/aging\.buckets/)
    expect(() =>
      createInvoicesModule({ payments, aging: { buckets: [15, 45] } }),
    ).not.toThrow()
  })
})

describe("старіння боргу: свіжий звіт", () => {
  it("відкриття сторінки робить кеш звіту застарілим, кеш списку рахунків не чіпає", () => {
    const queryClient = new QueryClient()
    const aging = [
      INVOICE_AGING,
      "getList",
      { filter: { buckets: "30,60,90" } },
    ]
    const invoices = [INVOICES, "getList", {}]
    queryClient.setQueryData(aging, { data: [], total: 0 })
    queryClient.setQueryData(invoices, { data: [], total: 0 })
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children)
    renderHook(
      () => {
        useFreshAging()
      },
      { wrapper },
    )
    expect(queryClient.getQueryState(aging)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(invoices)?.isInvalidated).toBe(false)
  })
})
