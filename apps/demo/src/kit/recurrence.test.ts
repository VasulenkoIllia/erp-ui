import { describe, expect, it } from "vitest"

import { instantIn } from "@/registry/lib/dates"
import {
  formatRecurrenceRule,
  parseRecurrenceRule,
  recurrenceOccurrences,
  recurrenceSchema,
  recurrenceSkip,
  type RecurrenceRule,
} from "@/registry/lib/recurrence"
import {
  isRecurrenceUntilBeforeStart,
  recurrenceDraft,
  recurrenceDraftSchema,
  recurrenceFromDraft,
  recurrenceRuleOfDraft,
} from "@/registry/lib/recurrence-draft"

const KYIV = "Europe/Kyiv"
const day = (start: string) => ({ start, timeZone: KYIV })

describe("instantIn", () => {
  it("час на годиннику поясу — мить UTC", () => {
    expect(instantIn("2026-12-07", "09:00", KYIV).toISOString()).toBe(
      "2026-12-07T07:00:00.000Z",
    )
    expect(instantIn("2026-07-06", "09:00", KYIV).toISOString()).toBe(
      "2026-07-06T06:00:00.000Z",
    )
  })

  it("часу, якого немає, — зсув до переходу, як RFC 5545", () => {
    // 29.03.2026 о 03:00 у Києві годинник іде на 04:00: 03:30 немає.
    expect(instantIn("2026-03-29", "03:30", KYIV).toISOString()).toBe(
      "2026-03-29T01:30:00.000Z",
    )
  })

  it("час, що буває двічі, — перший", () => {
    // 25.10.2026 о 04:00 годинник іде на 03:00: 03:30 буває двічі.
    expect(instantIn("2026-10-25", "03:30", KYIV).toISOString()).toBe(
      "2026-10-25T00:30:00.000Z",
    )
  })
})

describe("parseRecurrenceRule і formatRecurrenceRule", () => {
  const cases: [string, string, RecurrenceRule][] = [
    ["2026-12-01", "FREQ=DAILY", { frequency: "daily", interval: 1 }],
    [
      "2026-12-07",
      "FREQ=WEEKLY;BYDAY=MO",
      { frequency: "weekly", interval: 1, weekdays: ["MO"] },
    ],
    [
      "2026-12-05",
      "FREQ=MONTHLY;BYMONTHDAY=5;COUNT=10",
      { frequency: "monthly", interval: 1, monthDay: 5, count: 10 },
    ],
    [
      "2026-12-07",
      "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR;UNTIL=20270331",
      {
        frequency: "weekly",
        interval: 2,
        weekdays: ["MO", "WE", "FR"],
        until: "2027-03-31",
      },
    ],
    [
      "2026-01-31",
      "FREQ=MONTHLY;BYMONTHDAY=-1",
      { frequency: "monthly", interval: 1, monthDay: -1 },
    ],
    [
      "2028-02-29",
      "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29",
      { frequency: "yearly", interval: 1, month: 2, monthDay: 29 },
    ],
  ]

  it.each(cases)("%s %s читається й пишеться назад", (start, text, rule) => {
    expect(parseRecurrenceRule(text, day(start))).toEqual(rule)
    expect(formatRecurrenceRule(rule, day(start))).toBe(text)
  })

  it("UNTIL з часом — кінець дня в поясі правила, у UTC", () => {
    const rule: RecurrenceRule = {
      frequency: "weekly",
      interval: 1,
      weekdays: ["MO"],
      until: "2026-12-28",
    }
    const text = formatRecurrenceRule(rule, day("2026-12-07T09:00"))
    expect(text).toBe("FREQ=WEEKLY;BYDAY=MO;UNTIL=20261228T215959Z")
    expect(parseRecurrenceRule(text, day("2026-12-07T09:00"))).toEqual(rule)
  })

  it("частини, яких немає, беруться з першого дня, як RFC 5545", () => {
    expect(parseRecurrenceRule("RRULE:freq=weekly", day("2026-12-09"))).toEqual(
      { frequency: "weekly", interval: 1, weekdays: ["WE"] },
    )
    expect(parseRecurrenceRule("FREQ=YEARLY", day("2026-12-05"))).toEqual({
      frequency: "yearly",
      interval: 1,
      month: 12,
      monthDay: 5,
    })
  })

  it.each([
    "FREQ=MONTHLY;BYDAY=2TU",
    "FREQ=WEEKLY;BYDAY=1MO",
    "FREQ=HOURLY",
    "FREQ=DAILY;BYHOUR=9",
    "FREQ=DAILY;COUNT=3;UNTIL=20261231",
    "FREQ=DAILY;INTERVAL=0",
    "FREQ=DAILY;INTERVAL=100",
    "FREQ=DAILY;COUNT=1000",
    "FREQ=MONTHLY;BYMONTHDAY=5,20",
    "FREQ=MONTHLY;BYMONTHDAY=-2",
    "FREQ=YEARLY;BYMONTHDAY=5",
    "FREQ=YEARLY;BYMONTH=4;BYMONTHDAY=31",
    "FREQ=WEEKLY;INTERVAL=2;WKST=SU",
    "FREQ=DAILY;FREQ=DAILY",
    "FREQ=DAILY;UNTIL=20260230",
    "FREQ=DAILY;BYDAY=",
    "FREQ=WEEKLY;WKST=",
    "FREQ=MONTHLY;BYMONTHDAY=",
    "FREQ=DAILY;;COUNT=3",
    "",
  ])("%s — поза підмножиною", (text) => {
    expect(parseRecurrenceRule(text, day("2026-12-01"))).toBeNull()
  })

  it("хибний пояс чи перший день — не читається", () => {
    expect(
      parseRecurrenceRule("FREQ=DAILY", {
        start: "2026-12-01",
        timeZone: "Mars/Base",
      }),
    ).toBeNull()
    expect(
      parseRecurrenceRule("FREQ=DAILY", day("2026-12-01T25:00")),
    ).toBeNull()
  })

  it("дні тижня — від понеділка без повторів; правило поза межами — помилка програми", () => {
    expect(
      formatRecurrenceRule(
        { frequency: "weekly", interval: 1, weekdays: ["FR", "MO", "FR"] },
        day("2026-12-07"),
      ),
    ).toBe("FREQ=WEEKLY;BYDAY=MO,FR")
    expect(() =>
      formatRecurrenceRule(
        { frequency: "daily", interval: 0 },
        day("2026-12-07"),
      ),
    ).toThrow(RangeError)
    expect(() =>
      formatRecurrenceRule(
        { frequency: "yearly", interval: 1, month: 4, monthDay: 31 },
        day("2026-12-07"),
      ),
    ).toThrow(RangeError)
  })

  it("WKST не з понеділка можна, коли дні не залежать від початку тижня", () => {
    expect(
      parseRecurrenceRule("FREQ=WEEKLY;BYDAY=MO;WKST=SU", day("2026-12-07")),
    ).toEqual({ frequency: "weekly", interval: 1, weekdays: ["MO"] })
  })
})

describe("recurrenceOccurrences", () => {
  const occurrences = (start: string, rule: string, limit = 5, from?: string) =>
    recurrenceOccurrences({ start, rule, timeZone: KYIV }, { limit, from }).map(
      (item) => item.at ?? item.date,
    )

  it("щомісяця 31-го пропускає місяці без 31-го числа", () => {
    expect(occurrences("2027-01-31", "FREQ=MONTHLY;BYMONTHDAY=31")).toEqual([
      "2027-01-31",
      "2027-03-31",
      "2027-05-31",
      "2027-07-31",
      "2027-08-31",
    ])
  })

  it("останній день місяця — щомісяця, і в лютому теж", () => {
    expect(occurrences("2028-01-31", "FREQ=MONTHLY;BYMONTHDAY=-1", 3)).toEqual([
      "2028-01-31",
      "2028-02-29",
      "2028-03-31",
    ])
  })

  it("щороку 29 лютого — лише у високосні роки", () => {
    expect(
      occurrences("2028-02-29", "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29", 3),
    ).toEqual(["2028-02-29", "2032-02-29", "2036-02-29"])
  })

  it("кожні два тижні в понеділок і п'ятницю, N разів", () => {
    expect(
      occurrences("2026-12-07", "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR;COUNT=3"),
    ).toEqual(["2026-12-07", "2026-12-11", "2026-12-21"])
  })

  it("до дати — включно", () => {
    expect(occurrences("2026-12-29", "FREQ=DAILY;UNTIL=20261231")).toEqual([
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
    ])
  })

  it("перший день, що не підходить, — не повторення, і COUNT його не рахує", () => {
    // 05.12.2026 — субота.
    expect(occurrences("2026-12-05", "FREQ=WEEKLY;BYDAY=MO;COUNT=2")).toEqual([
      "2026-12-07",
      "2026-12-14",
    ])
  })

  it.each([
    ["2024-01-01", "FREQ=DAILY;INTERVAL=3"],
    ["2025-03-05", "FREQ=WEEKLY;INTERVAL=3;BYDAY=MO,WE,SU"],
    ["2025-03-09", "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,SA"],
    ["2024-01-31", "FREQ=MONTHLY;INTERVAL=5;BYMONTHDAY=31"],
    ["2020-02-29", "FREQ=YEARLY;INTERVAL=3;BYMONTH=2;BYMONTHDAY=29"],
  ])(
    "%s %s: найближчі від дати — ті самі, що й перебором від першого дня",
    (start, rule) => {
      const from = "2026-12-01"
      const all = occurrences(start, rule, 1000)
      expect(occurrences(start, rule, 3, from)).toEqual(
        all.filter((date) => date >= from).slice(0, 3),
      )
    },
  )

  it("перший день сто років тому: найближчі від дати без перебору всієї серії", () => {
    expect(
      occurrences("1900-01-01", "FREQ=DAILY;INTERVAL=3", 2, "2026-12-01"),
    ).toEqual(["2026-12-02", "2026-12-05"])
  })

  it("правило без жодного дня й межі року: порожньо, без винятку", () => {
    // Щомісяця 30-го раз на рік від лютого — лише лютий, а 30 лютого не буває.
    expect(
      occurrences("2027-02-01", "FREQ=MONTHLY;INTERVAL=12;BYMONTHDAY=30"),
    ).toEqual([])
    expect(occurrences("9999-12-20", "FREQ=WEEKLY", 3)).toEqual([
      "9999-12-20",
      "9999-12-27",
    ])
    expect(occurrences("2026-12-01", "FREQ=DAILY", 0)).toEqual([])
    expect(occurrences("2026-12-01", "FREQ=DAILY", 5000)).toHaveLength(1000)
    expect(
      recurrenceOccurrences(
        { start: "2026-12-01", rule: "FREQ=DAILY", timeZone: "Mars/Base" },
        { limit: 3 },
      ),
    ).toEqual([])
  })

  it("найближчі від дати: COUNT рахує від першого дня", () => {
    expect(
      occurrences("2026-12-01", "FREQ=DAILY;COUNT=5", 5, "2026-12-04"),
    ).toEqual(["2026-12-04", "2026-12-05"])
  })

  it("з часом — 09:00 на годиннику поясу і після переходу на літній час", () => {
    expect(
      recurrenceOccurrences(
        {
          start: "2027-03-22T09:00",
          rule: "FREQ=WEEKLY;BYDAY=MO",
          timeZone: KYIV,
        },
        { limit: 2 },
      ),
    ).toEqual([
      { date: "2027-03-22", at: "2027-03-22T07:00:00.000Z" },
      { date: "2027-03-29", at: "2027-03-29T06:00:00.000Z" },
    ])
  })

  it("правило поза підмножиною чи без днів — порожньо", () => {
    expect(occurrences("2026-12-01", "FREQ=MONTHLY;BYDAY=2TU")).toEqual([])
    expect(occurrences("2026-12-10", "FREQ=DAILY;UNTIL=20261201")).toEqual([])
  })
})

describe("recurrenceSkip", () => {
  it.each([
    [
      { frequency: "monthly", interval: 1, monthDay: 31 },
      "2027-01-31",
      "shortMonths",
    ],
    [
      { frequency: "monthly", interval: 1, monthDay: 30 },
      "2027-01-30",
      "february",
    ],
    [
      { frequency: "monthly", interval: 1, monthDay: 29 },
      "2027-01-29",
      "februaryNonLeap",
    ],
    [{ frequency: "monthly", interval: 1, monthDay: 28 }, "2027-01-28", null],
    // Кожні 2 місяці від січня: січень, березень, травень… — лютого немає.
    [{ frequency: "monthly", interval: 2, monthDay: 30 }, "2027-01-30", null],
    // Кожні 2 місяці 31-го від січня: з коротких лише вересень і листопад.
    [
      { frequency: "monthly", interval: 2, monthDay: 31 },
      "2027-01-31",
      "shortMonths",
    ],
    // Раз на рік від січня — лише січень.
    [{ frequency: "monthly", interval: 12, monthDay: 31 }, "2027-01-31", null],
    [
      { frequency: "monthly", interval: 12, monthDay: 31 },
      "2027-02-01",
      "february",
    ],
    [
      { frequency: "yearly", interval: 1, month: 2, monthDay: 29 },
      "2028-02-29",
      "leapYears",
    ],
    [
      { frequency: "yearly", interval: 1, month: 3, monthDay: 31 },
      "2027-03-31",
      null,
    ],
  ] as const)("%j від %s — %s", (rule, start, skip) => {
    expect(recurrenceSkip(rule, start)).toBe(skip)
  })
})

describe("recurrenceSchema", () => {
  it("приймає правило з підмножини", () => {
    expect(
      recurrenceSchema.safeParse({
        start: "2026-12-07T09:00",
        rule: "FREQ=WEEKLY;BYDAY=MO",
        timeZone: KYIV,
      }).success,
    ).toBe(true)
  })

  it.each([
    [{ start: "2026-12-07T9:00", rule: "FREQ=DAILY", timeZone: KYIV }, "start"],
    [
      { start: "2026-12-07", rule: "FREQ=DAILY", timeZone: "Mars/Base" },
      "timeZone",
    ],
    [
      { start: "2026-12-07", rule: "FREQ=MONTHLY;BYDAY=2TU", timeZone: KYIV },
      "rule",
    ],
    [
      {
        start: "2026-12-07",
        rule: "FREQ=DAILY;UNTIL=20261201",
        timeZone: KYIV,
      },
      "rule",
    ],
    [{ start: "2026-12-07", rule: "freq=daily", timeZone: KYIV }, "rule"],
    [{ start: "2026-12-07", rule: "RRULE:FREQ=DAILY", timeZone: KYIV }, "rule"],
    [{ start: "2026-12-07", rule: " FREQ=DAILY", timeZone: KYIV }, "rule"],
    [
      { start: "2026-12-07", rule: "FREQ=DAILY;BYDAY=", timeZone: KYIV },
      "rule",
    ],
    [
      { start: "2026-12-07", rule: "FREQ=DAILY", timeZone: "europe/kyiv" },
      "timeZone",
    ],
    [
      { start: "2026-12-07", rule: "FREQ=DAILY", timeZone: "+02:00" },
      "timeZone",
    ],
  ])("%j — помилка в %s", (value, field) => {
    const result = recurrenceSchema.safeParse(value)
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toEqual([field])
  })

  it("код помилки — у тексті", () => {
    const codes = (value: Record<string, string>) =>
      recurrenceSchema
        .safeParse(value)
        .error?.issues.map((issue) => issue.message)
    expect(
      codes({
        start: "2026-12-07",
        rule: "FREQ=DAILY;UNTIL=20261201",
        timeZone: KYIV,
      }),
    ).toEqual(["until_before_start"])
    expect(
      codes({
        start: "2026-12-07",
        rule: "FREQ=HOURLY",
        timeZone: "Mars/Base",
      }),
    ).toEqual(["invalid_time_zone"])
    expect(
      codes({ start: "07.12.2026", rule: "FREQ=DAILY", timeZone: KYIV }),
    ).toEqual(["invalid_start"])
  })
})

describe("чернетка форми", () => {
  const MESSAGES = {
    frequency: "frequency",
    interval: "interval",
    weekdays: "weekdays",
    monthDay: "monthDay",
    until: (value: string) => `until:${value}`,
    count: "count",
  }
  const schema = recurrenceDraftSchema(MESSAGES)

  it("без повтору — поля з першого дня", () => {
    expect(recurrenceDraft(null, "2026-12-09")).toMatchObject({
      frequency: "none",
      weekdays: ["WE"],
      monthDay: 9,
      month: 12,
    })
  })

  it.each([
    ["2026-12-05", "FREQ=MONTHLY;BYMONTHDAY=5;COUNT=10"],
    [
      "2026-12-07T09:00",
      "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;UNTIL=20270131T215959Z",
    ],
    ["2028-02-29", "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29"],
    ["2026-12-01", "FREQ=DAILY;INTERVAL=3"],
  ])("%s %s — у форму й назад без змін", (start, rule) => {
    const recurrence = { start, rule, timeZone: KYIV }
    const draft = recurrenceDraft(recurrence, start)
    expect(schema.safeParse(draft).success).toBe(true)
    expect(recurrenceFromDraft(draft, { start, timeZone: KYIV })).toEqual(
      recurrence,
    )
  })

  it("правило поза підмножиною лишається, як було", () => {
    const recurrence = {
      start: "2026-12-08",
      rule: "FREQ=MONTHLY;BYDAY=2TU",
      timeZone: KYIV,
    }
    const draft = recurrenceDraft(recurrence, "2026-12-08")
    expect(draft.frequency).toBe("custom")
    expect(
      recurrenceFromDraft(draft, { start: "2026-12-08", timeZone: KYIV }),
    ).toEqual(recurrence)
  })

  it("помилки — біля полів", () => {
    const draft = {
      ...recurrenceDraft(null, "2026-12-07"),
      frequency: "weekly" as const,
      interval: 0,
      weekdays: [],
      end: "count" as const,
      count: null,
    }
    const issues = schema.safeParse(draft).error?.issues ?? []
    expect(issues.map((issue) => [issue.path[0], issue.message])).toEqual([
      ["interval", "interval"],
      ["weekdays", "weekdays"],
      ["count", "count"],
    ])
    expect(recurrenceRuleOfDraft(draft)).toBeNull()
    expect(() =>
      recurrenceFromDraft(draft, { start: "2026-12-07", timeZone: KYIV }),
    ).toThrow(RangeError)
  })

  it("щороку день, якого в місяці немає, і неповна дата кінця", () => {
    const draft = {
      ...recurrenceDraft(null, "2026-12-07"),
      frequency: "yearly" as const,
      month: 4,
      monthDay: 31,
      end: "until" as const,
      until: "2026-12",
    }
    const issues = schema.safeParse(draft).error?.issues ?? []
    expect(issues.map((issue) => [issue.path[0], issue.message])).toEqual([
      ["monthDay", "monthDay"],
      ["until", "until:2026-12"],
    ])
  })

  it("схема й правило згодні: схема пропускає саме ті поля, з яких є правило", () => {
    const base = { ...recurrenceDraft(null, "2026-12-07"), interval: 1 }
    const drafts = [
      { ...base, frequency: "monthly" as const, monthDay: 0 },
      { ...base, frequency: "monthly" as const, monthDay: 32 },
      { ...base, frequency: "monthly" as const, monthDay: 5.5 },
      { ...base, frequency: "monthly" as const, monthDay: -1 },
      { ...base, frequency: "yearly" as const, month: 13, monthDay: 1 },
      { ...base, frequency: "yearly" as const, month: 2, monthDay: 29 },
      { ...base, frequency: "yearly" as const, month: 2, monthDay: -1 },
      { ...base, frequency: "weekly" as const, weekdays: [] },
      { ...base, frequency: "daily" as const, interval: 100 },
      { ...base, frequency: "daily" as const, interval: null },
      { ...base, frequency: "daily" as const, end: "count" as const, count: 0 },
      {
        ...base,
        frequency: "daily" as const,
        end: "until" as const,
        until: "2027-02-30",
      },
      {
        ...base,
        frequency: "daily" as const,
        end: "until" as const,
        until: "2027-02-28",
      },
    ]
    for (const draft of drafts)
      expect(schema.safeParse(draft).success).toBe(
        recurrenceRuleOfDraft(draft) !== null,
      )
    expect(
      schema.safeParse(drafts[0]).error?.issues.map((issue) => issue.path[0]),
    ).toEqual(["monthDay"])
  })

  it("порожнє правило з сервера — без повтору; інше правило без тексту — помилка", () => {
    expect(
      recurrenceDraft(
        { start: "2026-12-07", rule: " ", timeZone: KYIV },
        "2026-12-07",
      ).frequency,
    ).toBe("none")
    const issues =
      schema.safeParse({
        ...recurrenceDraft(null, "2026-12-07"),
        frequency: "custom",
        custom: "",
      }).error?.issues ?? []
    expect(issues.map((issue) => issue.path[0])).toEqual(["frequency"])
  })

  it("день кінця раніше за перший день знає форма", () => {
    const draft = {
      ...recurrenceDraft(null, "2026-12-07"),
      frequency: "daily" as const,
      end: "until" as const,
      until: "2026-12-06",
    }
    expect(isRecurrenceUntilBeforeStart(draft, "2026-12-07T09:00")).toBe(true)
    expect(isRecurrenceUntilBeforeStart(draft, "2026-12-06")).toBe(false)
    expect(
      isRecurrenceUntilBeforeStart({ ...draft, end: "never" }, "2026-12-07"),
    ).toBe(false)
  })
})
