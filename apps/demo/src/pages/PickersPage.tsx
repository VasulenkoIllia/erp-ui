import { zodResolver } from "@hookform/resolvers/zod"
import { useQueryClient } from "@tanstack/react-query"
import { useId, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { CopyableValue } from "@/registry/erp/copyable-value"
import { FormField, keepFieldFocus } from "@/registry/erp/form"
import { RecordPicker } from "@/registry/erp/record-picker"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  SCENARIOS,
  scenarioFor,
  setScenario,
  subscribeScenarios,
  type Scenario,
} from "@/registry/lib/mock-scenarios"
import { formatPhone } from "@/registry/lib/phone"
import { Button } from "@/registry/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/registry/ui/select"

import type { Organization } from "@/data/organizations"
import type { UserRecord } from "@/mocks/handlers"

import { MultiSelectSections } from "./multi-select-sections"
import { OrganizationCreateDialog } from "./OrganizationCreateDialog"
import {
  ORGANIZATION_SORT,
  ORGANIZATIONS,
  organizationLabel,
  useOrganizationDescription,
} from "./organization-options"
import { PageHeader } from "./PageHeader"
import { Section } from "./Section"

const usePageT = () => useTranslation("demo", { keyPrefix: "pickersPage" }).t

const USER_SORT = { field: "name", order: "ASC" } as const

/** Сценарії, що міняють список вибору (збереження тут немає — без `conflict`). */
const LIST_SCENARIOS = SCENARIOS.filter((s) => s !== "conflict")

export function PickersPage() {
  const t = usePageT()
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} lead={t("lead")} />
      <ContactSection />
      <FieldStatesSection />
      <ListStatesSection />
      <MultiSelectSections />
      <RequisitesSection />
    </div>
  )
}

function useContactSchema() {
  const kitT = useErpUiT()
  const t = usePageT()
  return useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, kitT("validation.required")),
        organizationId: z
          .string()
          .nullable()
          .refine((id) => id !== null, t("contact.organizationRequired")),
        ownerId: z.string().nullable(),
      }),
    [kitT, t],
  )
}

/** Контакт і його компанія: пошук на сервері, «Створити нову…» з діалогом. */
function ContactSection() {
  const t = usePageT()
  const describe = useOrganizationDescription()
  const picker = useRef<HTMLButtonElement>(null)
  const [creating, setCreating] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const form = useForm({
    mode: "onTouched",
    resolver: zodResolver(useContactSchema()),
    defaultValues: {
      name: "",
      organizationId: null as string | null,
      ownerId: null as string | null,
    },
  })
  const submit = form.handleSubmit(({ name }) => {
    setSaved(
      t("contact.saved", { name, organization: organization?.name ?? "" }),
    )
  })
  return (
    <Section title={t("contact.title")} description={t("contact.lead")}>
      <form
        noValidate
        onSubmit={(event) => void submit(event)}
        className="@container max-w-2xl space-y-4"
      >
        <FieldGroup className="grid gap-4 @xl:grid-cols-2">
          <FormField
            control={form.control}
            name="name"
            label={t("contact.name")}
            render={({ field, control }) => <Input {...field} {...control} />}
          />
          <FormField
            control={form.control}
            name="organizationId"
            label={t("contact.organization")}
            render={({ field, control }) => (
              <RecordPicker<Organization>
                {...control}
                // Один ref на два призначення: фокус на полі з помилкою й після діалогу створення.
                ref={(node) => {
                  picker.current = node
                  field.ref(node)
                }}
                resource={ORGANIZATIONS}
                label={t("contact.organization")}
                value={field.value}
                onValueChange={(id, record) => {
                  setOrganization(record)
                  field.onChange(id)
                }}
                onBlur={field.onBlur}
                optionLabel={organizationLabel}
                sort={ORGANIZATION_SORT}
                optionDescription={describe}
                required
                create={{
                  onCreate: setCreating,
                  deniedReason: t("contact.createDenied"),
                }}
              />
            )}
          />
          <FormField
            control={form.control}
            name="ownerId"
            label={t("contact.owner")}
            description={t("contact.ownerHint")}
            render={({ field, control }) => (
              <RecordPicker<UserRecord>
                {...control}
                ref={field.ref}
                resource="users"
                label={t("contact.owner")}
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                optionLabel={(user) => user.name}
                sort={USER_SORT}
                optionDescription={(user) => user.email}
                clearable
              />
            )}
          />
        </FieldGroup>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" onMouseDown={keepFieldFocus}>
            {t("contact.submit")}
          </Button>
          <p role="status" className="text-sm text-muted-foreground">
            {saved}
          </p>
        </div>
      </form>
      <OrganizationCreateDialog
        name={creating}
        finalFocus={picker}
        onOpenChange={(open) => {
          if (!open) setCreating(null)
        }}
        onCreated={(created) => {
          setCreating(null)
          setOrganization(created)
          form.setValue("organizationId", String(created.id), {
            shouldValidate: true,
            shouldDirty: true,
          })
        }}
      />
    </Section>
  )
}

/** Поле демо з підписом і підказкою; значення живе в самому полі. */
function PickerExample({
  label,
  hint,
  initial = null,
  error,
  readOnly,
  disabled,
}: {
  label: string
  hint?: string
  initial?: string | null
  error?: string
  readOnly?: boolean
  disabled?: boolean
}) {
  const id = useId()
  const describe = useOrganizationDescription()
  const [value, setValue] = useState(initial)
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <RecordPicker<Organization>
        id={id}
        resource={ORGANIZATIONS}
        label={label}
        value={value}
        onValueChange={setValue}
        optionLabel={organizationLabel}
        sort={ORGANIZATION_SORT}
        optionDescription={describe}
        readOnly={readOnly}
        disabled={disabled}
        clearable
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-msg`}
      />
      {error ? (
        <FieldError id={`${id}-msg`}>{error}</FieldError>
      ) : (
        <FieldDescription id={`${id}-msg`}>{hint}</FieldDescription>
      )}
    </Field>
  )
}

function FieldStatesSection() {
  const t = usePageT()
  return (
    <Section title={t("states.title")} description={t("states.lead")}>
      <div className="@container">
        <div className="grid gap-4 @2xl:grid-cols-2">
          <PickerExample
            label={t("states.empty")}
            hint={t("states.emptyHint")}
          />
          <PickerExample
            label={t("states.filled")}
            hint={t("states.filledHint")}
            initial="org-001"
          />
          <PickerExample
            label={t("states.invalid")}
            error={t("contact.organizationRequired")}
          />
          <PickerExample
            label={t("states.readOnly")}
            hint={t("states.readOnlyHint")}
            initial="org-002"
            readOnly
          />
          <PickerExample
            label={t("states.disabled")}
            hint={t("states.disabledHint")}
            initial="org-003"
            disabled
          />
          <PickerExample
            label={t("states.missing")}
            hint={t("states.missingHint")}
            initial="org-999"
          />
        </div>
      </div>
    </Section>
  )
}

/** Сценарій моків лише для організацій: стани списку вибору без панелі розробника. */
function ListStatesSection() {
  const t = usePageT()
  const id = useId()
  const queryClient = useQueryClient()
  const scenario = useSyncExternalStore(subscribeScenarios, () =>
    scenarioFor(ORGANIZATIONS),
  )
  const items = LIST_SCENARIOS.map((value) => ({
    value,
    label: t(`list.scenarios.${value}`),
  }))
  return (
    <Section title={t("list.title")} description={t("list.lead")}>
      <div className="@container">
        <div className="grid gap-4 @2xl:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={id}>{t("list.scenario")}</FieldLabel>
            <Select
              items={items}
              value={scenario}
              onValueChange={(value: Scenario | null) => {
                if (!value) return
                setScenario(value, ORGANIZATIONS)
                void queryClient.resetQueries({ queryKey: [ORGANIZATIONS] })
              }}
            >
              <SelectTrigger id={id} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <PickerExample label={t("list.picker")} hint={t("list.pickerHint")} />
        </div>
      </div>
    </Section>
  )
}

/** Реквізити організації в картці (UI43): показ для людини, копія — як зберігається. */
function RequisitesSection() {
  const t = usePageT()
  const rows = [
    { label: t("requisites.code"), value: "41234005", kind: "code" },
    { label: t("requisites.rnokpp"), value: "3012345673", kind: "code" },
    {
      label: "IBAN",
      value: "UA213223130000026007233566001",
      kind: "iban",
    },
    {
      label: t("requisites.phone"),
      value: "+380671204310",
      kind: "phone",
      display: formatPhone("+380671204310"),
    },
    { label: "Email", value: "office@dnipro-treid.example", kind: "email" },
    {
      label: t("requisites.site"),
      value: "https://dnipro-treid.example/rekvizyty-dlia-oplaty",
      kind: "url",
    },
    { label: t("requisites.fax"), value: "", kind: "text" },
  ] as const
  return (
    <Section title={t("requisites.title")} description={t("requisites.lead")}>
      <div className="@container">
        <dl className="grid gap-x-6 gap-y-3 @xl:grid-cols-[max-content_1fr]">
          {rows.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-sm text-muted-foreground @xl:pt-1">
                {row.label}
              </dt>
              <dd className="-mt-2 @xl:mt-0">
                <CopyableValue
                  label={row.label}
                  value={row.value}
                  kind={row.kind}
                  display={"display" in row ? row.display : undefined}
                />
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  )
}
