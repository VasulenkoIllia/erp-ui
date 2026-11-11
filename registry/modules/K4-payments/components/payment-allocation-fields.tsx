import { memo } from "react"
import { useWatch, type UseFormReturn } from "react-hook-form"

import { FormField } from "@/components/erp/form"
import { MoneyInput } from "@/components/erp/number-input"
import { PageState } from "@/components/erp/page-state"
import { StatusBadge } from "@/components/erp/status-badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { compareCalendarDates, todayIn, type CalendarDate } from "@/lib/dates"
import { errorStateKind } from "@/lib/api"
import { useFormat } from "@/lib/format"

import { allocatedTotal, allocateOldestFirst } from "../allocation"
import type { OpenInvoice } from "../contract"
import { usePaymentsT } from "../use-payments-t"
import { InvoiceLink } from "./payment-display"
import type { PaymentFormValues } from "./payment-form-items"
import { OPEN_INVOICES_LIMIT, type OpenInvoices } from "./use-open-invoices"

type Form = UseFormReturn<PaymentFormValues>

/** Підписи колонок на широкому контейнері: на вузькому в кожного рядка свої підписи. */
const ROW_GRID =
  "@2xl:grid-cols-[minmax(0,1fr)_9rem_10rem_13rem] @2xl:items-center"

/**
 * Рахунки клієнта у формі оплати (ADR-0073): неоплачені рахунки у валюті оплати від найранішої «Сплатити до»
 * з боргом і сумою з оплати кожному; «Розписати від найстаршого» ділить суму оплати за порядком; під списком —
 * скільки розписано й скільки лишилось. На вузькому контейнері рядок — картка, на широкому — колонки.
 */
export function PaymentAllocationFields({
  form,
  clientId,
  currency,
  open,
}: {
  form: Form
  clientId: string
  currency: string
  open: OpenInvoices
}) {
  const t = usePaymentsT()
  const invoices = open.invoices?.filter(
    (invoice) => invoice.currency === currency,
  )
  const body = !clientId ? (
    <p className="text-sm text-muted-foreground">
      {t("paymentForm.invoices.pickClient")}
    </p>
  ) : open.failure !== undefined ? (
    <PageState
      kind={errorStateKind(open.failure)}
      title={t("paymentForm.invoices.failed")}
      onRetry={open.retry}
    />
  ) : !invoices || open.isPending ? (
    <div className="grid gap-2" aria-hidden>
      <Skeleton className="h-10" />
      <Skeleton className="h-10" />
    </div>
  ) : invoices.length === 0 ? (
    <p className="text-sm text-muted-foreground">
      {t("paymentForm.invoices.empty")}
    </p>
  ) : (
    <AllocationRows form={form} invoices={invoices} currency={currency} />
  )
  return (
    <fieldset data-slot="payment-allocations" className="@container grid gap-3">
      <legend className="mb-2 text-base font-semibold">
        {t("paymentForm.invoices.label")}
      </legend>
      {body}
      {open.isTruncated ? (
        <Alert>
          <AlertDescription>
            {t("paymentForm.invoices.truncated", {
              count: OPEN_INVOICES_LIMIT,
            })}
          </AlertDescription>
        </Alert>
      ) : null}
    </fieldset>
  )
}

function AllocationRows({
  form,
  invoices,
  currency,
}: {
  form: Form
  invoices: readonly OpenInvoice[]
  currency: string
}) {
  const t = usePaymentsT()
  const format = useFormat()
  const amount = useWatch({ control: form.control, name: "amount" })
  const amounts = useWatch({ control: form.control, name: "allocations" })
  const allocated = allocatedTotal(amounts)
  const today = todayIn(format.timeZone)
  const money = (value: number) => format.money({ amount: value, currency })
  const left = (amount ?? 0) - allocated
  return (
    <>
      <div
        aria-hidden
        className={`hidden text-sm text-muted-foreground @2xl:grid ${ROW_GRID} gap-3`}
      >
        <span>{t("paymentForm.invoices.number")}</span>
        <span>{t("paymentForm.invoices.dueDate")}</span>
        <span className="text-end">{t("paymentForm.invoices.debt")}</span>
        <span>{t("paymentForm.invoices.amount")}</span>
      </div>
      <ul className="grid">
        {invoices.map((invoice) => (
          <AllocationRow
            key={invoice.id}
            form={form}
            invoice={invoice}
            today={today}
          />
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button
          type="button"
          variant="outline"
          disabled={!amount}
          onClick={() => {
            form.setValue(
              "allocations",
              allocateOldestFirst(amount ?? 0, invoices),
              { shouldDirty: true, shouldValidate: form.formState.isSubmitted },
            )
          }}
        >
          {t("paymentForm.invoices.auto")}
        </Button>
        <p aria-live="polite" className="text-sm tabular-nums">
          {t("paymentForm.invoices.allocated", {
            allocated: money(allocated),
            amount: money(amount ?? 0),
          })}
          {left > 0
            ? ` · ${t("paymentForm.invoices.left", { left: money(left) })}`
            : left < 0
              ? ` · ${t("paymentForm.invoices.over", { over: money(-left) })}`
              : null}
        </p>
      </div>
    </>
  )
}

/** Рядок рахунку: поле суми підписане само на себе, тож введення в одному рядку не перемальовує інші. */
const AllocationRow = memo(function AllocationRow({
  form,
  invoice,
  today,
}: {
  form: Form
  invoice: OpenInvoice
  today: CalendarDate
}) {
  const t = usePaymentsT()
  const format = useFormat()
  const isOverdue = compareCalendarDates(invoice.dueDate, today) < 0
  const money = (value: number) =>
    format.money({ amount: value, currency: invoice.currency })
  return (
    <li className={`grid gap-2 border-b py-3 ${ROW_GRID} @2xl:gap-3`}>
      <span className="font-medium">
        <InvoiceLink id={invoice.id} number={invoice.number} />
      </span>
      <span className="inline-flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground @2xl:sr-only">
          {t("paymentForm.invoices.dueDate")}
        </span>
        <span className="tabular-nums">
          {format.date(invoice.dueDate, "date")}
        </span>
        {isOverdue ? (
          <StatusBadge
            status={{
              id: "overdue",
              label: t("paymentForm.invoices.overdue"),
              tone: "warning",
              icon: "pending",
            }}
          />
        ) : null}
      </span>
      <span className="text-sm tabular-nums @2xl:text-end">
        <span className="text-muted-foreground @2xl:sr-only">
          {t("paymentForm.invoices.debt")}{" "}
        </span>
        {money(invoice.debt)}
      </span>
      <FormField
        control={form.control}
        name={`allocations.${invoice.id}`}
        label={t("paymentForm.invoices.amountOf", { number: invoice.number })}
        className="@2xl:[&>[data-slot=field-label]]:sr-only"
        render={({ field, control: aria }) => (
          <MoneyInput
            {...aria}
            ref={field.ref}
            currency={invoice.currency}
            value={
              typeof field.value === "number"
                ? { amount: field.value, currency: invoice.currency }
                : null
            }
            onValueChange={(value) => {
              field.onChange(value === null ? null : Number(value.amount))
            }}
            onBlur={field.onBlur}
          />
        )}
      />
    </li>
  )
})
