import { useCallback, useMemo, type RefObject } from "react"
import type { UseFormReturn } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { FormField } from "@/components/erp/form"
import { FormSelect } from "@/components/erp/form-select"
import {
  RecordFormDialog,
  type RecordFormItem,
} from "@/components/erp/record-form"
import { UaIdInput, uaIdIssueKey } from "@/components/erp/ua-id-input"
import { Input } from "@/components/ui/input"
import { useRecordForm } from "@/hooks/use-record-form"
import { useErpUiT } from "@/lib/i18n"
import { formatIban, validateUaId } from "@/lib/ua-ids"

import {
  ORGANIZATIONS,
  organizationCardSchemaFor,
  type BankAccount,
  type OrganizationCard,
} from "../contract"
import { useContactsModule } from "../module-context"
import { useContactsT } from "../use-contacts-t"
import { itemFieldOf, withItem } from "./detail-items"
import { choiceText, useCodeItems } from "./form-schema"

/**
 * Форма банківського рахунку організації в діалозі (ADR-0026, ADR-0028): новий і зміна. IBAN UA з
 * контрольними цифрами (`erp/ua-id-input`, `validateUaId`); той самий рахунок двічі форма не
 * приймає, а сервер — 422 `duplicate` біля поля. Основний рахунок форма не змінює: перший стає
 * основним сам, інший — дією «Зробити основним» у рядку. `iban` організації веде сервер.
 */

/** Валюти у формі (ISO 4217). */
const CURRENCIES = ["UAH", "USD", "EUR", "PLN", "GBP"] as const
const DEFAULT_CURRENCY = "UAH"
const BANK_NAME_MAX = 100

type BankAccountFormValues = Omit<BankAccount, "id" | "primary">

const valuesOf = (account: BankAccount): BankAccountFormValues => ({
  iban: account.iban,
  bankName: account.bankName,
  currency: account.currency,
})

const EMPTY: BankAccountFormValues = {
  iban: "",
  bankName: "",
  currency: DEFAULT_CURRENCY,
}

export interface BankAccountFormDialogProps {
  /** Організація з рахунками (детальний запис картки). */
  readonly organization: OrganizationCard
  /** Рахунок для зміни; без нього — новий. */
  readonly account?: BankAccount
  readonly onClose: () => void
  readonly onSaved: () => void
  /** Куди повернути фокус після закриття: «Додати рахунок» чи меню рядка. */
  readonly finalFocus?: RefObject<HTMLElement | null>
}

/** IBAN обов'язковий, з дійсними контрольними цифрами й не той, що вже є в організації. */
function useBankAccountSchema(others: readonly string[]) {
  const t = useContactsT()
  const kitT = useErpUiT()
  return useMemo(
    () =>
      z.object({
        iban: z.string().superRefine((iban, ctx) => {
          const issue = iban ? validateUaId("iban", iban) : null
          const message = !iban
            ? kitT("validation.required")
            : issue
              ? kitT(uaIdIssueKey("iban", issue))
              : others.includes(iban)
                ? t("organization.bankAccounts.form.duplicate")
                : null
          if (message) ctx.addIssue({ code: "custom", message })
        }),
        bankName: z
          .string()
          .trim()
          .max(
            BANK_NAME_MAX,
            t("organization.detail.tooLong", { max: BANK_NAME_MAX }),
          ),
        currency: z.string().length(3),
      }),
    [t, kitT, others],
  )
}

export function BankAccountFormDialog({
  organization,
  account,
  onClose,
  onSaved,
  finalFocus,
}: BankAccountFormDialogProps) {
  const t = useContactsT()
  const kitT = useErpUiT()
  const { extension } = useContactsModule()
  const recordSchema = useMemo(
    () => organizationCardSchemaFor(extension.organizations),
    [extension.organizations],
  )
  const others = useMemo(
    () =>
      organization.bankAccounts
        .filter((item) => item.id !== account?.id)
        .map((item) => item.iban),
    [organization.bankAccounts, account?.id],
  )
  const schema = useBankAccountSchema(others)
  // Стабільна: з неї форма рахує порівняння конфлікту.
  const toValues = useCallback(
    (record: OrganizationCard) => {
      const saved = record.bankAccounts.find((item) => item.id === account?.id)
      return saved ? valuesOf(saved) : EMPTY
    },
    [account?.id],
  )
  const state = useRecordForm<BankAccountFormValues, OrganizationCard>({
    resource: ORGANIZATIONS,
    record: organization,
    schema,
    defaultValues: account ? valuesOf(account) : EMPTY,
    recordSchema,
    // Уся колекція: основний лишається як був, новий рахунок — не основний (крім першого: сервер).
    toPayload: (values, _keys, target) => {
      const accounts = target?.bankAccounts ?? []
      const saved = accounts.find((item) => item.id === account?.id)
      return {
        bankAccounts: withItem(accounts, account?.id, {
          ...values,
          primary: saved?.primary ?? false,
        }),
      }
    },
    toValues,
    fieldOfServerError: itemFieldOf("bankAccounts"),
    onSaved: () => {
      const iban = formatIban(state.form.getValues("iban"))
      toast.success(
        t(
          account
            ? "organization.bankAccounts.form.saved"
            : "organization.bankAccounts.form.added",
          { iban },
        ),
      )
      onSaved()
    },
    onUnchanged: onClose,
  })
  const items = useBankAccountItems(state.form, account?.currency)
  return (
    <RecordFormDialog
      onClose={onClose}
      title={t(
        account
          ? "organization.bankAccounts.form.editTitle"
          : "organization.bankAccounts.form.createTitle",
      )}
      description={
        !account && !organization.bankAccounts.length
          ? `${organization.name}. ${t("organization.bankAccounts.form.firstPrimary")}`
          : organization.name
      }
      submitLabel={
        account ? kitT("recordForm.save") : t("organization.detail.add")
      }
      state={state}
      items={items}
      finalFocus={finalFocus}
    />
  )
}

/** Поля рахунку: IBAN на всю ширину, банк і валюта. */
function useBankAccountItems(
  form: UseFormReturn<BankAccountFormValues>,
  savedCurrency: string | undefined,
): RecordFormItem[] {
  const t = useContactsT()
  const { control } = form
  const currencies = useCodeItems(CURRENCIES, savedCurrency, "currency")
  return [
    {
      id: "iban",
      label: t("organization.bankAccounts.form.fields.iban"),
      wide: true,
      text: (value) => (typeof value === "string" ? formatIban(value) : null),
      render: (props) => (
        <FormField
          {...props}
          control={control}
          name="iban"
          render={({ field, control: aria }) => (
            <UaIdInput
              {...aria}
              kind="iban"
              ref={field.ref}
              name={field.name}
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
      ),
    },
    {
      id: "bankName",
      label: t("organization.bankAccounts.form.fields.bankName"),
      render: (props) => (
        <FormField
          {...props}
          control={control}
          name="bankName"
          render={({ field, control: aria }) => (
            <Input {...field} {...aria} autoComplete="off" />
          )}
        />
      ),
    },
    {
      id: "currency",
      label: t("organization.bankAccounts.form.fields.currency"),
      text: choiceText(currencies),
      render: (props) => (
        <FormField
          {...props}
          control={control}
          name="currency"
          render={({ field, control: aria }) => (
            <FormSelect
              {...aria}
              ref={field.ref}
              items={currencies}
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
      ),
    },
  ]
}
