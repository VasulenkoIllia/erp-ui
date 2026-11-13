import { useCallback, useMemo, useState } from "react"
import type { Path, UseFormReturn } from "react-hook-form"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import { z } from "zod"

import { dateFormItem } from "@/components/erp/document-form-items"
import {
  useExtensionForm,
  type ExtensionFormApi,
} from "@/components/erp/extension-field-input"
import {
  RecordFormFields,
  type RecordFormItem,
} from "@/components/erp/record-form"
import { RecordFormFrame } from "@/components/erp/record-form-page"
import { usePostingDate } from "@/hooks/use-period-lock"
import { useRecordForm, type RecordFormState } from "@/hooks/use-record-form"
import { isCalendarDate } from "@/lib/dates"
import { quantitySchema } from "@/lib/document-lines"
import { applyKeyedChanges } from "@/lib/extensions"
import { useFormat } from "@/lib/format"
import { useErpUiT } from "@/lib/i18n"

import {
  CREDIT_NOTE_ISSUES,
  CREDIT_NOTES,
  creditNoteCardSchemaFor,
  type CreditNoteCard,
} from "../contract"
import { CREDIT_NOTE_KIND } from "../credit-note-kind"
import { isWithinBasis } from "../credit-note-sums"
import type { CreditNoteFormFieldId } from "../extension"
import { useInvoicesModule } from "../module-context"
import { useInvoicesT } from "../use-invoices-t"
import {
  CreditNoteLinesFields,
  type CreditNoteFormValues,
} from "./credit-note-lines-fields"

type Basis = CreditNoteCard["basis"]

/** Текст помилки кількості рядка: порожня, не число, нуль чи понад залишок рахунку; правильна — `null`. */
function useQuantityIssue(basis: Basis) {
  const t = useInvoicesT()
  const kitT = useErpUiT()
  const format = useFormat()
  return useCallback(
    (id: string, quantity: string): string | null => {
      if (!quantity) return kitT("validation.required")
      const parsed = quantitySchema.safeParse(quantity)
      if (!parsed.success)
        return kitT(
          parsed.error.issues[0]?.message === "positive"
            ? "documentLines.errors.positive"
            : "documentLines.errors.invalid",
        )
      const line = basis?.[id]
      return line && !isWithinBasis(line, quantity)
        ? t("creditNoteForm.lines.exceeds", {
            available: format.decimal(line.available),
          })
        : null
    },
    [basis, t, kitT, format],
  )
}

function useCreditNoteFormSchema(basis: Basis, extensionShape: z.ZodRawShape) {
  const t = useInvoicesT()
  const kitT = useErpUiT()
  const quantityIssue = useQuantityIssue(basis)
  return useMemo(() => {
    const required = kitT("validation.required")
    return z.object({
      date: z.string().refine(isCalendarDate, required),
      lines: z
        .array(z.object({ id: z.string(), quantity: z.string() }))
        .min(1, t("creditNoteForm.lines.required"))
        .superRefine((lines, context) => {
          lines.forEach(({ id, quantity }, index) => {
            const message = quantityIssue(id, quantity)
            if (message)
              context.addIssue({
                code: "custom",
                path: [index, "quantity"],
                message,
              })
          })
        }),
      ...extensionShape,
    })
  }, [kitT, t, quantityIssue, extensionShape])
}

/** Зміна: змінена дата, рядки цілком (`id` і кількість — решту сервер бере з рахунку), поля розширення. */
const creditNotePayload = (
  values: CreditNoteFormValues,
  keys: readonly Path<CreditNoteFormValues>[],
  ext: ExtensionFormApi<CreditNoteFormFieldId>,
) => ({
  ...(keys.includes("date") ? { date: values.date } : {}),
  ...(keys.includes("lines")
    ? { lines: values.lines.map(({ id, quantity }) => ({ id, quantity })) }
    : {}),
  ...ext.payload(values, keys),
})

/** Дата з першим відкритим днем закритого періоду (PF13); дату з клавіатури відхилить сервер. */
function useDateItem(
  form: UseFormReturn<CreditNoteFormValues>,
  readOnly: boolean,
): RecordFormItem & { id: CreditNoteFormFieldId } {
  const t = useInvoicesT()
  const { min, hint } = usePostingDate()
  const { control } = form
  return useMemo(
    () =>
      dateFormItem({
        control,
        name: "date",
        label: t("creditNoteForm.fields.date"),
        description: hint,
        min,
        readOnly,
      }),
    [t, control, min, hint, readOnly],
  )
}

export interface CreditNoteFormProps {
  readonly note: CreditNoteCard
  readonly readOnly: boolean
  /** Чому лише для читання: виставлена, без права, редагує інша людина, закритий період. */
  readonly readOnlyReason?: string | undefined
}

/**
 * Форма чернетки кредит-ноти (ADR-0072): дата й повернені рядки (кількість не більша за залишок рахунку,
 * прибрати рядок), поля розширення, липка панель збереження. `PATCH` змінених полів з `version`; конфлікт
 * 409 — порівняння, 422 — помилки біля полів (кількість понад залишок, що лишився після інших кредит-нот, —
 * біля кількості; дата в закритому періоді — біля дати). Після збереження — картка кредит-ноти.
 */
export function CreditNoteForm({
  note,
  readOnly,
  readOnlyReason,
}: CreditNoteFormProps) {
  const t = useInvoicesT()
  const navigate = useNavigate()
  const { extension, paths } = useInvoicesModule()
  const noteExtension = extension.creditNotes
  const ext = useExtensionForm<CreditNoteFormFieldId>(
    noteExtension?.fields,
    noteExtension?.form,
  )
  const schema = useCreditNoteFormSchema(note.basis, ext.shape)
  const recordSchema = useMemo(
    () => creditNoteCardSchemaFor(noteExtension),
    [noteExtension],
  )
  const toValues = useCallback(
    (record: CreditNoteCard): CreditNoteFormValues => ({
      date: record.date,
      lines: record.lines.map(({ id, quantity }) => ({ id, quantity })),
      ...ext.values(record),
    }),
    [ext],
  )
  // Початкові значення беруться раз: далі форма живе своїм станом (`followRecord`).
  const [defaultValues] = useState(() => toValues(note))
  const record = CREDIT_NOTE_KIND.pathsOf(paths).record
  const state = useRecordForm<CreditNoteFormValues, CreditNoteCard>({
    resource: CREDIT_NOTES,
    record: note,
    followRecord: true,
    schema,
    defaultValues,
    recordSchema,
    toPayload: (values, changed) => creditNotePayload(values, changed, ext),
    serverErrorText: (field, code) =>
      field.startsWith("lines.") && code === CREDIT_NOTE_ISSUES.exceedsInvoice
        ? t("creditNoteForm.lines.exceedsInvoice")
        : undefined,
    toValues,
    onSaved: (saved) => {
      toast.success(t("creditNoteForm.saved"))
      void navigate(record(saved.id))
    },
    onUnchanged: () => {
      void navigate(record(note.id))
    },
  })
  const dateItem = useDateItem(state.form, readOnly)
  const { control } = state.form
  const header = useMemo(
    () => applyKeyedChanges([dateItem], ext.items(control, { readOnly })),
    [dateItem, ext, control, readOnly],
  )
  return (
    <CreditNoteFormView
      state={state}
      header={header}
      note={note}
      readOnly={readOnly}
      readOnlyReason={readOnlyReason}
    />
  )
}

function CreditNoteFormView({
  state,
  header,
  note,
  readOnly,
  readOnlyReason,
}: {
  state: RecordFormState<CreditNoteFormValues>
  header: readonly RecordFormItem[]
  note: CreditNoteCard
  readOnly: boolean
  readOnlyReason: string | undefined
}) {
  const t = useInvoicesT()
  const items = useMemo((): readonly RecordFormItem[] => {
    const linesItem: RecordFormItem = {
      id: "lines",
      label: t("creditNoteForm.lines.label"),
      text: (lines) =>
        Array.isArray(lines)
          ? t("creditNoteForm.linesCount", { count: lines.length })
          : null,
      render: () => null,
    }
    return [...header, linesItem]
  }, [header, t])
  const labels = useMemo(
    (): Readonly<Record<string, string>> =>
      Object.fromEntries(items.map((item) => [item.id, item.label])),
    [items],
  )
  return (
    <RecordFormFrame
      slot="credit-note-form"
      className="grid gap-6"
      state={state}
      labels={labels}
      conflictItems={items}
      readOnly={readOnly}
      readOnlyReason={readOnlyReason}
    >
      <RecordFormFields items={header} />
      <CreditNoteLinesFields
        form={state.form}
        note={note}
        readOnly={readOnly}
      />
    </RecordFormFrame>
  )
}
