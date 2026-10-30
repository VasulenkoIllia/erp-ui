import { useId } from "react"
import { Controller, useWatch } from "react-hook-form"

import type { Fields } from "@/components/erp/company-profile-values"
import { CompanyKindSelect } from "@/components/erp/company-selects"
import { FormField } from "@/components/erp/form"
import { UaIdInput } from "@/components/erp/ua-id-input"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useErpUiT } from "@/lib/i18n"
import type { UaIdKind } from "@/lib/ua-ids"

import type { SetupForm } from "./use-setup-form"

/** Текстове поле кроку; підписи — ті самі, що у формі реквізитів. */
function TextField({
  form,
  name,
  description,
  autoComplete = "off",
  maxLength = 200,
}: {
  form: SetupForm
  name: "name" | "legalName" | "bankName"
  description?: string
  autoComplete?: string
  maxLength?: number
}) {
  const t = useErpUiT()
  return (
    <FormField
      control={form.control}
      name={name}
      label={t(`companySettings.${name}`)}
      description={description}
      render={({ field, control }) => (
        <Input
          {...field}
          {...control}
          autoComplete={autoComplete}
          maxLength={maxLength}
        />
      )}
    />
  )
}

function UaIdField({ form, name }: { form: SetupForm; name: UaIdKind }) {
  const t = useErpUiT()
  return (
    <FormField
      control={form.control}
      name={name satisfies keyof Fields}
      label={t(`companySettings.${name}`)}
      render={({ field, control }) => (
        <UaIdInput
          ref={field.ref}
          id={control.id}
          kind={name}
          value={field.value}
          aria-invalid={control["aria-invalid"]}
          aria-describedby={control["aria-describedby"]}
          onValueChange={field.onChange}
          onBlur={field.onBlur}
        />
      )}
    />
  )
}

/** Крок «Реквізити»: основне й банк. Контакти й підписанти — потім, на картці компанії. */
export function SetupRequisitesStep({ form }: { form: SetupForm }) {
  const t = useErpUiT()
  const vatId = useId()
  const kind = useWatch({ control: form.control, name: "kind" })
  const vatPayer = useWatch({ control: form.control, name: "vatPayer" })
  const code = kind === "legal" ? "edrpou" : "rnokpp"
  return (
    <div className="grid gap-4 @lg:grid-cols-2">
      <TextField
        form={form}
        name="name"
        description={t("companySettings.nameHint")}
        autoComplete="organization"
        maxLength={100}
      />
      <TextField
        form={form}
        name="legalName"
        description={t("companySettings.legalNameHint")}
      />
      <FormField
        control={form.control}
        name="kind"
        label={t("companySettings.kind")}
        render={({ field, control }) => (
          <CompanyKindSelect
            id={control.id}
            value={field.value}
            describedBy={control["aria-describedby"]}
            onValueChange={field.onChange}
          />
        )}
      />
      <UaIdField key={code} form={form} name={code} />
      <Controller
        control={form.control}
        name="vatPayer"
        render={({ field }) => (
          <Field orientation="horizontal" className="@lg:col-span-2">
            <Switch
              id={vatId}
              checked={field.value}
              onCheckedChange={field.onChange}
            />
            <FieldLabel htmlFor={vatId}>
              {t("companySettings.vatPayer")}
            </FieldLabel>
          </Field>
        )}
      />
      {vatPayer ? <UaIdField form={form} name="vatIpn" /> : null}
      <UaIdField form={form} name="iban" />
      <TextField form={form} name="bankName" />
    </div>
  )
}
