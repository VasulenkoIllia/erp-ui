import { zodResolver } from "@hookform/resolvers/zod"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"

import { useErpAuthProvider } from "@/registry/erp/auth-layout"
import { FormField } from "@/registry/erp/form"
import { PhoneInput } from "@/registry/erp/phone-input"
import { Stepper, type StepperStep } from "@/registry/erp/stepper"
import { useCompanyId } from "@/registry/hooks/use-company"
import { useWizard, type WizardStep } from "@/registry/hooks/use-wizard"
import { COMPANY_QUERY_KEYS } from "@/registry/lib/company"
import { useErpUiT } from "@/registry/lib/i18n"
import { validatePhone } from "@/registry/lib/phone"
import {
  clearWizardProgress,
  loadWizardProgress,
  saveWizardProgress,
} from "@/registry/lib/wizard-progress"
import { Wizard, WizardReview } from "@/registry/templates/wizard"
import { Field, FieldDescription, FieldLabel } from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"
import { Switch } from "@/registry/ui/switch"

import { PageHeader } from "./PageHeader"
import { Section } from "./Section"

/** Майстер UI06 (ADR-0043): стани степера й справжній сценарій «Нова філія» на моках. */
export function WizardPage() {
  const { t } = useTranslation()
  const companyId = useCompanyId()
  const [run, setRun] = useState(0)
  const branchArea = useRef<HTMLDivElement>(null)
  // Майстер почався спочатку: фокус не лишається на кнопці, якої вже немає.
  useEffect(() => {
    if (run > 0) branchArea.current?.querySelector("input")?.focus()
  }, [run])
  const sample = useMemo<StepperStep[]>(
    () => [
      { id: "company", label: t("wizardPage.sample.company") },
      { id: "logo", label: t("wizardPage.sample.logo") },
      { id: "team", label: t("wizardPage.sample.team"), optional: true },
      { id: "done", label: t("wizardPage.sample.done") },
    ],
    [t],
  )
  return (
    <div className="space-y-6">
      <PageHeader title={t("app.pages.wizard")} lead={t("wizardPage.lead")} />
      <Section
        title={t("wizardPage.stepperTitle")}
        description={t("wizardPage.stepperDescription")}
      >
        <h3 className="font-medium">{t("wizardPage.stepperWide")}</h3>
        <Stepper steps={sample} currentId="logo" />
        <h3 className="font-medium">{t("wizardPage.stepperStates")}</h3>
        <Stepper
          steps={sample.map((step) =>
            step.id === "company" ? { ...step, invalid: true } : step,
          )}
          currentId="team"
          reachedIndex={3}
        />
        <h3 className="font-medium">{t("wizardPage.stepperNarrow")}</h3>
        <div className="max-w-xs rounded-lg border p-3">
          <Stepper steps={sample} currentId="logo" />
        </div>
      </Section>
      <Section
        title={t("wizardPage.wizardTitle")}
        description={t("wizardPage.wizardDescription")}
      >
        <div ref={branchArea}>
          <BranchWizard
            key={`${companyId ?? "none"}:${String(run)}`}
            onCreated={() => {
              setRun((current) => current + 1)
            }}
          />
        </div>
      </Section>
    </div>
  )
}

interface BranchValues {
  name: string
  code: string
  address: string
  phone: string
}

const EMPTY: BranchValues = { name: "", code: "", address: "", phone: "" }

/** Чернетка з браузера могла лишитись від іншої версії форми: чужу форму не беремо. */
const draftSchema = z.object({
  name: z.string(),
  code: z.string(),
  address: z.string(),
  phone: z.string(),
})

function loadDraft(key: string) {
  const progress = loadWizardProgress<BranchValues>(key)
  return progress && draftSchema.safeParse(progress.draft).success
    ? progress
    : null
}

function BranchWizard({ onCreated }: { onCreated: () => void }) {
  const { t } = useTranslation()
  const kitT = useErpUiT()
  const provider = useErpAuthProvider()
  const queryClient = useQueryClient()
  const companyId = useCompanyId()
  const key = `demo-branch:${companyId ?? "none"}`
  const [saved] = useState(() => loadDraft(key))
  const [failNext, setFailNext] = useState(false)
  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, kitT("validation.required")),
        code: z.string().trim(),
        address: z.string().trim(),
        phone: z.string().superRefine((value, ctx) => {
          const issue = value ? validatePhone(value) : null
          if (issue)
            ctx.addIssue({
              code: "custom",
              message: kitT(`validation.phone.${issue}`),
            })
        }),
      }),
    [kitT],
  )
  const form = useForm<BranchValues>({
    mode: "onTouched",
    resolver: zodResolver(schema),
    defaultValues: saved?.draft ?? EMPTY,
  })
  const steps: WizardStep[] = [
    {
      id: "main",
      label: t("wizardPage.steps.main"),
      description: t("wizardPage.steps.mainDescription"),
      onNext: () => form.trigger(["name", "code"], { shouldFocus: true }),
    },
    {
      id: "contacts",
      label: t("wizardPage.steps.contacts"),
      description: t("wizardPage.steps.contactsDescription"),
      optional: true,
      onNext: () => form.trigger(["phone"], { shouldFocus: true }),
      // Пропущений крок не несе введене далі, зокрема телефон із помилкою.
      onSkip: () => {
        form.setValue("address", "")
        form.setValue("phone", "")
        form.clearErrors("phone")
      },
    },
    {
      id: "review",
      label: t("wizardPage.steps.review"),
      description: t("wizardPage.steps.reviewDescription"),
    },
  ]
  const wizard = useWizard({
    steps,
    initial: saved ?? undefined,
    onProgress: (progress) => {
      saveWizardProgress(key, { ...progress, draft: form.getValues() })
    },
    onFinish: async () => {
      if (failNext) {
        setFailNext(false)
        throw new Error("Simulated failure")
      }
      const { name, code, address, phone } = form.getValues()
      await provider.company.createBranch({ name, code, address, phone })
      await queryClient.invalidateQueries({
        queryKey: COMPANY_QUERY_KEYS.profile,
      })
      clearWizardProgress(key)
      toast.success(t("wizardPage.created", { name }))
      onCreated()
    },
  })
  const values = form.getValues()
  return (
    <div className="space-y-6">
      <Wizard
        wizard={wizard}
        finishLabel={t("wizardPage.finish")}
        className="mx-0 max-w-none"
      >
        {wizard.step.id === "main" ? (
          <div className="grid gap-4 @lg:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              label={t("wizardPage.fields.name")}
              render={({ field, control }) => (
                <Input {...field} {...control} autoComplete="off" />
              )}
            />
            <FormField
              control={form.control}
              name="code"
              label={t("wizardPage.fields.code")}
              render={({ field, control }) => (
                <Input {...field} {...control} autoComplete="off" />
              )}
            />
          </div>
        ) : wizard.step.id === "contacts" ? (
          <div className="grid gap-4 @lg:grid-cols-2">
            <FormField
              control={form.control}
              name="address"
              label={t("wizardPage.fields.address")}
              render={({ field, control }) => (
                <Input {...field} {...control} autoComplete="off" />
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              label={t("wizardPage.fields.phone")}
              render={({ field, control }) => (
                <PhoneInput
                  id={control.id}
                  value={field.value}
                  aria-invalid={control["aria-invalid"]}
                  aria-describedby={control["aria-describedby"]}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            />
          </div>
        ) : (
          <WizardReview
            onEdit={wizard.goTo}
            sections={[
              {
                stepId: "main",
                title: t("wizardPage.steps.main"),
                items: [
                  { label: t("wizardPage.fields.name"), value: values.name },
                  { label: t("wizardPage.fields.code"), value: values.code },
                ],
              },
              {
                stepId: "contacts",
                title: t("wizardPage.steps.contacts"),
                items: [
                  {
                    label: t("wizardPage.fields.address"),
                    value: values.address,
                  },
                  { label: t("wizardPage.fields.phone"), value: values.phone },
                ],
              },
            ]}
          />
        )}
      </Wizard>
      <Field orientation="horizontal">
        <Switch
          id="wizard-fail"
          checked={failNext}
          aria-describedby="wizard-fail-hint"
          onCheckedChange={setFailNext}
        />
        <div className="space-y-1">
          <FieldLabel htmlFor="wizard-fail">
            {t("wizardPage.failToggle")}
          </FieldLabel>
          <FieldDescription id="wizard-fail-hint">
            {t("wizardPage.failHint")}
          </FieldDescription>
        </div>
      </Field>
    </div>
  )
}
