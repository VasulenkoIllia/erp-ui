import { useGetOne } from "ra-core"

import { useCompanyId } from "@/hooks/use-company"
import { useHasPermission } from "@/hooks/use-me"
import { companyScope } from "@/lib/company-scope"

import {
  DEFAULTS_ID,
  DICTIONARY_DEFAULTS,
  PAYMENT_TERMS,
  TAXES,
  UNITS,
  type DictionaryDefaults,
} from "../contract"
import { useDictionariesModule } from "../module-context"

/** Поле типових значень за ресурсом; теги й причини типових значень не мають. */
const DEFAULT_FIELDS: Readonly<
  Record<string, keyof DictionaryDefaults | undefined>
> = {
  [TAXES]: "taxId",
  [UNITS]: "unitId",
  [PAYMENT_TERMS]: "paymentTermId",
}

/**
 * Значення довідника, що стоїть типовим: позначка в рядку й питання перед вимкненням (ADR-0047). Список
 * працює й без цього запису: без `dictionary-defaults:read`, без сторінки типових чи зі збоєм запиту
 * позначки просто немає, а вимкнення йде без питання.
 */
export function useDefaultEntryId(resource: string): string | null {
  const companyId = useCompanyId()
  const { extension } = useDictionariesModule()
  const canRead = useHasPermission(DICTIONARY_DEFAULTS, "read")
  const field = DEFAULT_FIELDS[resource]
  const { data } = useGetOne<DictionaryDefaults>(
    DICTIONARY_DEFAULTS,
    { id: DEFAULTS_ID, meta: companyScope(companyId) },
    {
      enabled:
        field !== undefined && canRead && extension.defaults?.page !== false,
    },
  )
  const value = field && data ? data[field] : null
  return typeof value === "string" ? value : null
}
