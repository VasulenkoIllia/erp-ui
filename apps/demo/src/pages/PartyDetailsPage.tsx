import { zodResolver } from "@hookform/resolvers/zod"
import { useDeferredValue, useEffect, useId, useMemo, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"

import { FormSelect } from "@/registry/erp/form-select"
import {
  PartyDetailsFields,
  PartyRoleField,
  type PartyDetailsSource,
} from "@/registry/erp/party-details"
import { usePartyDetailsSchema } from "@/registry/erp/party-details-schema"
import { PrintPreview } from "@/registry/erp/print-preview"
import { partyClause, PrintPartyDetails } from "@/registry/erp/print-requisites"
import { useCompanyProfile } from "@/registry/hooks/use-company-profile"
import { toLanguage, useErpUiT, useLanguage } from "@/registry/lib/i18n"
import {
  emptyPartyDetails,
  otherPartyRole,
  PARTY_ROLES,
  partiesByRole,
  partyFromCompany,
  type PartyDetails,
  type PartyRole,
} from "@/registry/lib/document-parties"
import { usePrintSheet } from "@/registry/lib/print"
import { Button } from "@/registry/ui/button"
import { Field, FieldLabel } from "@/registry/ui/field"

import { PageHeader } from "./PageHeader"
import {
  CONTRACT_TEXT,
  DEMO_COUNTERPARTIES,
  INVALID_PARTY,
} from "./party-details-model"
import { Section } from "./Section"

const usePageT = () =>
  useTranslation("demo", { keyPrefix: "partyDetailsPage" }).t

/** Реквізити сторін (UI45, ADR-0068): договір із двома сторонами, аркуш і стани полів. */
export function PartyDetailsPage() {
  const pagesT = useTranslation("demo", { keyPrefix: "app.pages" }).t
  const t = usePageT()
  return (
    <div className="space-y-6">
      <PageHeader title={pagesT("partyDetails")} lead={t("lead")} />
      <ContractSection />
      <StatesSection />
    </div>
  )
}

interface ContractValues {
  ourRole: PartyRole
  ours: PartyDetails
  theirs: PartyDetails
}

/** Звідки заповнити нашу сторону: профіль компанії, поки вантажиться чи не прийшов — причина. */
function useCompanySource(): PartyDetailsSource {
  const t = usePageT()
  const company = useCompanyProfile()
  return {
    label: t("fillCompany"),
    values: company.data ? partyFromCompany(company.data) : undefined,
    unavailableReason: company.error ? t("companyFailed") : t("companyLoading"),
  }
}

function ContractSection() {
  const t = usePageT()
  const kitT = useErpUiT()
  const party = usePartyDetailsSchema()
  const schema = useMemo(
    () =>
      z.object({ ourRole: z.enum(PARTY_ROLES), ours: party, theirs: party }),
    [party],
  )
  const form = useForm<ContractValues>({
    mode: "onTouched",
    resolver: zodResolver(schema),
    defaultValues: {
      ourRole: "contractor",
      ours: emptyPartyDetails(),
      theirs: emptyPartyDetails(),
    },
  })
  const ourRole = useWatch({ control: form.control, name: "ourRole" })
  const [counterpartyId, setCounterpartyId] = useState<string | null>(null)
  const counterparty = DEMO_COUNTERPARTIES.find((c) => c.id === counterpartyId)
  const companySource = useCompanySource()
  const role = (value: PartyRole) => kitT(`partyDetails.roles.${value}`)
  return (
    <Section title={t("contract.title")} description={t("contract.lead")}>
      <form
        noValidate
        className="grid gap-6"
        onSubmit={(event) =>
          void form.handleSubmit(() => {
            toast.success(t("contract.valid"))
          })(event)
        }
      >
        <PartyRoleField form={form} name="ourRole" />
        <PartyDetailsFields
          form={form}
          name="ours"
          legend={kitT("partyDetails.ours", { role: role(ourRole) })}
          source={companySource}
        />
        <CounterpartyPicker
          value={counterpartyId}
          onChange={setCounterpartyId}
        />
        <PartyDetailsFields
          form={form}
          name="theirs"
          legend={role(otherPartyRole(ourRole))}
          source={{
            label: t("fillCounterparty"),
            values: counterparty?.party,
            unavailableReason: t("pickCounterparty"),
          }}
        />
        <Button type="submit" className="justify-self-start">
          {t("contract.check")}
        </Button>
      </form>
      <ContractPreview form={form} />
    </Section>
  )
}

/** Вибір картки контрагента демо: з неї кнопка заповнює порожні поля другої сторони. */
function CounterpartyPicker({
  value,
  onChange,
}: {
  value: string | null
  onChange: (id: string | null) => void
}) {
  const t = usePageT()
  const id = useId()
  const items = DEMO_COUNTERPARTIES.map((c) => ({
    value: c.id,
    label: c.party.name,
  }))
  return (
    <Field>
      <FieldLabel htmlFor={id}>{t("counterparty")}</FieldLabel>
      <FormSelect
        id={id}
        items={items}
        value={value}
        onValueChange={onChange}
        placeholder={t("counterpartyPlaceholder")}
      />
    </Field>
  )
}

/** Аркуш договору зі значень форми: вступ зі сторонами й реквізити з підписами. */
function ContractPreview({
  form,
}: {
  form: ReturnType<typeof useForm<ContractValues>>
}) {
  const ui = useLanguage()
  const company = useCompanyProfile()
  // Аркуш нижчим пріоритетом: набір у полях не чекає перемальовування аркуша.
  const values = useDeferredValue(
    useWatch({ control: form.control }) as ContractValues,
  )
  const language = company.data?.language ?? ui.language
  return (
    <PrintPreview
      title={CONTRACT_TEXT[toLanguage(language)].title}
      language={language}
    >
      <ContractSheet values={values} />
    </PrintPreview>
  )
}

function ContractSheet({ values }: { values: ContractValues }) {
  const { t, language } = usePrintSheet()
  const text = CONTRACT_TEXT[language]
  const parties = partiesByRole(values.ourRole, values.ours, values.theirs)
  const label = (role: PartyRole) => t(`print.sheet.party.${role}`)
  return (
    <div className="grid gap-[6mm]">
      <h2 className="text-center text-[12pt] font-semibold">{text.title}</h2>
      <p>
        {text.preamble(
          partyClause(parties.customer, label("customer"), t),
          partyClause(parties.contractor, label("contractor"), t),
        )}
      </p>
      <PrintPartyDetails
        parties={PARTY_ROLES.map((role) => ({
          label: label(role),
          party: parties[role],
        }))}
      />
    </div>
  )
}

/** Стани: лише читання, ФОП, помилки біля полів і джерело без даних. */
function StatesSection() {
  const t = usePageT()
  return (
    <Section title={t("states.title")} description={t("states.lead")}>
      <StateExample
        legend={t("states.readOnly")}
        party={DEMO_COUNTERPARTIES[0].party}
        readOnly
      />
      <StateExample
        legend={t("states.fop")}
        party={DEMO_COUNTERPARTIES[1].party}
      />
      <StateExample
        legend={t("states.invalid")}
        party={INVALID_PARTY}
        validate
        source={{
          label: t("fillCompany"),
          unavailableReason: t("companyLoading"),
        }}
      />
    </Section>
  )
}

function StateExample({
  legend,
  party,
  readOnly,
  validate,
  source,
}: {
  legend: string
  party: PartyDetails
  readOnly?: boolean
  validate?: boolean
  source?: PartyDetailsSource
}) {
  const schema = usePartyDetailsSchema()
  const form = useForm<{ party: PartyDetails }>({
    mode: "onTouched",
    resolver: zodResolver(z.object({ party: schema })),
    defaultValues: { party },
  })
  useEffect(() => {
    if (validate) void form.trigger()
  }, [form, validate])
  return (
    <PartyDetailsFields
      form={form}
      name="party"
      legend={legend}
      readOnly={readOnly}
      source={source}
    />
  )
}
