import type { useFormat } from "@/lib/format"

import { PERCENT_DECIMALS, type PaymentPart } from "../contract"
import type { DictionariesT } from "../use-dictionaries-t"

type Format = ReturnType<typeof useFormat>

/** Відсоток числом 0–100 мовою інтерфейсу: «33,33 %». */
export const percentText = (format: Format, value: number) =>
  format.percent(value / 100, { maximumFractionDigits: PERCENT_DECIMALS })

/** Частини оплати одним рядком: колонка списку й порівняння при конфлікті. */
export function partsText(
  parts: readonly PaymentPart[],
  t: DictionariesT,
  format: Format,
): string {
  return parts
    .map(({ percent, days, base }) => {
      const options = {
        percent: percentText(format, percent),
        base: t(`paymentTerms.bases.${base}`),
      }
      return days === 0
        ? t("paymentTerms.partNow", options)
        : t("paymentTerms.part", { ...options, count: days })
    })
    .join(", ")
}
