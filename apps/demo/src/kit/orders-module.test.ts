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
import {
  ORDER_STATUSES,
  orderCardSchemaFor,
  ORDERS,
  QUOTES,
  type OrderCard,
} from "@/registry/modules/B3-sales/contract"
import { createSalesFixtures } from "@/registry/modules/B3-sales/fixtures"
import {
  createSalesMocks,
  salesNumberingSeeds,
} from "@/registry/modules/B3-sales/mocks"

/**
 * Модуль B3, частина «Замовлення» (ADR-0067): фікстури, контракт, граф «Підтвердити» → «Позначити
 * виконаним» → «Скасувати» → «Виправити», своя серія номерів, масові дії й видалення чернетки.
 */
const BASE = "http://erp-orders.test/api/v1"
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
const MANAGER = person("manager", ["orders:*", "quotes:*"])
const SELLER = person("seller", [
  "orders:read",
  "orders:create",
  "orders:update",
  "orders:submit",
  "orders:complete",
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
  ...createPlatformHandlers({ users: [MANAGER, SELLER], baseUrl: BASE }),
  ...numbering.handlers,
  ...createJobHandlers({ baseUrl: BASE }),
  ...mocks.handlers,
)
const provider = createDataProvider(
  createApiClient({ baseUrl: BASE, getLanguage: () => "uk" }),
)

const cardSchema = orderCardSchemaFor()
const one = (id: string) =>
  provider
    .getOne<OrderCard>(ORDERS, { id })
    .then(({ data }) => cardSchema.parse(data))
const run = (id: string, action: string, body: object, resource = ORDERS) =>
  provider.runTransition(resource, id, action, body as never) as Promise<
    OrderCard & { amendedFrom?: string }
  >
const failureOf = async (promise: Promise<unknown>) => {
  const error: unknown = await promise.catch((caught: unknown) => caught)
  if (!isApiError(error)) throw new Error("expected ApiError")
  return error
}
const stored = (id: string) =>
  mocks.db.orders.all().find((order) => order.id === id)

const line = (): DocumentBodyLine => ({
  kind: "item",
  id: "new-l1",
  name: "Кавоварка ріжкова",
  itemId: null,
  quantity: "1",
  unit: { id: null, name: "шт." },
  price: "18500",
  discountPercent: 0,
  discountAmount: 0,
  tax: { id: "vat-20", name: "ПДВ 20%", rate: 20, included: false },
})

const draft = (overrides: Record<string, unknown> = {}) => ({
  clientId: "client-1",
  clientName: "ТОВ «Зелена долина»",
  date: TODAY,
  dueDate: addDays(TODAY, 7),
  currency: "UAH",
  discountPercent: 0,
  discountAmount: 0,
  lines: [line()],
  ...overrides,
})

describe("модуль B3: фікстури замовлень", () => {
  const { orders, counters } = createSalesFixtures(options)
  const company = orders.filter((order) => order.companyId === COMPANY)

  it("вісім замовлень на компанію з усіма статусами модуля й відповідною позначкою життєвого циклу", () => {
    expect(company).toHaveLength(8)
    expect(new Set(company.map((order) => order.status))).toEqual(
      new Set(ORDER_STATUSES),
    )
    for (const order of company) {
      expect(order.docStatus).toBe(
        order.status === "draft"
          ? "draft"
          : order.status === "cancelled"
            ? "cancelled"
            : "submitted",
      )
      expect(order.number === null).toBe(order.docStatus === "draft")
      expect(() => cardSchema.parse(order)).not.toThrow()
    }
  })

  it("номери своєї серії зростають разом із датою, лічильник — останній виданий номер", () => {
    const numbered = company
      .filter((order) => order.number !== null)
      .sort((a, b) => a.date.localeCompare(b.date))
    expect(numbered.map((order) => order.number)).toEqual(
      numbered.map(
        (_, index) => `ЗМ-2026-${String(index + 1).padStart(4, "0")}`,
      ),
    )
    expect(counters).toContainEqual({
      resource: ORDERS,
      companyId: COMPANY,
      year: 2026,
      value: numbered.length,
    })
  })

  it("підтверджене з минулою «Виконати до», скасоване з виправленою копією, великий документ", () => {
    expect(
      company.some(
        (order) => order.status === "confirmed" && order.dueDate < TODAY,
      ),
    ).toBe(true)
    const cancelled = company.find((order) => order.status === "cancelled")
    expect(
      company.find((order) => order.id === cancelled?.amendedBy),
    ).toMatchObject({
      amendedFrom: cancelled?.id,
      clientId: cancelled?.clientId,
      status: "draft",
    })
    const lines = Math.max(...company.map((order) => order.lines.length))
    expect(lines).toBeGreaterThanOrEqual(12)
  })

  it("англійські дані — свій шаблон номера", () => {
    const english = createSalesFixtures({ locale: "en", today: TODAY })
    expect(english.orders.find((order) => order.number)?.number).toMatch(
      /^SO-2026-\d{4}$/,
    )
  })
})

describe("модуль B3: моки замовлень", () => {
  beforeAll(() => {
    server.listen({ onUnhandledFrame: "error" })
  })
  beforeEach(() => {
    localStorage.clear()
    mocks.db.orders.reset()
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

  it("список — шапки компанії запиту без рядків", async () => {
    const { data, total } = await provider.getList<OrderCard>(ORDERS, {
      filter: {},
      pagination: { page: 1, perPage: 50 },
      sort: { field: "date", order: "DESC" },
    })
    expect(total).toBe(8)
    expect(data.every((order) => order.companyId === COMPANY)).toBe(true)
    expect(data.every((order) => !("lines" in order))).toBe(true)
  })

  it("нове замовлення — чернетка без номера, суми рахує сервер; «Виконати до» раніше дати — 422", async () => {
    const { data } = await provider.create<OrderCard>(ORDERS, {
      data: draft({ number: "ЗМ-2026-9999", status: "completed" }),
    })
    expect(cardSchema.parse(data)).toMatchObject({
      number: null,
      status: "draft",
      docStatus: "draft",
      // 18 500 + ПДВ 20%, у копійках.
      total: 2220000,
    })
    const early = await failureOf(
      provider.create(ORDERS, {
        data: draft({ dueDate: addDays(TODAY, -1) }),
      }),
    )
    expect(early.status).toBe(422)
    expect(early.fieldErrors).toEqual({ dueDate: "before_date" })
  })

  it("«Підтвердити»: номер своєї серії, серія пропозицій не зрушує; далі зміна заборонена", async () => {
    const order = await one("so-c1-01")
    const confirmed = await run(order.id, "submit", { version: order.version })
    expect(confirmed).toMatchObject({
      status: "confirmed",
      docStatus: "submitted",
      number: "ЗМ-2026-0007",
      deniedActions: { update: "submitted", delete: "submitted" },
    })
    const quote = await provider.getOne<{ id: string; version: number }>(
      QUOTES,
      { id: "qt-c1-01" },
    )
    expect(
      await run("qt-c1-01", "submit", { version: quote.data.version }, QUOTES),
    ).toMatchObject({ number: "КП-2026-0008" })
  })

  it("«Позначити виконаним» — лише з підтвердженого; з чернетки — 422 `transition_not_allowed`", async () => {
    const confirmed = await one("so-c1-02")
    expect(
      await run(confirmed.id, "complete", { version: confirmed.version }),
    ).toMatchObject({ status: "completed", docStatus: "submitted" })
    const draftOrder = await one("so-c1-01")
    const refused = await failureOf(
      run(draftOrder.id, "complete", { version: draftOrder.version }),
    )
    expect(refused.status).toBe(422)
    expect(refused.code).toBe("transition_not_allowed")
  })

  it("скасувати виконане — лише з причиною; виправити — нова чернетка з тим самим клієнтом і рядками", async () => {
    const completed = await one("so-c1-04")
    const noReason = await failureOf(
      run(completed.id, "cancel", { version: completed.version }),
    )
    expect(noReason.fieldErrors).toEqual({ reason: "required" })
    const cancelled = await run(completed.id, "cancel", {
      version: completed.version,
      reason: "Клієнт відмовився",
    })
    expect(cancelled).toMatchObject({
      status: "cancelled",
      docStatus: "cancelled",
    })
    const copy = cardSchema.parse(
      await run(completed.id, "amend", { version: cancelled.version }),
    )
    const today = todayIn()
    expect(copy).toMatchObject({
      number: null,
      status: "draft",
      docStatus: "draft",
      amendedFrom: completed.id,
      clientId: completed.clientId,
      date: today,
      dueDate: addDays(today, 7),
      total: completed.total,
    })
    expect(stored(completed.id)?.amendedBy).toBe(copy.id)
  })

  it("без права на дію — 403; сценарій `conflict`: колега переносить «Виконати до» на тиждень", async () => {
    signInMock(SELLER.id)
    const confirmed = await one("so-c1-02")
    expect(
      (
        await failureOf(
          run(confirmed.id, "cancel", {
            version: confirmed.version,
            reason: "Причина",
          }),
        )
      ).status,
    ).toBe(403)
    signInMock(MANAGER.id)
    setScenario("conflict", ORDERS)
    const conflict = await failureOf(
      run(confirmed.id, "complete", { version: confirmed.version }),
    )
    expect(conflict.status).toBe(409)
    expect(conflict.current).toMatchObject({
      dueDate: addDays(confirmed.dueDate, 7),
    })
  })

  it("сценарії ресурсу: порожньо й немає доступу", async () => {
    const list = () =>
      provider.getList(ORDERS, {
        filter: {},
        pagination: { page: 1, perPage: 10 },
        sort: { field: "date", order: "DESC" },
      })
    setScenario("empty", ORDERS)
    expect((await list()).total).toBe(0)
    setScenario("forbidden", ORDERS)
    expect((await failureOf(list())).status).toBe(403)
  })

  describe("масові дії й видалення (ADR-0066)", () => {
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
    const failedBy = (job: Job) =>
      Object.fromEntries(
        job.failures.map((group) => [
          group.code,
          group.items.map((item) => item.title),
        ]),
      )

    it("«Позначити виконаним»: підтверджені — виконані, чернетка й виконане — невдачі з назвою", async () => {
      const draftClient = stored("so-c1-01")?.clientName
      const completedNumber = stored("so-c1-04")?.number
      const { jobId } = await provider.startBulk(ORDERS, "complete", {
        ids: ["so-c1-02", "so-c1-03", "so-c1-01", "so-c1-04"],
      })
      const job = await finished(jobId)
      expect(job).toMatchObject({ total: 4, succeeded: 2, failed: 2 })
      expect(failedBy(job)).toEqual({
        transition_not_allowed: [draftClient, completedNumber],
      })
      expect(stored("so-c1-03")?.status).toBe("completed")
    })

    it("«Видалити»: лише чернетка; підтверджене — невдача `submitted`", async () => {
      const confirmedNumber = stored("so-c1-02")?.number
      const { jobId } = await provider.startBulk(ORDERS, "delete", {
        ids: ["so-c1-01", "so-c1-02"],
      })
      const job = await finished(jobId)
      expect(job).toMatchObject({ succeeded: 1, failed: 1 })
      expect(failedBy(job)).toEqual({ submitted: [confirmedNumber] })
      expect(stored("so-c1-01")).toBeUndefined()
    })
  })
})
