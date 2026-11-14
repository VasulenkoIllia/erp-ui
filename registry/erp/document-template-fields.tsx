import * as React from "react"

import {
  templateTagText,
  usedTemplateKeys,
  type TemplateIssue,
  type TemplateTag,
  type TemplateVariable,
  type TemplateVariables,
} from "@/registry/lib/document-template"
import { useErpUiT, type ErpUiTranslate } from "@/registry/lib/i18n"
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"
import { Textarea } from "@/registry/ui/textarea"

/**
 * Мітки шаблону у формі генератора (UI44, ADR-0087): помилки біля мітки першими, далі значення, які
 * шаблон бере, групами (документ, сторони, інші поля) зі значенням документа в полі, цикл рядків — числом
 * рядків. Мітка — під підписом поля, як її записано в шаблоні. `DocumentTemplateReference` — усі мітки,
 * які можна вставити в шаблон. Частина лінивого чанка `erp/document-generator-panel`.
 */
export interface DocumentTemplateFieldsProps {
  readonly variables: TemplateVariables
  readonly tags: readonly TemplateTag[]
  readonly issues: readonly TemplateIssue[]
  readonly values: Readonly<Record<string, string>>
  readonly onValueChange: (key: string, value: string) => void
}

const SYNTAX_CODES = [
  "unclosed_tag",
  "unopened_tag",
  "duplicate_open_tag",
  "duplicate_close_tag",
  "unclosed_loop",
  "unopened_loop",
  "closing_tag_does_not_match_opening_tag",
] as const
type SyntaxCode = (typeof SYNTAX_CODES)[number]
const isSyntaxCode = (code: string): code is SyntaxCode =>
  (SYNTAX_CODES as readonly string[]).includes(code)

/** Текст помилки біля мітки; невідомий код розбору — загальний текст. */
export function templateIssueText(
  issue: TemplateIssue,
  t: ErpUiTranslate,
): string {
  if (issue.code === "unknown")
    return t(
      issue.loop
        ? "documentGenerator.issue.unknownInLoop"
        : "documentGenerator.issue.unknown",
    )
  if (issue.code === "raw" || issue.syntax.startsWith("raw_"))
    return t("documentGenerator.issue.raw")
  return isSyntaxCode(issue.syntax)
    ? t(`documentGenerator.issue.${issue.syntax}`)
    : t("documentGenerator.issue.other")
}

export function TemplateIssueList({
  issues,
}: {
  issues: readonly TemplateIssue[]
}) {
  const t = useErpUiT()
  return (
    <FieldSet data-slot="document-template-issues">
      <FieldLegend variant="label">
        {t("documentGenerator.issuesTitle")}
      </FieldLegend>
      <ul className="grid gap-3">
        {issues.map((issue) => (
          <li
            key={`${issue.code}:${issue.tag}:${"loop" in issue ? (issue.loop ?? "") : ""}`}
            className="grid gap-1"
          >
            <code className="w-fit rounded-sm bg-muted px-1.5 py-0.5 font-mono text-sm">
              {templateTagText(issue.tag)}
            </code>
            <p className="text-sm text-destructive-foreground">
              {templateIssueText(issue, t)}
            </p>
          </li>
        ))}
      </ul>
    </FieldSet>
  )
}

function VariableField({
  variable,
  value,
  onValueChange,
}: {
  variable: TemplateVariable
  value: string
  onValueChange: (key: string, value: string) => void
}) {
  const id = React.useId()
  const hint = `${id}-tag`
  const change = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    onValueChange(variable.key, event.target.value)
  }
  return (
    <Field>
      <FieldLabel htmlFor={id}>{variable.label}</FieldLabel>
      {variable.isMultiline ? (
        <Textarea
          id={id}
          value={value}
          rows={2}
          aria-describedby={hint}
          onChange={change}
        />
      ) : (
        <Input
          id={id}
          value={value}
          aria-describedby={hint}
          onChange={change}
        />
      )}
      <FieldDescription id={hint} className="font-mono">
        {templateTagText(variable.key)}
      </FieldDescription>
    </Field>
  )
}

export function DocumentTemplateFields({
  variables,
  tags,
  issues,
  values,
  onValueChange,
}: DocumentTemplateFieldsProps) {
  const t = useErpUiT()
  const used = React.useMemo(
    () => usedTemplateKeys(tags, variables),
    [tags, variables],
  )
  const groups = variables.groups
    .map((group) => ({
      ...group,
      variables: group.variables.filter((item) => used.values.has(item.key)),
    }))
    .filter((group) => group.variables.length > 0)
  const loops = variables.loops.filter((loop) => used.loops.has(loop.key))
  return (
    <div className="grid gap-6" data-slot="document-template-fields">
      {issues.length > 0 ? <TemplateIssueList issues={issues} /> : null}
      {tags.length === 0 && issues.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("documentGenerator.noTags")}
        </p>
      ) : null}
      {groups.map((group) => (
        <FieldSet key={group.id}>
          <FieldLegend>{group.label}</FieldLegend>
          <div className="grid gap-4 @lg/generator-form:grid-cols-2">
            {group.variables.map((variable) => (
              <VariableField
                key={variable.key}
                variable={variable}
                value={values[variable.key] ?? variable.value}
                onValueChange={onValueChange}
              />
            ))}
          </div>
        </FieldSet>
      ))}
      {loops.map((loop) => (
        <div key={loop.key} className="grid gap-1">
          <p className="font-medium">{loop.label}</p>
          <p className="text-sm text-muted-foreground">
            <code className="font-mono">{templateTagText(loop.key, "#")}</code>{" "}
            {t("documentGenerator.loop", { count: loop.rows.length })}
          </p>
        </div>
      ))}
    </div>
  )
}

/** Усі мітки, які можна вставити в шаблон, з підписами: розгортається на вимогу. */
export function DocumentTemplateReference({
  variables,
}: {
  variables: TemplateVariables
}) {
  const t = useErpUiT()
  const sections = [
    ...variables.groups.map((group) => ({
      id: group.id,
      label: group.label,
      rows: group.variables.map((item) => [item.key, item.label] as const),
    })),
    ...variables.loops.map((loop) => ({
      id: loop.key,
      label: loop.label,
      rows: [
        [`#${loop.key}`, loop.label] as const,
        ...loop.columns.map((column) => [column.key, column.label] as const),
        [`/${loop.key}`, loop.label] as const,
      ],
    })),
  ]
  return (
    <details
      className="group rounded-lg border p-3 text-sm"
      data-slot="document-template-reference"
    >
      <summary className="cursor-pointer font-medium">
        {t("documentGenerator.reference")}
      </summary>
      <p className="mt-2 text-muted-foreground">
        {t("documentGenerator.referenceHint")}
      </p>
      {sections.map((section) => (
        <section key={section.id} className="mt-3">
          <h4 className="font-medium">{section.label}</h4>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {section.rows.map(([key, label]) => (
              <React.Fragment key={key}>
                <dt className="font-mono">{templateTagText(key)}</dt>
                <dd className="text-muted-foreground">{label}</dd>
              </React.Fragment>
            ))}
          </dl>
        </section>
      ))}
    </details>
  )
}
