import * as React from "react"
import { useQuery } from "@tanstack/react-query"

import type {
  DocumentGeneratorProps,
  DocumentTemplateOption,
} from "@/registry/erp/document-generator"
import {
  DocumentTemplateFields,
  DocumentTemplateReference,
} from "@/registry/erp/document-template-fields"
import { documentTemplateVariables } from "@/registry/erp/document-template-variables"
import { DocxPreview, type DocxPreviewState } from "@/registry/erp/docx-preview"
import { FileDrop } from "@/registry/erp/file-drop"
import { useCompanyProfile } from "@/registry/hooks/use-company-profile"
import { localizedText } from "@/registry/lib/auth"
import {
  templateData,
  templateIssues,
  type TemplateData,
  type TemplateIssue,
} from "@/registry/lib/document-template"
import {
  DOCX_MAX_BYTES,
  DOCX_MAX_UNPACKED_BYTES,
  readDocxTemplate,
  type DocxReadResult,
  type DocxTemplate,
} from "@/registry/lib/docx-template"
import {
  useErpUiT,
  useLanguage,
  type ErpUiTranslate,
} from "@/registry/lib/i18n"
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
 * шаблону, мітки зі значеннями документа, перегляд самого файла й завантаження.
 *
 * - Шаблон проекту вантажиться раз за відкриту сторінку; збій — «Спробувати ще». Свій файл — до 10 МБ.
 * - Перегляд оновлюється за паузу в наборі; «Завантажити» бере той самий файл, що в перегляді, а якщо
 *   набір ще не встиг у перегляд — спершу оновлює його, тож завантажене завжди те, що видно.
 * - Помилка в шаблоні (невідома мітка, запис мітки) — біля мітки, «Завантажити» неактивна з причиною.
 */
const FILE_CHOICE = "file"
const DOCX_ACCEPT = `.docx,${"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}`
/** Пауза в наборі, після якої оновлюється перегляд. */
const PREVIEW_DELAY_MS = 300
const BYTES_PER_MB = 1024 * 1024
/** Скільки жити адресі файла після «Завантажити»: браузер може почати збереження не одразу. */
const DOWNLOAD_URL_TTL_MS = 40_000

async function readBlob(blob: Blob): Promise<DocxReadResult> {
  return readDocxTemplate(new Uint8Array(await blob.arrayBuffer()))
}

/** Прочитаний шаблон: проекту (з кешем) чи свій файл (кожен вибір — новий). */
function useTemplateSource(
  templates: readonly DocumentTemplateOption[],
  choice: string,
  file: { readonly file: File; readonly revision: number } | null,
) {
  const option = templates.find((item) => item.id === choice)
  const project = useQuery({
    queryKey: ["erp-ui", "document-template", choice],
    queryFn: async () => {
      if (!option) throw new Error("erp-ui: unknown document template")
      return readBlob(await option.load())
    },
    enabled: option !== undefined,
    staleTime: Infinity,
    structuralSharing: false,
    retry: 1,
  })
  const own = useQuery({
    queryKey: ["erp-ui", "document-template-file", file?.revision ?? 0],
    queryFn: () => {
      if (!file) throw new Error("erp-ui: no template file")
      return readBlob(file.file)
    },
    enabled: choice === FILE_CHOICE && file !== null,
    gcTime: 0,
    structuralSharing: false,
    retry: false,
  })
  return choice === FILE_CHOICE ? own : project
}

/** Значення з паузою в змінах; `flush` переносить поточне одразу. */
function useDebouncedValue(
  value: string,
  delayMs: number,
): [string, () => void] {
  const [delayed, setDelayed] = React.useState(value)
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDelayed(value)
    }, delayMs)
    return () => {
      clearTimeout(timer)
    }
  }, [value, delayMs])
  const flush = React.useCallback(() => {
    setDelayed(value)
  }, [value])
  return [delayed, flush]
}

interface FilledFile {
  readonly template: DocxTemplate
  /** Дані заповнення (`JSON`), з яких зроблено файл. */
  readonly key: string
  /** `null` — шаблон не заповнився. */
  readonly file: Blob | null
}

function fillTemplate(template: DocxTemplate, key: string): FilledFile {
  try {
    return {
      template,
      key,
      file: template.fill(JSON.parse(key) as TemplateData),
    }
  } catch {
    return { template, key, file: null }
  }
}

/**
 * Файл перегляду з даних після паузи. Завантаження з новішими даними, ніж у перегляді, кладе свій файл і
 * в перегляд (`pin`): у перегляді й у завантаженнях той самий `Blob`.
 */
function usePreviewFile(template: DocxTemplate | null, dataKey: string) {
  const [previewKey, flushPreview] = useDebouncedValue(
    dataKey,
    PREVIEW_DELAY_MS,
  )
  const [pinned, setPinned] = React.useState<FilledFile | null>(null)
  const preview = React.useMemo(() => {
    if (!template) return null
    if (pinned?.template === template && pinned.key === previewKey)
      return pinned
    return fillTemplate(template, previewKey)
  }, [template, previewKey, pinned])
  const current = React.useCallback((): FilledFile | null => {
    if (!template) return null
    if (preview?.key === dataKey) return preview
    const filled = fillTemplate(template, dataKey)
    setPinned(filled)
    flushPreview()
    return filled
  }, [template, dataKey, preview, flushPreview])
  return { previewFile: preview?.file ?? null, current }
}

/** Що сказати про шаблон: читається, не взявся (і чому), прочитано скільки міток. */
function sourceStatus(
  source: ReturnType<typeof useTemplateSource>,
  issues: readonly TemplateIssue[],
  t: ErpUiTranslate,
): { text: string; isError: boolean; canRetry: boolean } {
  if (source.isPending && source.fetchStatus !== "idle")
    return {
      text: t("documentGenerator.reading"),
      isError: false,
      canRetry: false,
    }
  if (source.isError)
    return {
      text: t("documentGenerator.loadFailed"),
      isError: true,
      canRetry: true,
    }
  const result = source.data
  if (!result) return { text: "", isError: false, canRetry: false }
  if (!result.ok && result.reason === "not-docx")
    return {
      text: t("documentGenerator.notDocx"),
      isError: true,
      canRetry: false,
    }
  if (!result.ok && result.reason === "too-large")
    return {
      text: t("documentGenerator.tooLarge", {
        size: DOCX_MAX_UNPACKED_BYTES / BYTES_PER_MB,
      }),
      isError: true,
      canRetry: false,
    }
  const count = result.ok ? result.template.tags.length : issues.length
  return issues.length > 0
    ? {
        text: t("documentGenerator.issues", { count: issues.length }),
        isError: true,
        canRetry: false,
      }
    : {
        text: t("documentGenerator.read", { count }),
        isError: false,
        canRetry: false,
      }
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

export function DocumentGeneratorPanel({
  document,
  templates = [],
  fileName,
  language,
  initialTemplateId,
}: DocumentGeneratorProps) {
  const t = useErpUiT()
  const ui = useLanguage()
  const company = useCompanyProfile()
  const sheet = usePrintLanguage(language ?? company.data?.language)
  const [choice, setChoice] = React.useState(
    initialTemplateId ?? templates[0]?.id ?? FILE_CHOICE,
  )
  const [file, setFile] = React.useState<{
    file: File
    revision: number
  } | null>(null)
  const [overrides, setOverrides] = React.useState<Record<string, string>>({})
  const [previewState, setPreviewState] =
    React.useState<DocxPreviewState>("idle")
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
  const issues = React.useMemo((): TemplateIssue[] => {
    if (result?.ok) return templateIssues(result.template.tags, variables)
    if (result?.reason === "syntax")
      return result.issues.map((issue) => ({
        code: "syntax",
        tag: issue.tag,
        syntax: issue.code,
      }))
    return []
  }, [result, variables])
  const dataKey = React.useMemo(
    () => JSON.stringify(templateData(variables, overrides)),
    [variables, overrides],
  )
  const { previewFile, current } = usePreviewFile(template, dataKey)
  const status = sourceStatus(source, issues, t)
  const templateName =
    choice === FILE_CHOICE
      ? (file?.file.name.replace(/\.docx$/i, "") ?? "")
      : (localizedText(
          templates.find((item) => item.id === choice)?.label,
          ui.language,
        ) ?? "")
  const blockedReason = !template
    ? t("documentGenerator.downloadNoTemplate")
    : issues.length > 0
      ? t("documentGenerator.downloadBlocked")
      : previewFile === null
        ? t("documentGenerator.fillFailed")
        : null
  const reasonId = React.useId()
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
            onChoice={(next) => {
              setChoice(next)
            }}
          />
          {choice === FILE_CHOICE ? (
            <FileDrop
              label={t("documentGenerator.fileLabel")}
              hint={t("documentGenerator.fileHint")}
              accept={DOCX_ACCEPT}
              maxBytes={DOCX_MAX_BYTES}
              file={file?.file ?? null}
              onFileChange={(next) => {
                setFile((previous) =>
                  next
                    ? { file: next, revision: (previous?.revision ?? 0) + 1 }
                    : null,
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
            {status.canRetry ? (
              <Button
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => {
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
                onValueChange={(key, value) => {
                  setOverrides((previous) => ({ ...previous, [key]: value }))
                }}
              />
            </section>
          ) : null}
          <DocumentTemplateReference variables={variables} />
        </div>
        <div className="grid content-start gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-medium">{t("documentGenerator.preview")}</h3>
            <p className="text-sm text-muted-foreground" aria-hidden>
              {previewState === "rendering"
                ? t("documentGenerator.previewUpdating")
                : ""}
            </p>
          </div>
          <div
            className="relative aspect-[210/297] max-h-[min(70dvh,52rem)] w-full overflow-hidden rounded-lg bg-muted" // erp-ui: allow-raw-value — аркуш A4 не вищий за екран
          >
            <DocxPreview
              file={previewFile}
              title={t("documentGenerator.previewTitle", {
                name: templateName,
              })}
              onStateChange={setPreviewState}
            />
            {previewFile === null || previewState === "failed" ? (
              <p
                role={previewState === "failed" ? "status" : undefined}
                className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted-foreground"
              >
                {previewState === "failed"
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
              onClick={download}
            >
              {t("documentGenerator.download")}
            </Button>
            <p id={reasonId} className="text-sm text-muted-foreground">
              {blockedReason ?? ""}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
