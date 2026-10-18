import { zodResolver } from "@hookform/resolvers/zod"
import { useMemo, useState } from "react"
import { useForm, useWatch, type Control } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"

import { ConfirmDialog, useUndoToast } from "@/registry/erp/confirm-dialog"
import { DateInput, useDateIssueText } from "@/registry/erp/date-input"
import {
  FormErrorSummary,
  FormField,
  keepFieldFocus,
  UnsavedChangesGuard,
} from "@/registry/erp/form"
import { MoneyInput, NumberInput } from "@/registry/erp/number-input"
import { amountInWords } from "@/registry/lib/amount-in-words"
import { addDays, isCalendarDate, todayIn } from "@/registry/lib/dates"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT, useLanguage } from "@/registry/lib/i18n"
import { Button } from "@/registry/ui/button"
import { FieldGroup } from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"
import { Spinner } from "@/registry/ui/spinner"
import { Textarea } from "@/registry/ui/textarea"

import { PageHeader } from "./PageHeader"
import { Section } from "./Section"

const usePageT = () => useTranslation("demo", { keyPrefix: "formsPage" }).t

/** Номер, який «уже зайнятий» на сервері — показує серверну помилку біля поля. */
const TAKEN_NUMBER = "РФ-0001"
const SAVE_DELAY_MS = 600

const wait = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

/** Схема з текстами мовою інтерфейсу (ADR-0015). */
function useInvoiceSchema() {
  const kitT = useErpUiT()
  const format = useFormat()
  const issueText = useDateIssueText()
  return useMemo(() => {
    const required = kitT("validation.required")
    /** Текст помилки поля дати або null. */
    const dateError = (value: string, min?: string) =>
      value ? issueText(value, { min }) : required
    return z
      .object({
        number: z.string().trim().min(1, required),
        counterparty: z.string().trim().min(1, required),
        issuedOn: z.string(),
        dueOn: z.string(),
        amount: z
          .object({
            amount: z.union([z.number(), z.bigint()]),
            currency: z.string(),
          })
          .nullable()
          .superRefine((money, ctx) => {
            if (money === null)
              ctx.addIssue({ code: "custom", message: required })
            else if (BigInt(money.amount) <= 0n)
              ctx.addIssue({
                code: "custom",
                message: kitT("validation.number.min", {
                  min: format.number(0.01),
                }),
              })
          }),
        quantity: z
          .number()
          .nullable()
          .refine((value) => value !== null && value >= 1, {
            message: kitT("validation.number.min", { min: format.number(1) }),
          }),
        company: z.string(),
        comment: z.string(),
      })
      .superRefine((values, ctx) => {
        // «Сплатити до» — не раніше дати рахунку, якщо та введена правильно.
        const min = isCalendarDate(values.issuedOn)
          ? values.issuedOn
          : undefined
        const checks = [
          ["issuedOn", dateError(values.issuedOn)],
          ["dueOn", dateError(values.dueOn, min)],
        ] as const
        for (const [path, message] of checks)
          if (message) ctx.addIssue({ code: "custom", message, path: [path] })
      })
  }, [kitT, format, issueText])
}

type Invoice = z.input<ReturnType<typeof useInvoiceSchema>>

/** Сума прописом під полем — окремо, щоб введення суми не перерендерювало всю форму. */
function AmountInWordsHint({ control }: { control: Control<Invoice> }) {
  const t = usePageT()
  const { language } = useLanguage()
  const amount = useWatch({ control, name: "amount" })
  return amount && BigInt(amount.amount) > 0n
    ? amountInWords(amount, language)
    : t("form.amountHint")
}

function InvoiceForm() {
  const t = usePageT()
  const { timeZone } = useFormat()
  const schema = useInvoiceSchema()
  const today = todayIn(timeZone)
  const form = useForm<Invoice>({
    mode: "onTouched",
    shouldFocusError: false,
    resolver: zodResolver(schema),
    defaultValues: {
      number: "",
      counterparty: "",
      issuedOn: today,
      dueOn: addDays(today, 14),
      amount: null,
      quantity: 1,
      company: t("form.companyValue"),
      comment: "",
    },
  })
  const { control, formState } = form

  const submit = form.handleSubmit(async (values) => {
    if (!formState.isDirty) {
      toast.info(t("form.noChanges"))
      return
    }
    await wait(SAVE_DELAY_MS)
    if (values.number.trim() === TAKEN_NUMBER) {
      form.setError("number", { type: "server", message: t("form.taken") })
      return
    }
    form.reset(values)
    toast.success(t("form.saved"))
  })

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(event) => {
        void submit(event)
      }}
    >
      <UnsavedChangesGuard when={formState.isDirty} />
      <FormErrorSummary
        errors={formState.errors}
        submitCount={formState.submitCount}
        labels={{
          number: t("form.number"),
          counterparty: t("form.counterparty"),
          issuedOn: t("form.issuedOn"),
          dueOn: t("form.dueOn"),
          amount: t("form.amount"),
          quantity: t("form.quantity"),
        }}
      />
      <FieldGroup className="@container">
        <div className="grid gap-4 @lg:grid-cols-2">
          <FormField
            control={control}
            name="number"
            label={t("form.number")}
            description={t("form.numberHint", { taken: TAKEN_NUMBER })}
            render={({ field, control: aria }) => (
              <Input {...aria} {...field} autoComplete="off" />
            )}
          />
          <FormField
            control={control}
            name="counterparty"
            label={t("form.counterparty")}
            render={({ field, control: aria }) => (
              <Input {...aria} {...field} autoComplete="organization" />
            )}
          />
          <FormField
            control={control}
            name="issuedOn"
            label={t("form.issuedOn")}
            render={({ field, control: aria }) => (
              <DateInput
                {...aria}
                name={field.name}
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
          <FormField
            control={control}
            name="dueOn"
            label={t("form.dueOn")}
            render={({ field, control: aria }) => (
              <DateInput
                {...aria}
                name={field.name}
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
          <FormField
            control={control}
            name="amount"
            label={t("form.amount")}
            description={<AmountInWordsHint control={control} />}
            render={({ field, control: aria }) => (
              <MoneyInput
                {...aria}
                currency="UAH"
                name={field.name}
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
          <FormField
            control={control}
            name="quantity"
            label={t("form.quantity")}
            render={({ field, control: aria }) => (
              <NumberInput
                {...aria}
                unit={t("form.pieces")}
                name={field.name}
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
          <FormField
            control={control}
            name="company"
            label={t("form.company")}
            description={t("form.companyHint")}
            readOnly
            render={({ field, control: aria }) => (
              <Input {...aria} {...field} />
            )}
          />
        </div>
        <FormField
          control={control}
          name="comment"
          label={t("form.comment")}
          render={({ field, control: aria }) => (
            <Textarea {...aria} {...field} rows={3} />
          )}
        />
      </FieldGroup>
      <Button
        type="submit"
        onMouseDown={keepFieldFocus}
        disabled={formState.isSubmitting}
        focusableWhenDisabled
      >
        {formState.isSubmitting ? <Spinner aria-hidden /> : null}
        {t("form.save")}
      </Button>
    </form>
  )
}

type Pending = "delete" | "critical" | null

function ConfirmSection() {
  const t = usePageT()
  const undoToast = useUndoToast()
  const [pending, setPending] = useState<Pending>(null)
  const close = () => {
    setPending(null)
  }
  const done = (message: string) => async () => {
    await wait(SAVE_DELAY_MS)
    setPending(null)
    toast.success(message)
  }
  return (
    <Section title={t("confirm.title")} description={t("confirm.description")}>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => {
            undoToast(t("confirm.archived"), () => {
              toast.success(t("confirm.restored"))
            })
          }}
        >
          {t("confirm.archive")}
        </Button>
        <Button
          variant="destructive"
          onClick={() => {
            setPending("delete")
          }}
        >
          {t("confirm.delete")}
        </Button>
        <Button
          variant="destructive"
          onClick={() => {
            setPending("critical")
          }}
        >
          {t("confirm.deleteCompany")}
        </Button>
      </div>
      <ConfirmDialog
        open={pending === "delete"}
        title={t("confirm.deleteTitle")}
        description={t("confirm.deleteDescription")}
        confirmLabel={t("confirm.delete")}
        destructive
        onClose={close}
        onConfirm={done(t("confirm.deleted"))}
      />
      <ConfirmDialog
        open={pending === "critical"}
        title={t("confirm.deleteCompanyTitle")}
        description={t("confirm.deleteCompanyDescription")}
        confirmLabel={t("confirm.deleteCompanyConfirm")}
        confirmWord={t("confirm.word")}
        destructive
        onClose={close}
        onConfirm={done(t("confirm.companyDeleted"))}
      />
    </Section>
  )
}

export function FormsPage() {
  const t = usePageT()
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} lead={t("lead")} />
      <Section title={t("form.title")} description={t("form.description")}>
        <InvoiceForm />
      </Section>
      <ConfirmSection />
    </div>
  )
}
