/**
 * Закриті періоди (PF13, ADR-0069): дата, по яку включно документи компанії не змінюються, винятки на
 * час і роки компанії. Компанія — поточна (`X-Company-Id`, ADR-0002).
 *
 * Контракт (під `/api/v1`):
 * - `GET /period-lock/current` → `{ id: "current", version, lockedThrough, exception }`. Читає кожен у
 *   компанії: дата потрібна полю дати й смузі на картці документа. `lockedThrough` — останній закритий
 *   день (`YYYY-MM-DD`) чи `null`, коли закритих періодів немає. `exception` — чинний виняток того, хто
 *   питає (`{ until, reason }`), інакше `null`: сервер обчислює його для запиту, як `deniedActions`.
 * - `PATCH /period-lock/current` `{ version, lockedThrough, reason? }` → запис; право `period-lock:update`.
 *   Дата — лише в минулому (422 `lockedThrough: future`): сьогодні лишається відкритим, тож сторно й нові
 *   документи мають куди лягти. Дата раніше за чинну чи `null` відкриває період знову: причина обов'язкова
 *   (422 `reason: required`). Версія — 409 `conflict` з `current`. Зміна — у журнал (`period_lock.updated`).
 * - Винятки — ресурс `period-lock-exceptions`, лише чинні (`until` у майбутньому): `GET` (право
 *   `read`) → `{ data, total }`; `POST` `{ userId, until, reason }` (право `create`) → 201; `DELETE /:id`
 *   (право `delete`) → 204. Виняток — одній людині компанії до часу `until` не далі ніж за
 *   `PERIOD_LOCK_EXCEPTION_MAX_DAYS` днів, причина обов'язкова (рішення власника 09.11.2026). Помилки
 *   422: `userId` — `required`, `not_found` (не в компанії), `duplicate` (уже має чинний виняток);
 *   `until` — `invalid`, `past`, `too_far`; `reason` — `required`, `too_long`. Видача й відкликання — у
 *   журнал (`period_lock.exception_granted`, `period_lock.exception_revoked`). `until` і `grantedAt` —
 *   мить ISO 8601 з поясом (`Z` чи `+02:00`): без поясу сервер і браузер прочитали б її по-різному.
 * - Документи модуля, якого стосується закриття (вирішує модуль: рахунки так, пропозиції ні; рішення
 *   власника 09.11.2026): документ із датою по `lockedThrough` включно не створюють і не змінюють.
 *   Сервер мітить такий запис `deniedActions` з кодом `period_locked` для `update`, `delete` і кожної дії
 *   графа, окрім `reverse` (ADR-0037); збереження з датою в закритому періоді — 422 `fieldErrors` з
 *   кодом `period_locked` біля поля дати. Сторно дозволене: документ-сторно датується сьогоднішнім днем
 *   (рішення власника 09.11.2026). Людина з чинним винятком цих заборон не має, а кожна її зміна в
 *   закритому періоді — у журнал (`period_lock.exception_used` з причиною винятку).
 * - Роки компанії: фінансовий рік починається з `fiscalYearStartMonth` профілю компанії (lib/company,
 *   ADR-0043). Закрити рік — те саме `PATCH` з останнім днем року.
 */
import { z } from "zod"

import { recordBaseSchema } from "@/registry/lib/api"
import {
  addDays,
  isCalendarDate,
  type CalendarDate,
} from "@/registry/lib/dates"
import { RECORD_DENIAL_REASONS } from "@/registry/lib/record-access"

/** Ресурс закритого періоду компанії: один запис з адресою `current`. */
export const PERIOD_LOCK = "period-lock"
export const PERIOD_LOCK_ID = "current"
/** Винятки закритого періоду. */
export const PERIOD_LOCK_EXCEPTIONS = "period-lock-exceptions"

/** Код позначки `deniedActions` і помилки поля дати: дата документа в закритому періоді. */
export const PERIOD_LOCKED = RECORD_DENIAL_REASONS.periodLocked

/** На скільки днів наперед найдовше можна дати виняток. */
export const PERIOD_LOCK_EXCEPTION_MAX_DAYS = 7
/** Причина відкриття періоду чи винятку: довший текст — у нотатку, а не сюди. */
export const PERIOD_LOCK_REASON_MAX_LENGTH = 500
/** Скільки фінансових років показують налаштування: поточний і попередні. */
const FISCAL_YEARS_SHOWN = 3

/** Дія, яку закритий період дозволяє: сторно датується сьогодні й лягає у відкритий період. */
export const PERIOD_LOCK_ALLOWED_ACTIONS: readonly string[] = ["reverse"]

const calendarDateSchema = z.string().refine(isCalendarDate)
/** Мить із поясом: `2026-11-09T21:59:59.999Z` чи `2026-11-09T23:59:59+02:00`. */
const instantSchema = z.iso.datetime({ offset: true, error: "invalid" })

/** Чинний виняток того, хто питає. */
const ownPeriodLockExceptionSchema = z.object({
  until: instantSchema,
  reason: z.string(),
})
export type OwnPeriodLockException = z.infer<
  typeof ownPeriodLockExceptionSchema
>

export const periodLockSchema = recordBaseSchema.extend({
  lockedThrough: calendarDateSchema.nullable(),
  exception: ownPeriodLockExceptionSchema.nullable().optional(),
})
export type PeriodLock = z.infer<typeof periodLockSchema>

export const periodLockExceptionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  userName: z.string(),
  until: instantSchema,
  reason: z.string(),
  grantedBy: z.object({ id: z.string(), name: z.string() }),
  grantedAt: instantSchema,
})
export type PeriodLockException = z.infer<typeof periodLockExceptionSchema>

/** Причина: обов'язкова, до `PERIOD_LOCK_REASON_MAX_LENGTH` знаків. */
export const periodLockReasonSchema = z
  .string()
  .trim()
  .min(1, { error: "required" })
  .max(PERIOD_LOCK_REASON_MAX_LENGTH, { error: "too_long" })

/**
 * Тіло `PATCH /period-lock/current`, крім версії: без `lockedThrough` дата не змінюється; причину сервер
 * вимагає, коли період відкривають.
 */
export const periodLockUpdateSchema = z.object({
  lockedThrough: calendarDateSchema.nullable().optional(),
  reason: z
    .string()
    .trim()
    .max(PERIOD_LOCK_REASON_MAX_LENGTH, { error: "too_long" })
    .optional(),
})
export type PeriodLockUpdate = z.infer<typeof periodLockUpdateSchema>

/** Тіло `POST /period-lock-exceptions`. */
export const periodLockExceptionInputSchema = z.object({
  userId: z.string().trim().min(1, { error: "required" }),
  until: instantSchema,
  reason: periodLockReasonSchema,
})
export type PeriodLockExceptionInput = z.infer<
  typeof periodLockExceptionInputSchema
>

/** Чи лежить дата в закритому періоді: по `lockedThrough` включно. */
export function isPeriodLocked(
  date: unknown,
  lockedThrough: CalendarDate | null | undefined,
): boolean {
  return (
    typeof lockedThrough === "string" &&
    isCalendarDate(date) &&
    date <= lockedThrough
  )
}

/** Нова дата відкриває вже закритий період: раніше за чинну чи `null` після дати. */
export function reopensPeriod(
  current: CalendarDate | null,
  next: CalendarDate | null,
): boolean {
  return current !== null && (next === null || next < current)
}

/** Дата закриття в майбутньому чи сьогодні: сьогодні лишається відкритим. */
export function isLockDateTooLate(
  date: CalendarDate,
  today: CalendarDate,
): boolean {
  return date >= today
}

/** Виняток ще діє: `until` пізніше за `now`. */
export function isExceptionActive(
  exception: { readonly until: string } | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!exception) return false
  const until = Date.parse(exception.until)
  return Number.isFinite(until) && until > now
}

export type ExceptionUntilIssue = "invalid" | "past" | "too_far"

/** Що не так із кінцем винятку: у минулому, далі ніж за тиждень чи не час. */
export function exceptionUntilIssue(
  until: string,
  now: number = Date.now(),
): ExceptionUntilIssue | null {
  const at = Date.parse(until)
  if (!Number.isFinite(at)) return "invalid"
  if (at <= now) return "past"
  return at - now > PERIOD_LOCK_EXCEPTION_MAX_DAYS * 86_400_000
    ? "too_far"
    : null
}

/* ------------------------------ Роки компанії ------------------------------ */

export type FiscalYearStatus = "closed" | "partly" | "open"

export interface FiscalYear {
  /** «2026» для року із січня, «2025/26» для іншого місяця початку. */
  readonly label: string
  readonly start: CalendarDate
  readonly end: CalendarDate
  readonly status: FiscalYearStatus
  /** Рік ще не скінчився: закрити його цілком не можна. */
  readonly isCurrent: boolean
}

const pad = (value: number) => String(value).padStart(2, "0")

/** Перший день фінансового року, у якому лежить `date`. */
function fiscalYearStart(date: CalendarDate, startMonth: number): CalendarDate {
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  return `${String(month >= startMonth ? year : year - 1)}-${pad(startMonth)}-01`
}

/** Рік від `start`: межі, назва й стан щодо закритого періоду. */
function fiscalYearFrom(
  start: CalendarDate,
  startMonth: number,
  lockedThrough: CalendarDate | null,
  today: CalendarDate,
): FiscalYear {
  const startYear = Number(start.slice(0, 4))
  const end = addDays(`${String(startYear + 1)}-${pad(startMonth)}-01`, -1)
  const label =
    startMonth === 1
      ? String(startYear)
      : `${String(startYear)}/${String(startYear + 1).slice(2)}`
  const status: FiscalYearStatus =
    lockedThrough === null || lockedThrough < start
      ? "open"
      : lockedThrough >= end
        ? "closed"
        : "partly"
  return { label, start, end, status, isCurrent: end >= today }
}

/**
 * Фінансові роки компанії від поточного назад (`FISCAL_YEARS_SHOWN`): місяць початку — з профілю
 * компанії (`fiscalYearStartMonth`, 1–12; інше значення — січень).
 */
export function fiscalYears({
  startMonth,
  lockedThrough,
  today,
  count = FISCAL_YEARS_SHOWN,
}: {
  startMonth: number | null | undefined
  lockedThrough: CalendarDate | null
  today: CalendarDate
  count?: number
}): FiscalYear[] {
  const month =
    Number.isInteger(startMonth) &&
    (startMonth as number) >= 1 &&
    (startMonth as number) <= 12
      ? (startMonth as number)
      : 1
  const current = fiscalYearStart(today, month)
  const firstYear = Number(current.slice(0, 4))
  return Array.from({ length: count }, (_, index) =>
    fiscalYearFrom(
      `${String(firstYear - index)}-${pad(month)}-01`,
      month,
      lockedThrough,
      today,
    ),
  )
}

/** Останній день місяця перед тим, у якому лежить `today`: «закрити минулий місяць». */
export function previousMonthEnd(today: CalendarDate): CalendarDate {
  return addDays(`${today.slice(0, 7)}-01`, -1)
}
