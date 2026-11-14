import * as React from "react"
import { z } from "zod"

import {
  bodyTotalsCheck,
  discountShape,
  documentLineSchema,
  isSingleDiscount,
  LINE_NAME_MAX,
  lineTotalsCheck,
  linesTotalsCheck,
  NOTE_TEXT_MAX,
  priceSchema,
  quantitySchema,
  SECTION_TITLE_MAX,
  singleDiscount,
  whenBodyValid,
  whenValid,
  type DocumentBodyLine,
} from "@/registry/lib/document-lines"
import type { TotalsDiscount } from "@/registry/lib/document-totals"
import { useDateIssueText } from "@/registry/erp/date-input"
import type { ExtensionField } from "@/registry/lib/extension-fields"
import {
  extensionFormFields,
  extensionFormLines,
  extensionFormSchema,
  extensionPayloadLines,
} from "@/registry/lib/extension-form"
import { currencyDigits } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import type { ukDocumentLines } from "@/registry/lib/i18n-uk-document-lines"

/**
 * Схема форми `erp/document-lines-editor` (UI05, ADR-0059): ті самі правила, що в контракті `lib/document-lines`,
 * але з текстами мовою інтерфейсу біля поля. Кількість, ціну й знижки перевіряють схеми контракту, суми —
 * перевірки контракту (`lineTotalsCheck` і далі), тож правило живе в одному місці. Порожня кількість чи
 * ціна — `""`. Знижка понад суму рядка видна в кожному рядку одразу, знижка документа — коли рядки правильні.
 * Розділи й нотатки (ADR-0060) — серед рядків: назва розділу й текст нотатки обов'язкові.
 *
 * Модуль додає поля шапки: `useDocumentLinesSchema(currency).safeExtend({ client: … })`. Поля розширення
 * рядка (`lineFields`, ADR-0086) — `useDocumentLineFields(lineFields)`: схеми для другого аргументу,
 * значення рядків для форми й для запиту, поля для редактора.
 */

/** Значення форми, на яких стоїть редактор: рядки (з розділами й нотатками) і знижка документа. */
export interface DocumentLinesValues extends TotalsDiscount {
  lines: DocumentBodyLine[]
}

/** Коди помилок контракту й форми, які бачить людина. */
type IssueCode = Exclude<
  keyof (typeof ukDocumentLines)["documentLines"]["errors"],
  "tooLong"
>

/** Схеми полів розширення рядка товару у формі. */
type LineFormShape = Readonly<Record<string, z.ZodType>>

const NO_LINE_SHAPE: LineFormShape = {}

export interface DocumentLineFieldsApi {
  /** Поля розширення рядка в порядку `lineFields`: для редактора (`DocumentFormLines.lineFields`). */
  readonly fields: readonly ExtensionField[]
  /** Схеми полів у рядку форми — другий аргумент `useDocumentLinesSchema`. */
  readonly shape: LineFormShape
  /** Рядки документа для значень форми: у рядку товару — значення полів розширення для форми. */
  readonly formLines: <L extends DocumentBodyLine>(lines: readonly L[]) => L[]
  /** Рядки форми для запиту: порожнє поле розширення — `null`. */
  readonly payloadLines: <L extends DocumentBodyLine>(
    lines: readonly L[],
  ) => L[]
}

const NO_LINE_FIELDS: readonly ExtensionField[] = []

/**
 * Поля розширення рядка документа у формі (ADR-0086). `lineFields` — стабільні між рендерами
 * (константа файлу розширення): від них залежить схема форми. Обов'язкове поле — «Заповніть це поле»
 * біля поля рядка.
 */
export function useDocumentLineFields(
  lineFields: readonly ExtensionField[] = NO_LINE_FIELDS,
): DocumentLineFieldsApi {
  const t = useErpUiT()
  const dateIssue = useDateIssueText()
  return React.useMemo(() => {
    // Усі поля рядка — у рядку: `extensionFormFields` лише перевіряє ключі.
    const fields = extensionFormFields(lineFields, {
      add: lineFields.map(({ id }) => ({ id })),
    })
    return {
      fields,
      shape: fields.length
        ? extensionFormSchema(fields, {
            required: t("validation.required"),
            dateIssue: (value) => dateIssue(value),
          })
        : NO_LINE_SHAPE,
      formLines: (lines) => extensionFormLines(fields, lines),
      payloadLines: (lines) => extensionPayloadLines(fields, lines),
    }
  }, [lineFields, t, dateIssue])
}

export function useDocumentLinesSchema(
  currency: string,
  lineShape: LineFormShape = NO_LINE_SHAPE,
) {
  const t = useErpUiT()
  return React.useMemo(() => {
    const digits = currencyDigits(currency)
    const required = t("validation.required")
    const issueText = (code: IssueCode) => t(`documentLines.errors.${code}`)
    /** Правило контракту, текст — мовою інтерфейсу. */
    const translated = <S extends z.ZodType>(
      base: S,
      contract: z.ZodType<z.output<S>>,
      message: (value: z.output<S>, error: z.ZodError) => string,
    ) =>
      base.superRefine((value, context) => {
        const { error } = contract.safeParse(value)
        if (error)
          context.addIssue({ code: "custom", message: message(value, error) })
      })
    const decimal = (schema: z.ZodType<string>) =>
      translated(z.string(), schema, (value, error) =>
        value ? issueText(error.issues[0]?.message as IssueCode) : required,
      )
    const discount = {
      // Поле не дає ввести від'ємне чи третій знак, але значення може прийти із запису.
      discountPercent: translated(
        z.number(),
        discountShape.discountPercent,
        (value) => issueText(value > 100 ? "percentMax" : "invalid"),
      ),
      discountAmount: translated(z.number(), discountShape.discountAmount, () =>
        issueText("invalid"),
      ),
    }
    const singleDiscountText = {
      ...singleDiscount,
      error: issueText("discount_both"),
    }
    /** Обов'язковий текст до `max` символів. */
    const text = (max: number) =>
      z
        .string()
        .trim()
        .min(1, required)
        .max(max, t("documentLines.errors.tooLong", { max }))
    const item = z
      .object({
        kind: z.literal("item"),
        id: z.string(),
        name: text(LINE_NAME_MAX),
        itemId: z.string().nullable(),
        quantity: decimal(quantitySchema),
        unit: documentLineSchema.shape.unit,
        price: decimal(priceSchema),
        ...discount,
        tax: documentLineSchema.shape.tax,
        ...lineShape,
      })
      .refine(isSingleDiscount, singleDiscountText)
      .superRefine(lineTotalsCheck(digits, issueText), { when: whenValid })
    const line = z.discriminatedUnion("kind", [
      item,
      z.object({
        kind: z.literal("section"),
        id: z.string(),
        title: text(SECTION_TITLE_MAX),
      }),
      z.object({
        kind: z.literal("note"),
        id: z.string(),
        text: text(NOTE_TEXT_MAX),
      }),
    ])
    return z
      .object({
        lines: z.array(line).superRefine(linesTotalsCheck(digits, issueText), {
          when: whenValid,
        }),
        ...discount,
      })
      .refine(isSingleDiscount, singleDiscountText)
      .superRefine(bodyTotalsCheck(digits, issueText), {
        when: whenBodyValid,
      }) satisfies z.ZodType<DocumentLinesValues>
  }, [currency, t, lineShape])
}
