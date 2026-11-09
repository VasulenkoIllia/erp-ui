/**
 * Закритий період компанії в інтерфейсі (lib/period-lock, PF13, ADR-0069): запис `period-lock/current`,
 * чи закрита дата для того, хто дивиться, і підказка поля дати документа.
 *
 * - Бекенд без закритих періодів (404) — закритих періодів немає: смуги й підказки немає, поле дати
 *   звичайне. Сервер однаково перевіряє дату сам, інтерфейс лише не пропонує того, що він відхилить.
 * - Чинний виняток закінчився, поки сторінка відкрита, — у ту ж мить смуга й поле дати показують
 *   закритий період і запис перечитується (навіть коли відповідь та сама, інтерфейс не чекає змін).
 * - Запис спільний для смуги, поля дати й налаштувань: після збереження налаштувань ra-core перечитує
 *   його всюди.
 */
import { useGetOne } from "ra-core"
import * as React from "react"

import { useCompanyId } from "@/registry/hooks/use-company"
import { isApiError } from "@/registry/lib/api"
import { companyScope } from "@/registry/lib/company-scope"
import { addDays, type CalendarDate } from "@/registry/lib/dates"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  isExceptionActive,
  isPeriodLocked,
  PERIOD_LOCK,
  PERIOD_LOCK_ID,
  periodLockSchema,
  type OwnPeriodLockException,
  type PeriodLock,
} from "@/registry/lib/period-lock"

export interface PeriodLockState {
  /** Запис закритого періоду: `undefined`, поки вантажиться, після збою чи без підтримки бекенду. */
  readonly lock: PeriodLock | undefined
  readonly lockedThrough: CalendarDate | null
  /** Чинний виняток того, хто дивиться. */
  readonly exception: OwnPeriodLockException | null
  readonly isPending: boolean
  /** Немає мережі й запису ще немає: запит на паузі, помилки не буде. */
  readonly isOffline: boolean
  /** Бекенд закритих періодів не знає (404): закритих періодів немає. */
  readonly isUnsupported: boolean
  /** Збій читання (не 404). */
  readonly error: unknown
  readonly refetch: () => void
  /** Дата в закритому періоді й винятку немає: змінити документ не можна. */
  readonly isClosed: (date: unknown) => boolean
}

/** Скільки найдовше чекає таймер: довший `setTimeout` браузер виконує одразу. */
const MAX_TIMER_MS = 2_147_483_647
/** Запас після кінця винятку: таймер, що спрацював на мить раніше, не лишає виняток чинним. */
const EXPIRY_MARGIN_MS = 100

export function usePeriodLock(): PeriodLockState {
  const companyId = useCompanyId()
  const { data, error, isPending, refetch, fetchStatus } =
    useGetOne<PeriodLock>(PERIOD_LOCK, {
      id: PERIOD_LOCK_ID,
      meta: companyScope(companyId),
    })
  const parsed = React.useMemo(
    () => (data ? periodLockSchema.safeParse(data) : undefined),
    [data],
  )
  const lock = parsed?.success ? parsed.data : undefined
  const isUnsupported = isApiError(error) && error.status === 404
  const exception =
    lock?.exception && isExceptionActive(lock.exception) ? lock.exception : null
  const until = exception?.until
  // Чинність винятку рахується під час рендера: таймер лише перемальовує, коли вона спливла.
  const [, expire] = React.useReducer((count: number) => count + 1, 0)
  React.useEffect(() => {
    if (!until) return
    const timer = setTimeout(
      () => {
        expire()
        void refetch()
      },
      Math.min(
        Math.max(Date.parse(until) - Date.now(), 0) + EXPIRY_MARGIN_MS,
        MAX_TIMER_MS,
      ),
    )
    return () => {
      clearTimeout(timer)
    }
  }, [until, refetch])
  const lockedThrough = lock?.lockedThrough ?? null
  return {
    lock,
    lockedThrough,
    exception,
    // Без мережі запит на паузі без помилки: інакше скелетон лишився б назавжди.
    isPending: isPending && fetchStatus !== "paused",
    isOffline: isPending && fetchStatus === "paused",
    isUnsupported,
    // Відповідь, яку не розібрала схема контракту, — теж збій: інакше смуга мовчки зникла б.
    error: isUnsupported
      ? null
      : (error ?? (parsed?.success === false ? parsed.error : null)),
    refetch: () => {
      void refetch()
    },
    isClosed: (date) => isPeriodLocked(date, lockedThrough) && !exception,
  }
}

export interface PostingDate {
  /** Перший відкритий день: календар поля вимикає закриті дні. Немає — період відкритий чи є виняток. */
  readonly min?: CalendarDate
  /** Підказка під полем дати: «Період по 20.10.2026 закрито». */
  readonly hint?: string
}

/**
 * Поле дати документа, якого стосується закриття: перший відкритий день для `DateInput` (`min`) і
 * підказка для `FormField` (`description`). Дату в закритому періоді, введену з клавіатури, відхиляє
 * сервер: 422 `period_locked` біля поля (`useRecordForm`).
 */
export function usePostingDate(): PostingDate {
  const t = useErpUiT()
  const format = useFormat()
  const { lockedThrough, exception } = usePeriodLock()
  if (!lockedThrough) return {}
  const date = format.date(lockedThrough, "date")
  if (exception)
    return {
      hint: t("periodLock.dateHintException", {
        date,
        until: format.date(exception.until, "dateTime"),
      }),
    }
  return {
    min: addDays(lockedThrough, 1),
    hint: t("periodLock.dateHint", { date }),
  }
}
