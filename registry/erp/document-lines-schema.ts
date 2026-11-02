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
  priceSchema,
  quantitySchema,
  singleDiscount,
  whenBodyValid,
  whenValid,
  type DocumentLine,
} from "@/registry/lib/document-lines"
import type { TotalsDiscount } from "@/registry/lib/document-totals"
import { currencyDigits } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import type { ukDocumentLines } from "@/registry/lib/i18n-uk-document-lines"

/**
 * Схема форми `erp/document-lines-editor` (UI05, ADR-0059): ті самі правила, що в контракті `lib/document-lines`,
 * але з текстами мовою інтерфейсу біля поля. Кількість, ціну й знижки перевіряють схеми контракту, суми —
 * перевірки контракту (`lineTotalsCheck` і далі), тож правило живе в одному місці. Порожня кількість чи
 * ціна — `""`. Знижка понад суму рядка видна в кожному рядку одразу, знижка документа — коли рядки правильні.
 *
 * Модуль додає поля шапки: `useDocumentLinesSchema(currency).safeExtend({ client: … })`.
 */

/** Значення форми, на яких стоїть редактор: рядки й знижка документа. */
export interface DocumentLinesValues extends TotalsDiscount {
  lines: DocumentLine[]
}

/** Коди помилок контракту й форми, які бачить людина. */
type IssueCode = Exclude<
  keyof (typeof ukDocumentLines)["documentLines"]["errors"],
  "tooLong"
>

export function useDocumentLinesSchema(currency: string) {
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
    const line = z
      .object({
        id: z.string(),
        name: z
          .string()
          .trim()
          .min(1, required)
          .max(
            LINE_NAME_MAX,
            t("documentLines.errors.tooLong", { max: LINE_NAME_MAX }),
          ),
        itemId: z.string().nullable(),
        quantity: decimal(quantitySchema),
        unit: documentLineSchema.shape.unit,
        price: decimal(priceSchema),
        ...discount,
        tax: documentLineSchema.shape.tax,
      })
      .refine(isSingleDiscount, singleDiscountText)
      .superRefine(lineTotalsCheck(digits, issueText), { when: whenValid })
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
  }, [currency, t])
}
