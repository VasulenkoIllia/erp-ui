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
import {
  itemLinesOf,
  type SavedDocumentLine,
} from "@/registry/lib/document-lines"
import {
  convertMinorAmount,
  documentExchangeOf,
} from "@/registry/lib/currency-conversion"
import {
  computeDocumentTotals,
  type Totals,
} from "@/registry/lib/document-totals"
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
import {
  CREATE_CREDIT_NOTE,
  CREDIT_NOTES,
  creditNoteCardSchemaFor,
  invoiceCardSchemaFor,
  INVOICES,
  type CreditNoteCard,
  type InvoiceCard,
} from "@/registry/modules/K2-invoices/contract"
import {
  addTotals,
  creditedLineTotals,
  creditNoteTotals,
  NOTHING_CREDITED,
  quantityText,
  quantityUnits,
  type CreditedLineBasis,
  type CreditedPart,
} from "@/registry/modules/K2-invoices/credit-note-sums"
import { creditedExchange } from "@/registry/modules/K2-invoices/mock-exchange"
import {
  createInvoicesMocks,
  invoicesNumberingSeeds,
  type InvoiceMockRates,
} from "@/registry/modules/K2-invoices/mocks"

/**
 * Кредит-нота модуля K2 (ADR-0072, крок K2c): суми частками рядка рахунку й моки — кредит-нота з рахунку,
 * кількість не більша за рахунок, кілька кредит-нот, сума на картці рахунку, рахунок із виставленою
 * кредит-нотою не скасовують, закритий період рахунку, курс рахунку, потік.
 */
describe("кредит-нота K2: суми частками рядка рахунку", () => {
  const vat = { id: "vat-20", rate: 20, included: false }
  const basisOf = (
    quantity: string,
    price: string,
    tax = vat,
    discountPercent = 0,
  ) => {
    const totals = computeDocumentTotals(
      [{ quantity, price, discountPercent, discountAmount: 0, tax }],
      2,
    )?.lines[0]
    if (!totals) throw new Error("basis does not add up")
    return { quantity, totals }
  }
  /** Кредит-ноти по черзі, як рахує сервер: кожна — після повернених попередніми. */
  const inTurn = (basis: CreditedLineBasis, quantities: readonly string[]) => {
    let before: CreditedPart = NOTHING_CREDITED
    return quantities.map((quantity) => {
      const part = creditedLineTotals(basis, before, quantity, false)
      before = {
        quantity: quantityText(
          quantityUnits(before.quantity) + quantityUnits(quantity),
        ),
        totals: addTotals(before.totals, part),
      }
      return part
    })
  }

  it("10,03 × 2 частинами: ПДВ 2,01 і 2,00 — разом рівно рахунок", () => {
    const basis = basisOf("2", "10.03")
    expect(basis.totals).toMatchObject({ net: 2006, tax: 401, total: 2407 })
    const [first, second] = inTurn(basis, ["1", "1"])
    expect(first).toMatchObject({ net: 1003, tax: 201, total: 1204 })
    expect(second).toMatchObject({ net: 1003, tax: 200, total: 1203 })
    expect((first?.total ?? 0) + (second?.total ?? 0)).toBe(basis.totals.total)
  })

  it("частки накопичувальні: три по одній із чотирьох не перевищують рахунок, остання бере залишок", () => {
    const basis = basisOf("4", "0.005", vat)
    const parts = inTurn(basis, ["1", "1", "1", "1"])
    for (const key of ["amount", "net", "tax", "total"] as const) {
      expect(parts.every((part) => part[key] >= 0)).toBe(true)
      expect(parts.reduce((sum, part) => sum + part[key], 0)).toBe(
        basis.totals[key],
      )
    }
  })

  it("податок у ціні й знижка рядка: `net = total − tax`, знижка — частка", () => {
    const basis = basisOf("3", "120", { ...vat, included: true }, 10)
    const part = creditedLineTotals(basis, NOTHING_CREDITED, "1", true)
    expect(part.total).toBe(part.amount - part.discount)
    expect(part.net).toBe(part.total - part.tax)
    expect(part.discount).toBe(Math.round(basis.totals.discount / 3))
  })

  it("після сторно однієї з кредит-нот решта разом однаково не більша за рахунок", () => {
    // 3 × 3,3333 = 10,00: частки однієї одиниці — 3,33 і 3,34.
    const basis = basisOf("3", "3.3333")
    const [first, second] = inTurn(basis, ["1", "1"])
    if (!first || !second) throw new Error("no parts")
    expect(first.amount).not.toBe(second.amount)
    // Першу сторнували: лишилась друга, далі ще дві по одній.
    const third = creditedLineTotals(
      basis,
      { quantity: "1", totals: second },
      "1",
      false,
    )
    const fourth = creditedLineTotals(
      basis,
      { quantity: "2", totals: addTotals(second, third) },
      "1",
      false,
    )
    for (const key of ["amount", "net", "tax", "total"] as const)
      expect(second[key] + third[key] + fourth[key]).toBe(basis.totals[key])
  })

  it("кількість понад рахунок — RangeError; кількість — тисячними без зайвих нулів", () => {
    expect(() =>
      creditedLineTotals(
        basisOf("2", "10"),
        { ...NOTHING_CREDITED, quantity: "1.5" },
        "1",
        false,
      ),
    ).toThrow(RangeError)
    expect(quantityUnits("2.125")).toBe(2125n)
    expect(quantityText(1500n)).toBe("1.5")
    expect(quantityText(0n)).toBe("0")
    expect(quantityText(quantityUnits("12"))).toBe("12")
  })

  it("підсумки за ставками — сума рядків тієї самої ставки", () => {
    const line = (id: string, net: number, tax: number): SavedDocumentLine => ({
      kind: "item",
      id,
      name: id,
      itemId: null,
      quantity: "1",
      unit: null,
      price: "1",
      discountPercent: 0,
      discountAmount: 0,
      tax: { id: "vat-20", name: "ПДВ 20%", rate: 20, included: false },
      totals: {
        amount: net,
        discount: 0,
        documentDiscount: 0,
        net,
        tax,
        total: net + tax,
      },
    })
    expect(
      creditNoteTotals([line("a", 1000, 200), line("b", 500, 100)]),
    ).toMatchObject({
      net: 1500,
      tax: 300,
      total: 1800,
      taxes: [{ taxId: "vat-20", net: 1500, tax: 300 }],
    })
  })
})

describe("кредит-нота K2: частки без від'ємних складових (ADR-0074)", () => {
  const TOTALS_KEYS = [
    "amount",
    "discount",
    "documentDiscount",
    "net",
    "tax",
    "total",
  ] as const
  const vat = { id: "vat-20", rate: 20, included: false }
  const vatIncluded = { ...vat, included: true }

  /** Рядок рахунку з `lib/document-totals`: один рядок, знижка документа відсотком іде йому вся. */
  const basisOf = (
    quantity: string,
    price: string,
    tax: typeof vat | null,
    discountPercent: number,
    documentPercent = 0,
  ): CreditedLineBasis | null => {
    const totals = computeDocumentTotals(
      [{ quantity, price, discountPercent, discountAmount: 0, tax }],
      2,
      { discountPercent: documentPercent, discountAmount: 0 },
    )?.lines[0]
    return totals ? { quantity, totals } : null
  }

  /** Кредит-ноти по черзі, як рахує сервер. */
  const inTurn = (
    basis: CreditedLineBasis,
    quantities: readonly string[],
    taxIncluded: boolean,
  ) => {
    let before: CreditedPart = NOTHING_CREDITED
    return quantities.map((quantity) => {
      const part = creditedLineTotals(basis, before, quantity, taxIncluded)
      before = {
        quantity: quantityText(
          quantityUnits(before.quantity) + quantityUnits(quantity),
        ),
        totals: addTotals(before.totals, part),
      }
      return part
    })
  }

  /** Усі складові кожної частки невід'ємні, частка сходиться сама з собою, разом — рівно рядок рахунку. */
  const expectParts = (
    basis: CreditedLineBasis,
    parts: readonly Totals[],
    taxIncluded: boolean,
  ) => {
    for (const part of parts) {
      for (const key of TOTALS_KEYS) expect(part[key]).toBeGreaterThanOrEqual(0)
      expect(part.total).toBe(part.net + part.tax)
      expect(part.amount).toBe(
        (taxIncluded ? part.total : part.net) + part.discount,
      )
    }
    for (const key of TOTALS_KEYS)
      expect(parts.reduce((sum, part) => sum + part[key], 0)).toBe(
        basis.totals[key],
      )
  }

  it("1000 × 0,004 зі знижкою 50 %: друга й третя кредит-ноти по одній штуці без мінуса в нетто", () => {
    const basis = basisOf("1000", "0.004", vat, 50)
    if (!basis) throw new Error("basis does not add up")
    const parts = inTurn(basis, ["2", "1", "1", "996"], false)
    expectParts(basis, parts, false)
  })

  it("12 × 0,005 з ПДВ у ціні: шість кредит-нот по одній, решта — сьомою, без мінуса", () => {
    const basis = basisOf("12", "0.005", vatIncluded, 0)
    if (!basis) throw new Error("basis does not add up")
    const parts = inTurn(basis, ["1", "1", "1", "1", "1", "1", "6"], true)
    expectParts(basis, parts, true)
  })

  it("тест-властивість: на переборі цін, кількостей, знижок і послідовностей кредит-нот", () => {
    // Детермінований генератор (mulberry32): перебір той самий у кожному прогоні.
    let seed = 20_261_111
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0
      let mixed = Math.imul(seed ^ (seed >>> 15), seed | 1)
      mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296
    }
    /** `whole` тисячних — на `count` частин від 0,001, сума рівно `whole`. */
    const split = (whole: bigint, count: number): string[] => {
      const cuts = new Set<bigint>()
      while (cuts.size < Math.min(count - 1, Number(whole) - 1))
        cuts.add(1n + BigInt(Math.floor(random() * (Number(whole) - 1))))
      const points = [0n, ...[...cuts].sort((a, b) => (a < b ? -1 : 1)), whole]
      return points
        .slice(1)
        .map((point, index) => quantityText(point - (points[index] ?? 0n)))
    }
    const quantities = ["1", "2", "3", "7", "12", "0.5", "2.125", "1000"]
    const prices = [
      "0.001",
      "0.004",
      "0.005",
      "0.01",
      "0.33",
      "3.3333",
      "10.03",
      "999.99",
    ]
    const discounts = [0, 10, 33.33, 50, 99.99]
    const taxes = [null, vat, vatIncluded]
    let checked = 0
    for (const quantity of quantities)
      for (const price of prices)
        for (const discountPercent of discounts)
          for (const documentPercent of [0, 15])
            for (const tax of taxes) {
              const basis = basisOf(
                quantity,
                price,
                tax,
                discountPercent,
                documentPercent,
              )
              if (!basis) continue
              const included = tax?.included ?? false
              for (const count of [1, 2, 3, 5]) {
                const parts = inTurn(
                  basis,
                  split(quantityUnits(quantity), count),
                  included,
                )
                expectParts(basis, parts, included)
                checked += 1
              }
            }
    expect(checked).toBeGreaterThan(3000)
  })
})

describe("кредит-нота K2: залишок у базовій валюті (ADR-0074)", () => {
  const RATE = 41.2534
  const invoiceExchange = documentExchangeOf(
    { currency: "USD", total: 3 },
    "UAH",
    { rate: RATE, date: "2026-11-02" },
  )

  it("0,03 $ трьома кредит-нотами по 0,01 $: остання бере залишок, разом рівно рахунок", () => {
    expect(invoiceExchange?.baseTotal).toBe(124)
    const note = { currency: "USD", total: 1 }
    const first = creditedExchange(invoiceExchange, note)
    const second = creditedExchange(invoiceExchange, note)
    const last = creditedExchange(invoiceExchange, note, {
      creditedBase: (first?.baseTotal ?? 0) + (second?.baseTotal ?? 0),
    })
    expect([first?.baseTotal, second?.baseTotal, last?.baseTotal]).toEqual([
      41, 41, 42,
    ])
    expect(last).toMatchObject({ rate: RATE, rateDate: "2026-11-02" })
  })

  it("попередні вже перевищили рахунок округленням — у останньої нуль, а не мінус", () => {
    const last = creditedExchange(
      invoiceExchange,
      { currency: "USD", total: 1 },
      { creditedBase: 125 },
    )
    expect(last?.baseTotal).toBe(0)
  })

  it("рахунок без курсу — без суми в базовій валюті й у останньої", () => {
    const noRate = documentExchangeOf(
      { currency: "USD", total: 3 },
      "UAH",
      null,
    )
    expect(
      creditedExchange(
        noRate,
        { currency: "USD", total: 3 },
        { creditedBase: 0 },
      )?.baseTotal,
    ).toBeNull()
  })
})

const BASE = "http://erp-credit-notes.test/api/v1"
const COMPANY = "c1"
const TODAY = "2026-11-08"
const LOCKED_THROUGH = "2026-10-20"
/** Засів: виставлені без кредит-нот, з виставленою кредит-нотою (`cn-c1-05`), давній, у євро. */
const ISSUED = "inv-c1-03"
const ISSUED_OTHER = "inv-c1-04"
const CREDITED = "inv-c1-05"
const ISSUED_CLOSED = "inv-c1-10"
const EUR_ISSUED = "inv-c1-12"

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
])
/** Робить дії над рахунками, але кредит-нот не створює. */
const NO_CREDIT = person("no-credit", [
  "sales-invoices:*",
  "sales-credit-notes:read",
])

/** Курс із дробом: суми рахунку й кредит-нот у базовій валюті округлюються кожна окремо. */
const EUR_RATE = 48.1234
const rates: InvoiceMockRates = {
  baseCurrency: () => "UAH",
  rateOn: (_companyId, currency) =>
    currency === "EUR" ? { rate: EUR_RATE, date: TODAY } : null,
}
const options = { companies: [COMPANY], today: TODAY, rates } as const
const seeds = invoicesNumberingSeeds(options)
const numbering = createNumberingMocks({
  baseUrl: BASE,
  series: seeds.series,
  counters: seeds.counters,
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
})
const server = setupServer(
  ...createPlatformHandlers({ users: [ACCOUNTANT, NO_CREDIT], baseUrl: BASE }),
  ...numbering.handlers,
  ...periodLock.handlers,
  ...createJobHandlers({ baseUrl: BASE }),
  ...createDocumentFlowHandlers({
    sources: invoices.flowSources,
    baseUrl: BASE,
  }),
  ...invoices.handlers,
)
const provider = createDataProvider(
  createApiClient({ baseUrl: BASE, getLanguage: () => "uk" }),
)

const invoiceSchema = invoiceCardSchemaFor()
const noteSchema = creditNoteCardSchemaFor()
type Denied = { deniedActions?: Readonly<Record<string, string>> }
const invoice = (id: string) =>
  provider.getOne<InvoiceCard & Denied>(INVOICES, { id }).then(({ data }) => ({
    ...invoiceSchema.parse(data),
    deniedActions: data.deniedActions,
  }))
const note = (id: string) =>
  provider
    .getOne<CreditNoteCard & Denied>(CREDIT_NOTES, { id })
    .then(({ data }) => ({
      ...noteSchema.parse(data),
      deniedActions: data.deniedActions,
    }))
const run = (resource: string, id: string, action: string, body: object) =>
  provider.runTransition(resource, id, action, body as never)
const failureOf = async (promise: Promise<unknown>) => {
  const error: unknown = await promise.catch((caught: unknown) => caught)
  if (!isApiError(error)) throw new Error("expected ApiError")
  return error
}
/** Кредит-нота-чернетка з рахунку `id`. */
const creditNoteFrom = async (id: string) => {
  const seen = await invoice(id)
  return noteSchema.parse(
    await run(INVOICES, id, CREATE_CREDIT_NOTE, { version: seen.version }),
  )
}
/** Змінити рядки чернетки: `id` рядка рахунку й кількість. */
const saveLines = async (
  draft: CreditNoteCard,
  lines: readonly { id: string; quantity: string }[],
) => {
  const { data } = await provider.update<CreditNoteCard>(CREDIT_NOTES, {
    id: draft.id,
    data: { lines, version: draft.version },
    previousData: draft,
  })
  return noteSchema.parse(data)
}
const submit = async (draft: CreditNoteCard) =>
  noteSchema.parse(
    await run(CREDIT_NOTES, draft.id, "submit", { version: draft.version }),
  )

describe("кредит-нота K2: моки", () => {
  beforeAll(() => {
    server.listen({ onUnhandledFrame: "error" })
  })
  beforeEach(() => {
    localStorage.clear()
    invoices.db.reset()
    invoices.creditNotesDb.reset()
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

  it("з рахунку — чернетка без номера з усіма рядками, клієнтом, сторонами й датою сьогодні", async () => {
    const source = await invoice(ISSUED)
    const draft = await creditNoteFrom(ISSUED)
    expect(draft).toMatchObject({
      number: null,
      status: "draft",
      docStatus: "draft",
      invoiceId: ISSUED,
      invoiceNumber: source.number,
      clientId: source.clientId,
      supplier: source.supplier,
      currency: "UAH",
      date: TODAY,
      exchange: null,
      // Усі рядки повністю — рівно сума рахунку.
      total: source.total,
    })
    expect(draft.lines.map(({ id, quantity }) => ({ id, quantity }))).toEqual(
      itemLinesOf(source.lines).map(({ id, quantity }) => ({ id, quantity })),
    )
    expect(draft.basis?.[draft.lines[0]?.id ?? ""]).toMatchObject({
      available: draft.lines[0]?.quantity,
    })
  })

  it("чернетка: менше рядків і кількість — суми перераховано; ціну із запиту не беруть; понад рахунок — 422", async () => {
    const draft = await creditNoteFrom(ISSUED)
    const [first] = draft.lines
    if (!first) throw new Error("no lines")
    const saved = await saveLines(draft, [{ id: first.id, quantity: "1" }])
    expect(saved.lines).toHaveLength(1)
    expect(saved.lines[0]).toMatchObject({ quantity: "1", price: first.price })
    expect(saved.total).toBe(saved.totals.total)
    expect(saved.total).toBeLessThan(draft.total)
    const { data } = await provider.update<CreditNoteCard>(CREDIT_NOTES, {
      id: saved.id,
      data: {
        lines: [{ ...saved.lines[0], quantity: "1", price: "0.01" }],
        version: saved.version,
      },
      previousData: saved,
    })
    expect(noteSchema.parse(data).lines[0]?.price).toBe(first.price)
    const tooMany = String(Number(first.quantity) + 1)
    const refused = await failureOf(
      saveLines(noteSchema.parse(data), [{ id: first.id, quantity: tooMany }]),
    )
    expect(refused.fieldErrors).toEqual({
      "lines.0.quantity": "exceeds_invoice",
    })
  })

  it("«Виставити» — номер КН, сума на картці рахунку; рахунок тоді не скасовують і не сторнують", async () => {
    const draft = await creditNoteFrom(ISSUED)
    const [first] = draft.lines
    if (!first) throw new Error("no lines")
    const issued = await submit(
      await saveLines(draft, [{ id: first.id, quantity: "1" }]),
    )
    expect(issued).toMatchObject({ status: "issued", docStatus: "submitted" })
    expect(issued.number).toMatch(/^КН-2026-\d{4}$/)
    const source = await invoice(ISSUED)
    expect(source.creditedTotal).toBe(issued.total)
    expect(source.status).toBe("issued")
    expect(source.deniedActions).toMatchObject({
      cancel: "linked",
      reverse: "linked",
    })
    const cancel = await failureOf(
      run(INVOICES, ISSUED, "cancel", {
        version: source.version,
        reason: "Помилка",
      }),
    )
    expect(cancel.status).toBe(403)
  })

  it("кілька кредит-нот: друга бере лише залишок, разом — рівно рахунок; повністю покритий — без нової", async () => {
    const source = await invoice(ISSUED)
    const first = await creditNoteFrom(ISSUED)
    const [line] = first.lines
    if (!line) throw new Error("no lines")
    const issued = await submit(
      await saveLines(first, [{ id: line.id, quantity: "1" }]),
    )
    const second = await creditNoteFrom(ISSUED)
    expect(second.lines.find(({ id }) => id === line.id)?.quantity ?? "0").toBe(
      quantityText(quantityUnits(line.quantity) - 1000n),
    )
    const closing = await submit(second)
    expect(issued.total + closing.total).toBe(source.total)
    const covered = await invoice(ISSUED)
    expect(covered.creditedTotal).toBe(source.total)
    expect(covered.deniedActions).toMatchObject({
      [CREATE_CREDIT_NOTE]: "credited",
    })
    const refused = await failureOf(
      run(INVOICES, ISSUED, CREATE_CREDIT_NOTE, { version: covered.version }),
    )
    expect(refused.status).toBe(403)
  })

  it("дві чернетки на ті самі рядки: виставлена першою забирає кількість, друга — без «Виставити»", async () => {
    const first = await creditNoteFrom(ISSUED_OTHER)
    const second = await creditNoteFrom(ISSUED_OTHER)
    await submit(first)
    expect((await note(second.id)).deniedActions).toMatchObject({
      submit: "exceeds_invoice",
    })
    const refused = await failureOf(submit(await note(second.id)))
    expect(refused.status).toBe(403)
  })

  it("рахунок скасовано, поки кредит-нота чернетка: її не виставити", async () => {
    const draft = await creditNoteFrom(ISSUED_OTHER)
    const source = await invoice(ISSUED_OTHER)
    await run(INVOICES, ISSUED_OTHER, "cancel", {
      version: source.version,
      reason: "Помилка",
    })
    expect((await note(draft.id)).deniedActions).toMatchObject({
      submit: "invoice_inactive",
    })
  })

  it("сторно кредит-ноти: сума з мінусом, рахунок знову без кредит-нот, його можна скасувати", async () => {
    const credited = await invoice(CREDITED)
    expect(credited.creditedTotal).toBeGreaterThan(0)
    const seeded = await note("cn-c1-05")
    const reversal = noteSchema.parse(
      await run(CREDIT_NOTES, seeded.id, "reverse", {
        version: seeded.version,
        reason: "Повернення не відбулось",
      }),
    )
    expect(reversal).toMatchObject({
      status: "reversal",
      reversalOf: seeded.id,
      total: -seeded.total,
      totals: seeded.totals,
    })
    expect(reversal.number).toMatch(/^КН-2026-\d{4}$/)
    const after = await invoice(CREDITED)
    expect(after.creditedTotal).toBe(0)
    expect(after.deniedActions?.cancel).toBeUndefined()
  })

  it("рахунок закритого періоду: кредит-нота датується сьогодні; дата чернетки в закритому — 422", async () => {
    const closed = await invoice(ISSUED_CLOSED)
    expect(closed.deniedActions).toMatchObject({ cancel: "period_locked" })
    expect(closed.deniedActions?.[CREATE_CREDIT_NOTE]).toBeUndefined()
    const draft = await creditNoteFrom(ISSUED_CLOSED)
    expect(draft.date).toBe(TODAY)
    const refused = await failureOf(
      provider.update(CREDIT_NOTES, {
        id: draft.id,
        data: { date: LOCKED_THROUGH, version: draft.version },
        previousData: draft,
      }),
    )
    expect(refused.fieldErrors).toMatchObject({ date: "period_locked" })
  })

  it("рахунок у євро: валюта й курс рахунку, сума в базовій — від суми кредит-ноти", async () => {
    const source = await invoice(EUR_ISSUED)
    const draft = await note("cn-c1-12")
    expect(draft.currency).toBe("EUR")
    expect(draft.exchange).toMatchObject({
      baseCurrency: "UAH",
      rate: source.exchange?.rate,
      rateDate: source.exchange?.rateDate,
    })
    // Чернетка засіву повертає весь рахунок: у базовій валюті — сума рахунку (залишок, ADR-0074).
    expect(draft.total).toBe(source.total)
    expect(draft.exchange?.baseTotal).toBe(source.exchange?.baseTotal)
  })

  it("рахунок у євро частинами: перша — від своєї суми, остання — залишок, разом рівно рахунок у гривнях", async () => {
    const source = await invoice(EUR_ISSUED)
    const first = await creditNoteFrom(EUR_ISSUED)
    const [line] = first.lines
    if (!line) throw new Error("no lines")
    const issued = await submit(
      await saveLines(first, [{ id: line.id, quantity: "1" }]),
    )
    expect(issued.exchange?.baseTotal).toBe(
      convertMinorAmount(issued.total, "EUR", EUR_RATE, "UAH"),
    )
    const closing = await submit(await creditNoteFrom(EUR_ISSUED))
    expect(issued.total + closing.total).toBe(source.total)
    expect(
      (issued.exchange?.baseTotal ?? 0) + (closing.exchange?.baseTotal ?? 0),
    ).toBe(source.exchange?.baseTotal)
  })

  it("рахунок у євро: часткову кредит-ноту сторновано — закриваюча бере весь рахунок у гривнях, чернетки не рахуються", async () => {
    const source = await invoice(EUR_ISSUED)
    const first = await creditNoteFrom(EUR_ISSUED)
    const [line] = first.lines
    if (!line) throw new Error("no lines")
    const partial = await submit(
      await saveLines(first, [{ id: line.id, quantity: "1" }]),
    )
    await run(CREDIT_NOTES, partial.id, "reverse", {
      version: partial.version,
      reason: "Повернення не відбулось",
    })
    // Ще одна чернетка на той самий рахунок лишається чернеткою: залишку вона не зменшує.
    await creditNoteFrom(EUR_ISSUED)
    const closing = await submit(await creditNoteFrom(EUR_ISSUED))
    expect(closing.total).toBe(source.total)
    expect(closing.exchange?.baseTotal).toBe(source.exchange?.baseTotal)
  })

  it("без права створювати кредит-ноти — 403; потік рахунку показує кредит-ноту «на підставі»", async () => {
    signInMock(NO_CREDIT.id)
    const source = await invoice(ISSUED)
    const refused = await failureOf(
      run(INVOICES, ISSUED, CREATE_CREDIT_NOTE, { version: source.version }),
    )
    expect(refused.status).toBe(403)
    signInMock(ACCOUNTANT.id)
    const flow = await provider.getDocumentFlow(INVOICES, CREDITED)
    expect(
      flow.documents.map(({ resource, id }) => ({ resource, id })),
    ).toEqual([
      { resource: INVOICES, id: CREDITED },
      { resource: CREDIT_NOTES, id: "cn-c1-05" },
    ])
  })
})
