import { describe, expect, it } from "vitest"

import { moneyAmountSchema } from "@/registry/lib/api"
import {
  documentLineSchema,
  documentLinesSchemaFor,
  documentTotalsSchema,
  priceSchema,
  quantitySchema,
  savedDocumentLineSchema,
} from "@/registry/lib/document-lines"
import {
  computeDocumentTotals,
  type DocumentTotals,
  type Totals,
  type TotalsLine,
  type TotalsLineTax,
} from "@/registry/lib/document-totals"

const VAT_20: TotalsLineTax = { id: "vat-20", rate: 20, included: false }
const VAT_20_IN_PRICE: TotalsLineTax = {
  id: "vat-20-in",
  rate: 20,
  included: true,
}
const VAT_7: TotalsLineTax = { id: "vat-7", rate: 7, included: false }
const VAT_0: TotalsLineTax = { id: "vat-0", rate: 0, included: false }

const line = (
  quantity: string,
  price: string,
  tax: TotalsLineTax | null = null,
  discountPercent = 0,
): TotalsLine => ({ quantity, price, tax, discountPercent })

function totalsOf(lines: readonly TotalsLine[], digits = 2): DocumentTotals {
  const totals = computeDocumentTotals(lines, digits)
  if (!totals) throw new Error("Сума за межами контракту")
  return totals
}

describe("сума рядка: таблиця прикладів округлення", () => {
  const cases: readonly [string, TotalsLine, Totals][] = [
    [
      "ціна без ПДВ: податок зверху",
      line("1", "120", VAT_20),
      { amount: 12_000, discount: 0, net: 12_000, tax: 2_400, total: 14_400 },
    ],
    [
      "ціна з ПДВ: податок усередині",
      line("1", "120", VAT_20_IN_PRICE),
      { amount: 12_000, discount: 0, net: 10_000, tax: 2_000, total: 12_000 },
    ],
    [
      "половина копійки округлюється вгору",
      line("1", "0.125"),
      { amount: 13, discount: 0, net: 13, tax: 0, total: 13 },
    ],
    [
      "менше половини копійки вниз",
      line("1", "0.0049"),
      { amount: 0, discount: 0, net: 0, tax: 0, total: 0 },
    ],
    [
      "1,005 ₴: двійковий дріб дав би 1,00",
      line("1", "1.005"),
      { amount: 101, discount: 0, net: 101, tax: 0, total: 101 },
    ],
    [
      "1,5 години по 333,33 ₴",
      line("1.5", "333.33"),
      { amount: 50_000, discount: 0, net: 50_000, tax: 0, total: 50_000 },
    ],
    [
      "точна ціна 0,1234 ₴ за 1000 одиниць",
      line("1000", "0.1234"),
      { amount: 12_340, discount: 0, net: 12_340, tax: 0, total: 12_340 },
    ],
    [
      "дробова кількість з трьома знаками",
      line("0.125", "0.1234"),
      { amount: 2, discount: 0, net: 2, tax: 0, total: 2 },
    ],
    [
      "знижка округлюється окремо від суми",
      line("1", "33.33", VAT_20, 10),
      { amount: 3_333, discount: 333, net: 3_000, tax: 600, total: 3_600 },
    ],
    [
      "половина копійки у знижці",
      line("1", "0.25", null, 10),
      { amount: 25, discount: 3, net: 22, tax: 0, total: 22 },
    ],
    [
      "знижка 100 %: податку немає",
      line("2", "50", VAT_20, 100),
      { amount: 10_000, discount: 10_000, net: 0, tax: 0, total: 0 },
    ],
    [
      "знижка на ціну з ПДВ зменшує суму до оплати",
      line("1", "120", VAT_20_IN_PRICE, 10),
      {
        amount: 12_000,
        discount: 1_200,
        net: 9_000,
        tax: 1_800,
        total: 10_800,
      },
    ],
    [
      "половина копійки в податку зверху",
      line("1", "1.25", { id: "vat-10", rate: 10, included: false }),
      { amount: 125, discount: 0, net: 125, tax: 13, total: 138 },
    ],
    [
      "половина копійки в податку всередині",
      line("1", "0.99", VAT_20_IN_PRICE),
      { amount: 99, discount: 0, net: 82, tax: 17, total: 99 },
    ],
    [
      "ставка з дробом",
      line("1", "33.33", { id: "vat-7-5", rate: 7.5, included: false }),
      { amount: 3_333, discount: 0, net: 3_333, tax: 250, total: 3_583 },
    ],
    [
      "ставка 0 %",
      line("3", "10", VAT_0),
      { amount: 3_000, discount: 0, net: 3_000, tax: 0, total: 3_000 },
    ],
  ]

  it.each(cases)("%s", (_, input, expected) => {
    const { lines } = totalsOf([input])
    expect(lines).toEqual([expected])
  })

  it("без податку й із податком завжди net + tax = total", () => {
    for (const [, input] of cases) {
      const totals = totalsOf([input])
      expect(totals.net + totals.tax).toBe(totals.total)
    }
  })
})

describe("підсумки документа", () => {
  it("ПДВ округлюється за рядком: три рядки по 0,33 ₴ дають 0,21 ₴, а не 0,20 ₴", () => {
    const totals = totalsOf([
      line("1", "0.33", VAT_20),
      line("1", "0.33", VAT_20),
      line("1", "0.33", VAT_20),
    ])
    expect(totals).toMatchObject({ net: 99, tax: 21, total: 120 })
    expect(totals.taxes).toEqual([
      { taxId: "vat-20", rate: 20, included: false, net: 99, tax: 21 },
    ])
  })

  it("різні ставки, ціни з податком і без нього в одному документі", () => {
    const totals = totalsOf([
      line("1", "100", VAT_20),
      line("1", "120", VAT_20_IN_PRICE),
      line("1", "50"),
      line("1", "10", VAT_7),
    ])
    expect(totals).toMatchObject({
      amount: 28_000,
      discount: 0,
      net: 26_000,
      tax: 4_070,
      total: 30_070,
    })
    expect(totals.taxes).toEqual([
      { taxId: "vat-20", rate: 20, included: false, net: 10_000, tax: 2_000 },
      { taxId: "vat-20-in", rate: 20, included: true, net: 10_000, tax: 2_000 },
      { taxId: "vat-7", rate: 7, included: false, net: 1_000, tax: 70 },
    ])
  })

  it("стара ставка того самого податку не зливається з новою", () => {
    const totals = totalsOf([
      line("1", "100", VAT_20),
      line("1", "100", { ...VAT_20, rate: 14 }),
    ])
    expect(totals.taxes.map(({ rate, tax }) => [rate, tax])).toEqual([
      [20, 2_000],
      [14, 1_400],
    ])
  })

  it("знаки валюти: єна без копійок, кувейтський динар із трьома", () => {
    expect(totalsOf([line("1.5", "333")], 0).total).toBe(500)
    expect(totalsOf([line("1", "1.2345")], 3).total).toBe(1_235)
  })

  it("порожній документ", () => {
    expect(totalsOf([])).toEqual({
      amount: 0,
      discount: 0,
      net: 0,
      tax: 0,
      total: 0,
      lines: [],
      taxes: [],
    })
  })
})

describe("межа суми", () => {
  it("найбільша сума точна, на копійку більше — null", () => {
    const largest = totalsOf([line("1", "90071992547409.91")])
    expect(largest.total).toBe(Number.MAX_SAFE_INTEGER)
    expect(
      computeDocumentTotals([line("1", "90071992547409.92")], 2),
    ).toBeNull()
  })

  it("за межу виводить податок чи сума рядків", () => {
    const large = line("1", "60000000000000", VAT_20)
    expect(computeDocumentTotals([large], 2)).not.toBeNull()
    expect(computeDocumentTotals([large, large], 2)).toBeNull()
    expect(
      computeDocumentTotals([line("1", "90000000000000", VAT_20)], 2),
    ).toBeNull()
  })

  it("схема відхиляє кількість і ціну, разом завеликі для суми", () => {
    const row = {
      id: "1",
      name: "Послуга",
      quantity: "1000000000",
      price: "1000000000",
    }
    const schema = documentLinesSchemaFor(2)
    const result = schema.safeParse([row])
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe("out_of_range")
    expect(schema.safeParse([{ ...row, quantity: "1" }]).success).toBe(true)
  })

  it("зіпсований рядок має свою помилку, а не помилку межі", () => {
    const result = documentLinesSchemaFor(2).safeParse([
      { id: "1", name: "Послуга", quantity: "1,5", price: "10" },
    ])
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([
      [0, "quantity"],
    ])
  })
})

describe("некоректний вхід функції", () => {
  it.each(["1,5", "", "-1", "1e3", ".5", "1."])("кількість %j", (quantity) => {
    expect(() => computeDocumentTotals([line(quantity, "1")], 2)).toThrow(
      RangeError,
    )
  })

  it.each([101, -1, Number.NaN])("знижка %d", (discount) => {
    expect(() =>
      computeDocumentTotals([line("1", "1", null, discount)], 2),
    ).toThrow(RangeError)
  })
})

describe("контракт", () => {
  it("сума: ціле JSON-число в межах безпечного цілого", () => {
    for (const amount of [
      0,
      -1,
      Number.MAX_SAFE_INTEGER,
      -Number.MAX_SAFE_INTEGER,
    ])
      expect(moneyAmountSchema.safeParse(amount).success).toBe(true)
    for (const amount of [
      Number.MAX_SAFE_INTEGER + 1,
      -Number.MAX_SAFE_INTEGER - 1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      "100",
      100n,
      null,
    ])
      expect(moneyAmountSchema.safeParse(amount).success).toBe(false)
  })

  it("кількість: десятковий рядок більше нуля, до трьох знаків", () => {
    for (const quantity of ["1", "1.5", "0.001", "1.500", "100000"])
      expect(quantitySchema.safeParse(quantity).success).toBe(true)
    for (const quantity of [
      "0",
      "0.000",
      "1.2345",
      "1,5",
      ".5",
      "1.",
      "-1",
      "01",
      "1e3",
      " 1",
      "1".repeat(16),
      1.5,
    ])
      expect(quantitySchema.safeParse(quantity).success).toBe(false)
  })

  it("ціна: десятковий рядок від нуля, до чотирьох знаків", () => {
    for (const price of ["0", "0.1234", "12.5", "48600.00"])
      expect(priceSchema.safeParse(price).success).toBe(true)
    for (const price of ["0.12345", "-1", "1,5", 12.5])
      expect(priceSchema.safeParse(price).success).toBe(false)
  })

  it("рядок: вільний текст без запису й довідників", () => {
    expect(
      documentLineSchema.parse({
        id: "1",
        name: " Консультація ",
        quantity: "1.5",
        price: "1000",
      }),
    ).toEqual({
      id: "1",
      name: "Консультація",
      itemId: null,
      quantity: "1.5",
      unitId: null,
      unitName: null,
      price: "1000",
      discountPercent: 0,
      tax: null,
    })
  })

  it("рядок: знижка й ставка до двох знаків, знімок податку з назвою", () => {
    const row = { id: "1", name: "Товар", quantity: "1", price: "10" }
    const tax = { ...VAT_20, name: "ПДВ 20 %" }
    expect(documentLineSchema.parse({ ...row, tax }).tax).toEqual(tax)
    for (const bad of [
      { discountPercent: 100.01 },
      { discountPercent: -1 },
      { discountPercent: 1.005 },
      { tax: { ...tax, rate: 101 } },
      { tax: VAT_20 },
    ])
      expect(documentLineSchema.safeParse({ ...row, ...bad }).success).toBe(
        false,
      )
  })

  it("відповідь сервера розбирається тими самими схемами, що й розрахунок", () => {
    const input = documentLineSchema.parse({
      id: "1",
      name: "Товар",
      quantity: "2",
      price: "10.5",
      tax: { ...VAT_20, name: "ПДВ 20 %" },
    })
    const totals = totalsOf([input])
    expect(documentTotalsSchema.parse(totals)).toEqual({
      amount: totals.amount,
      discount: totals.discount,
      net: totals.net,
      tax: totals.tax,
      total: totals.total,
      taxes: totals.taxes,
    })
    expect(
      savedDocumentLineSchema.parse({ ...input, ...totals.lines[0] }),
    ).toMatchObject({ net: 2_100, tax: 420, total: 2_520 })
  })

  it("сума поза межами в підсумках сервера не проходить схему", () => {
    const totals = totalsOf([line("1", "10")])
    expect(
      documentTotalsSchema.safeParse({
        ...totals,
        total: Number.MAX_SAFE_INTEGER + 1,
      }).success,
    ).toBe(false)
    expect(
      documentTotalsSchema.safeParse({ ...totals, net: "1000" }).success,
    ).toBe(false)
  })
})
