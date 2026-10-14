import { describe, expect, it } from "vitest"

import {
  addDays,
  calendarDateToDate,
  dateInputFormat,
  dateIssue,
  formatDateInput,
  isCalendarDate,
  isTime,
  maskDateDigits,
  maskTimeDigits,
  parseDateInput,
  periodRange,
  toCalendarDate,
  todayIn,
} from "@/registry/lib/dates"
import { LOCALES } from "@/registry/lib/i18n"

const UK = LOCALES.uk
const EN = LOCALES.en

describe("календарні дати", () => {
  it("перевіряє справжні дати", () => {
    expect(isCalendarDate("2026-10-13")).toBe(true)
    expect(isCalendarDate("2028-02-29")).toBe(true)
    expect(isCalendarDate("2026-02-29")).toBe(false)
    expect(isCalendarDate("2026-13-01")).toBe(false)
    expect(isCalendarDate("13.10.2026")).toBe(false)
    expect(isCalendarDate(null)).toBe(false)
  })

  it("Date календаря ↔ календарна дата без зсуву поясу", () => {
    expect(toCalendarDate(new Date(2026, 9, 13))).toBe("2026-10-13")
    expect(toCalendarDate(calendarDateToDate("2026-03-29"))).toBe("2026-03-29")
  })

  it("арифметика через межі місяців, років і перехід на літній час", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01")
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
    expect(addDays("2026-03-30", -2)).toBe("2026-03-28")
  })

  it("«сьогодні» — у заданому поясі", () => {
    // 22:30 UTC 13 жовтня — у Києві вже 14 жовтня, у Нью-Йорку ще 13-те.
    const now = new Date("2026-10-13T22:30:00Z")
    expect(todayIn("Europe/Kyiv", now)).toBe("2026-10-14")
    expect(todayIn("America/New_York", now)).toBe("2026-10-13")
  })
})

describe("пресети періодів", () => {
  // Вівторок, 13 жовтня 2026.
  const today = "2026-10-13"

  it("тижні — з понеділка", () => {
    expect(periodRange("thisWeek", today)).toEqual({
      from: "2026-10-12",
      to: "2026-10-18",
    })
    expect(periodRange("lastWeek", today)).toEqual({
      from: "2026-10-05",
      to: "2026-10-11",
    })
    // Неділя належить тижню, що почався в понеділок перед нею.
    expect(periodRange("thisWeek", "2026-10-18").from).toBe("2026-10-12")
  })

  it("місяці, квартали, роки й ковзні періоди", () => {
    expect(periodRange("today", today)).toEqual({ from: today, to: today })
    expect(periodRange("yesterday", today)).toEqual({
      from: "2026-10-12",
      to: "2026-10-12",
    })
    expect(periodRange("last7Days", today)).toEqual({
      from: "2026-10-07",
      to: today,
    })
    expect(periodRange("last30Days", today).from).toBe("2026-09-14")
    expect(periodRange("thisMonth", today)).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
    })
    expect(periodRange("lastMonth", "2026-03-31")).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    })
    expect(periodRange("thisQuarter", today)).toEqual({
      from: "2026-10-01",
      to: "2026-12-31",
    })
    expect(periodRange("lastQuarter", "2026-02-10")).toEqual({
      from: "2025-10-01",
      to: "2025-12-31",
    })
    expect(periodRange("lastYear", today)).toEqual({
      from: "2025-01-01",
      to: "2025-12-31",
    })
  })
})

describe("роки до 100", () => {
  it("рік «0026» лишається 26-м, а не 1926-м", () => {
    expect(addDays("0050-01-01", 1)).toBe("0050-01-02")
    expect(calendarDateToDate("0026-10-13").getFullYear()).toBe(26)
    expect(isCalendarDate("0026-02-29")).toBe(false)
    expect(isCalendarDate("0024-02-29")).toBe(true)
  })
})

describe("введення дати з клавіатури", () => {
  it("формат — з Intl: uk «дд.мм.рррр», en-GB «dd/mm/yyyy»", () => {
    expect(dateInputFormat(UK)).toEqual({
      separator: ".",
      order: ["day", "month", "year"],
    })
    expect(dateInputFormat(EN).separator).toBe("/")
  })

  it("маска з цифр", () => {
    expect(maskDateDigits("13", UK)).toBe("13")
    expect(maskDateDigits("131", UK)).toBe("13.1")
    expect(maskDateDigits("13102026", UK)).toBe("13.10.2026")
    expect(maskDateDigits("1310202699", EN)).toBe("13/10/2026")
  })

  it("розбирає повну й справжню дату, інакше — null", () => {
    expect(parseDateInput("13.10.2026", UK)).toBe("2026-10-13")
    expect(parseDateInput("13/10/2026", EN)).toBe("2026-10-13")
    expect(parseDateInput("31.02.2026", UK)).toBe(null)
    expect(parseDateInput("13.10.26", UK)).toBe(null)
    expect(formatDateInput("2026-01-05", UK)).toBe("05.01.2026")
    expect(formatDateInput("2026-01-05", EN)).toBe("05/01/2026")
  })

  it("час — 24 години", () => {
    expect(isTime("00:00")).toBe(true)
    expect(isTime("23:59")).toBe(true)
    expect(isTime("24:00")).toBe(false)
    expect(isTime("9:30")).toBe(false)
    expect(maskTimeDigits("143")).toBe("14:3")
    expect(maskTimeDigits("14305")).toBe("14:30")
  })
})

describe("перевірка поля дати", () => {
  it("неповне, неіснуюче, поза межами; порожнє — не помилка", () => {
    expect(dateIssue("")).toBe(null)
    expect(dateIssue("13.1")).toBe("incomplete")
    expect(dateIssue("31.02.2026")).toBe("invalid")
    expect(dateIssue("2026-10-13")).toBe(null)
    const bounds = { min: "2026-10-01", max: "2026-10-31" }
    expect(dateIssue("2026-09-30", bounds)).toBe("min")
    expect(dateIssue("2026-11-01", bounds)).toBe("max")
    expect(dateIssue("2026-10-31", bounds)).toBe(null)
  })
})
