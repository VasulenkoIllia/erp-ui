import {
  formatRecurrenceRule,
  type Recurrence,
  type RecurrenceRule,
} from "@/registry/lib/recurrence"

/** Пояс компанії демо: правило задачі рахується за ним. */
export const COMPANY_ZONE = "Europe/Kyiv"
/** Пояс наради з колегами з іншої країни: текст правила його називає, дати — у поясі користувача. */
export const MEETING_ZONE = "America/New_York"

const MEETING_START = "2026-12-07T09:00"

export interface RecurrenceCase {
  id: "task" | "meeting" | "fresh" | "foreign" | "readOnly"
  start: string
  timeZone: string
  recurrence: Recurrence | null
  readOnly?: boolean
}

const recurrence = (
  start: string,
  timeZone: string,
  rule: RecurrenceRule | string,
): Recurrence => ({
  start,
  timeZone,
  rule:
    typeof rule === "string"
      ? rule
      : formatRecurrenceRule(rule, { start, timeZone }),
})

/** Форми сторінки: правило з сервера читається в редактор, «Зберегти» показує, що піде на сервер. */
export const RECURRENCE_CASES: readonly RecurrenceCase[] = [
  {
    id: "task",
    start: "2026-12-05",
    timeZone: COMPANY_ZONE,
    recurrence: recurrence(
      "2026-12-05",
      COMPANY_ZONE,
      "FREQ=MONTHLY;BYMONTHDAY=5;COUNT=10",
    ),
  },
  {
    id: "meeting",
    start: MEETING_START,
    timeZone: MEETING_ZONE,
    recurrence: recurrence(MEETING_START, MEETING_ZONE, {
      frequency: "weekly",
      interval: 2,
      weekdays: ["MO", "WE", "FR"],
      until: "2027-03-31",
    }),
  },
  {
    id: "fresh",
    start: "2027-01-31",
    timeZone: COMPANY_ZONE,
    recurrence: null,
  },
  {
    id: "foreign",
    start: "2026-12-08",
    timeZone: COMPANY_ZONE,
    recurrence: recurrence(
      "2026-12-08",
      COMPANY_ZONE,
      "FREQ=MONTHLY;BYDAY=2TU",
    ),
  },
  {
    id: "readOnly",
    start: "2028-02-29",
    timeZone: COMPANY_ZONE,
    recurrence: recurrence(
      "2028-02-29",
      COMPANY_ZONE,
      "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29",
    ),
    readOnly: true,
  },
]

/** Пропуски, які текст називає: 31-ше, 30-те й 29-те щомісяця, останній день, будні. */
export const RECURRENCE_SAMPLES: readonly {
  id: string
  start: string
  rule: RecurrenceRule
}[] = [
  {
    id: "day31",
    start: "2027-01-31",
    rule: { frequency: "monthly", interval: 1, monthDay: 31 },
  },
  {
    id: "day30",
    start: "2027-01-30",
    rule: { frequency: "monthly", interval: 1, monthDay: 30 },
  },
  {
    id: "day29",
    start: "2027-01-29",
    rule: { frequency: "monthly", interval: 1, monthDay: 29 },
  },
  {
    id: "lastDay",
    start: "2027-01-31",
    rule: { frequency: "monthly", interval: 1, monthDay: -1 },
  },
  {
    id: "workdays",
    start: "2026-12-07",
    rule: {
      frequency: "weekly",
      interval: 1,
      weekdays: ["MO", "TU", "WE", "TH", "FR"],
      count: 20,
    },
  },
  {
    id: "everyThreeDays",
    start: "2026-12-01",
    rule: { frequency: "daily", interval: 3, until: "2026-12-31" },
  },
]
