import * as React from "react"
import {
  useWatch,
  type FieldPathByValue,
  type FieldValues,
  type UseFormReturn,
} from "react-hook-form"

import { FormField } from "@/registry/erp/form"
import { FormSelect } from "@/registry/erp/form-select"
import { partyCodeKind } from "@/registry/erp/party-details-schema"
import { UaIdInput } from "@/registry/erp/ua-id-input"
import { announce } from "@/registry/lib/announce"
import { COMPANY_KINDS, type CompanyKind } from "@/registry/lib/company"
import {
  emptyPartyDetails,
  fillEmptyPartyFields,
  isPartyFieldShown,
  PARTY_ROLES,
  PARTY_TEXT_FIELDS,
  signatureName,
  type PartyDetails,
  type PartyField,
  type PartyRole,
} from "@/registry/lib/document-parties"
import { useErpUiT } from "@/registry/lib/i18n"
import type { UaIdKind } from "@/registry/lib/ua-ids"
import { cn } from "@/registry/lib/utils"
import { Button } from "@/registry/ui/button"
import { FieldLegend, FieldSet } from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"

/**
 * Реквізити сторони в формі документа (UI45, ADR-0068): вид (юрособа чи ФОП), повна назва, код за видом,
 * ІПН, IBAN і банк, адреса, телефон, пошта, підписант із підписом «Олена КОВАЛЬ», «в особі» в родовому
 * вручну й «діє на підставі». Дані — `lib/document-parties`, схема — `erp/party-details-schema`, друк —
 * `PrintPartyDetails` і `partyClause` з `erp/print-requisites`.
 *
 * - `name` — шлях до об'єкта `PartyDetails` у формі модуля; у списку сторін (`useFieldArray`) — `key`
 *   рядка `field.id`, а не індекс.
 * - `source` — звідки заповнити (профіль компанії, картка контрагента): кнопка заповнює лише порожні поля,
 *   введене людиною лишається, заповнене одразу перевіряється; скільки заповнено, чує скрінрідер. Немає
 *   даних — та сама кнопка неактивна з причиною поруч (SPEC §8.4), тож фокус на ній не губиться, коли дані
 *   приходять.
 * - Посада й «в особі» — лише юрособи: ФОП діє сам.
 * - `readOnly` — без права змінювати: поля лише для читання (SPEC §8.3), кнопки заповнення немає.
 */

/** Звідки заповнити сторону: профіль компанії, картка контрагента. */
export interface PartyDetailsSource {
  /** Текст кнопки: «Заповнити з профілю компанії». */
  label: string
  /** Дані джерела; поки їх немає, кнопка неактивна з причиною `unavailableReason`. */
  values?: Partial<PartyDetails>
  /** Чому заповнити не можна, коли даних немає: «Профіль компанії ще завантажується» (SPEC §8.4). */
  unavailableReason: string
}

interface PartyDetailsFieldsProps<TValues extends FieldValues> {
  form: UseFormReturn<TValues>
  name: FieldPathByValue<TValues, PartyDetails>
  /** Назва групи полів: «Виконавець: наша компанія», «Замовник». */
  legend: React.ReactNode
  source?: PartyDetailsSource
  readOnly?: boolean
  className?: string
}

/** Шляхи полів сторони — рядки: тип форми модуля всередині не потрібен. */
type PartyForm = UseFormReturn<FieldValues>

/** Поля сторони документа з групою «Підписант». */
export function PartyDetailsFields<TValues extends FieldValues>({
  form,
  name,
  legend,
  source,
  readOnly,
  className,
}: PartyDetailsFieldsProps<TValues>) {
  const t = useErpUiT()
  const host = form as unknown as PartyForm
  const path = (field: PartyField) => `${name}.${field}`
  const kind =
    (useWatch({ control: host.control, name: path("kind") }) as
      CompanyKind | undefined) ?? "legal"
  const field = (key: Exclude<PartyField, "kind">, wide?: boolean) =>
    isPartyFieldShown(key, kind) ? (
      <PartyTextField
        form={host}
        name={path(key)}
        field={key}
        kind={kind}
        readOnly={readOnly}
        className={wide ? "@lg:col-span-2" : undefined}
      />
    ) : null
  return (
    <div data-slot="party-details" className={cn("@container", className)}>
      <FieldSet className="min-w-0 gap-4">
        <FieldLegend>{legend}</FieldLegend>
        {source && !readOnly ? (
          <FillFromSource form={host} name={name} source={source} />
        ) : null}
        <div className="grid gap-4 @lg:grid-cols-2">
          <KindField form={host} party={name} readOnly={readOnly} />
          {field("name")}
          {field("code")}
          {field("vatIpn")}
          {field("iban")}
          {field("bankName")}
          {field("address", true)}
          {field("phone")}
          {field("email")}
        </div>
        <FieldSet className="min-w-0 gap-4">
          <FieldLegend variant="label">{t("partyDetails.signer")}</FieldLegend>
          <div className="grid gap-4 @lg:grid-cols-2">
            {field("signerPosition")}
            {field("signerName")}
            {field("representedBy", true)}
            {field("basis", true)}
          </div>
        </FieldSet>
      </FieldSet>
    </div>
  )
}

/** Вид сторони: інший вид — інша довжина коду, тож код, який уже бачили чи з помилкою, перевіряється знову. */
function KindField({
  form,
  party,
  readOnly,
}: {
  form: PartyForm
  party: string
  readOnly?: boolean
}) {
  const t = useErpUiT()
  const items = COMPANY_KINDS.map((value) => ({
    value,
    label: t(`companySettings.kinds.${value}`),
  }))
  const code = `${party}.code`
  return (
    <FormField
      control={form.control}
      name={`${party}.kind`}
      label={t("partyDetails.kind")}
      readOnly={readOnly}
      render={({ field, control: aria }) => (
        <FormSelect
          {...aria}
          ref={field.ref}
          items={items}
          value={field.value as CompanyKind}
          onValueChange={(next) => {
            field.onChange(next)
            const state = form.getFieldState(code)
            if (state.isTouched || state.invalid) void form.trigger(code)
          }}
          onBlur={field.onBlur}
        />
      )}
    />
  )
}

/** Підпис і підказка поля мовою інтерфейсу. */
function useFieldText(field: Exclude<PartyField, "kind">, kind: CompanyKind) {
  const t = useErpUiT()
  switch (field) {
    case "code":
      return { label: t(`companySettings.${partyCodeKind(kind)}`) }
    case "name":
      return {
        label: t("partyDetails.name"),
        hint: t(`partyDetails.nameHint.${kind}`),
      }
    case "vatIpn":
      return {
        label: t("companySettings.vatIpn"),
        hint: t("partyDetails.vatIpnHint"),
      }
    case "iban":
    case "bankName":
    case "phone":
    case "email":
      return { label: t(`companySettings.${field}`) }
    case "address":
    case "signerPosition":
      return { label: t(`partyDetails.${field}`) }
    case "signerName":
      return {
        label: t("partyDetails.signerName"),
        hint: t("partyDetails.signerNameHint"),
      }
    case "representedBy":
    case "basis":
      return {
        label: t(`partyDetails.${field}`),
        hint: t(`partyDetails.${field}Hint`),
      }
    default: {
      const unknown: never = field
      return unknown
    }
  }
}

const UA_ID_FIELDS: Partial<Record<PartyField, UaIdKind>> = {
  vatIpn: "vatIpn",
  iban: "iban",
}
/** Поля, які браузер може підказати з автозаповнення; решта — без підказок браузера. */
const AUTOCOMPLETE: Partial<Record<PartyField, string>> = {
  name: "organization",
}
const INPUT_TYPES: Partial<Record<PartyField, string>> = {
  phone: "tel",
  email: "email",
}
const MAX_LENGTH = 200
const ADDRESS_MAX_LENGTH = 300

function PartyTextField({
  form,
  name,
  field,
  kind,
  readOnly,
  className,
}: {
  form: PartyForm
  name: string
  field: Exclude<PartyField, "kind">
  kind: CompanyKind
  readOnly?: boolean
  className?: string
}) {
  const { label, hint } = useFieldText(field, kind)
  const uaId = field === "code" ? partyCodeKind(kind) : UA_ID_FIELDS[field]
  return (
    <FormField
      control={form.control}
      name={name}
      label={label}
      readOnly={readOnly}
      className={className}
      description={
        field === "signerName" ? (
          <SignatureHint form={form} name={name} fallback={hint} />
        ) : (
          hint
        )
      }
      render={({ field: props, control: aria }) =>
        uaId ? (
          <UaIdInput
            {...aria}
            kind={uaId}
            ref={props.ref}
            name={props.name}
            value={(props.value as string | undefined) ?? ""}
            onValueChange={props.onChange}
            onBlur={props.onBlur}
          />
        ) : (
          <Input
            {...props}
            {...aria}
            value={(props.value as string | undefined) ?? ""}
            type={INPUT_TYPES[field]}
            autoComplete={AUTOCOMPLETE[field] ?? "off"}
            maxLength={field === "address" ? ADDRESS_MAX_LENGTH : MAX_LENGTH}
          />
        )
      }
    />
  )
}

/** Під ПІБ — як підпишуть документ: «Підпис на документах: Олена КОВАЛЬ»; порожнє — порядок слів. */
function SignatureHint({
  form,
  name,
  fallback,
}: {
  form: PartyForm
  name: string
  fallback?: string
}) {
  const t = useErpUiT()
  const value = useWatch({ control: form.control, name }) as string | undefined
  const signature = signatureName(value ?? "")
  return signature ? t("partyDetails.signature", { name: signature }) : fallback
}

const sameParty = (a: PartyDetails | undefined, b: PartyDetails) =>
  a?.kind === b.kind &&
  PARTY_TEXT_FIELDS.every((field) => a[field] === b[field])

/**
 * Кнопка «Заповнити з …»: лише порожні поля. Підсумок чує скрінрідер щоразу (`lib/announce`), а видно
 * його, поки сторона така, як після заповнення: змінили поле — підсумок зник.
 */
function FillFromSource({
  form,
  name,
  source,
}: {
  form: PartyForm
  name: string
  source: PartyDetailsSource
}) {
  const t = useErpUiT()
  const reasonId = React.useId()
  const party = useWatch({ control: form.control, name }) as
    PartyDetails | undefined
  const [done, setDone] = React.useState<{
    message: string
    party: PartyDetails
  } | null>(null)
  const { values } = source
  const fill = () => {
    if (!values) return
    const current =
      (form.getValues(name) as PartyDetails | undefined) ?? emptyPartyDetails()
    const result = fillEmptyPartyFields(current, values)
    const paths = result.filled.map((key) => `${name}.${key}`)
    result.filled.forEach((key, index) => {
      form.setValue(paths[index], result.values[key], { shouldDirty: true })
    })
    // Заповнене одразу перевіряється: хибний IBAN картки видно до відправки.
    if (paths.length > 0) void form.trigger(paths)
    const count = result.filled.filter((key) => key !== "kind").length
    const message =
      count > 0
        ? t("partyDetails.filled", { count })
        : t("partyDetails.nothingToFill")
    announce(message)
    setDone({ message, party: result.values })
  }
  const status = values
    ? done && sameParty(party, done.party)
      ? done.message
      : ""
    : source.unavailableReason
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!values}
        focusableWhenDisabled
        aria-describedby={values ? undefined : reasonId}
        onClick={fill}
      >
        {source.label}
      </Button>
      <p id={reasonId} className="text-sm text-muted-foreground">
        {status}
      </p>
    </div>
  )
}

interface PartyRoleFieldProps<TValues extends FieldValues> {
  form: UseFormReturn<TValues>
  name: FieldPathByValue<TValues, PartyRole>
  readOnly?: boolean
  className?: string
}

/** «Наша компанія в документі: Замовник / Виконавець»; контрагент — друга роль (`otherPartyRole`). */
export function PartyRoleField<TValues extends FieldValues>({
  form,
  name,
  readOnly,
  className,
}: PartyRoleFieldProps<TValues>) {
  const t = useErpUiT()
  const host = form as unknown as PartyForm
  const items = PARTY_ROLES.map((value) => ({
    value,
    label: t(`partyDetails.roles.${value}`),
  }))
  return (
    <FormField
      control={host.control}
      name={name}
      label={t("partyDetails.role")}
      readOnly={readOnly}
      className={className}
      render={({ field, control: aria }) => (
        <FormSelect
          {...aria}
          ref={field.ref}
          items={items}
          value={field.value}
          onValueChange={field.onChange}
          onBlur={field.onBlur}
        />
      )}
    />
  )
}
