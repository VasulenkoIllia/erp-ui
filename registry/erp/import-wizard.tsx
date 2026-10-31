import * as React from "react"
import { DownloadIcon } from "lucide-react"

import { FileDrop } from "@/registry/erp/file-drop"
import { FormSelect } from "@/registry/erp/form-select"
import {
  ImportCheckStep,
  ImportPreviewStep,
  ImportReportStep,
} from "@/registry/erp/import-review"
import {
  useImportWizard,
  type ImportWizardApi,
  type ImportWizardOptions,
} from "@/registry/hooks/use-import-wizard"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  cellText,
  columnSample,
  dataRowCount,
  headerRowChoices,
} from "@/registry/lib/import-rows"
import { IMPORT_MAX_COLUMNS } from "@/registry/lib/imports"
import {
  SPREADSHEET_ACCEPT,
  SPREADSHEET_MAX_BYTES,
} from "@/registry/lib/spreadsheet"
import { Wizard } from "@/registry/templates/wizard"
import { Alert, AlertDescription } from "@/registry/ui/alert"
import { Button } from "@/registry/ui/button"
import { Field, FieldError, FieldLabel } from "@/registry/ui/field"

/**
 * Майстер імпорту (PF07, ADR-0049) на `templates/wizard`: файл → колонки → перевірка → перегляд →
 * звіт. Поля й дії задає `ImportTarget`, контракт сервера — `lib/imports`.
 *
 *   <ImportWizard target={contactsTarget} title={t("import")} onDone={() => navigate(list)} />
 */
export interface ImportWizardProps extends ImportWizardOptions {
  readonly title?: string
  readonly description?: React.ReactNode
  readonly headingRef?: React.Ref<HTMLHeadingElement>
}

export function ImportWizard({
  title,
  description,
  headingRef,
  ...options
}: ImportWizardProps) {
  const t = useErpUiT()
  const api = useImportWizard(options)
  return (
    <Wizard
      wizard={api.wizard}
      title={title}
      description={description}
      headingRef={headingRef}
      finishLabel={t("importWizard.report.finish")}
      dirty={api.dirty}
    >
      <ImportStep api={api} />
    </Wizard>
  )
}

function ImportStep({ api }: { api: ImportWizardApi }) {
  switch (api.wizard.step.id) {
    case "file":
      return <ImportFileStep api={api} />
    case "mapping":
      return <ImportMappingStep api={api} />
    case "check":
      return <ImportCheckStep api={api} />
    case "preview":
      return <ImportPreviewStep api={api} />
    default:
      return <ImportReportStep api={api} />
  }
}

function ImportFileStep({ api }: { api: ImportWizardApi }) {
  const t = useErpUiT()
  const format = useFormat()
  const { state, sheet, headerRow, fileError, maxRows } = api
  const selectId = React.useId()
  const headerId = React.useId()
  const rowCount = sheet ? dataRowCount(sheet.rows, headerRow) : 0
  const status = state.isReading
    ? t("importWizard.file.reading")
    : sheet
      ? t("importWizard.file.rows", {
          count: rowCount,
          formatted: format.number(rowCount),
        })
      : undefined
  const headerItems = headerRowChoices(sheet?.rows ?? []).map(
    ({ index, preview }) => ({
      value: String(index),
      label: t("importWizard.file.headerRowItem", {
        row: format.number(index + 1),
        cells: preview,
      }),
    }),
  )
  const sheetItems = state.sheets.map((item, index) => ({
    value: String(index),
    label: item.name,
  }))
  return (
    <div className="space-y-4">
      <FileDrop
        label={t("importWizard.file.label")}
        hint={t("importWizard.file.hint")}
        accept={SPREADSHEET_ACCEPT}
        maxBytes={SPREADSHEET_MAX_BYTES}
        file={state.file}
        status={status}
        disabled={api.wizard.busy}
        error={
          fileError
            ? t(`importWizard.fileErrors.${fileError}`, {
                max: format.number(
                  fileError === "too_many_columns"
                    ? IMPORT_MAX_COLUMNS
                    : maxRows,
                ),
              })
            : undefined
        }
        onFileChange={api.chooseFile}
      />
      {state.sheets.length > 1 ? (
        <Field>
          <FieldLabel htmlFor={selectId}>
            {t("importWizard.file.sheet")}
          </FieldLabel>
          <FormSelect
            id={selectId}
            items={sheetItems}
            value={String(state.sheetIndex)}
            disabled={api.wizard.busy}
            onValueChange={(value) => {
              api.chooseSheet(Number(value))
            }}
          />
        </Field>
      ) : null}
      {headerItems.length > 1 ? (
        <Field>
          <FieldLabel htmlFor={headerId}>
            {t("importWizard.file.headerRow")}
          </FieldLabel>
          <FormSelect
            id={headerId}
            items={headerItems}
            value={String(headerRow)}
            disabled={api.wizard.busy}
            onValueChange={(value) => {
              api.chooseHeaderRow(Number(value))
            }}
          />
        </Field>
      ) : null}
      <Button type="button" variant="link" onClick={api.downloadTemplate}>
        <DownloadIcon aria-hidden />
        {t("importWizard.file.template")}
      </Button>
    </div>
  )
}

function ImportMappingStep({ api }: { api: ImportWizardApi }) {
  const t = useErpUiT()
  const { state, sheet, headerRow, target, issues } = api
  const duplicatesId = React.useId()
  const rows = sheet?.rows ?? []
  const headers = rows[headerRow] ?? []
  const fieldItems = [
    { value: null, label: t("importWizard.mapping.skip") },
    ...target.fields.map((field) => ({
      value: field.key,
      label: field.required
        ? t("importWizard.mapping.required", { label: field.label })
        : field.label,
    })),
  ]
  const matchLabel = target.fields.find(
    (field) => field.key === target.matchField,
  )?.label
  const missing = state.showMappingIssues ? issues.missing : []
  const nothing = state.showMappingIssues && !Object.keys(state.mapping).length
  return (
    <div className="space-y-4">
      {missing.length || nothing ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {missing.length
              ? t("importWizard.mapping.missing", {
                  fields: missing.map((field) => field.label).join(", "),
                })
              : t("importWizard.mapping.nothing")}
          </AlertDescription>
        </Alert>
      ) : null}
      <ul className="@container divide-y rounded-lg border">
        {headers.map((header, column) => (
          <ImportColumnRow
            key={column}
            name={
              cellText(header) ||
              t("importWizard.mapping.noHeader", { index: column + 1 })
            }
            sample={columnSample(rows, column, headerRow)}
            items={fieldItems}
            value={state.mapping[column] ?? null}
            disabled={api.wizard.busy}
            repeated={
              state.showMappingIssues &&
              issues.repeated.has(state.mapping[column] ?? "")
            }
            onChange={(key) => {
              api.mapColumn(column, key)
            }}
          />
        ))}
      </ul>
      {matchLabel ? (
        <Field>
          <FieldLabel htmlFor={duplicatesId}>
            {t("importWizard.mapping.duplicates", { field: matchLabel })}
          </FieldLabel>
          <FormSelect
            id={duplicatesId}
            items={[
              {
                value: "skip" as const,
                label: t("importWizard.mapping.skipDuplicate"),
              },
              {
                value: "update" as const,
                label: t("importWizard.mapping.updateDuplicate"),
              },
            ]}
            value={state.onDuplicate}
            disabled={api.wizard.busy}
            onValueChange={api.setOnDuplicate}
          />
        </Field>
      ) : null}
    </div>
  )
}

function ImportColumnRow({
  name,
  sample,
  items,
  value,
  disabled,
  repeated,
  onChange,
}: {
  name: string
  sample: string
  items: readonly { value: string | null; label: string }[]
  value: string | null
  disabled: boolean
  repeated: boolean
  onChange: (key: string | null) => void
}) {
  const t = useErpUiT()
  const selectId = React.useId()
  const errorId = React.useId()
  return (
    <li className="grid items-start gap-2 p-3 @lg:grid-cols-2 @lg:gap-4">
      <div className="min-w-0">
        <p className="font-medium break-words">{name}</p>
        {sample ? (
          <p className="truncate text-sm text-muted-foreground">
            {t("importWizard.mapping.sample", { value: sample })}
          </p>
        ) : null}
      </div>
      <Field data-invalid={repeated || undefined}>
        <FieldLabel htmlFor={selectId} className="sr-only">
          {t("importWizard.mapping.field", { name })}
        </FieldLabel>
        <FormSelect
          id={selectId}
          items={items}
          value={value}
          disabled={disabled}
          aria-invalid={repeated || undefined}
          aria-describedby={repeated ? errorId : undefined}
          onValueChange={onChange}
        />
        {repeated ? (
          <FieldError id={errorId}>
            {t("importWizard.mapping.repeated")}
          </FieldError>
        ) : null}
      </Field>
    </li>
  )
}
