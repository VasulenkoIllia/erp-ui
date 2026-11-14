import * as React from "react"

import { useDateIssueText } from "@/registry/erp/date-input"
import type {
  DocumentBodyLine,
  LineExtensionShape,
} from "@/registry/lib/document-lines"
import type { ExtensionField } from "@/registry/lib/extension-fields"
import {
  extensionFormFields,
  extensionFormLines,
  extensionFormSchema,
  extensionPayloadLines,
} from "@/registry/lib/extension-form"
import { useErpUiT } from "@/registry/lib/i18n"

/**
 * Поля розширення рядка документа у формі (`lineFields`, ADR-0086): схеми для другого аргументу
 * `useDocumentLinesSchema` (`erp/document-lines-schema`), значення рядків для форми й для запиту, поля
 * для редактора. Окремо від схеми рядків: тексти помилок дати тягнуть поле дати з календарем, а схема
 * рядків потрібна й сторінкам без полів рядка.
 */

export interface DocumentLineFieldsApi {
  /** Поля розширення рядка в порядку `lineFields`: для редактора (`DocumentFormLines.lineFields`). */
  readonly fields: readonly ExtensionField[]
  /** Схеми полів у рядку форми — другий аргумент `useDocumentLinesSchema`. */
  readonly shape: LineExtensionShape
  /** Рядки документа для значень форми: у рядку товару — значення полів розширення для форми. */
  readonly formLines: <L extends DocumentBodyLine>(lines: readonly L[]) => L[]
  /** Рядки форми для запиту: порожнє поле розширення — `null`. */
  readonly payloadLines: <L extends DocumentBodyLine>(
    lines: readonly L[],
  ) => L[]
}

const NO_LINE_FIELDS: readonly ExtensionField[] = []
const NO_LINE_SHAPE: LineExtensionShape = {}

/**
 * Поля розширення рядка документа у формі. `lineFields` — стабільні між рендерами (константа файлу
 * розширення): від них залежить схема форми. Обов'язкове поле — «Заповніть це поле» біля поля рядка.
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
