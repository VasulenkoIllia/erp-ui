import * as React from "react"
import {
  Controller,
  type Control,
  type ControllerRenderProps,
  type UseFormReturn,
} from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { FormField, keepFieldFocus } from "@/registry/erp/form"
import {
  NumberingPreview,
  useNumberingIssueText,
} from "@/registry/erp/numbering-preview"
import type {
  RecordFormItem,
  RecordFormItemProps,
} from "@/registry/erp/record-form"
import { RecordFormPage } from "@/registry/erp/record-form-page"
import { useRecordForm } from "@/registry/hooks/use-record-form"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  NUMBERING_SERIES,
  NUMBERING_TEMPLATE_ISSUES,
  NUMBERING_TOKENS,
  numberingSeriesSchema,
  numberingTemplateIssue,
  type NumberingSeries,
  type NumberingTemplateIssue,
  type NumberingToken,
} from "@/registry/lib/numbering"
import { Button } from "@/registry/ui/button"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"
import { Switch } from "@/registry/ui/switch"

/**
 * Форма однієї серії нумерації (PF03b, ADR-0058), частина `erp/numbering-settings`: шаблон із кнопками
 * міток, «Щороку з 1», «Окремо для кожної філії» і перегляд наступного номера (`erp/numbering-preview`).
 * Перевірка шаблону — та сама, що в сервера (`numberingTemplateIssue`), і код 422 сервера звучить тим
 * самим текстом; зміна прапорця перевіряє шаблон ще раз, бо від нього залежить, чи потрібен рік чи код
 * філії.
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

const isTemplateIssue = (code: string): code is NumberingTemplateIssue =>
  (NUMBERING_TEMPLATE_ISSUES as readonly string[]).includes(code)

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
  const issueText = useNumberingIssueText()
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
              message: issueText(issue),
            })
        }),
    [issueText],
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
    serverErrorText: (field, code) =>
      field === "template" && isTemplateIssue(code)
        ? issueText(code)
        : undefined,
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
  // Текст і курсор — з того самого поля: під час набору з IME значення форми може відставати.
  const value = input?.value ?? field.value
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
              // Прапорець міг зробити шаблон хибним: помилка одразу біля поля, а не лише в перегляді.
              void form.trigger("template")
            }}
          />
          <FieldContent>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            {description ? (
              <FieldDescription id={`${id}-hint`}>
                {description}
              </FieldDescription>
            ) : null}
          </FieldContent>
        </Field>
      )}
    />
  )
}
