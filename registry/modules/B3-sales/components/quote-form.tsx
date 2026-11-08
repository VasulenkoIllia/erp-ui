import { useCallback, useMemo, useState } from "react"
import type { Path } from "react-hook-form"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import { z } from "zod"

import { ConflictDialog } from "@/components/erp/conflict-dialog"
import { DocumentLinesEditor } from "@/components/erp/document-lines-editor"
import { useDocumentLinesSchema } from "@/components/erp/document-lines-schema"
import {
  useExtensionForm,
  type ExtensionFormApi,
} from "@/components/erp/extension-field-input"
import { FormErrorSummary, UnsavedChangesGuard } from "@/components/erp/form"
import { SectionSkeleton } from "@/components/erp/page-state"
import {
  RecordFormFields,
  useConflictFields,
  useFormMessage,
  type RecordFormItem,
} from "@/components/erp/record-form"
import { SaveBar } from "@/components/erp/save-bar"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useRecordForm, type RecordFormState } from "@/hooks/use-record-form"
import { addDays, isCalendarDate, todayIn } from "@/lib/dates"
import { applyKeyedChanges } from "@/lib/extensions"
import { useFormat } from "@/lib/format"
import { useErpUiT } from "@/lib/i18n"

import { QUOTES, quoteCardSchemaFor, type QuoteCard } from "../contract"
import type { QuoteFormFieldId } from "../extension"
import { useSalesModule } from "../module-context"
import { useSalesT } from "../use-sales-t"
import { useLineDictionaries } from "./line-dictionaries"
import { useQuoteHeaderItems, type QuoteFormValues } from "./quote-form-items"

/** Строк нової пропозиції: два тижні від сьогодні. */
const NEW_VALID_DAYS = 14
/** Поля шапки модуля: їх надсилає форма; рядки — усім масивом, суми рахує сервер. */
const HEADER_FIELDS = [
  "clientId",
  "clientName",
  "date",
  "validUntil",
  "discountPercent",
  "discountAmount",
] as const

function useQuoteFormSchema(currency: string, extensionShape: z.ZodRawShape) {
  const t = useSalesT()
  const kitT = useErpUiT()
  const lines = useDocumentLinesSchema(currency)
  return useMemo(() => {
    const required = kitT("validation.required")
    const day = z.string().refine(isCalendarDate, required)
    return lines
      .safeExtend({
        clientId: z.string().min(1, required),
        clientName: z.string(),
        date: day,
        validUntil: day,
        ...extensionShape,
      })
      .superRefine((values, context) => {
        if (
          isCalendarDate(values.date) &&
          isCalendarDate(values.validUntil) &&
          values.validUntil < values.date
        )
          context.addIssue({
            code: "custom",
            path: ["validUntil"],
            message: t("form.validUntilBefore"),
          })
      })
  }, [t, kitT, lines, extensionShape])
}

/** Значення для запиту: створення — усі поля й валюта, зміна — змінені поля шапки й рядки цілком. */
function payloadOf(
  values: QuoteFormValues,
  keys: readonly Path<QuoteFormValues>[],
  ext: ExtensionFormApi<QuoteFormFieldId>,
  currency: string | null,
) {
  const changed = new Set<string>(keys)
  // Знімок назви — лише разом із клієнтом (ADR-0056): той самий клієнт, вибраний знову після перейменування.
  if (changed.has("clientName")) changed.add("clientId")
  return {
    ...Object.fromEntries(
      HEADER_FIELDS.filter((key) => changed.has(key)).map((key) => [
        key,
        values[key],
      ]),
    ),
    ...(changed.has("lines") ? { lines: values.lines } : {}),
    ...ext.payload(values, keys),
    ...(currency ? { currency } : {}),
  }
}

export interface QuoteFormProps {
  /** Пропозиція, яку змінюємо; без неї — створення. */
  readonly quote?: QuoteCard
  /** Валюта пропозиції: базова валюта компанії на момент створення. */
  readonly currency: string
  readonly readOnly: boolean
  /** Чому лише для читання: надіслана, без права, редагує інша людина. */
  readonly readOnlyReason?: string | undefined
}

/**
 * Форма пропозиції на сторінці (SPEC §7; ADR-0047, ADR-0059): шапка, рядки з розділами й нотатками,
 * знижка документа й підсумки, липка панель збереження. Створення — `POST`, зміна — `PATCH` змінених
 * полів з `version`; конфлікт 409 — порівняння, 422 — помилки біля полів і рядків. Після збереження —
 * картка пропозиції.
 */
export function QuoteForm({
  quote,
  currency,
  readOnly,
  readOnlyReason,
}: QuoteFormProps) {
  const t = useSalesT()
  const navigate = useNavigate()
  const { timeZone } = useFormat()
  const { extension, paths } = useSalesModule()
  const ext = useExtensionForm<QuoteFormFieldId>(
    extension.quotes?.fields,
    extension.quotes?.form,
  )
  const schema = useQuoteFormSchema(currency, ext.shape)
  const recordSchema = useMemo(
    () => quoteCardSchemaFor(extension.quotes),
    [extension.quotes],
  )
  const toValues = useCallback(
    (record: QuoteCard): QuoteFormValues => ({
      clientId: record.clientId,
      clientName: record.clientName,
      date: record.date,
      validUntil: record.validUntil,
      lines: record.lines,
      discountPercent: record.discountPercent,
      discountAmount: record.discountAmount,
      ...ext.values(record),
    }),
    [ext],
  )
  // Початкові значення беруться раз: далі форма живе своїм станом (`followRecord`).
  const [defaultValues] = useState<QuoteFormValues>(() => {
    const today = todayIn(timeZone)
    return quote
      ? toValues(quote)
      : {
          clientId: "",
          clientName: "",
          date: today,
          validUntil: addDays(today, NEW_VALID_DAYS),
          lines: [],
          discountPercent: 0,
          discountAmount: 0,
          ...ext.values(),
        }
  })
  const state = useRecordForm<QuoteFormValues, QuoteCard>({
    resource: QUOTES,
    record: quote,
    followRecord: true,
    schema,
    defaultValues,
    recordSchema,
    toPayload: (values, keys) =>
      payloadOf(values, keys, ext, quote ? null : currency),
    serverErrorText: (field, code) =>
      field === "validUntil" && code === "before_date"
        ? t("form.validUntilBefore")
        : undefined,
    toValues,
    onSaved: (saved) => {
      toast.success(t(quote ? "form.saved" : "form.created"))
      void navigate(paths.quote(saved.id))
    },
    onUnchanged: () => {
      if (quote) void navigate(paths.quote(quote.id))
    },
  })
  const moduleItems = useQuoteHeaderItems(state.form, readOnly)
  const { control } = state.form
  const header = useMemo(
    () => applyKeyedChanges(moduleItems, ext.items(control, { readOnly })),
    [moduleItems, ext, control, readOnly],
  )
  return (
    <QuoteFormView
      state={state}
      header={header}
      currency={currency}
      readOnly={readOnly}
      readOnlyReason={readOnlyReason}
      quote={quote}
    />
  )
}

function QuoteFormView({
  state,
  header,
  currency,
  readOnly,
  readOnlyReason,
  quote,
}: {
  state: RecordFormState<QuoteFormValues>
  header: readonly RecordFormItem[]
  currency: string
  readOnly: boolean
  readOnlyReason: string | undefined
  quote: QuoteCard | undefined
}) {
  const t = useSalesT()
  const kitT = useErpUiT()
  const { lineItem } = useSalesModule()
  const dictionaries = useLineDictionaries(!readOnly)
  const { isDirty, errors, submitCount } = state.form.formState
  // Сталі посилання: форма перемальовується зі станом збереження, а документ буває на сотні рядків.
  const items = useMemo((): readonly RecordFormItem[] => {
    const linesItem: RecordFormItem = {
      id: "lines",
      label: kitT("documentLines.label"),
      text: (lines) =>
        Array.isArray(lines)
          ? t("form.linesCount", { count: lines.length })
          : null,
      render: () => null,
    }
    return [...header, linesItem]
  }, [header, t, kitT])
  const labels = useMemo(
    (): Readonly<Record<string, string>> => ({
      ...Object.fromEntries(items.map((item) => [item.id, item.label])),
      discountPercent: kitT("documentLines.totals.documentDiscount"),
      discountAmount: kitT("documentLines.totals.documentDiscount"),
    }),
    [items, kitT],
  )
  const { ref: messageRef, message } = useFormMessage(state, labels)
  const conflictRows = useConflictFields(state, items)
  return (
    <form
      noValidate
      data-slot="quote-form"
      onSubmit={(event) => void state.submit(event)}
      aria-busy={state.isSaving || undefined}
      className="grid gap-6"
    >
      <UnsavedChangesGuard when={isDirty && !readOnly} />
      {readOnlyReason ? (
        <Alert>
          <AlertDescription>{readOnlyReason}</AlertDescription>
        </Alert>
      ) : null}
      {message ? (
        <Alert
          ref={messageRef}
          tabIndex={-1}
          variant="destructive"
          role="alert"
        >
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      <FormErrorSummary
        errors={errors}
        labels={labels}
        submitCount={submitCount}
      />
      <RecordFormFields items={header} />
      {dictionaries.isPending ? (
        // Рядок, доданий до довідників, лишився б без типових одиниці й податку.
        <SectionSkeleton rows={4} />
      ) : (
        <DocumentLinesEditor
          form={state.form}
          currency={currency}
          units={dictionaries.units}
          taxes={dictionaries.taxes}
          item={lineItem}
          newLine={dictionaries.newLine}
          readOnly={readOnly}
          savedTotals={readOnly ? quote?.totals : undefined}
        />
      )}
      {readOnly ? null : (
        <SaveBar
          isDirty={isDirty}
          isSaving={state.isSaving}
          onDiscard={state.discard}
        />
      )}
      <ConflictDialog
        open={state.conflict !== null}
        onOpenChange={(open) => {
          if (!open) state.dismissConflict()
        }}
        fields={conflictRows}
        onOverwrite={state.overwrite}
        onReload={state.reload}
      />
    </form>
  )
}
