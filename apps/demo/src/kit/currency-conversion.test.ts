import { describe, expect, it } from "vitest"

import {
  convertMinorAmount,
  documentExchangeOf,
  documentExchangeSchema,
} from "@/registry/lib/currency-conversion"

/**
 * Сума документа в базовій валюті (ADR-0071, крок K2b): таблиця прикладів правила округлення сервера —
 * підсумок × курс, половина мінорної одиниці від нуля, знаки валют з ISO 4217.
 */
describe("lib/currency-conversion: перерахунок за курсом", () => {
  it.each([
    // [сума, з, курс, у, результат] — мінорні одиниці.
    [100_000, "USD", 41.2534, "UAH", 4_125_340], // 1 000,00 $ → 41 253,40 ₴
    [100_000, "EUR", 48.1, "UAH", 4_810_000],
    [1, "USD", 0.5, "UAH", 1], // 0,005 ₴ — половина від нуля
    [-1, "USD", 0.5, "UAH", -1], // сторно: те саме з мінусом
    [1, "USD", 0.4999, "UAH", 0], // менше за половину — вниз
    [0, "USD", 41.25, "UAH", 0],
    [1_000, "JPY", 0.27, "UAH", 27_000], // ієна без копійок: 1 000 ¥ → 270,00 ₴
    [100_000, "UAH", 0.0074, "KWD", 7_400], // три знаки динара: 1 000,00 ₴ → 7,400
    [100_000_000, "USD", 0.000001, "UAH", 100], // шостий знак курсу береться
  ])("%i %s × %f → %i %s", (amount, from, rate, to, expected) => {
    expect(convertMinorAmount(amount, from, rate, to)).toBe(expected)
  })

  it("сторно гасить документ до копійки: від'ємна сума — та сама величина з мінусом", () => {
    const amount = 123_457
    expect(convertMinorAmount(-amount, "USD", 41.3851, "UAH")).toBe(
      -convertMinorAmount(amount, "USD", 41.3851, "UAH"),
    )
  })

  it("некоректний курс чи сума — RangeError, а не тиха помилка", () => {
    for (const rate of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1e-7])
      expect(() => convertMinorAmount(100, "USD", rate, "UAH")).toThrow(
        RangeError,
      )
    expect(() => convertMinorAmount(1.5, "USD", 41, "UAH")).toThrow(RangeError)
    expect(() =>
      convertMinorAmount(Number.MAX_SAFE_INTEGER, "USD", 41, "UAH"),
    ).toThrow(RangeError)
  })

  it("documentExchangeOf: базова валюта — null; без курсу — порожні курс і сума; з курсом — сума в базовій", () => {
    expect(
      documentExchangeOf({ currency: "UAH", total: 100 }, "UAH", null),
    ).toBeNull()
    expect(
      documentExchangeOf({ currency: "PLN", total: 100 }, "UAH", null),
    ).toEqual({
      baseCurrency: "UAH",
      rate: null,
      rateDate: null,
      baseTotal: null,
    })
    const exchange = documentExchangeOf(
      { currency: "USD", total: 100_000 },
      "UAH",
      { rate: 41.25, date: "2026-11-07" },
    )
    expect(exchange).toEqual({
      baseCurrency: "UAH",
      rate: 41.25,
      rateDate: "2026-11-07",
      baseTotal: 4_125_000,
    })
    expect(documentExchangeSchema.parse(exchange)).toEqual(exchange)
  })

  it("схема контракту: курс більше за нуль, дата календарна, сума ціла", () => {
    const valid = {
      baseCurrency: "UAH",
      rate: 41.25,
      rateDate: "2026-11-08",
      baseTotal: 100,
    }
    expect(documentExchangeSchema.safeParse(valid).success).toBe(true)
    for (const broken of [
      { ...valid, rate: 0 },
      { ...valid, rateDate: "08.11.2026" },
      { ...valid, baseTotal: 1.5 },
      { ...valid, baseCurrency: "UA" },
    ])
      expect(documentExchangeSchema.safeParse(broken).success).toBe(false)
  })
})
