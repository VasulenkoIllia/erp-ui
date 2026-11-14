/**
 * Читання й заповнення шаблону .docx у браузері (UI44, ADR-0087): `docxtemplater` і `pizzip` (беремо
 * MIT). Лише лінивим чанком генератора (`erp/document-generator-panel`): імпорт цього файла з картки чи
 * списку додав би бібліотеки до першого екрана.
 *
 * - `readDocxTemplate(bytes)` — мітки шаблону або причина, чому його не взяти: не .docx, завеликий
 *   розпакований, заскладний (забагато тексту Word чи міток), не прочитався, помилки запису міток (кожна —
 *   біля своєї мітки).
 * - Розмір розпакованого рахується справжній, потоком з обривом на межі: заголовок zip пише автор файла, а
 *   `pizzip` розпаковує частину повністю й лише потім звіряє з заголовком (zip-бомба повісила б вкладку).
 *   Межа тексту Word і кількості міток тримає заповнення в межах секунди: воно синхронне.
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
/** Розпакований текст Word (`word/*.xml`), який розбирає заповнення: договір — сотні КБ. */
export const DOCX_MAX_XML_BYTES = 10 * 1024 * 1024
/** Мітки в шаблоні (`{` у тексті Word): договір — до сотні-двох; розбір блоків росте швидше за лінійно. */
export const DOCX_MAX_TAGS = 500

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
  | {
      readonly ok: false
      readonly reason: "not-docx" | "too-large" | "too-complex" | "unreadable"
    }
  | {
      readonly ok: false
      readonly reason: "syntax"
      readonly issues: readonly DocxSyntaxIssue[]
    }

interface DocxPart {
  readonly type: string
  readonly value: string
  readonly module?: string
  readonly inverted?: boolean
  readonly subparsed?: readonly DocxPart[]
}

const hasOwn = (
  value: unknown,
  key: string,
): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && Object.hasOwn(value, key)

/**
 * Значення за шляхом мітки лише з власних полів даних: `{constructor.name}` нічого не дістане. Пробіли
 * навколо назви (`{ number }`) не рахуються, як і в переліку міток (`toTag`).
 */
function lookup(scope: unknown, tag: string): unknown {
  const path = tag.trim()
  if (path === ".") return scope
  let value: unknown = scope
  for (const part of path.split(".")) {
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
      : part.module !== "loop"
        ? "value"
        : part.inverted
          ? "inverted"
          : "section"
  return { name: part.value.trim(), kind, inner }
}

const DEFLATE = "\x08\x00"
const STORED = "\x00\x00"
const WORD_XML = /^word\/[^/]+\.xml$/

/** Розпакований розмір частини потоком; понад `budget` — `null`, далі не розпаковуємо. */
async function inflatedBytes(
  compressed: Uint8Array<ArrayBuffer>,
  budget: number,
): Promise<number | null> {
  const reader = new Blob([compressed])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"))
    .getReader()
  let size = 0
  for (;;) {
    const chunk = await reader.read()
    if (chunk.done) return size
    size += chunk.value.byteLength
    if (size > budget) {
      await reader.cancel()
      return null
    }
  }
}

type ArchiveCheck = "ok" | "too-large" | "too-complex" | "unreadable"

/**
 * Справжній розпакований розмір частин архіву й тексту Word. Внутрішня форма частини `pizzip` (стиснені
 * байти й метод) інша чи метод невідомий — файл не беремо, а не пропускаємо без перевірки.
 */
async function checkArchive(zip: PizZip): Promise<ArchiveCheck> {
  let total = 0
  let xml = 0
  for (const [name, file] of Object.entries(zip.files)) {
    if (file.dir) continue
    const data: unknown = (file as { _data?: unknown })._data
    const method = hasOwn(data, "compressionMethod")
      ? data.compressionMethod
      : undefined
    const read = hasOwn(data, "getCompressedContent")
      ? data.getCompressedContent
      : undefined
    if (typeof read !== "function") return "unreadable"
    const content: unknown = read.call(data)
    if (!(content instanceof Uint8Array)) return "unreadable"
    const compressed = new Uint8Array(content)
    const budget = DOCX_MAX_UNPACKED_BYTES - total
    const size =
      method === STORED
        ? compressed.byteLength
        : method === DEFLATE
          ? await inflatedBytes(compressed, budget)
          : undefined
    if (size === undefined) return "unreadable"
    if (size === null || size > budget) return "too-large"
    total += size
    if (WORD_XML.test(name)) xml += size
    if (xml > DOCX_MAX_XML_BYTES) return "too-complex"
  }
  return "ok"
}

/** Скільки міток у тексті Word: кожна починається з `{`, навіть якщо Word розбив її на шматки. */
function tagMarks(zip: PizZip): number {
  let count = 0
  for (const file of zip.file(WORD_XML)) {
    const text = file.asText()
    for (let index = text.indexOf("{"); index !== -1;) {
      count += 1
      index = text.indexOf("{", index + 1)
    }
  }
  return count
}

/** Мітка помилки: у більшості — `xtag`, у блоків, що не збігаються чи перетинаються, — назва першого. */
function issueTag(props: unknown): string {
  const field = (source: unknown, key: string) => {
    const value = hasOwn(source, key) ? source[key] : undefined
    return typeof value === "string" ? value.trim() : ""
  }
  const pair = hasOwn(props, "pair") ? props.pair : undefined
  return (
    field(props, "xtag") || field(props, "openingtag") || field(pair, "left")
  )
}

function syntaxIssues(error: unknown): DocxSyntaxIssue[] | null {
  if (!(error instanceof Error) || error.name !== "TemplateError") return null
  const properties: unknown = (error as { properties?: unknown }).properties
  const list = hasOwn(properties, "errors") ? properties.errors : [error]
  if (!Array.isArray(list)) return null
  const seen = new Set<string>()
  return list.flatMap((item: unknown) => {
    const props: unknown = hasOwn(item, "properties") ? item.properties : {}
    const id = hasOwn(props, "id") ? props.id : undefined
    const issue = {
      code: typeof id === "string" ? id : "",
      tag: issueTag(props),
    }
    // Двічі не закритий той самий блок — одна помилка біля мітки, а не дві однакові.
    const key = `${issue.code}:${issue.tag}`
    if (seen.has(key)) return []
    seen.add(key)
    return [issue]
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
export async function readDocxTemplate(
  source: Uint8Array,
): Promise<DocxReadResult> {
  const bytes = source.slice()
  let zip: PizZip
  try {
    zip = new PizZip(bytes)
  } catch {
    return { ok: false, reason: "not-docx" }
  }
  if (!zip.file("word/document.xml")) return { ok: false, reason: "not-docx" }
  let check: ArchiveCheck
  try {
    check = await checkArchive(zip)
  } catch (error) {
    console.error("erp-ui: docx archive was not read", error)
    return { ok: false, reason: "not-docx" }
  }
  if (check !== "ok") return { ok: false, reason: check }
  if (tagMarks(zip) > DOCX_MAX_TAGS) return { ok: false, reason: "too-complex" }
  const inspect = new InspectModule()
  try {
    compile(bytes, [inspect])
  } catch (error) {
    const issues = syntaxIssues(error)
    if (issues) return { ok: false, reason: "syntax", issues }
    console.error("erp-ui: docx template was not read", error)
    return { ok: false, reason: "unreadable" }
  }
  const tags = (inspect.getAllStructuredTags() as readonly DocxPart[])
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
