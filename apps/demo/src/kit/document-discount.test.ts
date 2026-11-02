import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  documentBodySchemaFor,
  documentLineSchema,
  documentLinesSchemaFor,
} from "@/registry/lib/document-lines"
import {
  computeDocumentTotals,
  documentTotalsIssue,
} from "@/registry/lib/document-totals"

import {
  line,
  ROW,
  shares,
  totalsOf,
  VAT_20,
  VAT_20_IN_PRICE,
  VAT_7,
} from "./document-totals.fixtures"

/** Знижка сумою й знижка документа (ADR-0059): розрахунок і схеми контракту. */

describe("знижка сумою і знижка документа", () => {
  it.each([
    [
      "знижка сумою на весь рядок, а не на одиницю",
      line("3", "100", VAT_20, 0, 5_000),
      {
        amount: 30_000,
        discount: 5_000,
        documentDiscount: 0,
        net: 25_000,
        tax: 5_000,
        total: 30_000,
      },
    ],
    [
      "знижка сумою на ціну з ПДВ",
      line("1", "120", VAT_20_IN_PRICE, 0, 2_000),
      {
        amount: 12_000,
        discount: 2_000,
        documentDiscount: 0,
        net: 8_333,
        tax: 1_667,
        total: 10_000,
      },
    ],
    [
      "знижка сумою на всю суму рядка",
      line("1", "10", VAT_20, 0, 1_000),
      {
        amount: 1_000,
        discount: 1_000,
        documentDiscount: 0,
        net: 0,
        tax: 0,
        total: 0,
      },
    ],
  ] as const)("%s", (_, input, expected) => {
    expect(totalsOf([input]).lines).toEqual([expected])
  })

  it("10 % на документ ділиться між рядками й зменшує базу ПДВ", () => {
    const totals = totalsOf([line("1", "100", VAT_20), line("1", "50")], 2, {
      discountPercent: 10,
      discountAmount: 0,
    })
    expect(shares(totals)).toEqual([1_000, 500])
    expect(totals.lines[0]).toMatchObject({ net: 9_000, tax: 1_800 })
    expect(totals).toMatchObject({
      amount: 15_000,
      discount: 1_500,
      documentDiscount: 1_500,
      net: 13_500,
      tax: 1_800,
      total: 15_300,
    })
  })

  it("знижка документа рахується від суми після знижки рядка", () => {
    const totals = totalsOf([line("1", "100", null, 10)], 2, {
      discountPercent: 5,
      discountAmount: 0,
    })
    expect(totals).toMatchObject({
      discount: 1_450,
      documentDiscount: 450,
      total: 8_550,
    })
  })

  it("знижка документа на ціни з ПДВ зменшує і податок у ціні", () => {
    const totals = totalsOf([line("1", "120", VAT_20_IN_PRICE)], 2, {
      discountPercent: 10,
      discountAmount: 0,
    })
    expect(totals).toMatchObject({ net: 9_000, tax: 1_800, total: 10_800 })
  })

  it("копійки залишку — найдорожчому рядку", () => {
    const totals = totalsOf(
      [line("1", "10"), line("1", "20"), line("1", "70.01")],
      2,
      { discountPercent: 0, discountAmount: 1_000 },
    )
    // Пропорційно 99,99 / 199,98 / 700,03 копійки: вниз 99 / 199 / 700, ще 2 — найдорожчому.
    expect(shares(totals)).toEqual([99, 199, 702])
    expect(totals.documentDiscount).toBe(1_000)
  })

  it("за рівних сум копійки отримує перший із найдорожчих", () => {
    const totals = totalsOf(
      [line("1", "100"), line("1", "100"), line("1", "100")],
      2,
      { discountPercent: 0, discountAmount: 10_000 },
    )
    expect(shares(totals)).toEqual([3_334, 3_333, 3_333])
  })

  it("частка не більша за суму рядка: зайві копійки йдуть далі", () => {
    const totals = totalsOf(
      [line("1", "0.01"), line("1", "0.01"), line("1", "0.01")],
      2,
      { discountPercent: 0, discountAmount: 2 },
    )
    expect(shares(totals)).toEqual([1, 1, 0])
    expect(totals.lines.map((row) => row.total)).toEqual([0, 0, 1])
  })

  it("рядок без суми не отримує частки, документ без суми — знижки 0 %", () => {
    expect(
      shares(
        totalsOf([line("1", "0"), line("1", "10")], 2, {
          discountPercent: 0,
          discountAmount: 500,
        }),
      ),
    ).toEqual([0, 500])
    expect(
      totalsOf([line("1", "0")], 2, { discountPercent: 50, discountAmount: 0 })
        .total,
    ).toBe(0)
  })

  it("у будь-якому поєднанні частки складаються в знижку документа", () => {
    const lines = ["0.01", "0.99", "33.33", "1234.5678"].flatMap((price) =>
      [0, 15].flatMap((discount) =>
        [null, VAT_20, VAT_20_IN_PRICE, VAT_7].map((tax) =>
          line("1.5", price, tax, discount),
        ),
      ),
    )
    for (const discount of [
      { discountPercent: 33.33, discountAmount: 0 },
      { discountPercent: 0, discountAmount: 12_345 },
      { discountPercent: 100, discountAmount: 0 },
    ]) {
      const totals = totalsOf(lines, 2, discount)
      expect(
        totals.lines.reduce((sum, row) => sum + row.documentDiscount, 0),
      ).toBe(totals.documentDiscount)
      for (const row of totals.lines) {
        expect(row.net + row.tax).toBe(row.total)
        expect(row.discount).toBeLessThanOrEqual(row.amount)
      }
      expect(totals.net + totals.tax).toBe(totals.total)
    }
  })

  it("знижка сумою більша за свою суму: причина й null", () => {
    const lines = [line("1", "10"), line("1", "10", null, 0, 1_001)]
    expect(documentTotalsIssue(lines, 2)).toEqual({
      code: "discount_exceeds",
      line: 1,
    })
    expect(computeDocumentTotals(lines, 2)).toBeNull()
    const discount = { discountPercent: 0, discountAmount: 1_001 }
    expect(documentTotalsIssue([line("1", "10")], 2, discount)).toEqual({
      code: "discount_exceeds",
      line: null,
    })
    expect(documentTotalsIssue([line("1", "10")], 2)).toBeNull()
  })

  it("знижка і відсотком, і сумою — помилка коду", () => {
    expect(() =>
      computeDocumentTotals([line("1", "10", null, 10, 100)], 2),
    ).toThrow(RangeError)
    expect(() =>
      computeDocumentTotals([line("1", "10")], 2, {
        discountPercent: 10,
        discountAmount: 100,
      }),
    ).toThrow(RangeError)
  })

  it.each([-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    "знижка сумою %d — помилка коду",
    (discountAmount) => {
      expect(() =>
        computeDocumentTotals([line("1", "10", null, 0, discountAmount)], 2),
      ).toThrow(RangeError)
    },
  )
})

describe("схеми знижки", () => {
  it("рядок: знижка відсотком або сумою, друга — помилка на полі суми", () => {
    expect(
      documentLineSchema.safeParse({ ...ROW, discountAmount: 500 }).success,
    ).toBe(true)
    const result = documentLineSchema.safeParse({
      ...ROW,
      discountPercent: 10,
      discountAmount: 500,
    })
    expect(
      result.error?.issues.map(({ path, message }) => [path, message]),
    ).toEqual([[["discountAmount"], "discount_both"]])
    for (const discountAmount of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1])
      expect(
        documentLineSchema.safeParse({ ...ROW, discountAmount }).success,
      ).toBe(false)
  })

  it("рядки: знижка сумою понад суму рядка — на її полі", () => {
    const result = documentLinesSchemaFor(2).safeParse([
      ROW,
      { ...ROW, discountAmount: 1_001 },
    ])
    expect(
      result.error?.issues.map(({ path, message }) => [path, message]),
    ).toEqual([[[1, "discountAmount"], "discount_exceeds"]])
    expect(
      documentLinesSchemaFor(2).safeParse([{ ...ROW, discountAmount: 1_000 }])
        .success,
    ).toBe(true)
  })

  it("рядки: знижка кожного рядка перевіряється, хоч інший рядок зіпсований", () => {
    const result = documentLinesSchemaFor(2).safeParse([
      { ...ROW, quantity: "0" },
      { ...ROW, discountAmount: 1_001 },
      { ...ROW, discountAmount: 2_000 },
    ])
    expect(
      result.error?.issues.map(({ path, message }) => [path, message]),
    ).toEqual([
      [[0, "quantity"], "positive"],
      [[1, "discountAmount"], "discount_exceeds"],
      [[2, "discountAmount"], "discount_exceeds"],
    ])
  })

  it("тіло документа: знижка документа понад суму рядків і шапка модуля", () => {
    const schema = documentBodySchemaFor(2).safeExtend({ client: z.string() })
    const body = { client: "ТОВ «Приклад»", lines: [ROW], discountPercent: 0 }
    expect(schema.safeParse({ ...body, discountAmount: 1_000 }).success).toBe(
      true,
    )
    const over = schema.safeParse({ ...body, discountAmount: 1_001 })
    expect(
      over.error?.issues.map(({ path, message }) => [path, message]),
    ).toEqual([[["discountAmount"], "discount_exceeds"]])
    const both = schema.safeParse({
      ...body,
      discountPercent: 5,
      discountAmount: 100,
    })
    expect(both.error?.issues.map(({ message }) => message)).toEqual([
      "discount_both",
    ])
    // Порожня шапка модуля не вимикає перевірку знижки документа.
    const header = schema.safeParse({
      ...body,
      client: 1,
      discountAmount: 1_001,
    })
    expect(
      header.error?.issues.map(({ path, message }) => [path[0], message]),
    ).toEqual([
      ["client", expect.any(String)],
      ["discountAmount", "discount_exceeds"],
    ])
    // Зіпсований рядок: знижку документа не перевіряємо, помилка лише рядка.
    const broken = schema.safeParse({
      ...body,
      lines: [{ ...ROW, quantity: "0" }],
      discountAmount: 1_001,
    })
    expect(broken.error?.issues.map(({ message }) => message)).toEqual([
      "positive",
    ])
  })
})
