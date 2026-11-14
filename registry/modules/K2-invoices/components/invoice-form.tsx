import { useCallback, useLayoutEffect, useMemo, useState } from "react"
import type { Path } from "react-hook-form"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import { z } from "zod"

import { DocumentFormLines } from "@/components/erp/document-lines-section"
import {
  useDocumentLineFields,
  useDocumentLinesSchema,
  type DocumentLineFieldsApi,
} from "@/components/erp/document-lines-schema"
import {
  useExtensionForm,
  type ExtensionFormApi,
} from "@/components/erp/extension-field-input"
import { usePartyDetailsSchema } from "@/components/erp/party-details-schema"
import {
  RecordFormFields,
  type RecordFormGroup,
  type RecordFormItem,
} from "@/components/erp/record-form"
import { RecordFormFrame } from "@/components/erp/record-form-page"
import { useRecordForm, type RecordFormState } from "@/hooks/use-record-form"
import { DEFAULT_BASE_CURRENCY, type CompanyProfile } from "@/lib/company"
import { addDays, isCalendarDate, todayIn } from "@/lib/dates"
import { copiedDocumentLines } from "@/lib/document-lines"
import {
  emptyPartyDetails,
  partyDetailsFrom,
  partyFromCompany,
} from "@/lib/document-parties"
import type { ExtensionField } from "@/lib/extension-fields"
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
import { useBaseCurrency, useFormCurrencySync } from "./invoice-currency"
import { InvoicePartiesFields } from "./invoice-parties-fields"

/** Поля шапки модуля: їх надсилає форма; рядки — усім масивом, сторона — цілою, суми рахує сервер. */
const HEADER_FIELDS = [
  "clientId",
  "clientName",
  "date",
  "dueDate",
  "currency",
  "discountPercent",
  "discountAmount",
  "supplier",
  "buyer",
] as const

function useInvoiceFormSchema(
  currency: string,
  dueBefore: string,
  extensionShape: z.ZodRawShape,
  lineShape: DocumentLineFieldsApi["shape"],
) {
  const kitT = useErpUiT()
  const lines = useDocumentLinesSchema(currency, lineShape)
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
        currency: z.string().length(3, required),
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

/** Значення для запиту: створення — усі поля, зміна — змінені поля шапки, сторони й рядки цілком. */
function payloadOf(
  values: InvoiceFormValues,
  keys: readonly Path<InvoiceFormValues>[],
  ext: ExtensionFormApi<InvoiceFormFieldId>,
  lineExt: DocumentLineFieldsApi,
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
    ...(changed.has("lines")
      ? { lines: lineExt.payloadLines(values.lines) }
      : {}),
    ...ext.payload(values, keys),
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
 * (дата в закритому періоді — `period_locked` біля дати). Після збереження — картка рахунку. Валюта нового
 * рахунку — базова валюта компанії; іншу дає поле «Валюта», коли проект дав валюти компанії (ADR-0071).
 */
export function InvoiceForm({
  invoice,
  source,
  company,
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
    invoiceExtension?.formGroups,
  )
  const lineExt = useDocumentLineFields(invoiceExtension?.lineFields)
  const before = t("invoiceForm.dueDateBefore")
  const baseCurrency = useBaseCurrency(company)
  const initialCurrency =
    invoice?.currency ??
    source?.currency ??
    baseCurrency ??
    DEFAULT_BASE_CURRENCY
  // Знаки суми — валюти, вибраної у формі: схему рядків будуємо за нею (оновлюється разом із полем).
  const [schemaCurrency, setSchemaCurrency] = useState(initialCurrency)
  const schema = useInvoiceFormSchema(
    schemaCurrency,
    before,
    ext.shape,
    lineExt.shape,
  )
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
      currency: record.currency,
      supplier: record.supplier,
      buyer: record.buyer,
      lines: lineExt.formLines(record.lines),
      discountPercent: record.discountPercent,
      discountAmount: record.discountAmount,
      ...ext.values(record),
    }),
    [ext, lineExt],
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
      currency: initialCurrency,
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
              lines: lineExt.formLines(copiedDocumentLines(source.lines)),
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
    toPayload: (values, changed) => payloadOf(values, changed, ext, lineExt),
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
  useFormCurrencySync(form, schemaCurrency, setSchemaCurrency)
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
  const moduleItems = useInvoiceHeaderItems(state.form, readOnly, baseCurrency)
  const { control } = state.form
  const header = useMemo(
    () => applyKeyedChanges(moduleItems, ext.items(control, { readOnly })),
    [moduleItems, ext, control, readOnly],
  )
  return (
    <InvoiceFormView
      state={view}
      header={header}
      groups={ext.groups}
      lineFields={lineExt.fields}
      currency={schemaCurrency}
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
  groups,
  lineFields,
  currency,
  readOnly,
  readOnlyReason,
  mayEdit,
  invoice,
}: {
  state: RecordFormState<InvoiceFormValues>
  header: readonly RecordFormItem[]
  groups: readonly RecordFormGroup[]
  lineFields: readonly ExtensionField[]
  currency: string
  readOnly: boolean
  readOnlyReason: string | undefined
  mayEdit: boolean
  invoice: InvoiceCard | undefined
}) {
  const t = useInvoicesT()
  const kitT = useErpUiT()
  const { lineItem } = useInvoicesModule()
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
  return (
    <RecordFormFrame
      slot="invoice-form"
      className="grid gap-6"
      state={state}
      labels={labels}
      conflictItems={items}
      readOnly={readOnly}
      readOnlyReason={readOnlyReason}
    >
      <RecordFormFields items={header} groups={groups} />
      <InvoicePartiesFields form={state.form} readOnly={readOnly} />
      <DocumentFormLines
        form={state.form}
        currency={currency}
        item={lineItem}
        readOnly={readOnly}
        mayEdit={mayEdit}
        savedTotals={readOnly ? invoice?.totals : undefined}
        lineFields={lineFields}
      />
    </RecordFormFrame>
  )
}
