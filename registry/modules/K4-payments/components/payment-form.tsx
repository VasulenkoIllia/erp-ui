import { useEffect, useMemo, useRef, useState } from "react"
import { useWatch, type UseFormReturn } from "react-hook-form"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import { z } from "zod"

import {
  useExtensionForm,
  type ExtensionFormApi,
} from "@/components/erp/extension-field-input"
import { FormErrorSummary, UnsavedChangesGuard } from "@/components/erp/form"
import {
  RecordFormFields,
  useFormMessage,
  type RecordFormItem,
} from "@/components/erp/record-form"
import { SaveBar } from "@/components/erp/save-bar"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useCompanyProfile } from "@/hooks/use-company-profile"
import { useRecordForm, type RecordFormState } from "@/hooks/use-record-form"
import { DEFAULT_BASE_CURRENCY } from "@/lib/company"
import { isCalendarDate, todayIn } from "@/lib/dates"
import { useFormat } from "@/lib/format"
import { useErpUiT } from "@/lib/i18n"
import { newImportRequestId } from "@/lib/imports"
import { applyKeyedChanges } from "@/lib/extensions"

import { allocatedTotal, allocationsOf } from "../allocation"
import {
  DEFAULT_PAYMENT_METHOD,
  PAYMENT_ISSUES,
  PAYMENT_REFERENCE_MAX,
  paymentSchemaFor,
  PAYMENTS,
  type OpenInvoice,
  type Payment,
} from "../contract"
import type { PaymentFormFieldId } from "../extension"
import { usePaymentsModule } from "../module-context"
import { usePaymentsT } from "../use-payments-t"
import { PaymentAllocationFields } from "./payment-allocation-fields"
import {
  usePaymentFormItems,
  type PaymentFormValues,
} from "./payment-form-items"
import { useOpenInvoices, type OpenInvoices } from "./use-open-invoices"
import { useRefreshInvoices } from "./use-refresh-invoices"

/** Звідки реєструють оплату: картка рахунку дає клієнта й рахунок. */
export interface PaymentFormSource {
  readonly clientId?: string | undefined
  readonly invoiceId?: string | undefined
}

/**
 * Схема форми: обов'язкові поля, сума понад нуль, кожному рахунку не більше за борг, сума оплати дорівнює
 * сумі рознесення (переплати й авансу немає — рішення власника 11.11.2026).
 */
function usePaymentFormSchema(
  invoices: readonly OpenInvoice[],
  extensionShape: z.ZodRawShape,
) {
  const t = usePaymentsT()
  const kitT = useErpUiT()
  const format = useFormat()
  return useMemo(() => {
    const required = kitT("validation.required")
    return z
      .object({
        clientId: z.string().min(1, required),
        clientName: z.string(),
        currency: z.string(),
        date: z.string().refine(isCalendarDate, required),
        method: z.string().min(1, required),
        amount: z
          .number()
          .int()
          .positive(t("paymentForm.amountPositive"))
          .nullable()
          .refine((value) => value !== null, required),
        reference: z.string().max(PAYMENT_REFERENCE_MAX),
        allocations: z.record(z.string(), z.number().int().min(0).nullable()),
        ...extensionShape,
      })
      .superRefine((values, context) => {
        for (const invoice of invoices) {
          const value = values.allocations[invoice.id] ?? 0
          if (value > invoice.debt)
            context.addIssue({
              code: "custom",
              path: ["allocations", invoice.id],
              message: t("paymentForm.invoices.exceeds", {
                debt: format.money({
                  amount: invoice.debt,
                  currency: invoice.currency,
                }),
              }),
            })
        }
        if (
          values.amount !== null &&
          allocatedTotal(values.allocations) !== values.amount
        )
          context.addIssue({
            code: "custom",
            path: ["amount"],
            message: t("paymentForm.invoices.notAllocated"),
          })
      })
  }, [kitT, t, format, invoices, extensionShape])
}

/**
 * Перший вибір форми з рахунками клієнта: оплата з картки рахунку — його валюта, сума його боргу на ньому й
 * сума оплати (значення за замовчуванням: «Скасувати зміни» повертає до них); інакше — валюта першого рахунку.
 */
function useFirstChoice(
  form: UseFormReturn<PaymentFormValues>,
  open: OpenInvoices,
  from: PaymentFormSource,
) {
  const isApplied = useRef(false)
  const currency = useWatch({ control: form.control, name: "currency" })
  const clientId = useWatch({ control: form.control, name: "clientId" })
  useEffect(() => {
    const invoices = open.invoices
    if (!invoices?.length || currency) return
    const invoice = invoices.find(({ id }) => id === from.invoiceId)
    if (invoice && !isApplied.current && clientId === from.clientId) {
      isApplied.current = true
      form.reset({
        ...form.getValues(),
        currency: invoice.currency,
        amount: invoice.debt,
        allocations: { [invoice.id]: invoice.debt },
      })
      return
    }
    form.setValue("currency", invoices[0]?.currency ?? "")
  }, [form, open.invoices, currency, clientId, from])
}

/**
 * Форма реєстрації оплати (ADR-0073): клієнт, валюта, дата, спосіб, сума й призначення, рахунки клієнта з
 * сумою кожному, поля розширення, липка панель «Зареєструвати». `POST` з ключем ідемпотентності
 * `requestId`: один на форму, тож подвійне натискання чи повтор після втраченої відповіді не дає другої
 * оплати. 422 — помилки біля полів (сума понад борг — біля рахунку, нерозписана сума — біля суми, дата в
 * закритому періоді — біля дати). Після реєстрації з картки рахунку — назад до рахунку, інакше — картка оплати.
 */
export function PaymentForm({ from }: { from: PaymentFormSource }) {
  const t = usePaymentsT()
  const navigate = useNavigate()
  const format = useFormat()
  const { extension, paths, invoices: invoiceLinks } = usePaymentsModule()
  const refreshInvoices = useRefreshInvoices()
  const ext = useExtensionForm<PaymentFormFieldId>(
    extension.fields,
    extension.form,
  )
  const [requestId] = useState(newImportRequestId)
  const [defaultValues] = useState((): PaymentFormValues => ({
    clientId: from.clientId ?? "",
    clientName: "",
    currency: "",
    date: todayIn(format.timeZone),
    method: DEFAULT_PAYMENT_METHOD,
    amount: null,
    reference: "",
    allocations: {},
    ...ext.values(),
  }))
  const [targets, setTargets] = useState<readonly OpenInvoice[]>([])
  const schema = usePaymentFormSchema(targets, ext.shape)
  const recordSchema = useMemo(() => paymentSchemaFor(extension), [extension])
  /** Рахунки останнього запиту: помилку `allocations.<i>` сервера показуємо біля свого рахунку. */
  const sent = useRef<readonly string[]>([])
  const state = useRecordForm<PaymentFormValues, Payment>({
    resource: PAYMENTS,
    schema,
    defaultValues,
    recordSchema,
    toPayload: (values, keys) => {
      const allocations = allocationsOf(values.allocations, targets)
      sent.current = allocations.map(({ invoiceId }) => invoiceId)
      return {
        requestId,
        date: values.date,
        clientId: values.clientId,
        currency: values.currency,
        method: values.method,
        reference: values.reference.trim() || null,
        amount: values.amount,
        allocations,
        ...ext.payload(values, keys),
      }
    },
    fieldOfServerError: (field) => {
      const match = /^allocations\.(\d+)\./.exec(field)
      const id = match ? sent.current[Number(match[1])] : undefined
      return id ? `allocations.${id}` : field
    },
    serverErrorText: (_field, code) =>
      code === PAYMENT_ISSUES.notAllocated
        ? t("paymentForm.invoices.notAllocated")
        : code === PAYMENT_ISSUES.exceedsDebt
          ? t("paymentForm.invoices.exceedsDebt")
          : code === PAYMENT_ISSUES.invoiceUnavailable
            ? t("paymentForm.invoices.unavailable")
            : undefined,
    toValues: () => defaultValues,
    onSaved: (saved) => {
      refreshInvoices()
      toast.success(t("paymentForm.saved"))
      void navigate(
        from.invoiceId && invoiceLinks.href
          ? invoiceLinks.href(from.invoiceId)
          : paths.payment(saved.id),
      )
    },
  })
  return (
    <PaymentFormBody
      state={state}
      from={from}
      ext={ext}
      onTargets={setTargets}
    />
  )
}

/** Тіло форми: рахунки клієнта, поля шапки з полями розширення й рознесення. */
function PaymentFormBody({
  state,
  from,
  ext,
  onTargets,
}: {
  state: RecordFormState<PaymentFormValues>
  from: PaymentFormSource
  ext: ExtensionFormApi<PaymentFormFieldId>
  onTargets: (invoices: readonly OpenInvoice[]) => void
}) {
  const { form } = state
  const clientId = useWatch({ control: form.control, name: "clientId" })
  const currency = useWatch({ control: form.control, name: "currency" })
  const open = useOpenInvoices(clientId)
  useFirstChoice(form, open, from)
  const currencies = useMemo(
    () => [...new Set(open.invoices?.map((invoice) => invoice.currency))],
    [open.invoices],
  )
  const targets = useMemo(
    () =>
      open.invoices?.filter((invoice) => invoice.currency === currency) ?? [],
    [open.invoices, currency],
  )
  useEffect(() => {
    onTargets(targets)
  }, [targets, onTargets])
  const profile = useCompanyProfile()
  const moneyCurrency =
    currency || (profile.data?.baseCurrency ?? DEFAULT_BASE_CURRENCY)
  const moduleItems = usePaymentFormItems(form, currencies, moneyCurrency)
  const items = useMemo(
    () =>
      applyKeyedChanges(
        moduleItems,
        ext.items(form.control, { readOnly: false }),
      ),
    [moduleItems, ext, form.control],
  )
  return (
    <PaymentFormView state={state} items={items}>
      <PaymentAllocationFields
        form={form}
        clientId={clientId}
        currency={currency}
        open={open}
      />
    </PaymentFormView>
  )
}

function PaymentFormView({
  state,
  items,
  children,
}: {
  state: RecordFormState<PaymentFormValues>
  items: readonly RecordFormItem[]
  children: React.ReactNode
}) {
  const t = usePaymentsT()
  const { isDirty, errors, submitCount } = state.form.formState
  const labels = useMemo(
    (): Readonly<Record<string, string>> => ({
      ...Object.fromEntries(items.map((item) => [item.id, item.label])),
      allocations: t("paymentForm.invoices.label"),
    }),
    [items, t],
  )
  const { ref: messageRef, message } = useFormMessage(state, labels)
  return (
    <form
      noValidate
      data-slot="payment-form"
      onSubmit={(event) => void state.submit(event)}
      aria-busy={state.isSaving || undefined}
      className="grid gap-6"
    >
      <UnsavedChangesGuard when={isDirty} />
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
      <RecordFormFields items={items} />
      {children}
      <SaveBar
        isDirty={isDirty}
        isSaving={state.isSaving}
        onDiscard={state.discard}
        submitLabel={t("payments.create")}
      />
    </form>
  )
}
