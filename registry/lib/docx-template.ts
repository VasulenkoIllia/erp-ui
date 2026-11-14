/**
 * Читання й заповнення шаблону .docx у браузері (UI44, ADR-0087): `docxtemplater` і `pizzip` (беремо
 * MIT). Лише лінивим чанком генератора (`erp/document-generator-panel`): імпорт цього файла з картки чи
 * списку додав би бібліотеки до першого екрана.
 *
 * - `readDocxTemplate(bytes)` — мітки шаблону або причина, чому його не взяти: не .docx, завеликий
 *   розпакований, помилки запису міток (кожна — біля своєї мітки).
 * - `template.fill(data)` — новий файл .docx з тих самих байтів шаблону; порожнє значення — порожньо, а
 *   невідома мітка лишається текстом `{мітка}`: так її видно в перегляді.
 * - Значення вставляються текстом: XML екранує `docxtemplater`, перенос рядка — розрив рядка Word. Мітки
 *   `{@…}` (сирий XML) генератор не підтримує: `templateIssues` робить їх помилкою.
 */
import Docxtemplater from "docxtemplater"
import InspectModule from "docxtemplater/js/inspect-module.js"
import PizZip from "pizzip"

import type {
  TemplateData,
  TemplateTag,
} from "@/registry/lib/document-template"

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
/** Розмір файла шаблону, який бере генератор. */
export const DOCX_MAX_BYTES = 10 * 1024 * 1024
/** Розпакований вміст: більше — не шаблон документа, а ризик заморозити вкладку. */
export const DOCX_MAX_UNPACKED_BYTES = 50 * 1024 * 1024

/** Помилка запису мітки: код `docxtemplater` (`unclosed_tag`, `unclosed_loop`…) і мітка біля неї. */
export interface DocxSyntaxIssue {
  readonly code: string
  readonly tag: string
}

export interface DocxTemplate {
  readonly tags: readonly TemplateTag[]
  fill(data: TemplateData): Blob
}

export type DocxReadResult =
  | { readonly ok: true; readonly template: DocxTemplate }
  | { readonly ok: false; readonly reason: "not-docx" | "too-large" }
  | {
      readonly ok: false
      readonly reason: "syntax"
      readonly issues: readonly DocxSyntaxIssue[]
    }

interface DocxPart {
  readonly type: string
  readonly value: string
  readonly module?: string
  readonly subparsed?: readonly DocxPart[]
}

const hasOwn = (
  value: unknown,
  key: string,
): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && Object.hasOwn(value, key)

/** Значення за шляхом мітки лише з власних полів даних: `{constructor.name}` нічого не дістане. */
function lookup(scope: unknown, tag: string): unknown {
  if (tag === ".") return scope
  let value: unknown = scope
  for (const part of tag.split(".")) {
    if (!hasOwn(value, part)) return undefined
    value = value[part]
  }
  return value
}

const OPTIONS = {
  paragraphLoop: true,
  linebreaks: true,
  errorLogging: false,
  parser: (tag: string) => ({ get: (scope: unknown) => lookup(scope, tag) }),
}

function toTag(part: DocxPart): TemplateTag {
  const inner = (part.subparsed ?? [])
    .filter((child) => child.type === "placeholder")
    .map(toTag)
  const kind =
    part.module === "rawxml"
      ? "raw"
      : part.module === "loop"
        ? "section"
        : "value"
  return { name: part.value.trim(), kind, inner }
}

/** Заявлений розпакований розмір частин архіву; `pizzip` розпаковує частину, лише коли її читають. */
function unpackedBytes(zip: PizZip): number {
  return Object.values(zip.files).reduce((sum, file) => {
    const data: unknown = (file as { _data?: unknown })._data
    const size = hasOwn(data, "uncompressedSize") ? data.uncompressedSize : 0
    return sum + (typeof size === "number" ? size : 0)
  }, 0)
}

function syntaxIssues(error: unknown): DocxSyntaxIssue[] | null {
  if (!(error instanceof Error) || error.name !== "TemplateError") return null
  const properties: unknown = (error as { properties?: unknown }).properties
  const list = hasOwn(properties, "errors") ? properties.errors : [error]
  if (!Array.isArray(list)) return null
  return list.map((item: unknown) => {
    const props: unknown = hasOwn(item, "properties") ? item.properties : {}
    const field = (key: string) => {
      const value = hasOwn(props, key) ? props[key] : undefined
      return typeof value === "string" ? value : ""
    }
    return { code: field("id"), tag: field("xtag").trim() }
  })
}

function compile(bytes: Uint8Array, modules: InspectModule[] = []) {
  return new Docxtemplater(new PizZip(bytes), {
    ...OPTIONS,
    modules,
    nullGetter: (part) =>
      part.module === "loop" ? "" : `{${part.value.trim()}}`,
  })
}

/** Прочитати шаблон: мітки чи причина відмови. Байти копіюються: зміна масиву ззовні шаблону не зачепить. */
export function readDocxTemplate(source: Uint8Array): DocxReadResult {
  const bytes = source.slice()
  let zip: PizZip
  try {
    zip = new PizZip(bytes)
  } catch {
    return { ok: false, reason: "not-docx" }
  }
  if (!zip.file("word/document.xml")) return { ok: false, reason: "not-docx" }
  if (unpackedBytes(zip) > DOCX_MAX_UNPACKED_BYTES)
    return { ok: false, reason: "too-large" }
  const inspect = new InspectModule()
  try {
    compile(bytes, [inspect])
  } catch (error) {
    const issues = syntaxIssues(error)
    if (issues) return { ok: false, reason: "syntax", issues }
    return { ok: false, reason: "not-docx" }
  }
  const tags = (inspect.getAllStructuredTags() as DocxPart[])
    .filter((part) => part.type === "placeholder")
    .map(toTag)
  return {
    ok: true,
    template: {
      tags,
      fill: (data) =>
        new Blob([compile(bytes).render(data).toUint8Array().slice()], {
          type: DOCX_MIME,
        }),
    },
  }
}
