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
import { usePartyDetailsSchema } from "@/components/erp/party-details-schema"
import {
  RecordFormFields,
  useConflictFields,
  useFormMessage,
  type RecordFormItem,
} from "@/components/erp/record-form"
import { SaveBar } from "@/components/erp/save-bar"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useLineDictionaries } from "@/hooks/use-line-dictionaries"
import { useRecordForm, type RecordFormState } from "@/hooks/use-record-form"
import type { CompanyProfile } from "@/lib/company"
import { addDays, isCalendarDate, todayIn } from "@/lib/dates"
import { copiedDocumentLines } from "@/lib/document-lines"
import {
  emptyPartyDetails,
  partyDetailsFrom,
  partyFromCompany,
} from "@/lib/document-parties"
import { applyKeyedChanges } from "@/lib/extensions"
import { useFormat } from "@/lib/format"
import { useErpUiT } from "@/lib/i18n"

import {
  INVOICE_DUE_DAYS,
  INVOICES,
  invoiceCardSchemaFor,
  type InvoiceCard,
} from "../contract"
import type { InvoiceFormFieldId } from "../extension"
import { invoiceDocumentPaths } from "../invoice-kind"
import { useInvoicesModule } from "../module-context"
import { useInvoicesT } from "../use-invoices-t"
import {
  useInvoiceHeaderItems,
  type InvoiceFormValues,
} from "./invoice-form-items"
import { InvoicePartiesFields } from "./invoice-parties-fields"

/** Поля шапки модуля: їх надсилає форма; рядки — усім масивом, сторона — цілою, суми рахує сервер. */
const HEADER_FIELDS = [
  "clientId",
  "clientName",
  "date",
  "dueDate",
  "discountPercent",
  "discountAmount",
  "supplier",
  "buyer",
] as const

function useInvoiceFormSchema(
  currency: string,
  dueBefore: string,
  extensionShape: z.ZodRawShape,
) {
  const kitT = useErpUiT()
  const lines = useDocumentLinesSchema(currency)
  const party = usePartyDetailsSchema()
  return useMemo(() => {
    const required = kitT("validation.required")
    const day = z.string().refine(isCalendarDate, required)
    return lines
      .safeExtend({
        clientId: z.string().min(1, required),
        clientName: z.string(),
        date: day,
        dueDate: day,
        supplier: party,
        buyer: party,
        ...extensionShape,
      })
      .superRefine((values, context) => {
        if (
          isCalendarDate(values.date) &&
          isCalendarDate(values.dueDate) &&
          values.dueDate < values.date
        )
          context.addIssue({
            code: "custom",
            path: ["dueDate"],
            message: dueBefore,
          })
      })
  }, [kitT, lines, party, extensionShape, dueBefore])
}

/** Значення для запиту: створення — усі поля й валюта, зміна — змінені поля шапки, сторони й рядки цілком. */
function payloadOf(
  values: InvoiceFormValues,
  keys: readonly Path<InvoiceFormValues>[],
  ext: ExtensionFormApi<InvoiceFormFieldId>,
  currency: string | null,
) {
  const changed = new Set<string>(keys)
  // Знімок назви — лише разом із клієнтом (ADR-0056): той самий клієнт, вибраний знову після перейменування.
  if (changed.has("clientName")) changed.add("clientId")
  return {
    ...Object.fromEntries(
      HEADER_FIELDS.filter((key) => changed.has(key)).map(
        (key): [string, unknown] => [key, values[key]],
      ),
    ),
    ...(changed.has("lines") ? { lines: values.lines } : {}),
    ...ext.payload(values, keys),
    ...(currency ? { currency } : {}),
  }
}

/** Постачальник нового рахунку — з профілю компанії; поки профілю немає — порожній. */
const supplierOf = (company: CompanyProfile | undefined) =>
  company ? partyDetailsFrom(partyFromCompany(company)) : emptyPartyDetails()

export interface InvoiceFormProps {
  /** Рахунок, який змінюємо; без нього — створення. */
  readonly invoice?: InvoiceCard
  /**
   * Рахунок, який копіюють («Копіювати»): нова форма з його клієнтом, сторонами, рядками, знижкою й полями
   * розширення, дата — сьогодні, «Сплатити до» — як у нового. Документ з'являється лише після «Зберегти».
   */
  readonly source?: InvoiceCard
  /** Профіль компанії: постачальник нового рахунку. */
  readonly company?: CompanyProfile
  /** Валюта рахунку: базова валюта компанії на момент створення. */
  readonly currency: string
  readonly readOnly: boolean
  /** Чому лише для читання: виставлений, без права, редагує інша людина, закритий період. */
  readonly readOnlyReason?: string | undefined
  /** Зміну дозволено (право й позначка запису): довідники рядків вантажаться одразу. */
  readonly mayEdit: boolean
}

/**
 * Форма рахунку на сторінці (SPEC §7; ADR-0047, ADR-0059, ADR-0068, ADR-0069): шапка, сторони, рядки з
 * розділами й нотатками, знижка документа й підсумки, липка панель збереження. Створення — `POST`, зміна —
 * `PATCH` змінених полів з `version`; конфлікт 409 — порівняння, 422 — помилки біля полів, рядків і сторін
 * (дата в закритому періоді — `period_locked` біля дати). Після збереження — картка рахунку.
 */
export function InvoiceForm({
  invoice,
  source,
  company,
  currency,
  readOnly,
  readOnlyReason,
  mayEdit,
}: InvoiceFormProps) {
  const t = useInvoicesT()
  const navigate = useNavigate()
  const { timeZone } = useFormat()
  const { extension, paths } = useInvoicesModule()
  const invoiceExtension = extension.invoices
  const ext = useExtensionForm<InvoiceFormFieldId>(
    invoiceExtension?.fields,
    invoiceExtension?.form,
  )
  const before = t("invoiceForm.dueDateBefore")
  const schema = useInvoiceFormSchema(currency, before, ext.shape)
  const recordSchema = useMemo(
    () => invoiceCardSchemaFor(invoiceExtension),
    [invoiceExtension],
  )
  const toValues = useCallback(
    (record: InvoiceCard): InvoiceFormValues => ({
      clientId: record.clientId,
      clientName: record.clientName,
      date: record.date,
      dueDate: record.dueDate,
      supplier: record.supplier,
      buyer: record.buyer,
      lines: record.lines,
      discountPercent: record.discountPercent,
      discountAmount: record.discountAmount,
      ...ext.values(record),
    }),
    [ext],
  )
  // Початкові значення беруться раз: далі форма живе своїм станом (`followRecord`). Копія — значення
  // поверх порожньої форми: вони незбережені, тож «Зберегти» створює рахунок, а вихід питає.
  const [{ defaultValues, copied }] = useState(() => {
    const today = todayIn(timeZone)
    const dates = { date: today, dueDate: addDays(today, INVOICE_DUE_DAYS) }
    const blank: InvoiceFormValues = {
      clientId: "",
      clientName: "",
      ...dates,
      supplier: supplierOf(company),
      buyer: emptyPartyDetails(),
      lines: [],
      discountPercent: 0,
      discountAmount: 0,
      ...ext.values(),
    }
    return {
      defaultValues: invoice ? toValues(invoice) : blank,
      copied:
        source && !invoice
          ? {
              ...toValues(source),
              ...dates,
              lines: copiedDocumentLines(source.lines),
            }
          : null,
    }
  })
  const documentPaths = invoiceDocumentPaths(paths)
  const state = useRecordForm<InvoiceFormValues, InvoiceCard>({
    resource: INVOICES,
    record: invoice,
    followRecord: true,
    schema,
    defaultValues,
    recordSchema,
    toPayload: (values, changed) =>
      payloadOf(values, changed, ext, invoice ? null : currency),
    serverErrorText: (field, code) =>
      field === "dueDate" && code === "before_date" ? before : undefined,
    toValues,
    onSaved: (saved) => {
      toast.success(t(invoice ? "invoiceForm.saved" : "invoiceForm.created"))
      void navigate(documentPaths.record(saved.id))
    },
    onUnchanged: () => {
      if (invoice) void navigate(documentPaths.record(invoice.id))
    },
  })
  const { form } = state
  // Значення копії поверх порожньої форми: до першого малювання (порожня форма не блимає) і після
  // «Скасувати зміни» — копія так само не збережена, тож вихід і далі питає.
  const applyCopy = useCallback(() => {
    if (copied) form.reset(copied, { keepDefaultValues: true })
  }, [copied, form])
  useLayoutEffect(applyCopy, [applyCopy])
  const view: RecordFormState<InvoiceFormValues> = copied
    ? {
        ...state,
        discard: () => {
          state.discard()
          applyCopy()
        },
      }
    : state
  const moduleItems = useInvoiceHeaderItems(state.form, readOnly)
  const { control } = state.form
  const header = useMemo(
    () => applyKeyedChanges(moduleItems, ext.items(control, { readOnly })),
    [moduleItems, ext, control, readOnly],
  )
  return (
    <InvoiceFormView
      state={view}
      header={header}
      currency={currency}
      readOnly={readOnly}
      readOnlyReason={readOnlyReason}
      mayEdit={mayEdit}
      invoice={invoice}
    />
  )
}

function InvoiceFormView({
  state,
  header,
  currency,
  readOnly,
  readOnlyReason,
  mayEdit,
  invoice,
}: {
  state: RecordFormState<InvoiceFormValues>
  header: readonly RecordFormItem[]
  currency: string
  readOnly: boolean
  readOnlyReason: string | undefined
  mayEdit: boolean
  invoice: InvoiceCard | undefined
}) {
  const t = useInvoicesT()
  const kitT = useErpUiT()
  const { lineItem } = useInvoicesModule()
  const dictionaries = useLineDictionaries(mayEdit)
  const { isDirty, errors, submitCount } = state.form.formState
  // Сталі посилання: форма перемальовується зі станом збереження, а рахунок буває на сотні рядків.
  const items = useMemo((): readonly RecordFormItem[] => {
    const linesItem: RecordFormItem = {
      id: "lines",
      label: kitT("documentLines.label"),
      text: (lines) =>
        Array.isArray(lines)
          ? t("invoiceForm.linesCount", { count: lines.length })
          : null,
      render: () => null,
    }
    return [...header, linesItem]
  }, [header, t, kitT])
  const labels = useMemo(
    (): Readonly<Record<string, string>> => ({
      ...Object.fromEntries(items.map((item) => [item.id, item.label])),
      supplier: t("invoiceForm.parties.supplier"),
      buyer: t("invoiceForm.parties.buyer"),
      discountPercent: kitT("documentLines.totals.documentDiscount"),
      discountAmount: kitT("documentLines.totals.documentDiscount"),
    }),
    [items, t, kitT],
  )
  const { ref: messageRef, message } = useFormMessage(state, labels)
  const conflictRows = useConflictFields(state, items)
  return (
    <form
      noValidate
      data-slot="invoice-form"
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
      <InvoicePartiesFields form={state.form} readOnly={readOnly} />
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
          savedTotals={readOnly ? invoice?.totals : undefined}
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
