import * as React from "react"
import { useQuery } from "@tanstack/react-query"

import type { DocumentTemplateOption } from "@/registry/erp/document-generator"
import {
  templateIssues,
  type TemplateData,
  type TemplateIssue,
  type TemplateTag,
  type TemplateVariables,
} from "@/registry/lib/document-template"
import {
  DOCX_MAX_TAGS,
  DOCX_MAX_UNPACKED_BYTES,
  readDocxTemplate,
  type DocxReadResult,
  type DocxTemplate,
} from "@/registry/lib/docx-template"
import type { ErpUiTranslate } from "@/registry/lib/i18n"

/**
 * Стан генератора документа (UI44, ADR-0087), частина лінивого чанка `erp/document-generator-panel`:
 * читання шаблону, помилки міток, виправлені значення, файл перегляду й завантаження.
 *
 * - Шаблон проекту читається раз за відкритий генератор, свій файл — раз за вибір: повернення у вкладку
 *   його не перечитує (змінений у Word файл браузер уже не дасть прочитати). Читання не чекає мережі: свій
 *   файл і так у браузері, а шаблон проекту без мережі дає помилку з «Спробувати ще».
 * - Ключ запиту свій у кожного генератора: два генератори на сторінці з тим самим `id` шаблону не беруть
 *   чужий прочитаний шаблон.
 * - Файл перегляду — з даних після паузи в наборі; завантаження з новішими даними кладе свій файл і в
 *   перегляд: у перегляді й у завантаженні той самий `Blob`.
 */

/** Вибір «Свій файл .docx» у переліку шаблонів. */
export const FILE_CHOICE = "file"
/** Пауза в наборі, після якої оновлюється перегляд. */
const PREVIEW_DELAY_MS = 300
const BYTES_PER_MB = 1024 * 1024
const NO_OVERRIDES: Readonly<Record<string, string>> = {}

/** Свій файл шаблону; `revision` — новий номер на кожен вибір, навіть того самого файла. */
export interface TemplateFile {
  readonly file: File
  readonly revision: number
}

async function readBlob(blob: Blob): Promise<DocxReadResult> {
  return readDocxTemplate(new Uint8Array(await blob.arrayBuffer()))
}

/** Прочитаний шаблон: проекту чи свій файл. */
export function useTemplateSource(
  templates: readonly DocumentTemplateOption[],
  choice: string,
  file: TemplateFile | null,
) {
  const scope = React.useId()
  const option = templates.find((item) => item.id === choice)
  const project = useQuery({
    queryKey: ["erp-ui", "document-template", scope, choice],
    queryFn: async () => {
      if (!option) throw new Error("erp-ui: unknown document template")
      return readBlob(await option.load())
    },
    enabled: option !== undefined,
    staleTime: Infinity,
    structuralSharing: false,
    retry: 1,
    networkMode: "always",
  })
  const own = useQuery({
    queryKey: ["erp-ui", "document-template-file", scope, file?.revision ?? 0],
    queryFn: () => {
      if (!file) throw new Error("erp-ui: no template file")
      return readBlob(file.file)
    },
    enabled: choice === FILE_CHOICE && file !== null,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    structuralSharing: false,
    retry: false,
    networkMode: "always",
  })
  return choice === FILE_CHOICE ? own : project
}

export type TemplateSource = ReturnType<typeof useTemplateSource>

/** Помилки шаблону: мітки проти змінних документа чи помилки запису міток. */
export function documentIssues(
  result: DocxReadResult | undefined,
  variables: TemplateVariables,
): readonly TemplateIssue[] {
  if (result?.ok) return templateIssues(result.template.tags, variables)
  if (result?.reason === "syntax")
    return result.issues.map((issue) => ({
      code: "syntax",
      tag: issue.tag,
      syntax: issue.code,
    }))
  return []
}

/** Скільки різних міток у шаблоні, разом із мітками всередині блоків. */
function tagCount(tags: readonly TemplateTag[]): number {
  const names = new Set<string>()
  const walk = (list: readonly TemplateTag[]) => {
    for (const tag of list) {
      names.add(tag.name)
      walk(tag.inner)
    }
  }
  walk(tags)
  return names.size
}

export interface TemplateStatus {
  readonly text: string
  readonly isError: boolean
  readonly canRetry: boolean
}

/** Що сказати про шаблон: читається, не взявся (і чому), прочитано скільки міток. */
export function templateStatus(
  source: TemplateSource,
  issues: readonly TemplateIssue[],
  t: ErpUiTranslate,
): TemplateStatus {
  const error = (text: string, canRetry = false) => ({
    text,
    isError: true,
    canRetry,
  })
  if (source.isPending && source.fetchStatus !== "idle")
    return {
      text: t("documentGenerator.reading"),
      isError: false,
      canRetry: false,
    }
  if (source.isError) return error(t("documentGenerator.loadFailed"), true)
  const result = source.data
  if (!result) return { text: "", isError: false, canRetry: false }
  if (issues.length > 0)
    return error(t("documentGenerator.issues", { count: issues.length }))
  if (result.ok)
    return {
      text: t("documentGenerator.read", {
        count: tagCount(result.template.tags),
      }),
      isError: false,
      canRetry: false,
    }
  if (result.reason === "too-large")
    return error(
      t("documentGenerator.tooLarge", {
        size: DOCX_MAX_UNPACKED_BYTES / BYTES_PER_MB,
      }),
    )
  if (result.reason === "too-complex")
    return error(t("documentGenerator.tooComplex", { tags: DOCX_MAX_TAGS }))
  return error(
    t(
      result.reason === "not-docx"
        ? "documentGenerator.notDocx"
        : "documentGenerator.unreadable",
    ),
  )
}

/**
 * Значення, виправлені людиною. Змінилися дані документа (інша картка, оновлений запис) — виправлення
 * скидаються: старі значення не перекривають нові.
 */
export function useTemplateOverrides(variables: TemplateVariables) {
  const key = React.useMemo(() => JSON.stringify(variables), [variables])
  const [edits, setEdits] = React.useState({
    key,
    values: NO_OVERRIDES,
  })
  const values = edits.key === key ? edits.values : NO_OVERRIDES
  const setValue = React.useCallback(
    (name: string, value: string) => {
      setEdits((previous) => ({
        key,
        values: {
          ...(previous.key === key ? previous.values : NO_OVERRIDES),
          [name]: value,
        },
      }))
    },
    [key],
  )
  return [values, setValue] as const
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

export interface FilledFile {
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
  } catch (error) {
    console.error("erp-ui: docx template was not filled", error)
    return { template, key, file: null }
  }
}

/**
 * Файл перегляду з даних після паузи. Завантаження з новішими даними, ніж у перегляді, кладе свій файл і
 * в перегляд: у перегляді й у завантаженні той самий `Blob`.
 */
export function usePreviewFile(template: DocxTemplate | null, dataKey: string) {
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
