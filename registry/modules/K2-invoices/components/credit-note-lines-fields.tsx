import { useId, useMemo, useRef, useState } from "react"
import {
  useFieldArray,
  useFormState,
  useWatch,
  type UseFormReturn,
} from "react-hook-form"

import { LineSum, lineSumOf } from "@/components/erp/document-line-fields"
import { FormField } from "@/components/erp/form"
import { DecimalInput } from "@/components/erp/number-input"
import { Button } from "@/components/ui/button"
import {
  QUANTITY_DECIMALS_MAX,
  type SavedDocumentLine,
} from "@/lib/document-lines"
import { useFormat } from "@/lib/format"
import { useErpUiT } from "@/lib/i18n"
import { ACTION_ICONS } from "@/lib/icons"

import type { CreditNoteCard } from "../contract"
import { creditNoteLinePreview } from "../credit-note-sums"
import { useInvoicesT } from "../use-invoices-t"

/** Рядки форми кредит-ноти: `id` рядка рахунку й кількість. */
interface CreditNoteLinesValues {
  lines: { id: string; quantity: string }[]
}

/** Значення форми кредит-ноти: дата, рядки, поля розширення. */
export type CreditNoteFormValues = CreditNoteLinesValues & {
  date: string
} & Record<string, unknown>

type LinesForm = UseFormReturn<CreditNoteLinesValues>

type Basis = NonNullable<CreditNoteCard["basis"]>[string]

const RemoveIcon = ACTION_ICONS.delete

interface CreditNoteLinesFieldsProps {
  readonly form: UseFormReturn<CreditNoteFormValues>
  readonly note: CreditNoteCard
  readonly readOnly: boolean
}

/**
 * Повернені рядки кредит-ноти (ADR-0072): назва й ціна — з рахунку, змінити можна лише кількість (не більше
 * залишку рахунку) і прибрати рядок. Сума рядка (як у редакторі рядків: без знижки документа й податку) і
 * сума кредит-ноти з податком — попередній розрахунок тим самим правилом, що на сервері (`credit-note-sums`);
 * після збереження — суми сервера. На вузькому екрані рядок — картка, від
 * `@2xl` — рядок таблиці.
 */
export function CreditNoteLinesFields({
  form,
  note,
  readOnly,
}: CreditNoteLinesFieldsProps) {
  const t = useInvoicesT()
  const kitT = useErpUiT()
  const format = useFormat()
  // Поля розширення в значеннях (`Record<string, unknown>`) ламають шляхи RHF: рядкам — лише рядки.
  const linesForm = form as unknown as LinesForm
  const { fields, remove } = useFieldArray({
    control: linesForm.control,
    name: "lines",
    keyName: "key",
  })
  const lines = useWatch({ control: linesForm.control, name: "lines" })
  const { errors } = useFormState({
    control: linesForm.control,
    name: "lines",
  })
  const [announcement, setAnnouncement] = useState("")
  const headingId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const byId = useMemo(
    () => new Map(note.lines.map((line) => [line.id, line])),
    [note.lines],
  )
  const total = useMemo(() => {
    let sum = 0
    for (const { id, quantity } of lines) {
      const line = byId.get(id)
      const preview = line
        ? creditNoteLinePreview(line, note.basis?.[id], quantity)
        : null
      if (preview === null) return null
      sum += preview.total
    }
    return sum
  }, [lines, byId, note.basis])
  const linesError = errors.lines?.root?.message ?? errors.lines?.message
  return (
    <section
      aria-labelledby={headingId}
      data-slot="credit-note-lines"
      data-field-name="lines"
      className="@container grid gap-3"
    >
      <h2
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className="text-base font-medium"
      >
        {t("creditNoteForm.lines.label")}
      </h2>
      {readOnly ? null : (
        <p className="text-sm text-muted-foreground">
          {t("creditNoteForm.lines.hint")}
        </p>
      )}
      <ul className="grid gap-3">
        {fields.map((field, index) => {
          const line = byId.get(field.id)
          return line ? (
            <CreditNoteLineRow
              key={field.key}
              form={linesForm}
              index={index}
              line={line}
              basis={note.basis?.[field.id]}
              currency={note.currency}
              readOnly={readOnly}
              onRemove={() => {
                remove(index)
                setAnnouncement(
                  t("creditNoteForm.lines.removed", { name: line.name }),
                )
                // Кнопка зникла разом із рядком: фокус — на заголовок рядків, а не на початок сторінки.
                headingRef.current?.focus()
              }}
            />
          ) : null
        })}
      </ul>
      {linesError ? (
        <p role="alert" className="text-sm text-destructive">
          {linesError}
        </p>
      ) : null}
      <p className="flex flex-wrap justify-end gap-x-3 text-base font-medium">
        <span>{t("creditNoteForm.lines.total")}</span>
        <span className="tabular-nums" data-slot="credit-note-total">
          {total === null ? (
            <>
              <span aria-hidden>—</span>
              <span className="sr-only">{kitT("documentLines.noSum")}</span>
            </>
          ) : (
            format.money({ amount: total, currency: note.currency })
          )}
        </span>
      </p>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  )
}

interface CreditNoteLineRowProps {
  readonly form: LinesForm
  readonly index: number
  readonly line: SavedDocumentLine
  readonly basis: Basis | undefined
  readonly currency: string
  readonly readOnly: boolean
  readonly onRemove: () => void
}

function CreditNoteLineRow({
  form,
  index,
  line,
  basis,
  currency,
  readOnly,
  onRemove,
}: CreditNoteLineRowProps) {
  const t = useInvoicesT()
  const format = useFormat()
  const quantity = useWatch({
    control: form.control,
    name: `lines.${index}.quantity`,
  })
  const preview = creditNoteLinePreview(line, basis, quantity)
  const unit = line.unit?.name ?? ""
  return (
    <li
      data-slot="credit-note-line"
      className="grid gap-3 rounded-lg border p-3 @2xl:grid-cols-[minmax(10rem,3fr)_minmax(9rem,1.6fr)_minmax(7rem,1fr)_auto] @2xl:items-start"
    >
      <div className="grid min-w-0 gap-1">
        <p className="font-medium break-words">{line.name}</p>
        <p className="text-sm text-muted-foreground tabular-nums">
          {t("creditNoteForm.lines.price")}:{" "}
          {format.price(line.price, currency)}
        </p>
      </div>
      <FormField
        control={form.control}
        name={`lines.${index}.quantity`}
        label={
          <>
            {t("creditNoteForm.lines.quantity")}
            <span className="sr-only">: {line.name}</span>
          </>
        }
        description={
          basis
            ? t("creditNoteForm.lines.available", {
                available: format.decimal(basis.available),
                unit,
              }).trim()
            : undefined
        }
        readOnly={readOnly}
        render={({ field, control }) => (
          <DecimalInput
            {...control}
            ref={field.ref}
            decimalScale={QUANTITY_DECIMALS_MAX}
            value={field.value}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
            unit={unit || undefined}
          />
        )}
      />
      <LineSum
        label={t("creditNoteForm.lines.sum")}
        sum={preview === null ? null : lineSumOf(preview)}
        currency={currency}
        className="@2xl:items-end"
      />
      {readOnly ? null : (
        <div className="flex justify-end @2xl:pt-6">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("creditNoteForm.lines.remove", { name: line.name })}
            onClick={onRemove}
          >
            <RemoveIcon aria-hidden />
          </Button>
        </div>
      )}
    </li>
  )
}
