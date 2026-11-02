import * as React from "react"
import { z } from "zod"

import {
  documentLineSchema,
  isSingleDiscount,
  LINE_NAME_MAX,
  priceSchema,
  quantitySchema,
  whenValid,
  type DocumentLine,
} from "@/registry/lib/document-lines"
import {
  documentTotalsIssue,
  type TotalsDiscount,
} from "@/registry/lib/document-totals"
import { currencyDigits } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import type { ukDocumentLines } from "@/registry/lib/i18n-uk-document-lines"

/**
 * Схема форми `erp/document-lines-editor` (UI05, ADR-0059): ті самі правила, що в контракті `lib/document-lines`,
 * але з текстами мовою інтерфейсу біля поля. Кількість і ціна перевіряються схемами контракту, суми й
 * знижки — `documentTotalsIssue`, тож правило живе в одному місці. Порожня кількість чи ціна — `""`.
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
    const issueText = (code: string) =>
      t(`documentLines.errors.${code as IssueCode}`)
    const decimal = (schema: z.ZodType<string>) =>
      z.string().superRefine((value, context) => {
        const message = value
          ? schema.safeParse(value).error?.issues[0]?.message
          : required
        if (message)
          context.addIssue({
            code: "custom",
            message: value ? issueText(message) : message,
          })
      })
    const discount = {
      discountPercent: z.number().max(100, issueText("percentMax")),
      // Поле суми дає bigint понад межу безпечного цілого, форма тримає його числом поза межею.
      discountAmount: z
        .number()
        .refine(Number.isSafeInteger, issueText("out_of_range")),
    }
    const singleDiscount = {
      error: issueText("discount_both"),
      path: ["discountAmount"],
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
      .refine(isSingleDiscount, singleDiscount)
    const lines = z.array(line).superRefine(
      (rows, context) => {
        const issue = documentTotalsIssue(rows, digits)
        if (issue?.code === "out_of_range")
          context.addIssue({ code: "custom", message: issueText(issue.code) })
        if (issue?.code === "discount_exceeds" && issue.line !== null)
          context.addIssue({
            code: "custom",
            message: issueText(issue.code),
            path: [issue.line, "discountAmount"],
          })
      },
      { when: whenValid },
    )
    return z
      .object({ lines, ...discount })
      .refine(isSingleDiscount, singleDiscount)
      .superRefine(
        (body, context) => {
          if (
            documentTotalsIssue(body.lines, digits, body)?.code ===
            "discount_exceeds"
          )
            context.addIssue({
              code: "custom",
              message: issueText("discount_exceeds"),
              path: ["discountAmount"],
            })
        },
        { when: whenValid },
      )
  }, [currency, t])
}
