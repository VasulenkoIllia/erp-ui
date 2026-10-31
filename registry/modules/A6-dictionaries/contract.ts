/**
 * Контракт модуля A6 «Довідники» (SPEC §14, §17; ADR-0002, ADR-0047). П'ять ресурсів-довідників
 * (`/api/v1/<ресурс>`, плоскі параметри списку, відповідь `{ data, total }`) і одне налаштування, усе в
 * межах компанії запиту (`X-Company-Id`):
 *
 * - Спільне для довідників: `name` не повторюється в довіднику компанії (422 `name: duplicate`,
 *   у причин — у межах виду). `active: false` — значення вимкнено: його немає в нових виборах, старі
 *   документи його зберігають. Видаляти значення не можна (`DELETE` немає), це вікторина кроку A6.
 *   Фільтр `active`, пошук `q` за назвою, сортування `name`.
 * - `taxes` — `rate` у відсотках (0–100, два знаки), `included`: податок уже в ціні.
 * - `units` — `shortName` для документів, не повторюється; `decimals`: скільки знаків після коми
 *   дозволено в кількості (0–3).
 * - `payment-terms` — `parts`: коли й скільки платити. Частина — `percent` (більше 0), `days` після
 *   `base` (`invoice` — дата рахунку, `delivery` — дата поставки). Сума частин дорівнює 100, інакше
 *   422 `parts`. Частин від 1 до `PAYMENT_PARTS_MAX`, порядок зберігається.
 * - `tags` — `tone`: колір тега з токенів теми.
 * - `reasons` — `kind`: де застосовується причина (ключ модуля чи розширення), `commentRequired`:
 *   вибрати причину можна лише з коментарем. Фільтр `kind`.
 * - `externalCodes` податку, одиниці й умов оплати — коди значення в інших системах
 *   (`{ "Бухгалтерія": "0301" }`). `PATCH` замінює об'єкт цілком.
 * - `dictionary-defaults/current` — одне налаштування на компанію: `taxId`, `unitId`, `paymentTermId`
 *   (`null` — не вибрано). Адреса стала, запис є завжди. Вимкнення значення прибирає його з типових:
 *   це робить сервер, вимкнене значення ніколи не лишається типовим.
 * - Права — `<ресурс>:<дія>`: довідники `read`, `create`, `update`; `dictionary-defaults` `read`, `update`.
 *
 * Поля розширення проекту (ADR-0020) входять у схеми через `…SchemaFor`: без них zod відкинув би нові
 * поля відповіді.
 */
import { z } from "zod"

import { recordBaseSchema } from "@/lib/api"
import { extendSchema, type ExtensionField } from "@/lib/extension-fields"
import {
  KEY_VALUE_KEY_MAX,
  KEY_VALUE_MAX_ROWS,
  KEY_VALUE_VALUE_MAX,
} from "@/lib/key-value"
import {
  statusSchema,
  type ExtensionStatusChanges,
  type StatusTone,
} from "@/lib/statuses"

export {
  DICTIONARY_DEFAULTS,
  DICTIONARY_RESOURCES,
  PAYMENT_TERMS,
  REASONS,
  TAGS,
  TAXES,
  UNITS,
} from "./resources"

export const DEFAULTS_ID = "current"

export const NAME_MAX = 80
export const SHORT_NAME_MAX = 12
export const UNIT_DECIMALS_MAX = 3
export const PERCENT_DECIMALS = 2
export const PAYMENT_PARTS_MAX = 12
export const PAYMENT_DAYS_MAX = 365

export const PAYMENT_BASES = ["invoice", "delivery"] as const
export type PaymentBase = (typeof PAYMENT_BASES)[number]

export const TAG_TONES = [
  "neutral",
  "info",
  "success",
  "warning",
  "destructive",
] as const satisfies readonly StatusTone[]

export const REASON_KINDS = ["cancel", "reject", "return", "other"] as const
export type ReasonKind = (typeof REASON_KINDS)[number]

/** Значення належить компанії запиту, вимкнене лишається в старих документах. */
const entryShape = {
  companyId: z.string().nullable().optional(),
  name: z.string().trim().min(1).max(NAME_MAX),
  active: z.boolean().default(true),
}
/** Межі ті самі, що у формі: значення, яке прийшло не з неї, теж має зберігатись нею. */
const externalCodes = z
  .record(
    z.string().trim().min(1).max(KEY_VALUE_KEY_MAX),
    z.string().trim().min(1).max(KEY_VALUE_VALUE_MAX),
  )
  .refine(
    (codes) => Object.keys(codes).length <= KEY_VALUE_MAX_ROWS,
    "too_many",
  )
  .default({})
/** Відсоток із двома знаками: суму частин рахуємо в сотих. */
const percent = z.number().multipleOf(10 ** -PERCENT_DECIMALS)

export const taxSchema = recordBaseSchema.extend({
  ...entryShape,
  rate: percent.min(0).max(100),
  included: z.boolean().default(false),
  externalCodes,
})
export type Tax = z.infer<typeof taxSchema>

export const unitSchema = recordBaseSchema.extend({
  ...entryShape,
  shortName: z.string().trim().min(1).max(SHORT_NAME_MAX),
  decimals: z.number().int().min(0).max(UNIT_DECIMALS_MAX),
  externalCodes,
})
export type Unit = z.infer<typeof unitSchema>

export const paymentPartSchema = z.object({
  percent: percent.positive().max(100),
  days: z.number().int().min(0).max(PAYMENT_DAYS_MAX),
  base: z.enum(PAYMENT_BASES),
})
export type PaymentPart = z.infer<typeof paymentPartSchema>

/** Сума частин у сотих відсотка: 33,33 + 33,33 + 33,34 дає рівно 100, а не шум дробових чисел. */
const partsHundredths = (parts: readonly { percent: number | null }[]) =>
  parts.reduce(
    (total, part) => total + Math.round((part.percent ?? 0) * 100),
    0,
  )

export const partsTotal = (parts: readonly { percent: number | null }[]) =>
  partsHundredths(parts) / 100

/** Скільки бракує до 100 %: значення нової частини. */
export const partsRemainder = (parts: readonly { percent: number | null }[]) =>
  Math.max(10_000 - partsHundredths(parts), 0) / 100

export const paymentTermSchema = recordBaseSchema.extend({
  ...entryShape,
  parts: z
    .array(paymentPartSchema)
    .min(1)
    .max(PAYMENT_PARTS_MAX)
    .refine((parts) => partsTotal(parts) === 100, "invalid"),
  externalCodes,
})
export type PaymentTerm = z.infer<typeof paymentTermSchema>

export const tagSchema = recordBaseSchema.extend({
  ...entryShape,
  tone: z.enum(TAG_TONES),
})
export type Tag = z.infer<typeof tagSchema>

const reasonShape = {
  ...entryShape,
  commentRequired: z.boolean().default(false),
}

export const dictionaryDefaultsSchema = recordBaseSchema.extend({
  companyId: z.string().nullable().optional(),
  taxId: z.string().nullable().default(null),
  unitId: z.string().nullable().default(null),
  paymentTermId: z.string().nullable().default(null),
})
export type DictionaryDefaults = z.infer<typeof dictionaryDefaultsSchema>

export interface DictionarySchemaExtension {
  readonly fields?: readonly ExtensionField[]
}

export interface ReasonSchemaExtension extends DictionarySchemaExtension {
  readonly kinds?: ExtensionStatusChanges<ReasonKind>
}

export const taxSchemaFor = (extension?: DictionarySchemaExtension) =>
  extendSchema(taxSchema, extension?.fields)
export const unitSchemaFor = (extension?: DictionarySchemaExtension) =>
  extendSchema(unitSchema, extension?.fields)
export const paymentTermSchemaFor = (extension?: DictionarySchemaExtension) =>
  extendSchema(paymentTermSchema, extension?.fields)
export const tagSchemaFor = (extension?: DictionarySchemaExtension) =>
  extendSchema(tagSchema, extension?.fields)

export const reasonSchemaFor = (extension?: ReasonSchemaExtension) =>
  extendSchema(
    recordBaseSchema.extend({
      ...reasonShape,
      kind: statusSchema(REASON_KINDS, extension?.kinds),
    }),
    extension?.fields,
  )
export type Reason = z.infer<ReturnType<typeof reasonSchemaFor>>

/** Спільне для значень усіх довідників: на цьому тримаються список, вимкнення й форма. */
export type DictionaryEntry = Tax | Unit | PaymentTerm | Tag | Reason
