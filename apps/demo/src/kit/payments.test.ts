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
import { createNumberingMocks } from "@/registry/lib/mock-numbering"
import { createPeriodLockMocks } from "@/registry/lib/mock-period-lock"
import { resetScenarios } from "@/registry/lib/mock-scenarios"
import {
  createPlatformHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"
import {
  CREATE_CREDIT_NOTE,
  CREDIT_NOTES,
  invoiceCardSchemaFor,
  INVOICES,
  type CreditNoteCard,
  type InvoiceCard,
} from "@/registry/modules/K2-invoices/contract"
import {
  invoicePaymentQr,
  invoiceSettlementRows,
} from "@/registry/modules/K2-invoices/components/invoice-payment"
import { invoiceDebt } from "@/registry/modules/K2-invoices/invoice-debt"
import {
  createInvoicesMocks,
  invoicePaymentSeed,
  invoicesNumberingSeeds,
  type InvoiceMockRates,
} from "@/registry/modules/K2-invoices/mocks"
import { createPaymentsModule } from "@/registry/modules/K4-payments"
import {
  allocateOldestFirst,
  allocatedTotal,
  allocationsOf,
} from "@/registry/modules/K4-payments/allocation"
import {
  OPEN_INVOICES_PATH,
  openInvoiceSchema,
  OVERPAID_INVOICES_PATH,
  overpaidInvoiceSchema,
  paymentSchemaFor,
  PAYMENTS,
  refundSchemaFor,
  REFUNDS,
  type Payment,
} from "@/registry/modules/K4-payments/contract"
import {
  createPaymentsMocks,
  paymentsNumberingSeeds,
} from "@/registry/modules/K4-payments/mocks"

/**
 * Оплати модуля K4 (ADR-0073, крок K4): рознесення у формі й моки — реєстрація з ключем ідемпотентності,
 * сума не більша за борг і дорівнює рознесенню, «Оплачено» ставить сервер, часткова оплата статусу не
 * змінює, скасування й сторно повертають борг, кредит-нота разом з оплатою закриває рахунок, закритий
 * період, рахунок з оплатою не скасовують.
 */
describe("оплата K4: рознесення у формі", () => {
  const targets = [
    { id: "a", limit: 1000 },
    { id: "b", limit: 500 },
    { id: "c", limit: 300 },
  ]

  it("«Розписати від найстаршого»: по черзі, кожному не більше за борг, решті — порожньо", () => {
    expect(allocateOldestFirst(1200, targets)).toEqual({
      a: 1000,
      b: 200,
      c: null,
    })
    expect(allocateOldestFirst(5000, targets)).toEqual({
      a: 1000,
      b: 500,
      c: 300,
    })
    expect(allocateOldestFirst(-5, targets)).toEqual({
      a: null,
      b: null,
      c: null,
    })
  })

  it("у тіло запиту — рахунки з сумою понад нуль у порядку рахунків", () => {
    const amounts = { c: 100, a: 250, b: null }
    expect(allocatedTotal(amounts)).toBe(350)
    expect(allocationsOf(amounts, targets)).toEqual([
      { invoiceId: "a", amount: 250 },
      { invoiceId: "c", amount: 100 },
    ])
  })
})

const BASE = "http://erp-payments.test/api/v1"
const COMPANY = "c1"
const TODAY = "2026-11-08"
const LOCKED_THROUGH = "2026-10-20"
/**
 * Засів: прострочений рахунок, оплачений наполовину однією оплатою з новішим рахунком того самого клієнта
 * (новіший — «Оплачено»), рахунок із кредит-нотою, оплачений наполовину карткою, рахунок без оплат.
 */
const OVERDUE = "inv-c1-04"
const PAID = "inv-c1-14"
const CREDITED = "inv-c1-05"
const UNPAID = "inv-c1-03"
const MULTI = "pay-c1-multi"
const PARTIAL = "pay-c1-partial"
const REVERSED = "pay-c1-reversed"

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
const VIEWER = person("viewer", [
  "sales-invoices:read",
  "sales-payments:read",
  "sales-refunds:read",
])

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
const periodLock = createPeriodLockMocks({
  baseUrl: BASE,
  seeds: [{ companyId: COMPANY, lockedThrough: LOCKED_THROUGH }],
})
const invoices = createInvoicesMocks({
  ...options,
  baseUrl: BASE,
  numbering,
  periodLock,
  payments: {
    paidTotal: (invoiceId) => payments.paidTotal(invoiceId),
    refundedTotal: (invoiceId) => payments.refundedTotal(invoiceId),
  },
})
const payments = createPaymentsMocks({
  invoices: invoices.forPayments,
  baseUrl: BASE,
  numbering,
  periodLock,
  rates,
  today: TODAY,
})
const server = setupServer(
  ...createPlatformHandlers({ users: [ACCOUNTANT, VIEWER], baseUrl: BASE }),
  ...numbering.handlers,
  ...periodLock.handlers,
  ...invoices.handlers,
  ...payments.handlers,
)
const provider = createDataProvider(
  createApiClient({ baseUrl: BASE, getLanguage: () => "uk" }),
)

const invoiceSchema = invoiceCardSchemaFor()
const paymentSchema = paymentSchemaFor()
type Denied = { deniedActions?: Readonly<Record<string, string>> }
const invoice = (id: string) =>
  provider.getOne<InvoiceCard & Denied>(INVOICES, { id }).then(({ data }) => ({
    ...invoiceSchema.parse(data),
    deniedActions: data.deniedActions,
  }))
const payment = (id: string) =>
  provider.getOne<Payment & Denied>(PAYMENTS, { id }).then(({ data }) => ({
    ...paymentSchema.parse(data),
    deniedActions: data.deniedActions,
  }))
const openInvoices = (clientId: string) =>
  provider
    .getList(`${PAYMENTS}/${OPEN_INVOICES_PATH}`, {
      pagination: { page: 1, perPage: 50 },
      sort: { field: "dueDate", order: "ASC" },
      filter: { clientId },
    })
    .then(({ data }) => data.map((item) => openInvoiceSchema.parse(item)))
const register = (body: Record<string, unknown>) =>
  provider
    .create<Payment>(PAYMENTS, { data: body })
    .then(({ data }) => paymentSchema.parse(data))
const run = (resource: string, id: string, action: string, body: object) =>
  provider.runTransition(resource, id, action, body as never)
const failureOf = async (promise: Promise<unknown>) => {
  const error: unknown = await promise.catch((caught: unknown) => caught)
  if (!isApiError(error)) throw new Error("expected ApiError")
  return error
}
/** Тіло реєстрації: увесь борг рахунку `id` за сьогодні переказом. */
const payInFull = async (id: string, requestId: string) => {
  const target = await invoice(id)
  const debt = invoiceDebt(target)
  return {
    requestId,
    date: TODAY,
    clientId: target.clientId,
    currency: target.currency,
    method: "bank",
    reference: "Оплата за рахунком",
    amount: debt,
    allocations: [{ invoiceId: id, amount: debt }],
  }
}

describe("оплата K4: моки", () => {
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
    server.resetHandlers()
  })
  afterAll(() => {
    server.close()
    setCompanyId(null)
  })

  it("засів: оплата на два рахунки — новіший «Оплачено», прострочений наполовину лишається «Виставлено»", async () => {
    const multi = await payment(MULTI)
    expect(multi.allocations.map(({ invoiceId }) => invoiceId)).toEqual([
      OVERDUE,
      PAID,
    ])
    expect(multi.number).toMatch(/^ОП-2026-\d{4}$/)
    const paid = await invoice(PAID)
    expect(paid.status).toBe("paid")
    expect(paid.paidTotal).toBe(paid.total)
    const overdue = await invoice(OVERDUE)
    expect(overdue.status).toBe("issued")
    expect(overdue.paidTotal).toBe(multi.allocations[0]?.amount)
    expect(overdue.paidTotal).toBeLessThan(overdue.total)
    // Рахунок з оплатою, що діє, не скасовують і не сторнують.
    expect(overdue.deniedActions).toMatchObject({
      cancel: "has_payments",
      reverse: "has_payments",
    })
    // Сторнована й скасована оплати боргу не зменшують.
    expect((await payment(REVERSED)).status).toBe("reversed")
    expect((await invoice(UNPAID)).paidTotal).toBe(0)
  })

  it("рахунки клієнта з боргом: борг після оплат і кредит-нот, без оплаченого, від найранішої «Сплатити до»", async () => {
    const overdue = await invoice(OVERDUE)
    const open = await openInvoices(overdue.clientId)
    expect(open.map(({ id }) => id)).not.toContain(PAID)
    expect(open[0]).toMatchObject({
      id: OVERDUE,
      debt: overdue.total - (overdue.paidTotal ?? 0),
    })
    const dueDates = open.map(({ dueDate }) => dueDate)
    expect(dueDates).toEqual([...dueDates].sort())
    expect(open.every(({ debt }) => debt > 0)).toBe(true)
  })

  it("реєстрація на весь борг — номер серії, рахунок «Оплачено»; повтор із тим самим ключем — та сама оплата", async () => {
    const body = await payInFull(OVERDUE, "request-full")
    const [first, second] = await Promise.all([register(body), register(body)])
    expect(second.id).toBe(first?.id)
    expect(first).toMatchObject({
      number: "ОП-2026-0007",
      status: "received",
      docStatus: "submitted",
      clientName: (await invoice(OVERDUE)).clientName,
    })
    expect(
      payments.db
        .all()
        .filter((item) => item.allocations.some((a) => a.invoiceId === OVERDUE))
        .filter((item) => item.status === "received"),
    ).toHaveLength(2)
    const paid = await invoice(OVERDUE)
    expect(paid.status).toBe("paid")
    expect(paid.paidTotal).toBe(paid.total)
    expect(await openInvoices(paid.clientId)).not.toContainEqual(
      expect.objectContaining({ id: OVERDUE }),
    )
  })

  it("номер, статус, стан, версію й зв'язки сторно веде сервер: з тіла запиту їх не бере", async () => {
    const created = await register({
      ...(await payInFull(UNPAID, "request-server-fields")),
      id: "pay-from-client",
      number: "ОП-1999-0001",
      status: "cancelled",
      docStatus: "draft",
      version: 9,
      reversedBy: "pay-other",
    })
    expect(created).toMatchObject({
      number: expect.stringMatching(/^ОП-2026-\d{4}$/) as string,
      status: "received",
      docStatus: "submitted",
    })
    expect(created.id).not.toBe("pay-from-client")
    expect(created.version).not.toBe(9)
    expect(created).not.toHaveProperty("reversedBy", "pay-other")
    expect((await invoice(UNPAID)).status).toBe("paid")
  })

  it("більше за борг, нерозписана сума, чужий рахунок, закритий період — 422 біля поля, оплати немає", async () => {
    const body = await payInFull(UNPAID, "request-invalid")
    const before = payments.db.all().length
    const over = await failureOf(
      register({
        ...body,
        amount: body.amount + 1,
        allocations: [{ invoiceId: UNPAID, amount: body.amount + 1 }],
      }),
    )
    expect(over.status).toBe(422)
    expect(over.fieldErrors).toEqual({ "allocations.0.amount": "exceeds_debt" })
    const short = await failureOf(
      register({ ...body, amount: body.amount + 100 }),
    )
    expect(short.fieldErrors).toEqual({ amount: "not_allocated" })
    const foreign = await failureOf(
      register({
        ...body,
        allocations: [{ invoiceId: OVERDUE, amount: body.amount }],
      }),
    )
    expect(foreign.fieldErrors).toEqual({
      "allocations.0.invoiceId": "invoice_unavailable",
    })
    const paidAlready = await failureOf(
      register({
        ...body,
        allocations: [{ invoiceId: PAID, amount: body.amount }],
      }),
    )
    expect(paidAlready.fieldErrors?.["allocations.0.invoiceId"]).toBe(
      "invoice_unavailable",
    )
    const locked = await failureOf(register({ ...body, date: LOCKED_THROUGH }))
    expect(locked.fieldErrors).toEqual({ date: "period_locked" })
    expect(payments.db.all()).toHaveLength(before)
  })

  it("скасування оплати повертає рахунку «Виставлено» й борг; рахунок знову можна скасувати", async () => {
    const multi = await payment(MULTI)
    await run(PAYMENTS, MULTI, "cancel", {
      version: multi.version,
      reason: "Помилкова оплата",
    })
    expect((await payment(MULTI)).status).toBe("cancelled")
    const paid = await invoice(PAID)
    expect(paid.status).toBe("issued")
    expect(paid.paidTotal).toBe(0)
    const overdue = await invoice(OVERDUE)
    expect(overdue.paidTotal).toBe(0)
    expect(overdue.deniedActions?.cancel).toBeUndefined()
  })

  it("сторно оплати — проведене сторно сьогодні з мінусом, борг повертається", async () => {
    const partial = await payment(PARTIAL)
    const reversal = paymentSchema.parse(
      await run(PAYMENTS, PARTIAL, "reverse", {
        version: partial.version,
        reason: "Повернено банком",
      }),
    )
    expect(reversal).toMatchObject({
      status: "reversal",
      docStatus: "submitted",
      date: TODAY,
      amount: -partial.amount,
      reversalOf: PARTIAL,
    })
    expect((await payment(PARTIAL)).status).toBe("reversed")
    expect((await invoice(CREDITED)).paidTotal).toBe(0)
  })

  it("кредит-нота на решту рядків після часткової оплати — «Оплачено» з переплатою; сторно кредит-ноти — знову «Виставлено»", async () => {
    const before = await invoice(CREDITED)
    expect(before.status).toBe("issued")
    expect(before.paidTotal).toBeGreaterThan(0)
    const draft = (await run(INVOICES, CREDITED, CREATE_CREDIT_NOTE, {
      version: before.version,
    })) as CreditNoteCard
    const issued = (await run(CREDIT_NOTES, draft.id, "submit", {
      version: draft.version,
    })) as CreditNoteCard
    const overpaid = await invoice(CREDITED)
    expect(overpaid.status).toBe("paid")
    expect(overpaid.creditedTotal).toBe(overpaid.total)
    expect(
      overpaid.total -
        (overpaid.creditedTotal ?? 0) -
        (overpaid.paidTotal ?? 0),
    ).toBe(-(overpaid.paidTotal ?? 0))
    await run(CREDIT_NOTES, issued.id, "reverse", {
      version: issued.version,
      reason: "Помилка",
    })
    expect((await invoice(CREDITED)).status).toBe("issued")
  })

  it("без права `sales-payments:create` — 403 на реєстрацію й рахунки клієнта", async () => {
    const body = await payInFull(UNPAID, "request-viewer")
    signInMock(VIEWER.id)
    expect((await failureOf(register(body))).status).toBe(403)
    expect((await failureOf(openInvoices(body.clientId))).status).toBe(403)
  })
})

/**
 * Повернення переплати (ADR-0083, крок K4b): засів повертає половину переплати рахунку, на який після повної
 * оплати виставили кредит-ноту; повернення не більше за переплату, лише на рахунки з переплатою, з ключем
 * ідемпотентності; скасоване чи сторноване повернення переплату повертає; статус рахунку лишається «Оплачено».
 */
const refundSchema = refundSchemaFor()
const REFUND = "ref-c1-overpaid"
const refund = (id: string) =>
  provider
    .getOne<Payment>(REFUNDS, { id })
    .then(({ data }) => refundSchema.parse(data))
const overpaidInvoices = (clientId: string) =>
  provider
    .getList(`${REFUNDS}/${OVERPAID_INVOICES_PATH}`, {
      pagination: { page: 1, perPage: 50 },
      sort: { field: "dueDate", order: "ASC" },
      filter: { clientId },
    })
    .then(({ data }) => data.map((item) => overpaidInvoiceSchema.parse(item)))
const refundBody = (
  target: InvoiceCard,
  amount: number,
  requestId: string,
  allocated = amount,
) => ({
  requestId,
  date: TODAY,
  clientId: target.clientId,
  currency: target.currency,
  method: "bank",
  reference: "Повернення переплати",
  amount,
  allocations: [{ invoiceId: target.id, amount: allocated }],
})
const createRefund = (body: Record<string, unknown>) =>
  provider
    .create<Payment>(REFUNDS, { data: body })
    .then(({ data }) => refundSchema.parse(data))

describe("повернення K4: моки", () => {
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
    server.resetHandlers()
  })
  afterAll(() => {
    server.close()
    setCompanyId(null)
  })

  it("засів: рахунок сплачено повністю, потім кредит-нота — повернено половину переплати, рахунок «Оплачено»", async () => {
    const paid = await invoice(PAID)
    const seeded = await refund(REFUND)
    expect(seeded).toMatchObject({
      number: "ПВ-2026-0001",
      status: "refunded",
      docStatus: "submitted",
      allocations: [{ invoiceId: PAID, amount: seeded.amount }],
    })
    expect(paid.paidTotal).toBe(paid.total)
    expect(paid.creditedTotal).toBeGreaterThan(0)
    expect(paid.refundedTotal).toBe(seeded.amount)
    expect(paid.status).toBe("paid")
    expect(invoiceDebt(paid)).toBeLessThan(0)
    expect(await overpaidInvoices(paid.clientId)).toEqual([
      expect.objectContaining({ id: PAID, overpaid: -invoiceDebt(paid) }),
    ])
  })

  it("повернення решти переплати: номер серії «ПВ-…», борг нуль, рахунок лишається «Оплачено»; повтор ключа — те саме повернення", async () => {
    const paid = await invoice(PAID)
    const body = refundBody(paid, -invoiceDebt(paid), "refund-rest")
    const created = await createRefund(body)
    expect(created).toMatchObject({
      number: "ПВ-2026-0002",
      status: "refunded",
      amount: body.amount,
      clientName: paid.clientName,
    })
    const after = await invoice(PAID)
    expect(invoiceDebt(after)).toBe(0)
    expect(after.status).toBe("paid")
    expect(after.refundedTotal).toBe((paid.refundedTotal ?? 0) + created.amount)
    expect(await overpaidInvoices(paid.clientId)).toEqual([])
    const repeated = await createRefund(body)
    expect(repeated.id).toBe(created.id)
    expect(payments.refundsDb.all()).toHaveLength(2)
  })

  it("більше за переплату, рахунок без переплати, нерозписана сума — 422 біля полів", async () => {
    const paid = await invoice(PAID)
    const overpaid = -invoiceDebt(paid)
    const exceeds = await failureOf(
      createRefund(refundBody(paid, overpaid + 1, "refund-exceeds")),
    )
    expect(exceeds.status).toBe(422)
    expect(exceeds.fieldErrors).toEqual({
      "allocations.0.amount": "exceeds_overpayment",
    })
    const unpaid = await invoice(UNPAID)
    const unavailable = await failureOf(
      createRefund(refundBody(unpaid, 100, "refund-unpaid")),
    )
    expect(unavailable.fieldErrors).toEqual({
      "allocations.0.invoiceId": "invoice_unavailable",
    })
    const notAllocated = await failureOf(
      createRefund(refundBody(paid, overpaid, "refund-split", overpaid - 1)),
    )
    expect(notAllocated.fieldErrors).toEqual({ amount: "not_allocated" })
    expect(payments.refundsDb.all()).toHaveLength(1)
  })

  it("дата в закритому періоді — 422 `period_locked`", async () => {
    const paid = await invoice(PAID)
    const failure = await failureOf(
      createRefund({
        ...refundBody(paid, 1, "refund-locked"),
        date: LOCKED_THROUGH,
      }),
    )
    expect(failure.fieldErrors).toEqual({ date: "period_locked" })
  })

  it("скасоване й сторноване повернення переплату повертає: сторно — з мінусом і сьогоднішньою датою", async () => {
    const seeded = await refund(REFUND)
    const before = await invoice(PAID)
    await run(REFUNDS, REFUND, "cancel", {
      version: seeded.version,
      reason: "Помилка",
    })
    const cancelled = await invoice(PAID)
    expect(cancelled.refundedTotal).toBe(0)
    expect(invoiceDebt(cancelled)).toBe(invoiceDebt(before) - seeded.amount)
    const created = await createRefund(
      refundBody(cancelled, 100, "refund-then-reverse"),
    )
    const reversal = (await run(REFUNDS, created.id, "reverse", {
      version: created.version,
      reason: "Повернули не тому",
    })) as Payment
    expect(reversal).toMatchObject({
      status: "reversal",
      amount: -created.amount,
      date: TODAY,
      reversalOf: created.id,
    })
    expect((await invoice(PAID)).refundedTotal).toBe(0)
  })

  it("аркуш: «Повернено» між «Оплачено» й «Переплата»; переплата без QR; повернено все — «До сплати» нуль", async () => {
    const card = await invoice(PAID)
    const { totals } = card
    expect(invoiceSettlementRows(card, totals).map(({ key }) => key)).toEqual([
      "credited",
      "paid",
      "refunded",
      "overpaid",
    ])
    expect(invoicePaymentQr(card, totals)).toBeNull()
    const settled = {
      ...card,
      refundedTotal: (card.refundedTotal ?? 0) - invoiceDebt(card),
    }
    expect(invoiceSettlementRows(settled, totals).at(-1)).toEqual({
      key: "debt",
      amount: 0,
    })
  })

  it("без права `sales-refunds:create` — 403 на повернення й рахунки з переплатою", async () => {
    const paid = await invoice(PAID)
    signInMock(VIEWER.id)
    expect(
      (await failureOf(createRefund(refundBody(paid, 1, "refund-viewer"))))
        .status,
    ).toBe(403)
    expect((await failureOf(overpaidInvoices(paid.clientId))).status).toBe(403)
  })
})

describe("рахунок K2: борг із поверненнями", () => {
  it("борг — «виставлено мінус кредит-ноти мінус оплачено плюс повернено»", () => {
    const base = { total: 120_000, creditedTotal: 20_000, paidTotal: 120_000 }
    expect(invoiceDebt(base)).toBe(-20_000)
    expect(invoiceDebt({ ...base, refundedTotal: 5_000 })).toBe(-15_000)
    expect(invoiceDebt({ ...base, refundedTotal: 20_000 })).toBe(0)
  })
})

describe("фабрика createPaymentsModule", () => {
  it("маршрути від basePath, перехід з адреси модуля, пункти з правом і ресурси", () => {
    const module = createPaymentsModule({ basePath: "/finance/" })
    expect(module.routes.map((route) => route.path)).toEqual([
      "/finance/payments",
      "/finance/payments/new",
      "/finance/payments/:id",
      "/finance/refunds",
      "/finance/refunds/new",
      "/finance/refunds/:id",
      "/finance/",
    ])
    expect(
      module.nav.map(({ id, href, access }) => ({ id, href, access })),
    ).toEqual([
      {
        id: "K4-payments",
        href: "/finance/payments",
        access: { resource: "sales-payments", action: "read" },
      },
      {
        id: "K4-refunds",
        href: "/finance/refunds",
        access: { resource: "sales-refunds", action: "read" },
      },
    ])
    expect(module.resources.map((resource) => resource.name)).toEqual([
      "sales-payments",
      "sales-refunds",
    ])
  })
})
