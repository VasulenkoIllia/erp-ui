import { useMemo } from "react"

import { RATE_SOURCES, type RateSource } from "../contract"
import { useCompanyT } from "../use-company-t"

const isKnownSource = (source: string): source is RateSource =>
  (RATE_SOURCES as readonly string[]).includes(source)

/** Підпис джерела курсу; код, якого модуль не знає, показуємо як є (SPEC §15). */
export function useRateSourceLabel() {
  const t = useCompanyT()
  return useMemo(
    () => (source: string) =>
      isKnownSource(source) ? t(`rates.sources.${source}`) : source,
    [t],
  )
}
