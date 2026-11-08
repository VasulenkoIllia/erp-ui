import { useGetList, useGetOne } from "ra-core"
import { useCallback, useMemo } from "react"

import { useCompanyId } from "@/hooks/use-company"
import { companyScope } from "@/lib/company-scope"
import type {
  DocumentLine,
  DocumentLineTax,
  DocumentLineUnit,
} from "@/lib/document-lines"

/**
 * Довідники рядків пропозиції — ресурси модуля A6 за назвами (модуль не імпортує інший модуль):
 * активні одиниці й ставки та типові значення компанії для нового рядка. Проект без A6 (довідника
 * немає чи немає права) — порожні списки: рядок пишеться вільним текстом без одиниці й податку.
 */
const UNITS = "units"
const TAXES = "taxes"
const DICTIONARY_DEFAULTS = "dictionary-defaults"
const DEFAULTS_ID = "current"
/** Довідник компанії — десятки значень, а не тисячі: одна сторінка. */
const DICTIONARY_PAGE = 200

interface UnitRecord {
  readonly id: string
  readonly shortName: string
}
interface TaxRecord {
  readonly id: string
  readonly name: string
  readonly rate: number
  readonly included: boolean
}
interface DefaultsRecord {
  readonly id: string
  readonly taxId: string | null
  readonly unitId: string | null
}

export interface LineDictionaries {
  readonly units: readonly (DocumentLineUnit & { id: string })[]
  readonly taxes: readonly DocumentLineTax[]
  /** Типові податок і одиниця нового рядка з налаштувань довідників компанії. */
  readonly newLine: () => Partial<Omit<DocumentLine, "id">>
  /**
   * Довідники й типові значення ще йдуть із сервера: новий рядок без них лишився б без одиниці й
   * податку. Без мережі (запит на паузі) чи з помилкою (проект без A6) — `false`: рядок вільним текстом.
   */
  readonly isLoading: boolean
}

export function useLineDictionaries(enabled = true): LineDictionaries {
  const companyId = useCompanyId()
  const params = {
    pagination: { page: 1, perPage: DICTIONARY_PAGE },
    sort: { field: "name", order: "ASC" as const },
    filter: { active: true },
    meta: companyScope(companyId),
  }
  const units = useGetList<UnitRecord>(UNITS, params, { enabled })
  const taxes = useGetList<TaxRecord>(TAXES, params, { enabled })
  const defaults = useGetOne<DefaultsRecord>(
    DICTIONARY_DEFAULTS,
    { id: DEFAULTS_ID, meta: companyScope(companyId) },
    { enabled },
  )
  const unitOptions = useMemo(
    () =>
      (units.data ?? []).map((unit) => ({ id: unit.id, name: unit.shortName })),
    [units.data],
  )
  const taxOptions = useMemo(
    () =>
      (taxes.data ?? []).map(({ id, name, rate, included }) => ({
        id,
        name,
        rate,
        included,
      })),
    [taxes.data],
  )
  const taxId = defaults.data?.taxId
  const unitId = defaults.data?.unitId
  const newLine = useCallback(
    () => ({
      tax: taxOptions.find((tax) => tax.id === taxId),
      unit: unitOptions.find((unit) => unit.id === unitId),
    }),
    [taxOptions, unitOptions, taxId, unitId],
  )
  return {
    units: unitOptions,
    taxes: taxOptions,
    newLine,
    isLoading:
      enabled && (units.isLoading || taxes.isLoading || defaults.isLoading),
  }
}
