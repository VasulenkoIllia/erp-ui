/**
 * Контракт рядка документа (UI05, ADR-0056): пропозиція, замовлення й рахунок беруть ті самі схеми.
 *
 * - Кількість і ціна за одиницю — десяткові рядки: JSON-число двійкове й псує дріб, а колонка
 *   `DECIMAL` бази віддає той самий рядок. Ціна — в основних одиницях валюти, бо вона точніша за
 *   копійку (0,1234 за одиницю). Суми — цілі мінорні одиниці (`moneyAmountSchema`).
 * - Назва — вільний текст, `itemId` — необов'язковий запис із ресурсу, який назве проект.
 * - Одиниця й податок — знімок значень довідника на момент вибору: зміна довідника не чіпає старі
 *   документи. `included` приходить із довідника разом зі ставкою.
 * - Усі поля обов'язкові, типові значення дає форма: рядок сервера без `tax` — помилка контракту, а не
 *   рядок без податку.
 * - `POST` і `PATCH` надсилають `documentLineSchema`. Сервер рахує суми сам: `totals` у рядках
 *   (`savedDocumentLineSchema`) і `documentTotalsSchema` у документі.
 * - Запис документа розбирає модуль на картці, частинами: шапку видно й тоді, коли рядки зіпсовані.
 */
import { z } from "zod"

import { moneyAmountSchema } from "@/registry/lib/api"
import {
  computeDocumentTotals,
  type TaxTotal,
  type Totals,
} from "@/registry/lib/document-totals"

/** Стільки ж, скільки дозволяє `decimals` одиниці в довіднику. */
export const QUANTITY_DECIMALS_MAX = 3
export const PRICE_DECIMALS_MAX = 4
/** Цілих розрядів, як у полі суми (ADR-0015). */
const INTEGER_DIGITS_MAX = 15
/** Два знаки, як у довіднику ставок; у соті відсотка їх переводить `lib/document-totals`. */
const PERCENT_STEP = 0.01

export const LINE_NAME_MAX = 500
export const UNIT_NAME_MAX = 12
export const TAX_NAME_MAX = 80

/** zod не перериває перевірку помилкою регулярного виразу, а на зіпсованому значенні вона хибна. */
const whenValid = ({ issues }: z.core.ParsePayload) => issues.length === 0

/** Канонічний запис: без знака, зайвих нулів зліва й коми, бо це формат контракту, а не введення. */
const decimalSchema = (decimals: number) =>
  z
    .string()
    .regex(
      new RegExp(
        `^(0|[1-9]\\d{0,${String(INTEGER_DIGITS_MAX - 1)}})(\\.\\d{1,${String(decimals)}})?$`,
      ),
      "invalid",
    )

const percentSchema = z.number().min(0).max(100).multipleOf(PERCENT_STEP)

export const quantitySchema = decimalSchema(QUANTITY_DECIMALS_MAX).refine(
  (quantity) => /[1-9]/.test(quantity),
  { error: "positive", when: whenValid },
)
export const priceSchema = decimalSchema(PRICE_DECIMALS_MAX)

const documentLineUnitSchema = z.object({
  /** null — одиницю вписали вручну. */
  id: z.string().nullable(),
  name: z.string().trim().min(1).max(UNIT_NAME_MAX),
})

const documentLineTaxSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(TAX_NAME_MAX),
  rate: percentSchema,
  included: z.boolean(),
})

export const documentLineSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(LINE_NAME_MAX),
  itemId: z.string().nullable(),
  quantity: quantitySchema,
  unit: documentLineUnitSchema.nullable(),
  price: priceSchema,
  discountPercent: percentSchema,
  /** null — рядок без податку. */
  tax: documentLineTaxSchema.nullable(),
})
export type DocumentLine = z.infer<typeof documentLineSchema>

/** Від'ємних сум у документі поки немає, кредит-нота розширить це на своєму кроці. */
const lineAmountSchema = moneyAmountSchema.min(0)

const totalsShape = {
  /** Кількість × ціна, до знижки. */
  amount: lineAmountSchema,
  discount: lineAmountSchema,
  /** Без податку. */
  net: lineAmountSchema,
  tax: lineAmountSchema,
  /** З податком. */
  total: lineAmountSchema,
} satisfies Record<keyof Totals, z.ZodType<number>>

export const savedDocumentLineSchema = documentLineSchema.extend({
  totals: z.object(totalsShape),
})
export type SavedDocumentLine = z.infer<typeof savedDocumentLineSchema>

const documentTaxTotalSchema: z.ZodType<TaxTotal> = z.object({
  taxId: z.string(),
  rate: percentSchema,
  included: z.boolean(),
  net: lineAmountSchema,
  tax: lineAmountSchema,
})

export const documentTotalsSchema = z.object({
  ...totalsShape,
  taxes: z.array(documentTaxTotalSchema),
})

/**
 * Рядки документа разом: схема рядка не бачить, що кількість і ціна разом вийшли за межу суми.
 * `digits` — знаків після коми у валюти документа (`currencyDigits` з lib/format).
 */
export const documentLinesSchemaFor = (digits: number) =>
  z
    .array(documentLineSchema)
    .refine((lines) => computeDocumentTotals(lines, digits) !== null, {
      error: "out_of_range",
      when: whenValid,
    })
