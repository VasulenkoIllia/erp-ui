/**
 * Форматування чисел, сум і дат через Intl (SPEC §11). Чисті функції з локаллю явно — у
 * `lib/format-core` (ADR-0093): їх бере й сервер на TypeScript; тут вони реекспортуються, як раніше.
 *
 * - `useFormat()` — ті самі функції з локаллю поточної мови інтерфейсу.
 * - Мітки часу в `useFormat()` показуються в поясі користувача з профілю (`lib/user-timezone`).
 */
import { useMemo } from "react"

import {
  currencyDigits,
  currencyLabel,
  DATE_STYLES,
  decimalToMinor,
  formatDate,
  formatDateRange,
  formatDecimal,
  formatMoney,
  formatNumber,
  formatPercent,
  formatPrice,
  formatRelative,
  isoWeek,
  minorToDecimal,
  numberSeparators,
  pluralCategory,
  type DateOptions,
  type DateStyle,
  type DateValue,
  type Money,
  type RelativeOptions,
} from "@/registry/lib/format-core"
import { useLanguage } from "@/registry/lib/i18n"
import { useUserTimeZone } from "@/registry/lib/user-timezone"

export {
  currencyDigits,
  currencyLabel,
  DATE_STYLES,
  decimalToMinor,
  formatDate,
  formatDateRange,
  formatDecimal,
  formatMoney,
  formatNumber,
  formatPercent,
  formatPrice,
  formatRelative,
  isoWeek,
  minorToDecimal,
  numberSeparators,
  pluralCategory,
  type DateOptions,
  type DateStyle,
  type DateValue,
  type Money,
  type RelativeOptions,
}

/** Форматери з локаллю поточної мови інтерфейсу й поясом користувача. */
export function useFormat() {
  const { locale } = useLanguage()
  const timeZone = useUserTimeZone()
  return useMemo(
    () => ({
      locale,
      /** Пояс, у якому показуються мітки часу; undefined — пояс пристрою. */
      timeZone,
      number: (value: number | bigint, options?: Intl.NumberFormatOptions) =>
        formatNumber(value, locale, options),
      percent: (value: number, options?: Intl.NumberFormatOptions) =>
        formatPercent(value, locale, options),
      money: (money: Money) => formatMoney(money, locale),
      decimal: (value: string) => formatDecimal(value, locale),
      price: (price: string, currency: string) =>
        formatPrice(price, currency, locale),
      date: (value: DateValue, style: DateStyle, options?: DateOptions) =>
        formatDate(value, style, locale, { timeZone, ...options }),
      dateRange: (
        from: DateValue,
        to: DateValue,
        style: Exclude<DateStyle, "weekdayDayMonth">,
        options?: DateOptions,
      ) => formatDateRange(from, to, style, locale, { timeZone, ...options }),
      relative: (value: DateValue, options?: RelativeOptions) =>
        formatRelative(value, locale, { timeZone, ...options }),
    }),
    [locale, timeZone],
  )
}
