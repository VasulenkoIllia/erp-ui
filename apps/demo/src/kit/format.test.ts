import { renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  currencyDigits,
  decimalToMinor,
  formatDate,
  formatDateRange,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRelative,
  isoWeek,
  minorToDecimal,
  pluralCategory,
  useFormat,
} from "@/registry/lib/format"
import { LOCALES } from "@/registry/lib/i18n"
import { getUserTimeZone, setUserTimeZone } from "@/registry/lib/user-timezone"

const UK = LOCALES.uk
const EN = LOCALES.en
const NBSP = " "
const KYIV = { timeZone: "Europe/Kyiv" }

describe("числа й суми", () => {
  it("uk: нерозривний пробіл у розрядах, кома в дробах", () => {
    expect(formatNumber(1234.5, UK)).toBe(`1${NBSP}234,5`)
    expect(formatNumber(1234.5, EN)).toBe("1,234.5")
    expect(formatPercent(0.2, UK)).toBe("20%")
  })

  it("гривня — «₴» після суми (SPEC §11), en — британський формат", () => {
    const money = { amount: 4_860_000, currency: "UAH" }
    expect(formatMoney(money, UK)).toBe(`48${NBSP}600,00${NBSP}₴`)
    expect(formatMoney(money, EN)).toBe("₴48,600.00")
  })

  it("інші валюти — кодом", () => {
    expect(formatMoney({ amount: 120_000, currency: "USD" }, UK)).toBe(
      `1${NBSP}200,00${NBSP}USD`,
    )
    expect(formatMoney({ amount: 120_000, currency: "usd" }, EN)).toBe(
      `USD${NBSP}1,200.00`,
    )
  })

  it("мінорні одиниці без похибок float, з урахуванням знаків валюти", () => {
    expect(minorToDecimal(4_860_050, 2)).toBe("48600.50")
    expect(minorToDecimal(-5, 2)).toBe("-0.05")
    expect(minorToDecimal(1500, 0)).toBe("1500")
    expect(currencyDigits("JPY")).toBe(0)
    expect(currencyDigits("KWD")).toBe(3)
    expect(
      formatMoney({ amount: 9_007_199_254_740_993n, currency: "UAH" }, UK),
    ).toBe(`90${NBSP}071${NBSP}992${NBSP}547${NBSP}409,93${NBSP}₴`)
    expect(() => formatMoney({ amount: 12.5, currency: "UAH" }, UK)).toThrow(
      RangeError,
    )
  })
})

describe("дати", () => {
  const instant = "2026-10-11T11:30:00Z"

  it("uk: родовий відмінок у датах, називний — у заголовку, без «р.»", () => {
    expect(formatDate(instant, "long", UK, KYIV)).toBe("11 жовтня 2026")
    expect(formatDate(instant, "dayMonth", UK, KYIV)).toBe("11 жовтня")
    expect(formatDate(instant, "monthYear", UK, KYIV)).toBe("жовтень 2026")
    expect(formatDate(instant, "medium", UK, KYIV)).toBe("11 жовт. 2026")
  })

  it("день тижня — у називному відмінку", () => {
    expect(formatDate(instant, "weekdayDayMonth", UK, KYIV)).toBe(
      "неділя, 11 жовтня",
    )
    expect(formatDate("2026-10-14", "weekdayDayMonth", UK)).toBe(
      "середа, 14 жовтня",
    )
    expect(formatDate(instant, "weekdayDayMonth", EN, KYIV)).toBe(
      "Sunday 11 October",
    )
  })

  it("явний короткий формат з чотирицифровим роком, час 24-годинний", () => {
    expect(formatDate(instant, "date", UK, KYIV)).toBe("11.10.2026")
    expect(formatDate(instant, "time", UK, KYIV)).toBe("14:30")
    expect(formatDate(instant, "dateTime", UK, KYIV)).toBe("11.10.2026, 14:30")
  })

  it("en: британські формати", () => {
    expect(formatDate(instant, "date", EN, KYIV)).toBe("11/10/2026")
    expect(formatDate(instant, "long", EN, KYIV)).toBe("11 October 2026")
    expect(formatDate(instant, "monthYear", EN, KYIV)).toBe("October 2026")
    expect(formatDate(instant, "time", EN, KYIV)).toBe("14:30")
  })

  it("календарна дата не зсувається часовим поясом", () => {
    for (const timeZone of ["Pacific/Honolulu", "Asia/Tokyo"]) {
      expect(formatDate("2026-01-01", "date", UK, { timeZone })).toBe(
        "01.01.2026",
      )
    }
  })

  it("некоректна дата — помилка, а не «Invalid Date»", () => {
    expect(() => formatDate("вчора", "date", UK)).toThrow(RangeError)
  })

  it("тиждень за ISO 8601", () => {
    expect(isoWeek("2026-10-11")).toEqual({ year: 2026, week: 41 })
    // 1 січня 2027 — п'ятниця, тож це ще 53-й тиждень 2026 року.
    expect(isoWeek("2027-01-01")).toEqual({ year: 2026, week: 53 })
    expect(isoWeek("2024-12-30")).toEqual({ year: 2025, week: 1 })
  })
})

describe("відносний час", () => {
  const now = new Date("2026-10-13T09:00:00Z")
  const at = (ms: number) => new Date(now.getTime() + ms)
  const opts = { now, timeZone: "Europe/Kyiv" }
  const min = 60_000
  const hour = 60 * min
  const day = 24 * hour

  it("uk", () => {
    expect(formatRelative(at(-30_000), UK, opts)).toBe("зараз")
    expect(formatRelative(at(-5 * min), UK, opts)).toBe("5 хвилин тому")
    expect(formatRelative(at(-3 * hour), UK, opts)).toBe("3 години тому")
    expect(formatRelative(at(-day), UK, opts)).toBe("учора")
    expect(formatRelative(at(-4 * day), UK, opts)).toBe("4 дні тому")
    expect(formatRelative(at(-12 * day), UK, opts)).toBe("1 жовтня")
    expect(formatRelative(at(-400 * day), UK, opts)).toBe("8 вересня 2025")
    expect(formatRelative(at(day), UK, opts)).toBe("завтра")
  })

  it("en", () => {
    expect(formatRelative(at(-5 * min), EN, opts)).toBe("5 minutes ago")
    expect(formatRelative(at(-day), EN, opts)).toBe("yesterday")
    expect(formatRelative(at(2 * hour), EN, opts)).toBe("in 2 hours")
  })
})

describe("множина", () => {
  it("uk: 21 і 101 — one, 22 — few, 11 і 25 — many", () => {
    const cases: [number, Intl.LDMLPluralRule][] = [
      [1, "one"],
      [2, "few"],
      [5, "many"],
      [11, "many"],
      [21, "one"],
      [22, "few"],
      [25, "many"],
      [101, "one"],
      [1.5, "other"],
    ]
    for (const [n, category] of cases)
      expect(pluralCategory(n, UK), String(n)).toBe(category)
  })
})

describe("десятковий рядок → мінорні одиниці", () => {
  it("точно, з неповним введенням і bigint", () => {
    expect(decimalToMinor("48600.5", 2)).toBe(4_860_050)
    expect(decimalToMinor("48600.", 2)).toBe(4_860_000)
    expect(decimalToMinor(".5", 2)).toBe(50)
    expect(decimalToMinor("-12.34", 2)).toBe(-1234)
    expect(decimalToMinor("1200", 0)).toBe(1200)
    expect(decimalToMinor("90071992547409.93", 2)).toBe(9_007_199_254_740_993n)
    expect(() => decimalToMinor("1.005", 2)).toThrow(RangeError)
    expect(() => decimalToMinor(".", 2)).toThrow(RangeError)
    expect(() => decimalToMinor("1,5", 2)).toThrow(RangeError)
  })
})

describe("періоди", () => {
  it("однакові частини не повторюються, без «р.»/«рр.»", () => {
    expect(formatDateRange("2026-10-01", "2026-10-13", "long", UK)).toBe(
      "1–13 жовтня 2026",
    )
    expect(formatDateRange("2026-10-01", "2027-01-05", "long", UK)).toBe(
      "1 жовтня 2026 – 5 січня 2027",
    )
    expect(formatDateRange("2026-10-01", "2026-10-13", "date", UK)).toBe(
      "01.10.2026 – 13.10.2026",
    )
    // CLDR 48 (новіший Node 22 у CI) ставить в en-GB пробіли навколо тире, CLDR 47 — ні;
    // перевіряємо суть: місяць і рік не повторюються.
    expect(formatDateRange("2026-10-01", "2026-10-13", "medium", EN)).toMatch(
      /^1\s?–\s?13\sOct\s2026$/,
    )
    expect(formatDateRange("2026-10-05", "2026-10-05", "long", UK)).toBe(
      "5 жовтня 2026",
    )
  })
})

describe("пояс користувача (SPEC §11)", () => {
  afterEach(() => {
    setUserTimeZone(undefined)
  })

  it("useFormat показує мітки часу в поясі з профілю, календарні дати — без зсуву", () => {
    const instant = "2026-10-11T22:30:00Z"
    setUserTimeZone("Europe/Kyiv")
    const { result, rerender } = renderHook(() => useFormat())
    expect(result.current.timeZone).toBe("Europe/Kyiv")
    expect(result.current.date(instant, "dateTime")).toBe("12.10.2026, 01:30")
    setUserTimeZone("Europe/Warsaw")
    rerender()
    expect(result.current.date(instant, "dateTime")).toBe("12.10.2026, 00:30")
    expect(result.current.date("2026-10-11", "date")).toBe("11.10.2026")
    // Явний пояс у виклику важливіший за пояс профілю.
    expect(
      result.current.date(instant, "time", { timeZone: "America/New_York" }),
    ).toBe("18:30")
  })

  it("відносна календарна дата — у своєму дні, навіть у поясі на захід від UTC", () => {
    setUserTimeZone("America/New_York")
    const { result } = renderHook(() => useFormat())
    // 13.10 о 10:00 у Нью-Йорку: календарна дата 13.10 — «сьогодні», а не «учора».
    const now = new Date("2026-10-13T14:00:00Z")
    expect(result.current.relative("2026-10-13", { now })).toBe("сьогодні")
    expect(result.current.relative("2026-10-12", { now })).toBe("учора")
    expect(result.current.relative("2026-09-01", { now })).toBe("1 вересня")
  })

  it("невідомий пояс ігнорується", () => {
    setUserTimeZone("Mars/Olympus")
    expect(getUserTimeZone()).toBeUndefined()
  })
})
