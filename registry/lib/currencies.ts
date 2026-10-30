/**
 * Коди й назви валют (PF02, ADR-0043): ISO 4217 з браузера (`Intl.supportedValuesOf`), назва мовою
 * інтерфейсу з `Intl.DisplayNames`. Курси й перелік валют компанії — у модулі A1, тут лише довідник
 * для поля вибору.
 */

/** Найчастіші валюти на випадок браузера без `Intl.supportedValuesOf`. */
const FALLBACK_CODES = ["UAH", "USD", "EUR", "GBP", "PLN", "CHF", "CZK"]

export function currencyCodes(): string[] {
  return typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("currency")
    : FALLBACK_CODES
}

/** «Долар США»; валюта без назви в браузері — сам код. */
export function currencyName(code: string, locale: string): string {
  try {
    return (
      new Intl.DisplayNames(locale, { type: "currency" }).of(
        code.toUpperCase(),
      ) ?? code
    )
  } catch (error) {
    // Код не з трьох літер: показуємо як є, а не валимо сторінку.
    if (error instanceof RangeError) return code
    throw error
  }
}
