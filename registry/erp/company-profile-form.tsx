import * as React from "react"
import { toast } from "sonner"

import {
  useAuthErrorText,
  useErpAuthProvider,
  useFieldError,
} from "@/registry/erp/auth-layout"
import {
  ProfileState,
  useRefreshCompany,
} from "@/registry/erp/company-profile-state"
import {
  CompanyKindSelect,
  CompanyPaletteSelect,
} from "@/registry/erp/company-selects"
import {
  checkAll,
  checkField,
  fieldsOf,
  patchOf,
  serverFieldErrors,
  type Fields,
  type Key,
} from "@/registry/erp/company-profile-values"
import { PhoneInput } from "@/registry/erp/phone-input"
import { UaIdInput } from "@/registry/erp/ua-id-input"
import { useCompanyProfile } from "@/registry/hooks/use-company-profile"
import { useHasPermission } from "@/registry/hooks/use-me"
import type { CompanyProfile } from "@/registry/lib/company"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  ibanBankCode,
  validateUaId,
  type UaIdKind,
} from "@/registry/lib/ua-ids"
import { Alert, AlertDescription } from "@/registry/ui/alert"
import { Button } from "@/registry/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"
import { Spinner } from "@/registry/ui/spinner"
import { Switch } from "@/registry/ui/switch"

/** Реквізити компанії: основне, банк, контакти, підписанти, палітра. */
export function CompanyProfileForm() {
  const query = useCompanyProfile()
  return (
    <ProfileState query={query} rows={6}>
      {/* Інша компанія — нова форма: незбережені правки не переходять до неї. */}
      {(profile) => <ProfileFields key={profile.id} profile={profile} />}
    </ProfileState>
  )
}

function ProfileFields({ profile }: { profile: CompanyProfile }) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const fieldError = useFieldError()
  const errorText = useAuthErrorText()
  const refresh = useRefreshCompany()
  const canEdit = useHasPermission("company", "update")
  const ids = React.useId()
  const initial = fieldsOf(profile)
  // Лише правки поверх профілю: оновлення з сервера видно одразу.
  const [edits, setEdits] = React.useState<Partial<Fields>>({})
  const values: Fields = { ...initial, ...edits }
  const [errors, setErrors] = React.useState<Partial<Record<Key, string>>>({})
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const changed = (Object.keys(values) as Key[]).filter(
    (key) => values[key] !== initial[key],
  )

  const set = <K extends Key>(key: K, value: Fields[K]) => {
    const next = { ...values, [key]: value }
    setEdits((current) => ({ ...current, [key]: value }))
    // Помилку, що вже показана, знімаємо щойно значення стало правильним.
    if (errors[key])
      setErrors((current) => ({ ...current, [key]: checkField(t, key, next) }))
  }
  const blur = (key: Key) => () => {
    setErrors((current) => ({ ...current, [key]: checkField(t, key, values) }))
  }

  const describedBy = (key: Key, hint?: boolean) =>
    [hint ? `${ids}-${key}-hint` : "", errors[key] ? `${ids}-${key}-error` : ""]
      .filter(Boolean)
      .join(" ") || undefined
  const invalid = (key: Key) => (errors[key] ? true : undefined)
  const errorOf = (key: Key) =>
    errors[key] ? (
      <FieldError id={`${ids}-${key}-error`}>{errors[key]}</FieldError>
    ) : null

  const text = (
    key: Exclude<Key, "kind" | "vatPayer" | UaIdKind | "phone" | "palette">,
    options: {
      hint?: string
      autoComplete?: string
      type?: string
      inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]
      maxLength?: number
    } = {},
  ) => (
    <Field data-invalid={invalid(key)}>
      <FieldLabel htmlFor={`${ids}-${key}`}>
        {t(`companySettings.${key}`)}
      </FieldLabel>
      <Input
        id={`${ids}-${key}`}
        type={options.type}
        inputMode={options.inputMode}
        autoComplete={options.autoComplete ?? "off"}
        maxLength={options.maxLength ?? 200}
        value={values[key]}
        disabled={!canEdit}
        aria-invalid={invalid(key)}
        aria-describedby={describedBy(key, Boolean(options.hint))}
        onChange={(event) => {
          set(key, event.target.value)
        }}
        onBlur={blur(key)}
      />
      {options.hint ? (
        <FieldDescription id={`${ids}-${key}-hint`}>
          {options.hint}
        </FieldDescription>
      ) : null}
      {errorOf(key)}
    </Field>
  )

  const uaId = (key: UaIdKind, hint?: string) => (
    <Field data-invalid={invalid(key)}>
      <FieldLabel htmlFor={`${ids}-${key}`}>
        {t(`companySettings.${key}`)}
      </FieldLabel>
      <UaIdInput
        id={`${ids}-${key}`}
        kind={key}
        value={values[key]}
        disabled={!canEdit}
        aria-invalid={invalid(key)}
        aria-describedby={describedBy(key, Boolean(hint))}
        onValueChange={(value) => {
          set(key, value)
        }}
        onBlur={blur(key)}
      />
      {hint ? (
        <FieldDescription id={`${ids}-${key}-hint`}>{hint}</FieldDescription>
      ) : null}
      {errorOf(key)}
    </Field>
  )

  const bankCode =
    values.iban && !validateUaId("iban", values.iban)
      ? ibanBankCode(values.iban)
      : null

  return (
    <form
      className="@container space-y-6"
      data-slot="company-profile-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        const local = checkAll(t, values)
        setErrors(local)
        if (Object.keys(local).length || !changed.length) return
        setBusy(true)
        setError(null)
        provider.company
          .update(patchOf(values, changed))
          .then(async () => {
            await refresh()
            setEdits({})
            toast.success(t("companySettings.saved"))
          })
          .catch((failure: unknown) => {
            const server = serverFieldErrors(
              t,
              failure,
              Object.keys(values) as Key[],
              fieldError,
            )
            if (Object.keys(server).length) setErrors(server)
            else setError(errorText(failure))
          })
          .finally(() => {
            setBusy(false)
          })
      }}
    >
      {canEdit ? null : (
        <Alert>
          <AlertDescription>{t("companySettings.readOnly")}</AlertDescription>
        </Alert>
      )}
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <FieldSet className="gap-4">
        <FieldLegend>{t("companySettings.sections.main")}</FieldLegend>
        <div className="grid gap-4 @lg:grid-cols-2">
          {text("name", {
            hint: t("companySettings.nameHint"),
            autoComplete: "organization",
            maxLength: 100,
          })}
          {text("legalName", { hint: t("companySettings.legalNameHint") })}
          <Field>
            <FieldLabel htmlFor={`${ids}-kind`}>
              {t("companySettings.kind")}
            </FieldLabel>
            <CompanyKindSelect
              id={`${ids}-kind`}
              value={values.kind}
              disabled={!canEdit}
              onValueChange={(value) => {
                set("kind", value)
              }}
            />
          </Field>
          {values.kind === "legal" ? uaId("edrpou") : uaId("rnokpp")}
        </div>
        <Field orientation="horizontal">
          <Switch
            id={`${ids}-vatPayer`}
            checked={values.vatPayer}
            disabled={!canEdit}
            onCheckedChange={(checked) => {
              set("vatPayer", checked)
              if (!checked)
                setErrors((current) => ({ ...current, vatIpn: undefined }))
            }}
          />
          <FieldLabel htmlFor={`${ids}-vatPayer`}>
            {t("companySettings.vatPayer")}
          </FieldLabel>
        </Field>
        {values.vatPayer ? (
          <div className="grid gap-4 @lg:grid-cols-2">{uaId("vatIpn")}</div>
        ) : null}
      </FieldSet>

      <FieldSet className="gap-4">
        <FieldLegend>{t("companySettings.sections.bank")}</FieldLegend>
        <div className="grid gap-4 @lg:grid-cols-2">
          {uaId(
            "iban",
            bankCode
              ? t("companySettings.bankCode", { code: bankCode })
              : undefined,
          )}
          {text("bankName")}
        </div>
      </FieldSet>

      <FieldSet className="gap-4">
        <FieldLegend>{t("companySettings.sections.contacts")}</FieldLegend>
        <div className="grid gap-4 @lg:grid-cols-2">
          <div className="@lg:col-span-2">
            {text("address", {
              autoComplete: "street-address",
              maxLength: 300,
            })}
          </div>
          <Field data-invalid={invalid("phone")}>
            <FieldLabel htmlFor={`${ids}-phone`}>
              {t("companySettings.phone")}
            </FieldLabel>
            <PhoneInput
              id={`${ids}-phone`}
              value={values.phone}
              disabled={!canEdit}
              aria-invalid={invalid("phone")}
              aria-describedby={describedBy("phone")}
              onValueChange={(value) => {
                set("phone", value)
              }}
              onBlur={blur("phone")}
            />
            {errorOf("phone")}
          </Field>
          {text("email", {
            type: "email",
            inputMode: "email",
            autoComplete: "email",
          })}
          {text("website", { inputMode: "url", autoComplete: "url" })}
        </div>
      </FieldSet>

      <FieldSet className="gap-4">
        <FieldLegend>{t("companySettings.sections.signers")}</FieldLegend>
        <div className="grid gap-4 @lg:grid-cols-2">
          {text("directorName", { maxLength: 100 })}
          {text("directorPosition", { maxLength: 100 })}
          {text("accountant", { maxLength: 100 })}
        </div>
      </FieldSet>

      <FieldSet className="gap-4">
        <FieldLegend>{t("companySettings.sections.appearance")}</FieldLegend>
        <div className="grid gap-4 @lg:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${ids}-palette`}>
              {t("companySettings.palette")}
            </FieldLabel>
            <CompanyPaletteSelect
              id={`${ids}-palette`}
              value={values.palette}
              disabled={!canEdit}
              describedBy={`${ids}-palette-hint`}
              onValueChange={(value) => {
                set("palette", value)
              }}
            />
            <FieldDescription id={`${ids}-palette-hint`}>
              {t("companySettings.paletteHint")}
            </FieldDescription>
          </Field>
        </div>
      </FieldSet>

      {canEdit ? (
        <Button type="submit" disabled={busy || !changed.length}>
          {busy ? <Spinner aria-hidden /> : null}
          {t("companySettings.save")}
        </Button>
      ) : null}
    </form>
  )
}
