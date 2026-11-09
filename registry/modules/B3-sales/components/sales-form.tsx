import { useCallback, useLayoutEffect, useMemo, useState } from "react"
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
import { copiedDocumentLines } from "@/lib/document-lines"
import { applyKeyedChanges } from "@/lib/extensions"
import { useFormat } from "@/lib/format"
import { useErpUiT } from "@/lib/i18n"

import type { SalesDocument, SalesDocumentDetail } from "../contract"
import type { SalesDocumentIds } from "../extension"
import { useSalesModule } from "../module-context"
import type { SalesDocumentKind } from "../sales-kinds"
import { useSalesT } from "../use-sales-t"
import { useLineDictionaries } from "./line-dictionaries"
import { useSalesHeaderItems, type SalesFormValues } from "./sales-form-items"

/** Поля шапки модуля, крім другої дати: їх надсилає форма; рядки — усім масивом, суми рахує сервер. */
const HEADER_FIELDS = [
  "clientId",
  "clientName",
  "date",
  "discountPercent",
  "discountAmount",
] as const

function useSalesFormSchema(
  due: { readonly field: string; readonly before: string },
  currency: string,
  extensionShape: z.ZodRawShape,
) {
  const kitT = useErpUiT()
  const lines = useDocumentLinesSchema(currency)
  return useMemo(() => {
    const required = kitT("validation.required")
    const day = z.string().refine(isCalendarDate, required)
    // Ключ другої дати відомий лише під час виконання: разом із полями розширення, як `ZodRawShape`,
    // інакше тип схеми загубив би поля рядків.
    const extra: z.ZodRawShape = { [due.field]: day, ...extensionShape }
    return lines
      .safeExtend({
        clientId: z.string().min(1, required),
        clientName: z.string(),
        date: day,
        ...extra,
      })
      .superRefine((values, context) => {
        const dueDate: unknown = (values as Record<string, unknown>)[due.field]
        if (
          isCalendarDate(values.date) &&
          typeof dueDate === "string" &&
          isCalendarDate(dueDate) &&
          dueDate < values.date
        )
          context.addIssue({
            code: "custom",
            path: [due.field],
            message: due.before,
          })
      })
  }, [kitT, lines, extensionShape, due.field, due.before])
}

/** Значення для запиту: створення — усі поля й валюта, зміна — змінені поля шапки й рядки цілком. */
function payloadOf<Due extends string>(
  dueField: Due,
  values: SalesFormValues,
  keys: readonly Path<SalesFormValues>[],
  ext: ExtensionFormApi<SalesDocumentIds<Due>["formField"]>,
  currency: string | null,
) {
  const changed = new Set<string>(keys)
  // Знімок назви — лише разом із клієнтом (ADR-0056): той самий клієнт, вибраний знову після перейменування.
  if (changed.has("clientName")) changed.add("clientId")
  const fields: readonly string[] = [...HEADER_FIELDS, dueField]
  return {
    ...Object.fromEntries(
      fields
        .filter((key) => changed.has(key))
        .map((key): [string, unknown] => [key, values[key]]),
    ),
    ...(changed.has("lines") ? { lines: values.lines } : {}),
    ...ext.payload(values, keys),
    ...(currency ? { currency } : {}),
  }
}

export interface SalesFormProps<D extends SalesDocument, Due extends string> {
  readonly kind: SalesDocumentKind<D, Due>
  /** Документ, який змінюємо; без нього — створення. */
  readonly document?: D & SalesDocumentDetail
  /**
   * Документ, який копіюють («Копіювати», ADR-0067): нова форма з його клієнтом, рядками, знижкою й
   * полями розширення, дата — сьогодні, друга дата — як у нового. Форма одразу з незбереженими змінами:
   * документ з'являється лише після «Зберегти». Разом із `document` не діє.
   */
  readonly source?: D & SalesDocumentDetail
  /** Валюта документа: базова валюта компанії на момент створення. */
  readonly currency: string
  readonly readOnly: boolean
  /** Чому лише для читання: проведений, без права, редагує інша людина. */
  readonly readOnlyReason?: string | undefined
  /**
   * Зміну дозволено (право й позначка запису): довідники рядків вантажаться одразу, навіть поки форма
   * чекає блокування, щоб редактор не змінювався на скелет, коли блокування візьметься.
   */
  readonly mayEdit: boolean
}

/**
 * Форма документа продажу на сторінці (SPEC §7; ADR-0047, ADR-0059): шапка, рядки з розділами й
 * нотатками, знижка документа й підсумки, липка панель збереження. Створення — `POST`, зміна — `PATCH`
 * змінених полів з `version`; конфлікт 409 — порівняння, 422 — помилки біля полів і рядків. Після
 * збереження — картка документа.
 */
export function SalesForm<D extends SalesDocument, Due extends string>({
  kind,
  document,
  source,
  currency,
  readOnly,
  readOnlyReason,
  mayEdit,
}: SalesFormProps<D, Due>) {
  const t = useSalesT()
  const navigate = useNavigate()
  const { timeZone } = useFormat()
  const { extension, paths } = useSalesModule()
  const documentExtension = kind.extensionOf(extension)
  const ext = useExtensionForm<SalesDocumentIds<Due>["formField"]>(
    documentExtension?.fields,
    documentExtension?.form,
  )
  const dueField = kind.due.field
  const before = t(kind.due.before)
  const due = useMemo(() => ({ field: dueField, before }), [dueField, before])
  const schema = useSalesFormSchema(due, currency, ext.shape)
  const recordSchema = useMemo(
    () => kind.cardSchemaFor(documentExtension),
    [kind, documentExtension],
  )
  const toValues = useCallback(
    (record: D & SalesDocumentDetail): SalesFormValues => ({
      clientId: record.clientId,
      clientName: record.clientName,
      date: record.date,
      [dueField]: kind.dueOf(record),
      lines: record.lines,
      discountPercent: record.discountPercent,
      discountAmount: record.discountAmount,
      ...ext.values(record),
    }),
    [ext, kind, dueField],
  )
  // Початкові значення беруться раз: далі форма живе своїм станом (`followRecord`). Копія — значення
  // поверх порожньої форми: вони незбережені, тож «Зберегти» створює документ, а вихід питає.
  const [{ defaultValues, copied }] = useState(() => {
    const today = todayIn(timeZone)
    const dates = { date: today, [dueField]: addDays(today, kind.due.newDays) }
    const blank: SalesFormValues = {
      clientId: "",
      clientName: "",
      ...dates,
      lines: [],
      discountPercent: 0,
      discountAmount: 0,
      ...ext.values(),
    }
    return {
      defaultValues: document ? toValues(document) : blank,
      copied:
        source && !document
          ? {
              ...toValues(source),
              ...dates,
              lines: copiedDocumentLines(source.lines),
            }
          : null,
    }
  })
  const { form: keys } = kind.keys
  const documentPaths = kind.pathsOf(paths)
  const state = useRecordForm<SalesFormValues, D & SalesDocumentDetail>({
    resource: kind.resource,
    record: document,
    followRecord: true,
    schema,
    defaultValues,
    recordSchema,
    toPayload: (values, changed) =>
      payloadOf(dueField, values, changed, ext, document ? null : currency),
    serverErrorText: (field, code) =>
      field === dueField && code === "before_date" ? before : undefined,
    toValues,
    onSaved: (saved) => {
      toast.success(t(document ? `${keys}.saved` : `${keys}.created`))
      void navigate(documentPaths.record(saved.id))
    },
    onUnchanged: () => {
      if (document) void navigate(documentPaths.record(document.id))
    },
  })
  const { form } = state
  // Значення копії поверх порожньої форми: до першого малювання (порожня форма не блимає) і після
  // «Скасувати зміни» — копія так само не збережена, тож вихід і далі питає.
  const applyCopy = useCallback(() => {
    if (copied) form.reset(copied, { keepDefaultValues: true })
  }, [copied, form])
  useLayoutEffect(applyCopy, [applyCopy])
  const view: RecordFormState<SalesFormValues> = copied
    ? {
        ...state,
        discard: () => {
          state.discard()
          applyCopy()
        },
      }
    : state
  const moduleItems = useSalesHeaderItems(kind, state.form, readOnly)
  const { control } = state.form
  const header = useMemo(
    () => applyKeyedChanges(moduleItems, ext.items(control, { readOnly })),
    [moduleItems, ext, control, readOnly],
  )
  return (
    <SalesFormView
      formKey={keys}
      state={view}
      header={header}
      currency={currency}
      readOnly={readOnly}
      readOnlyReason={readOnlyReason}
      mayEdit={mayEdit}
      document={document}
    />
  )
}

function SalesFormView({
  formKey,
  state,
  header,
  currency,
  readOnly,
  readOnlyReason,
  mayEdit,
  document,
}: {
  formKey: SalesDocumentKind<SalesDocument, string>["keys"]["form"]
  state: RecordFormState<SalesFormValues>
  header: readonly RecordFormItem[]
  currency: string
  readOnly: boolean
  readOnlyReason: string | undefined
  mayEdit: boolean
  document: SalesDocumentDetail | undefined
}) {
  const t = useSalesT()
  const kitT = useErpUiT()
  const { lineItem } = useSalesModule()
  const dictionaries = useLineDictionaries(mayEdit)
  const { isDirty, errors, submitCount } = state.form.formState
  // Сталі посилання: форма перемальовується зі станом збереження, а документ буває на сотні рядків.
  const items = useMemo((): readonly RecordFormItem[] => {
    const linesItem: RecordFormItem = {
      id: "lines",
      label: kitT("documentLines.label"),
      text: (lines) =>
        Array.isArray(lines)
          ? t(`${formKey}.linesCount`, { count: lines.length })
          : null,
      render: () => null,
    }
    return [...header, linesItem]
  }, [header, t, kitT, formKey])
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
      data-slot="sales-form"
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
      {dictionaries.isLoading ? (
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
          savedTotals={readOnly ? document?.totals : undefined}
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
