/**
 * Контракт рядка документа (UI05, ADR-0056): пропозиція, замовлення й рахунок беруть ті самі схеми.
 *
 * - Кількість і ціна за одиницю — десяткові рядки: JSON-число двійкове й псує дріб, а колонка
 *   `DECIMAL` бази віддає той самий рядок. Ціна — в основних одиницях валюти, бо вона точніша за
 *   копійку (0,1234 за одиницю). Суми — цілі мінорні одиниці (`moneyAmountSchema`).
 * - Назва — вільний текст, `itemId` — необов'язковий запис із ресурсу, який назве проект.
 * - Одиниця й податок — знімок значень довідника на момент вибору: зміна довідника не чіпає старі
 *   документи. `included` приходить із довідника разом зі ставкою.
 * - `POST` і `PATCH` надсилають `documentLineSchema`. Сервер рахує суми сам і повертає
 *   `savedDocumentLineSchema` у рядках та `documentTotalsSchema` у документі.
 * - Запис документа розбирає модуль на картці, частинами: шапку видно й тоді, коли рядки зіпсовані.
 */
import { z } from "zod"

import { moneyAmountSchema } from "@/registry/lib/api"
import { computeDocumentTotals } from "@/registry/lib/document-totals"

/** Стільки ж, скільки дозволяє `decimals` одиниці в довіднику. */
export const QUANTITY_DECIMALS_MAX = 3
export const PRICE_DECIMALS_MAX = 4
/** Цілих розрядів, як у полі суми (ADR-0015). */
const INTEGER_DIGITS_MAX = 15
const PERCENT_STEP = 0.01

export const LINE_NAME_MAX = 500
export const UNIT_NAME_MAX = 12
export const TAX_NAME_MAX = 80

/** Канонічний запис: без знака, зайвих нулів зліва й коми, бо це формат контракту, а не введення. */
const decimalSchema = (decimals: number) =>
  z
    .string()
    .regex(
      new RegExp(
        `^(0|[1-9]\\d{0,${String(INTEGER_DIGITS_MAX - 1)}})(\\.\\d{1,${String(decimals)}})?$`,
      ),
    )

const percentSchema = z.number().min(0).max(100).multipleOf(PERCENT_STEP)

export const quantitySchema = decimalSchema(QUANTITY_DECIMALS_MAX).refine(
  (quantity) => /[1-9]/.test(quantity),
  "positive",
)
export const priceSchema = decimalSchema(PRICE_DECIMALS_MAX)

export const documentLineTaxSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(TAX_NAME_MAX),
  rate: percentSchema,
  included: z.boolean(),
})

export const documentLineSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(LINE_NAME_MAX),
  itemId: z.string().nullable().default(null),
  quantity: quantitySchema,
  unitId: z.string().nullable().default(null),
  unitName: z.string().trim().max(UNIT_NAME_MAX).nullable().default(null),
  price: priceSchema,
  discountPercent: percentSchema.default(0),
  /** null — рядок без податку. */
  tax: documentLineTaxSchema.nullable().default(null),
})
export type DocumentLine = z.infer<typeof documentLineSchema>

const totalsShape = {
  /** Кількість × ціна, до знижки. */
  amount: moneyAmountSchema,
  discount: moneyAmountSchema,
  /** Без податку. */
  net: moneyAmountSchema,
  tax: moneyAmountSchema,
  /** З податком. */
  total: moneyAmountSchema,
}

export const savedDocumentLineSchema = documentLineSchema.extend(totalsShape)
export type SavedDocumentLine = z.infer<typeof savedDocumentLineSchema>

export const documentTaxTotalSchema = z.object({
  taxId: z.string(),
  rate: percentSchema,
  included: z.boolean(),
  net: moneyAmountSchema,
  tax: moneyAmountSchema,
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
      // Зіпсований рядок уже має свою помилку, а розрахунку потрібні коректні числа.
      when: ({ issues }) => issues.length === 0,
    })
