import { useGetList } from "ra-core"
import * as React from "react"
import {
  Controller,
  useWatch,
  type Control,
  type ControllerRenderProps,
  type UseFormReturn,
} from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { FormField, keepFieldFocus } from "@/registry/erp/form"
import { FormSelect } from "@/registry/erp/form-select"
import type {
  RecordFormItem,
  RecordFormItemProps,
} from "@/registry/erp/record-form"
import { RecordFormPage } from "@/registry/erp/record-form-page"
import { useCompanyId } from "@/registry/hooks/use-company"
import { useCompanyProfile } from "@/registry/hooks/use-company-profile"
import { useRecordForm } from "@/registry/hooks/use-record-form"
import { MAX_PER_PAGE } from "@/registry/lib/api"
import { companyScope } from "@/registry/lib/company-scope"
import { todayIn } from "@/registry/lib/dates"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  NUMBERING_COUNTERS,
  NUMBERING_SERIES,
  NUMBERING_TEMPLATE_MAX_LENGTH,
  NUMBERING_TOKENS,
  nextDocumentNumber,
  numberingSeriesSchema,
  numberingTemplateIssue,
  usesBranch,
  type NumberingCounter,
  type NumberingSeries,
  type NumberingToken,
} from "@/registry/lib/numbering"
import { Button } from "@/registry/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"
import { Switch } from "@/registry/ui/switch"

/**
 * Форма однієї серії нумерації (PF03b, ADR-0058), частина `erp/numbering-settings`: шаблон із кнопками
 * міток, «Щороку з 1», «Окремо для кожної філії» і перегляд наступного номера з лічильників сервера.
 * Перевірка шаблону — та сама, що в сервера (`numberingTemplateIssue`); зміна прапорця перевіряє шаблон
 * ще раз, бо від нього залежить, чи потрібен рік чи код філії.
 */
interface SeriesValues {
  template: string
  resetYearly: boolean
  perBranch: boolean
}

const toValues = ({
  template,
  resetYearly,
  perBranch,
}: NumberingSeries): SeriesValues => ({ template, resetYearly, perBranch })

const TOKEN_NAMES: Readonly<
  Record<NumberingToken, "YYYY" | "YY" | "MM" | "BRANCH" | "counter">
> = {
  "{YYYY}": "YYYY",
  "{YY}": "YY",
  "{MM}": "MM",
  "{BRANCH}": "BRANCH",
  "{####}": "counter",
}

export function NumberingSeriesForm({
  series,
  readOnly,
}: {
  series: NumberingSeries
  readOnly: boolean
}) {
  const t = useErpUiT()
  const schema = React.useMemo(
    () =>
      z
        .object({
          template: z.string(),
          resetYearly: z.boolean(),
          perBranch: z.boolean(),
        })
        .superRefine((values, context) => {
          const issue = numberingTemplateIssue(values.template, values)
          if (issue)
            context.addIssue({
              code: "custom",
              path: ["template"],
              message: t(`numbering.issues.${issue}`, {
                max: NUMBERING_TEMPLATE_MAX_LENGTH,
              }),
            })
        }),
    [t],
  )
  const state = useRecordForm<SeriesValues, NumberingSeries>({
    resource: NUMBERING_SERIES,
    record: series,
    followRecord: true,
    schema,
    defaultValues: toValues(series),
    recordSchema: numberingSeriesSchema,
    toPayload: (values, keys) =>
      Object.fromEntries(keys.map((key) => [key, values[key]])),
    toValues,
    onSaved: () => {
      toast.success(t("numbering.saved"))
    },
  })
  const { form } = state
  const items: RecordFormItem[] = [
    {
      id: "template",
      label: t("numbering.template"),
      description: t("numbering.templateHint"),
      wide: true,
      render: (props) => (
        <TemplateField {...props} control={form.control} readOnly={readOnly} />
      ),
    },
    ...(["resetYearly", "perBranch"] as const).map((name) => ({
      id: name,
      label: t(`numbering.${name}`),
      description: t(`numbering.${name}Hint`),
      render: (props: RecordFormItemProps) => (
        <RuleSwitch {...props} form={form} name={name} readOnly={readOnly} />
      ),
    })),
    {
      id: "preview",
      label: t("numbering.preview"),
      description: t("numbering.previewHint"),
      wide: true,
      render: (props) => (
        <NumberingPreview {...props} control={form.control} series={series} />
      ),
    },
  ]
  return <RecordFormPage state={state} items={items} readOnly={readOnly} />
}

/**
 * Мітка на місці курсора чи виділення. Поле пам'ятає їх і без фокуса (кнопка з клавіатури), а нове
 * значення ставить курсор у кінець, тож поле, якого ще не торкались, дописується в кінець.
 */
function insertToken(
  field: ControllerRenderProps<SeriesValues, "template">,
  input: HTMLInputElement | null,
  token: string,
) {
  const value = field.value
  const start = input?.selectionStart ?? value.length
  const end = input?.selectionEnd ?? start
  const next = value.slice(0, start) + token + value.slice(end)
  // Значення й курсор — одразу в полі: React побачить те саме значення й курсора не скине, а кадр
  // пізніше повернув би курсор назад, якщо людина вже друкує далі.
  if (input) {
    input.value = next
    input.setSelectionRange(start + token.length, start + token.length)
  }
  field.onChange(next)
}

function TemplateField({
  control,
  readOnly,
  label,
  description,
  className,
}: RecordFormItemProps & {
  control: Control<SeriesValues>
  readOnly: boolean
}) {
  const t = useErpUiT()
  const input = React.useRef<HTMLInputElement | null>(null)
  return (
    <FormField
      control={control}
      name="template"
      label={label}
      description={description}
      readOnly={readOnly}
      className={className}
      render={({ field, control: aria }) => (
        <div className="grid gap-2">
          <Input
            {...aria}
            ref={(node) => {
              field.ref(node)
              input.current = node
            }}
            name={field.name}
            value={field.value}
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
            onChange={field.onChange}
            onBlur={field.onBlur}
          />
          {readOnly ? null : (
            <div
              role="group"
              aria-label={t("numbering.tokens")}
              className="flex flex-wrap gap-2"
            >
              {NUMBERING_TOKENS.map((token) => (
                <Button
                  key={token}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="font-mono"
                  aria-label={t("numbering.insertToken", {
                    token,
                    name: t(`numbering.tokenNames.${TOKEN_NAMES[token]}`),
                  })}
                  onMouseDown={keepFieldFocus}
                  onClick={() => {
                    insertToken(field, input.current, token)
                  }}
                >
                  {token}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
    />
  )
}

/** Прапорець правила серії: від нього залежить, чи шаблону потрібен рік чи код філії. */
function RuleSwitch({
  form,
  name,
  readOnly,
  label,
  description,
  className,
}: RecordFormItemProps & {
  form: UseFormReturn<SeriesValues>
  name: "resetYearly" | "perBranch"
  readOnly: boolean
}) {
  const id = React.useId()
  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <Field
          orientation="horizontal"
          data-field-name={name}
          className={className}
        >
          <Switch
            id={id}
            inputRef={field.ref}
            checked={field.value}
            disabled={readOnly}
            aria-describedby={description ? `${id}-hint` : undefined}
            onCheckedChange={(checked) => {
              field.onChange(checked)
              const template = form.getFieldState("template")
              if (template.isTouched || form.formState.isSubmitted)
                void form.trigger("template")
            }}
          />
          <div className="grid gap-1">
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            {description ? (
              <FieldDescription id={`${id}-hint`}>
                {description}
              </FieldDescription>
            ) : null}
          </div>
        </Field>
      )}
    />
  )
}

/** Наступний номер для шаблону у формі, зокрема ще не збереженого; філію питає, лише якщо номер її має. */
function NumberingPreview({
  control,
  series,
  label,
  description,
  className,
}: RecordFormItemProps & {
  control: Control<SeriesValues>
  series: NumberingSeries
}) {
  const t = useErpUiT()
  const id = React.useId()
  const companyId = useCompanyId()
  const values = useWatch({ control })
  const profile = useCompanyProfile()
  const [branchId, setBranchId] = React.useState<string | null>(null)
  const counters = useGetList<NumberingCounter>(NUMBERING_COUNTERS, {
    filter: { series: series.id },
    pagination: { page: 1, perPage: MAX_PER_PAGE },
    meta: companyScope(companyId),
  })
  const rules = {
    id: series.id,
    template: values.template ?? series.template,
    resetYearly: values.resetYearly ?? series.resetYearly,
    perBranch: values.perBranch ?? series.perBranch,
  }
  const branches = profile.data?.branches ?? []
  const branch = branches.find((item) => item.id === branchId)
  const number = numberingTemplateIssue(rules.template, rules)
    ? t("numbering.previewInvalid")
    : counters.error
      ? t("numbering.previewFailed")
      : counters.data
        ? nextDocumentNumber(rules, counters.data, {
            date: todayIn(profile.data?.timezone ?? undefined),
            branchId: branch?.id ?? null,
            branchCode: branch?.code,
          })
        : "…"
  return (
    <div className={className}>
      <div className="grid gap-3 rounded-lg border bg-muted/40 p-3 @lg:grid-cols-[minmax(0,1fr)_minmax(0,14rem)] @lg:items-end">
        <div className="grid min-w-0 gap-1">
          <p id={`${id}-label`} className="text-sm text-muted-foreground">
            {label}
          </p>
          <output
            aria-labelledby={`${id}-label`}
            aria-describedby={`${id}-hint`}
            className="font-mono text-lg font-semibold break-all"
          >
            {number}
          </output>
          <p id={`${id}-hint`} className="text-sm text-muted-foreground">
            {description}
          </p>
        </div>
        {usesBranch(rules.template) && branches.length ? (
          <Field>
            <FieldLabel htmlFor={`${id}-branch`}>
              {t("numbering.previewBranch")}
            </FieldLabel>
            <FormSelect<string | null>
              id={`${id}-branch`}
              items={[
                { value: null, label: t("numbering.noBranch") },
                ...branches.map((item) => ({
                  value: item.id,
                  label: item.code ? `${item.name} (${item.code})` : item.name,
                })),
              ]}
              value={branch?.id ?? null}
              onValueChange={setBranchId}
            />
          </Field>
        ) : null}
      </div>
    </div>
  )
}
