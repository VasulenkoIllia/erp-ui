/**
 * Моки модуля A6 на MSW (ADR-0002, ADR-0003, ADR-0047): довідники й типові значення компанії запиту.
 * Сценарії `success`, `error`, `empty`, `slow`, `conflict`, `forbidden`, `offline` — для кожного
 * ресурсу окремо (`lib/mock-scenarios`, панель розробника), права — `<ресурс>:<дія>`.
 *
 *   const dictionaries = createDictionariesMocks({ extension, companies: ["zoriana"] })
 *   setupWorker(...platform, ...dictionaries.handlers)
 *
 * - Назва не повторюється в довіднику компанії (у причин — у межах виду): 422 `name: duplicate`.
 * - Вимкнене значення перестає бути типовим: мок прибирає його з налаштування за подією шини, як сервер
 *   (контракт). Підписка — на весь час життя моків, як в A1 і A2.
 * - Типові значення — один запис на компанію з адресою `current`: компанію визначає запит.
 */
import { withMockValues } from "@/lib/extension-fields"
import { subscribeMockEvents } from "@/lib/mock-server"
import { createResourceHandlers } from "@/lib/mocks"

import {
  DEFAULTS_ID,
  DICTIONARY_DEFAULTS,
  DICTIONARY_RESOURCES,
  dictionaryDefaultsSchema,
  PAYMENT_TERMS,
  paymentTermSchemaFor,
  REASONS,
  reasonSchemaFor,
  TAGS,
  tagSchemaFor,
  TAXES,
  taxSchemaFor,
  UNITS,
  unitSchemaFor,
  type DictionaryDefaults,
  type PaymentTerm,
  type Reason,
  type Tag,
  type Tax,
  type Unit,
} from "./contract"
import type { DictionariesMockExtension } from "./extension"
import {
  createDictionariesFixtures,
  type DictionariesFixtureOptions,
} from "./fixtures"

export interface DictionariesMocksOptions extends DictionariesFixtureOptions {
  /** Поля розширення проекту — дані без компонентів. */
  readonly extension?: DictionariesMockExtension
  /** Початок адрес API, як у `createResourceHandlers` (за замовчуванням `/api/v1`). */
  readonly baseUrl?: string
}

const labelOf = (name: string) =>
  DICTIONARY_RESOURCES.find((resource) => resource.name === name)?.label

const NAME_LABELS = {
  name: { uk: "Назва", en: "Name" },
  active: { uk: "Активне", en: "Active" },
}

/** Поле налаштування, яке вказує на значення кожного довідника. */
const DEFAULT_FIELDS: Readonly<
  Record<
    string,
    keyof Pick<DictionaryDefaults, "taxId" | "unitId" | "paymentTermId">
  >
> = {
  [TAXES]: "taxId",
  [UNITS]: "unitId",
  [PAYMENT_TERMS]: "paymentTermId",
}

const keyValueAudit = (value: Readonly<Record<string, string>>) =>
  Object.entries(value)
    .map(([key, code]) => `${key}: ${code}`)
    .join(", ") || null

export function createDictionariesMocks({
  extension,
  baseUrl,
  companies,
}: DictionariesMocksOptions = {}) {
  // Свіжі фікстури на кожне скидання: PATCH і подія вимкнення змінюють записи на місці.
  const fixtures = () => createDictionariesFixtures({ companies })

  const taxes = createResourceHandlers<Tax>({
    resource: TAXES,
    baseUrl,
    schema: taxSchemaFor(extension?.taxes),
    data: () => withMockValues(fixtures().taxes, extension?.taxes?.fields),
    searchFields: ["name"],
    label: labelOf(TAXES),
    fieldLabels: {
      ...NAME_LABELS,
      rate: { uk: "Ставка", en: "Rate" },
      included: { uk: "Уже в ціні", en: "Included in price" },
      externalCodes: { uk: "Зовнішні коди", en: "External codes" },
    },
    auditValue: { externalCodes: keyValueAudit },
    unique: ["name"],
  })

  const units = createResourceHandlers<Unit>({
    resource: UNITS,
    baseUrl,
    schema: unitSchemaFor(extension?.units),
    data: () => withMockValues(fixtures().units, extension?.units?.fields),
    searchFields: ["name", "shortName"],
    label: labelOf(UNITS),
    fieldLabels: {
      ...NAME_LABELS,
      shortName: { uk: "Скорочення", en: "Short name" },
      decimals: { uk: "Знаків після коми", en: "Decimal places" },
      externalCodes: { uk: "Зовнішні коди", en: "External codes" },
    },
    auditValue: { externalCodes: keyValueAudit },
    unique: ["name", "shortName"],
  })

  const paymentTerms = createResourceHandlers<PaymentTerm>({
    resource: PAYMENT_TERMS,
    baseUrl,
    schema: paymentTermSchemaFor(extension?.paymentTerms),
    data: () =>
      withMockValues(fixtures().paymentTerms, extension?.paymentTerms?.fields),
    searchFields: ["name"],
    label: labelOf(PAYMENT_TERMS),
    fieldLabels: {
      ...NAME_LABELS,
      parts: { uk: "Частини оплати", en: "Payment parts" },
      externalCodes: { uk: "Зовнішні коди", en: "External codes" },
    },
    auditValue: {
      externalCodes: keyValueAudit,
      parts: (parts: readonly PaymentTerm["parts"][number][]) =>
        parts
          .map(({ percent, days, base }) => `${percent}% / ${days} / ${base}`)
          .join(", "),
    },
    unique: ["name"],
  })

  const tags = createResourceHandlers<Tag>({
    resource: TAGS,
    baseUrl,
    schema: tagSchemaFor(extension?.tags),
    data: () => withMockValues(fixtures().tags, extension?.tags?.fields),
    searchFields: ["name"],
    label: labelOf(TAGS),
    fieldLabels: { ...NAME_LABELS, tone: { uk: "Колір", en: "Colour" } },
    unique: ["name"],
  })

  const reasons = createResourceHandlers<Reason>({
    resource: REASONS,
    baseUrl,
    schema: reasonSchemaFor(extension?.reasons),
    data: () => withMockValues(fixtures().reasons, extension?.reasons?.fields),
    searchFields: ["name"],
    label: labelOf(REASONS),
    fieldLabels: {
      ...NAME_LABELS,
      kind: { uk: "Де застосовується", en: "Used for" },
      commentRequired: { uk: "Потрібен коментар", en: "Comment required" },
    },
    unique: [["kind", "name"]],
  })

  const defaults = createResourceHandlers<DictionaryDefaults>({
    resource: DICTIONARY_DEFAULTS,
    baseUrl,
    schema: dictionaryDefaultsSchema,
    data: () => fixtures().defaults,
    label: labelOf(DICTIONARY_DEFAULTS),
    fieldLabels: {
      taxId: { uk: "Типовий податок", en: "Default tax" },
      unitId: { uk: "Типова одиниця", en: "Default unit" },
      paymentTermId: { uk: "Типові умови оплати", en: "Default payment terms" },
    },
  })

  subscribeMockEvents((event) => {
    const [resource, verb] = event.type.split(".")
    const field = resource ? DEFAULT_FIELDS[resource] : undefined
    if (!field || verb !== "updated" || event.data.active !== false) return
    for (const record of defaults.db.all()) {
      if (record.id !== DEFAULTS_ID || record[field] !== event.data.id) continue
      record[field] = null
      record.version += 1
    }
  })

  return {
    handlers: [
      ...taxes.handlers,
      ...units.handlers,
      ...paymentTerms.handlers,
      ...tags.handlers,
      ...reasons.handlers,
      ...defaults.handlers,
    ],
    db: {
      taxes: taxes.db,
      units: units.db,
      paymentTerms: paymentTerms.db,
      tags: tags.db,
      reasons: reasons.db,
      defaults: defaults.db,
    },
  }
}
