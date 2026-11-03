import * as React from "react"
import type { RaRecord } from "ra-core"
import { useWatch, type UseFormReturn } from "react-hook-form"

import {
  DocumentLineFields,
  LineSum,
  type DocumentLineItem,
} from "@/registry/erp/document-line-fields"
import {
  lineTotalsOf,
  useSectionSum,
} from "@/registry/erp/document-lines-preview"
import type { DocumentLinesValues } from "@/registry/erp/document-lines-schema"
import { FormField } from "@/registry/erp/form"
import {
  savedDocumentLineSchema,
  type DocumentBodyLine,
  type DocumentLine,
  type DocumentLineTax,
  type DocumentLineUnit,
} from "@/registry/lib/document-lines"
import type { Totals } from "@/registry/lib/document-totals"
import { currencyDigits } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import { Input } from "@/registry/ui/input"
import { Textarea } from "@/registry/ui/textarea"

/**
 * Рядок `erp/document-lines-editor` будь-якого виду (UI05b, ADR-0060): товар чи послуга
 * (`erp/document-line-fields`), розділ із сумою або нотатка. Рядок підписаний лише на свої значення
 * (`useWatch` з порівнянням): введення в іншому рядку його не перемальовує.
 *
 * - Розділ — назва на ширину рядка й сума його рядків у колонці «Сума» (`useSectionSum`).
 * - Нотатка — текст на всю ширину рядка, без суми.
 * - Частина редактора: форма — `DocumentLinesValues`.
 */

type LinesForm = UseFormReturn<DocumentLinesValues>

export interface DocumentLineRowProps<T extends RaRecord> {
  form: LinesForm
  index: number
  rowLabel: string
  readOnly: boolean
  currency: string
  units: readonly (DocumentLineUnit & { id: string })[]
  taxes: readonly DocumentLineTax[]
  item?: DocumentLineItem<T>
}

/** Суми сервера в збереженому рядку (`savedDocumentLineSchema`); рядок форми їх не має. */
const savedLineTotals = (line: DocumentLine): Totals | undefined =>
  "totals" in line
    ? savedDocumentLineSchema.shape.totals.safeParse(line.totals).data
    : undefined

/**
 * Знімок рядка: `compute` порівнює його з попереднім і не перемальовує рядок без змін. Копія, бо перше
 * значення `useWatch` — живий об'єкт форми, який RHF змінює на місці: порівняння з ним завжди «рівне».
 */
const snapshotOf = (line: DocumentBodyLine | undefined) => line && { ...line }

export function DocumentLineRow<T extends RaRecord>({
  form,
  index,
  rowLabel,
  readOnly,
  currency,
  units,
  taxes,
  item,
}: DocumentLineRowProps<T>) {
  const line = useWatch({
    control: form.control,
    name: `lines.${index}`,
    compute: snapshotOf,
  })
  const digits = currencyDigits(currency)
  const totals = React.useMemo(
    () =>
      line?.kind === "item"
        ? (readOnly && savedLineTotals(line)) || lineTotalsOf(line, digits)
        : undefined,
    [line, readOnly, digits],
  )
  if (line?.kind === "section")
    return (
      <SectionFields
        form={form}
        index={index}
        readOnly={readOnly}
        currency={currency}
      />
    )
  if (line?.kind === "note")
    return <NoteFields form={form} index={index} readOnly={readOnly} />
  return (
    <DocumentLineFields
      form={form}
      index={index}
      rowLabel={rowLabel}
      line={line}
      totals={totals}
      currency={currency}
      units={units}
      taxes={taxes}
      item={item}
      readOnly={readOnly}
    />
  )
}

function SectionFields({
  form,
  index,
  readOnly,
  currency,
}: {
  form: LinesForm
  index: number
  readOnly: boolean
  currency: string
}) {
  const t = useErpUiT()
  const sum = useSectionSum(index)
  return (
    <>
      <FormField
        control={form.control}
        name={`lines.${index}.title`}
        label={t("documentLines.section")}
        readOnly={readOnly}
        className="col-span-full @4xl:col-span-6"
        render={({ field, control }) => (
          <Input
            {...control}
            {...field}
            value={field.value}
            autoComplete="off"
            placeholder={t("documentLines.sectionPlaceholder")}
            className="font-semibold"
          />
        )}
      />
      <LineSum
        label={t("documentLines.sectionSum")}
        sum={sum !== undefined && Number.isSafeInteger(sum) ? sum : null}
        currency={currency}
        className="col-span-full @4xl:col-span-1"
      />
    </>
  )
}

function NoteFields({
  form,
  index,
  readOnly,
}: {
  form: LinesForm
  index: number
  readOnly: boolean
}) {
  const t = useErpUiT()
  return (
    <FormField
      control={form.control}
      name={`lines.${index}.text`}
      label={t("documentLines.note")}
      readOnly={readOnly}
      className="col-span-full"
      render={({ field, control }) => (
        <Textarea
          {...control}
          {...field}
          value={field.value}
          rows={2}
          placeholder={t("documentLines.notePlaceholder")}
        />
      )}
    />
  )
}
