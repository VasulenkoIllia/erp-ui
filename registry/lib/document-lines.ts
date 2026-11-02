/**
 * Контракт рядка документа (UI05, ADR-0056): пропозиція, замовлення й рахунок беруть ті самі схеми.
 *
 * - Кількість і ціна за одиницю — десяткові рядки: JSON-число двійкове й псує дріб, а колонка
 *   `DECIMAL` бази віддає той самий рядок. Ціна — в основних одиницях валюти, бо вона точніша за
 *   копійку (0,1234 за одиницю). Суми — цілі мінорні одиниці (`moneyAmountSchema`).
 * - Назва — вільний текст, `itemId` — необов'язковий запис із ресурсу, який назве проект.
 * - Знижка рядка й документа — `discountPercent` або `discountAmount` (мінорні одиниці на весь рядок
 *   чи документ), більша за нуль лише одна. Знижка документа зменшує базу податку й ділиться між
 *   рядками (`lib/document-totals`).
 * - Одиниця й податок — знімок значень довідника на момент вибору: зміна довідника не чіпає старі
 *   документи. `included` приходить із довідника разом зі ставкою.
 * - Усі поля обов'язкові, типові значення дає форма: рядок сервера без `tax` — помилка контракту, а не
 *   рядок без податку.
 * - `POST` і `PATCH` надсилають рядки `documentLineSchema` і знижку документа
 *   (`documentBodySchemaFor`). Сервер рахує суми сам: `totals` у рядках (`savedDocumentLineSchema`) і
 *   `documentTotalsSchema` у документі.
 * - Запис документа розбирає модуль на картці, частинами: шапку видно й тоді, коли рядки зіпсовані.
 */
import { z } from "zod"

import { moneyAmountSchema } from "@/registry/lib/api"
import {
  documentTotalsIssue,
  type TaxTotal,
  type Totals,
  type TotalsDiscount,
  type TotalsIssue,
  type TotalsLine,
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
export const whenValid = ({ issues }: z.core.ParsePayload) =>
  issues.length === 0

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
/** Від'ємних сум у документі поки немає, кредит-нота розширить це на своєму кроці. */
const lineAmountSchema = moneyAmountSchema.min(0)

/** Поля знижки рядка й документа. */
export const discountShape = {
  discountPercent: percentSchema,
  /** Мінорні одиниці на весь рядок чи документ, не на одиницю товару. */
  discountAmount: lineAmountSchema,
} satisfies Record<keyof TotalsDiscount, z.ZodType<number>>

/** Знижка відсотком або сумою: друга при першій — помилка на полі суми. */
export const isSingleDiscount = (discount: TotalsDiscount) =>
  !(discount.discountPercent > 0 && discount.discountAmount > 0)
const singleDiscount = {
  error: "discount_both",
  path: ["discountAmount"],
}

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

export const documentLineSchema = z
  .object({
    id: z.string(),
    name: z.string().trim().min(1).max(LINE_NAME_MAX),
    itemId: z.string().nullable(),
    quantity: quantitySchema,
    unit: documentLineUnitSchema.nullable(),
    price: priceSchema,
    ...discountShape,
    /** null — рядок без податку. */
    tax: documentLineTaxSchema.nullable(),
  })
  .refine(isSingleDiscount, singleDiscount)
export type DocumentLine = z.infer<typeof documentLineSchema>
/** Знімки довідників у рядку. */
export type DocumentLineUnit = NonNullable<DocumentLine["unit"]>
export type DocumentLineTax = NonNullable<DocumentLine["tax"]>

const totalsShape = {
  /** Кількість × ціна, до знижки. */
  amount: lineAmountSchema,
  /** Уся знижка: рядка й частка знижки документа. */
  discount: lineAmountSchema,
  documentDiscount: lineAmountSchema,
  /** Без податку. */
  net: lineAmountSchema,
  tax: lineAmountSchema,
  /** З податком. */
  total: lineAmountSchema,
} satisfies Record<keyof Totals, z.ZodType<number>>

// `safeExtend`, як радимо модулям: `extend` схеми з `refine` не перевизначає поле.
export const savedDocumentLineSchema = documentLineSchema.safeExtend({
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
export type SavedDocumentTotals = z.infer<typeof documentTotalsSchema>

/** Текст помилки сум за кодом: контракт лишає код, форма (`erp/document-lines-schema`) перекладає. */
export type TotalsIssueText = (code: TotalsIssue["code"]) => string
const asCode: TotalsIssueText = (code) => code

/** Перевірки сум — після схеми, коли значення вже правильні: `documentTotalsIssue` інакше кидає. */
type TotalsCheck<T> = (value: T, context: z.core.$RefinementCtx<T>) => void

/** Знижка сумою понад суму рядка — помилка на полі знижки цього рядка, окремо в кожному рядку. */
export const lineTotalsCheck =
  <T extends TotalsLine>(
    digits: number,
    text: TotalsIssueText = asCode,
  ): TotalsCheck<T> =>
  (line, context) => {
    if (documentTotalsIssue([line], digits)?.code === "discount_exceeds")
      context.addIssue({
        code: "custom",
        message: text("discount_exceeds"),
        path: ["discountAmount"],
      })
  }

/** Сума рядків за межею контракту — помилка всієї групи. */
export const linesTotalsCheck =
  <T extends TotalsLine>(
    digits: number,
    text: TotalsIssueText = asCode,
  ): TotalsCheck<T[]> =>
  (lines, context) => {
    if (documentTotalsIssue(lines, digits)?.code === "out_of_range")
      context.addIssue({ code: "custom", message: text("out_of_range") })
  }

/** Знижка документа понад суму рядків після їхніх знижок — помилка на полі знижки документа. */
export const bodyTotalsCheck =
  <T extends TotalsDiscount & { lines: TotalsLine[] }>(
    digits: number,
    text: TotalsIssueText = asCode,
  ): TotalsCheck<T> =>
  (body, context) => {
    if (
      documentTotalsIssue(body.lines, digits, body)?.code === "discount_exceeds"
    )
      context.addIssue({
        code: "custom",
        message: text("discount_exceeds"),
        path: ["discountAmount"],
      })
  }

const BODY_KEYS: ReadonlySet<PropertyKey> = new Set([
  "lines",
  ...Object.keys(discountShape),
])

/** Рядки й знижка документа без помилок; помилка в полі шапки модуля перевірку сум не вимикає. */
export const whenBodyValid = ({ issues }: z.core.ParsePayload) =>
  !issues.some((issue) => BODY_KEYS.has(issue.path?.[0] ?? ""))

/**
 * Рядки документа разом: схема рядка не бачить, що кількість і ціна разом вийшли за межу суми, а знижка
 * сумою — за суму рядка. `digits` — знаків після коми у валюти документа (`currencyDigits` з lib/format).
 */
export const documentLinesSchemaFor = (digits: number) =>
  z
    .array(
      documentLineSchema.superRefine(lineTotalsCheck(digits), {
        when: whenValid,
      }),
    )
    .superRefine(linesTotalsCheck(digits), { when: whenValid })

/**
 * Рядки й знижка документа: тіло, з якого сервер рахує підсумки. Модуль додає поля шапки через
 * `safeExtend`. Знижка документа більша за суму рядків після їхніх знижок — `discount_exceeds`.
 */
export const documentBodySchemaFor = (digits: number) =>
  z
    .object({ lines: documentLinesSchemaFor(digits), ...discountShape })
    .refine(isSingleDiscount, singleDiscount)
    .superRefine(bodyTotalsCheck(digits), { when: whenBodyValid })
export type DocumentBody = z.infer<ReturnType<typeof documentBodySchemaFor>>
