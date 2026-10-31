/**
 * Фікстури модуля A6: значення довідників і типові значення кожної компанії. `companies` не задано —
 * записи без компанії (застосунок без `X-Company-Id`). Без `lib/mocks`, тож у тестах і застосунку їх
 * можна взяти без MSW.
 */
import {
  DEFAULTS_ID,
  type DictionaryDefaults,
  type PaymentTerm,
  type Reason,
  type Tag,
  type Tax,
  type Unit,
} from "./contract"

export interface DictionariesFixtureOptions {
  /** Компанії: у кожної свої значення. */
  readonly companies?: readonly string[]
}

const TAX_ROWS = [
  ["vat-20", "ПДВ 20%", 20, { Бухгалтерія: "20" }],
  ["vat-7", "ПДВ 7%", 7, { Бухгалтерія: "7" }],
  ["vat-0", "ПДВ 0%", 0, { Бухгалтерія: "901" }],
  ["no-vat", "Без ПДВ", 0, { Бухгалтерія: "903" }],
] as const

const UNIT_ROWS = [
  ["pcs", "Штука", "шт", 0, { Бухгалтерія: "2009" }],
  ["kg", "Кілограм", "кг", 3, { Бухгалтерія: "0301" }],
  ["m", "Метр", "м", 2, { Бухгалтерія: "0101" }],
  ["l", "Літр", "л", 2, { Бухгалтерія: "0138" }],
  ["h", "Година", "год", 2, { Бухгалтерія: "2454" }],
] as const

const TERM_ROWS = [
  ["prepay", "Повна передоплата", [[100, 0, "invoice"]]],
  [
    "half",
    "Половина наперед, решта після поставки",
    [
      [50, 0, "invoice"],
      [50, 5, "delivery"],
    ],
  ],
  ["net-30", "Відстрочка 30 днів", [[100, 30, "delivery"]]],
] as const

const TAG_ROWS = [
  ["vip", "VIP", "success"],
  ["urgent", "Терміново", "destructive"],
  ["review", "На перевірці", "warning"],
  ["new", "Новий", "info"],
] as const

const REASON_ROWS = [
  ["changed-mind", "Клієнт передумав", "cancel", false],
  ["duplicate", "Дублікат замовлення", "cancel", false],
  ["no-budget", "Немає бюджету", "reject", false],
  ["defect", "Брак товару", "return", true],
  ["other", "Інше", "other", true],
] as const

const record = (id: string, companyId: string | null, version = 1) => ({
  id: companyId ? `${id}-${companyId}` : id,
  version,
  companyId,
})

export function createDictionariesFixtures({
  companies,
}: DictionariesFixtureOptions = {}) {
  const owners: readonly (string | null)[] = companies?.length
    ? companies
    : [null]
  const taxes = owners.flatMap((companyId) =>
    TAX_ROWS.map(([id, name, rate, externalCodes]): Tax => ({
      ...record(id, companyId),
      name,
      rate,
      included: false,
      active: true,
      externalCodes,
    })),
  )
  const units = owners.flatMap((companyId) =>
    UNIT_ROWS.map(([id, name, shortName, decimals, externalCodes]): Unit => ({
      ...record(id, companyId),
      name,
      shortName,
      decimals,
      active: true,
      externalCodes,
    })),
  )
  const paymentTerms = owners.flatMap((companyId) =>
    TERM_ROWS.map(([id, name, parts]): PaymentTerm => ({
      ...record(id, companyId),
      name,
      active: true,
      parts: parts.map(([percent, days, base]) => ({ percent, days, base })),
      externalCodes: {},
    })),
  )
  const tags = owners.flatMap((companyId) =>
    TAG_ROWS.map(([id, name, tone]): Tag => ({
      ...record(id, companyId),
      name,
      tone,
      active: true,
    })),
  )
  const reasons = owners.flatMap((companyId) =>
    REASON_ROWS.map(([id, name, kind, commentRequired]): Reason => ({
      ...record(id, companyId),
      name,
      kind,
      commentRequired,
      active: true,
    })),
  )
  const defaults = owners.map((companyId): DictionaryDefaults => ({
    id: DEFAULTS_ID,
    version: 1,
    companyId,
    taxId: record("vat-20", companyId).id,
    unitId: record("pcs", companyId).id,
    paymentTermId: null,
  }))
  return { taxes, units, paymentTerms, tags, reasons, defaults }
}
