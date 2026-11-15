import * as React from "react"

import type {
  DocumentGeneratorProps,
  DocumentTemplateOption,
} from "@/registry/erp/document-generator"
import {
  documentIssues,
  FILE_CHOICE,
  templateStatus,
  usePreviewFile,
  useTemplateOverrides,
  useTemplateSource,
  type TemplateFile,
} from "@/registry/erp/document-generator-source"
import {
  DocumentTemplateFields,
  DocumentTemplateReference,
} from "@/registry/erp/document-template-fields"
import { documentTemplateVariables } from "@/registry/erp/document-template-variables"
import { DocxPreview, type DocxPreviewState } from "@/registry/erp/docx-preview"
import { FileDrop } from "@/registry/erp/file-drop"
import { useCompanyProfile } from "@/registry/hooks/use-company-profile"
import { localizedText } from "@/registry/lib/localized-text"
import { templateData } from "@/registry/lib/document-template"
import { DOCX_MAX_BYTES, DOCX_MIME } from "@/registry/lib/docx-template"
import { useErpUiT, useLanguage } from "@/registry/lib/i18n"
import { printFileName, usePrintLanguage } from "@/registry/lib/print"
import { Button } from "@/registry/ui/button"
import { FieldLabel } from "@/registry/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/registry/ui/select"

/**
 * Панель генератора документа з шаблону (UI44, ADR-0087), лінивий чанк `erp/document-generator`: вибір
 * шаблону, мітки зі значеннями документа, перегляд самого файла й завантаження. Стан — у
 * `erp/document-generator-source`.
 *
 * - Помилка в шаблоні (невідома мітка, запис мітки), дані документа ще не готові (`unavailableReason`) чи
 *   шаблон не заповнився — «Завантажити» неактивна з причиною.
 * - «Спробувати ще» лишається на місці, поки шаблон читається знову: фокус не губиться.
 * - Шаблони проекту прийшли після відкриття — береться перший (чи `initialTemplateId`), поки людина сама
 *   нічого не вибрала.
 */
const DOCX_ACCEPT = `.docx,${DOCX_MIME}`
/** Скільки жити адресі файла після «Завантажити»: браузер може почати збереження не одразу. */
const DOWNLOAD_URL_TTL_MS = 40_000
/** Керівні символи й перевизначення напрямку тексту в назві свого файла: назва не підмінить розширення. */
const UNSAFE_NAME = /[\p{Cc}‪-‮⁦-⁩]/gu

function defaultChoice(
  templates: readonly DocumentTemplateOption[],
  initialTemplateId: string | undefined,
) {
  if (templates.some((item) => item.id === initialTemplateId))
    return initialTemplateId ?? FILE_CHOICE
  return templates[0]?.id ?? FILE_CHOICE
}

function TemplateChoice({
  templates,
  choice,
  onChoice,
}: {
  templates: readonly DocumentTemplateOption[]
  choice: string
  onChoice: (choice: string) => void
}) {
  const t = useErpUiT()
  const { language } = useLanguage()
  const labelId = React.useId()
  const items = [
    ...templates.map((item) => ({
      value: item.id,
      label: localizedText(item.label, language) ?? item.id,
    })),
    { value: FILE_CHOICE, label: t("documentGenerator.ownFile") },
  ]
  return (
    <div className="grid gap-2">
      <FieldLabel id={labelId}>{t("documentGenerator.template")}</FieldLabel>
      <Select
        items={items}
        value={choice}
        onValueChange={(next) => {
          if (typeof next === "string") onChoice(next)
        }}
      >
        <SelectTrigger aria-labelledby={labelId} className="w-full">
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
    </div>
  )
}

/** Перегляд аркуша й «Завантажити .docx» з причиною, чому кнопка неактивна. */
function GeneratorPreview({
  file,
  name,
  blockedReason,
  onDownload,
}: {
  file: Blob | null
  name: string
  blockedReason: string | null
  onDownload: () => void
}) {
  const t = useErpUiT()
  const [state, setState] = React.useState<DocxPreviewState>("idle")
  const reasonId = React.useId()
  const isFailed = state === "failed"
  return (
    // Дві колонки: перегляд лишається на екрані, поки людина править нижні поля форми.
    <div className="grid content-start gap-3 @4xl/generator:sticky @4xl/generator:top-[var(--app-topbar-height,0px)] @4xl/generator:self-start">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium">{t("documentGenerator.preview")}</h3>
        <p className="text-sm text-muted-foreground" aria-hidden>
          {state === "rendering" ? t("documentGenerator.previewUpdating") : ""}
        </p>
      </div>
      <p role="status" className="sr-only">
        {isFailed ? t("documentGenerator.previewFailed") : ""}
      </p>
      <div
        className="relative aspect-[210/297] max-h-[min(70dvh,52rem)] w-full overflow-hidden rounded-lg bg-muted" // erp-ui: allow-raw-value — аркуш A4 не вищий за екран
      >
        <DocxPreview
          file={file}
          title={
            name
              ? t("documentGenerator.previewTitle", { name })
              : t("documentGenerator.preview")
          }
          onStateChange={setState}
        />
        {file === null || isFailed ? (
          <p
            aria-hidden={isFailed}
            className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted-foreground"
          >
            {isFailed
              ? t("documentGenerator.previewFailed")
              : t("documentGenerator.previewEmpty")}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button
          disabled={blockedReason !== null}
          focusableWhenDisabled
          aria-describedby={blockedReason ? reasonId : undefined}
          onClick={onDownload}
        >
          {t("documentGenerator.download")}
        </Button>
        <p id={reasonId} className="text-sm text-muted-foreground">
          {blockedReason ?? ""}
        </p>
      </div>
    </div>
  )
}

export function DocumentGeneratorPanel({
  document,
  templates = [],
  fileName,
  language,
  initialTemplateId,
  unavailableReason,
}: DocumentGeneratorProps) {
  const t = useErpUiT()
  const ui = useLanguage()
  const company = useCompanyProfile()
  const sheet = usePrintLanguage(language ?? company.data?.language)
  const [chosen, setChosen] = React.useState<string | null>(null)
  const choice =
    chosen === FILE_CHOICE || templates.some((item) => item.id === chosen)
      ? (chosen ?? FILE_CHOICE)
      : defaultChoice(templates, initialTemplateId)
  const [file, setFile] = React.useState<TemplateFile | null>(null)
  const revisions = React.useRef(0)
  const [retryOf, setRetryOf] = React.useState<string | null>(null)
  const source = useTemplateSource(templates, choice, file)
  const result = source.data
  const template = result?.ok ? result.template : null

  const variables = React.useMemo(
    () =>
      documentTemplateVariables(document, {
        sheet,
        ui: { t, language: ui.language },
      }),
    [document, sheet, t, ui.language],
  )
  const [overrides, setOverride] = useTemplateOverrides(variables)
  const issues = React.useMemo(
    () => documentIssues(result, variables),
    [result, variables],
  )
  const dataKey = React.useMemo(
    () => JSON.stringify(templateData(variables, overrides)),
    [variables, overrides],
  )
  const { previewFile, current } = usePreviewFile(template, dataKey)
  const status = templateStatus(source, issues, t)
  const isRetrying = retryOf === choice && source.isFetching
  const templateName = (
    choice === FILE_CHOICE
      ? (file?.file.name.replace(/\.docx$/i, "") ?? "")
      : (localizedText(
          templates.find((item) => item.id === choice)?.label,
          ui.language,
        ) ?? "")
  ).replace(UNSAFE_NAME, "")
  const blockedReason = !template
    ? t("documentGenerator.downloadNoTemplate")
    : issues.length > 0
      ? t("documentGenerator.downloadBlocked")
      : (unavailableReason ??
        (previewFile === null ? t("documentGenerator.fillFailed") : null))
  const fieldsId = React.useId()

  const download = () => {
    const filled = blockedReason ? null : current()?.file
    if (!filled) return
    const url = URL.createObjectURL(filled)
    const link = window.document.createElement("a")
    link.href = url
    link.download = `${printFileName(`${fileName} ${templateName}`)}.docx`
    link.click()
    setTimeout(() => {
      URL.revokeObjectURL(url)
    }, DOWNLOAD_URL_TTL_MS)
  }

  return (
    <div data-slot="document-generator" className="@container/generator">
      <div className="grid gap-6 @4xl/generator:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="@container/generator-form grid content-start gap-6">
          <TemplateChoice
            templates={templates}
            choice={choice}
            onChoice={setChosen}
          />
          {choice === FILE_CHOICE ? (
            <FileDrop
              label={t("documentGenerator.fileLabel")}
              hint={t("documentGenerator.fileHint")}
              accept={DOCX_ACCEPT}
              maxBytes={DOCX_MAX_BYTES}
              file={file?.file ?? null}
              onFileChange={(next) => {
                revisions.current += 1
                setFile(
                  next ? { file: next, revision: revisions.current } : null,
                )
              }}
            />
          ) : null}
          <div className="grid gap-2">
            <p
              role="status"
              className={
                status.isError
                  ? "text-sm text-destructive-foreground"
                  : "text-sm text-muted-foreground"
              }
            >
              {status.text || (template ? "" : t("documentGenerator.choose"))}
            </p>
            {status.canRetry || isRetrying ? (
              <Button
                variant="outline"
                size="sm"
                className="w-fit"
                disabled={isRetrying}
                focusableWhenDisabled
                onClick={() => {
                  setRetryOf(choice)
                  void source.refetch()
                }}
              >
                {t("documentGenerator.retry")}
              </Button>
            ) : null}
          </div>
          {template || issues.length > 0 ? (
            <section className="grid gap-3" aria-labelledby={fieldsId}>
              <h3 id={fieldsId} className="font-medium">
                {t("documentGenerator.fields")}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t("documentGenerator.fieldsHint")}
              </p>
              <DocumentTemplateFields
                variables={variables}
                tags={template?.tags ?? []}
                issues={issues}
                values={overrides}
                onValueChange={setOverride}
              />
            </section>
          ) : null}
          <DocumentTemplateReference variables={variables} />
        </div>
        <GeneratorPreview
          file={previewFile}
          name={templateName}
          blockedReason={blockedReason}
          onDownload={download}
        />
      </div>
    </div>
  )
}
