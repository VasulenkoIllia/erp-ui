import { z } from "zod"

/**
 * Оформлений текст нотаток і повідомлень (UI12, ADR-0052). Зберігається JSON-документом, а не HTML:
 * показ будує елементи React із дозволених вузлів, тож небезпечному HTML ніде взятися, а екрану
 * запису не потрібен ні редактор, ні санітайзер.
 *
 * - Документ — підмножина JSON ProseMirror, яку редактор віддає сам. І `attrs.id`, і `attrs.label` згадки
 *   надсилає браузер автора: сервер проекту перевіряє кожен `id` і на запису ставить ім'я з довідника.
 * - `toRichText(value)` — єдиний вхід для чужих даних, усе, що показуємо чи редагуємо, проходить через
 *   нього. Рядок стає абзацами: бекенд із простим текстом працює без змін. Невідомий вузол (новіша
 *   версія кіта) лишає свій текст, невідома позначка чи небезпечне посилання зникають, текст лишається.
 * - Глибина й кількість вузлів обмежені: підроблений документ не вичерпає стек і не завісить вкладку
 *   в обході кіта. Законний текст цих меж не досягає. Сервер проекту сам обмежує глибину й довжину, а
 *   у форму значення йде через `toRichText`: react-hook-form копіює його рекурсивно й без меж.
 * - Посилання лише `http`, `https`, `mailto`, `tel`, без логіна в адресі: `https://bank.example@evil.example`
 *   виглядає як інший сайт. У `mailto` лише адреса: `bcc`, зокрема закодований, дописав би приховану
 *   копію. Перевірка одна для показу й редактора: `safeLinkHref`.
 * - Підпис згадки без керівних символів і не довший за `RICH_TEXT_MENTION_MAX`: він виглядає як позначка
 *   системи, тож не має розвертати сусідній текст чи вдавати повідомлення.
 */
export const RICH_TEXT_MAX_DEPTH = 32
export const RICH_TEXT_MAX_NODES = 10_000
export const RICH_TEXT_MENTION_MAX = 80

export type RichTextMark =
  | { readonly type: "bold" | "italic" }
  | { readonly type: "link"; readonly attrs: { readonly href: string } }

export interface RichTextMention {
  readonly id: string
  readonly label: string
}

export interface RichTextTextNode {
  readonly type: "text"
  readonly text: string
  readonly marks?: readonly RichTextMark[]
}

export interface RichTextMentionNode {
  readonly type: "mention"
  readonly attrs: RichTextMention
}

export type RichTextInline =
  RichTextTextNode | RichTextMentionNode | { readonly type: "hardBreak" }

export interface RichTextParagraph {
  readonly type: "paragraph"
  readonly content?: readonly RichTextInline[]
}

export interface RichTextListItem {
  readonly type: "listItem"
  readonly content: readonly RichTextBlock[]
}

export interface RichTextBulletList {
  readonly type: "bulletList"
  readonly content: readonly RichTextListItem[]
}

export interface RichTextOrderedList {
  readonly type: "orderedList"
  readonly attrs?: { readonly start: number }
  readonly content: readonly RichTextListItem[]
}

export interface RichTextBlockquote {
  readonly type: "blockquote"
  readonly content: readonly RichTextBlock[]
}

export type RichTextBlock =
  | RichTextParagraph
  | RichTextBulletList
  | RichTextOrderedList
  | RichTextBlockquote

export interface RichTextDoc {
  readonly type: "doc"
  readonly content: readonly RichTextBlock[]
}

/** Кого можна згадати: `label` потрапляє в текст, `hint` лише розрізняє тезок у списку. */
export interface MentionCandidate extends RichTextMention {
  readonly hint?: string
}

/** Пошук людей для згадки: `signal` скасовує запит, коли людина ввела наступну літеру. */
export type MentionSearch = (
  query: string,
  signal: AbortSignal,
) => Promise<readonly MentionCandidate[]>

export const EMPTY_RICH_TEXT: RichTextDoc = { type: "doc", content: [] }

const LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"])
const INLINE_TYPES = new Set(["text", "mention", "hardBreak"])
const NAMED_SCHEME = /^[a-z][a-z0-9+.-]*:/i
// `crm:8080/a` і `docs.example:8443` — адреса з портом, а не схема; `tel:0441234567` — схема.
const HOST_WITH_PORT = /^(?!tel:)[a-z][a-z0-9+.-]*:\d{1,5}(?:[/?#]|$)/i
const LABEL_CONTROL_CHARS = /[\p{Cc}\p{Cf}]/gu
const LABEL_SCAN_MAX = RICH_TEXT_MENTION_MAX * 4
const EMAIL = /^[^\s@/:]+@[^\s@/:]+$/
// Закодовані `?`, `#` і керівні символи поштовий клієнт може розкодувати в заголовки листа.
const MAILTO_ENCODED_HEADERS = /%(?:[01][0-9a-f]|23|3f)/i

/** Нормалізована адреса посилання або `null`, якщо такому посиланню не можна вірити. */
export function safeLinkHref(value: unknown): string | null {
  if (typeof value !== "string") return null
  try {
    const url = new URL(value.trim())
    if (!LINK_PROTOCOLS.has(url.protocol)) return null
    if (
      url.protocol === "mailto:" &&
      (url.search || url.hash || MAILTO_ENCODED_HEADERS.test(url.pathname))
    )
      return null
    return url.username || url.password ? null : url.href
  } catch {
    return null
  }
}

/** Те, що людина ввела в поле адреси: `example.com` означає `https://example.com/`, пошта стає листом. */
export function linkFromInput(value: string): string | null {
  const typed = value.trim()
  if (!typed) return null
  if (EMAIL.test(typed)) return safeLinkHref(`mailto:${typed}`)
  const hasScheme = NAMED_SCHEME.test(typed) && !HOST_WITH_PORT.test(typed)
  return safeLinkHref(hasScheme ? typed : `https://${typed}`)
}

type JsonObject = Readonly<Record<string, unknown>>

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const childrenOf = (node: JsonObject): readonly unknown[] =>
  Array.isArray(node.content) ? (node.content as unknown[]) : []

/** Лишок вузлів, спільний на весь обхід. */
interface Walk {
  left: number
}

/** Вузол можна обробити: не надто глибоко й лишок не вичерпано. */
function enter(value: unknown, depth: number, walk: Walk): value is JsonObject {
  if (!isObject(value) || depth > RICH_TEXT_MAX_DEPTH || walk.left <= 0)
    return false
  walk.left -= 1
  return true
}

function toMarks(value: unknown): readonly RichTextMark[] {
  if (!Array.isArray(value)) return []
  const marks = new Map<RichTextMark["type"], RichTextMark>()
  for (const mark of value as unknown[]) {
    if (!isObject(mark)) continue
    if (mark.type === "bold" || mark.type === "italic") {
      marks.set(mark.type, { type: mark.type })
    } else if (mark.type === "link") {
      const href = isObject(mark.attrs) ? safeLinkHref(mark.attrs.href) : null
      if (href) marks.set("link", { type: "link", attrs: { href } })
    }
  }
  return [...marks.values()]
}

function toMentionLabel(value: unknown): string {
  if (typeof value !== "string") return ""
  // Межа до розбору: підроблений підпис на мегабайти не копіюється посимвольно.
  const visible = value
    .slice(0, LABEL_SCAN_MAX)
    .replace(LABEL_CONTROL_CHARS, "")
    .trim()
  return Array.from(visible).slice(0, RICH_TEXT_MENTION_MAX).join("").trim()
}

function toMention(value: JsonObject): RichTextMentionNode | null {
  const attrs = isObject(value.attrs) ? value.attrs : {}
  if (typeof attrs.id !== "string" || !attrs.id) return null
  const label = toMentionLabel(attrs.label) || toMentionLabel(attrs.id)
  return label ? { type: "mention", attrs: { id: attrs.id, label } } : null
}

function toInline(
  value: unknown,
  depth: number,
  walk: Walk,
): readonly RichTextInline[] {
  if (!enter(value, depth, walk)) return []
  switch (value.type) {
    case "text": {
      if (typeof value.text !== "string" || !value.text) return []
      const marks = toMarks(value.marks)
      return [
        marks.length
          ? { type: "text", text: value.text, marks }
          : { type: "text", text: value.text },
      ]
    }
    case "hardBreak":
      return [{ type: "hardBreak" }]
    case "mention": {
      const mention = toMention(value)
      return mention ? [mention] : []
    }
    default:
      return []
  }
}

function toParagraph(content: readonly RichTextInline[]): RichTextParagraph {
  return content.length ? { type: "paragraph", content } : { type: "paragraph" }
}

/** Блоки з дітей вузла: сусідні рядкові вузли, що опинились поза абзацом, стають одним абзацом. */
function toBlocks(
  values: readonly unknown[],
  depth: number,
  walk: Walk,
): readonly RichTextBlock[] {
  const blocks: RichTextBlock[] = []
  let inline: RichTextInline[] = []
  const flush = () => {
    if (inline.length) blocks.push(toParagraph(inline))
    inline = []
  }
  for (const value of values) {
    // Лише рядок: приведення вкладеного масиву в `type` вичерпало б стек ще до межі глибини.
    if (
      isObject(value) &&
      typeof value.type === "string" &&
      INLINE_TYPES.has(value.type)
    ) {
      inline.push(...toInline(value, depth, walk))
    } else {
      flush()
      blocks.push(...toBlock(value, depth, walk))
    }
  }
  flush()
  return blocks
}

function toListItems(
  value: JsonObject,
  depth: number,
  walk: Walk,
): readonly RichTextListItem[] {
  return childrenOf(value).flatMap((item): RichTextListItem[] => {
    if (!enter(item, depth, walk)) return []
    const content = toBlocks(childrenOf(item), depth + 1, walk)
    // Пункт списку в редакторі завжди починається з абзацу.
    return [
      {
        type: "listItem",
        content:
          content[0]?.type === "paragraph"
            ? content
            : [toParagraph([]), ...content],
      },
    ]
  })
}

function toOrderedStart(value: JsonObject): number | undefined {
  const start = isObject(value.attrs) ? value.attrs.start : undefined
  return typeof start === "number" && Number.isSafeInteger(start) && start > 1
    ? start
    : undefined
}

function toBlock(
  value: unknown,
  depth: number,
  walk: Walk,
): readonly RichTextBlock[] {
  if (!enter(value, depth, walk)) return []
  const inner = depth + 1
  switch (value.type) {
    case "paragraph":
      return [
        toParagraph(
          childrenOf(value).flatMap((child) => toInline(child, inner, walk)),
        ),
      ]
    case "blockquote": {
      const content = toBlocks(childrenOf(value), inner, walk)
      return content.length ? [{ type: "blockquote", content }] : []
    }
    case "bulletList": {
      const content = toListItems(value, inner, walk)
      return content.length ? [{ type: "bulletList", content }] : []
    }
    case "orderedList": {
      const content = toListItems(value, inner, walk)
      if (!content.length) return []
      const start = toOrderedStart(value)
      return [
        start
          ? { type: "orderedList", attrs: { start }, content }
          : { type: "orderedList", content },
      ]
    }
    default:
      // Невідомий вузол лишає свій текст: заголовок нової версії не зникає зі старої стрічки.
      return toBlocks(childrenOf(value), inner, walk)
  }
}

/** Простий текст у документ: кожен рядок стає абзацом. */
export function richTextFromPlain(text: string): RichTextDoc {
  if (!text.trim()) return EMPTY_RICH_TEXT
  return {
    type: "doc",
    content: text
      .split(/\r?\n/, RICH_TEXT_MAX_NODES)
      .map((line) => toParagraph(line ? [{ type: "text", text: line }] : [])),
  }
}

/** Безпечний документ із будь-якого значення: відповіді сервера, редактора, форми. */
export function toRichText(value: unknown): RichTextDoc {
  if (typeof value === "string") return richTextFromPlain(value)
  if (!isObject(value) || value.type !== "doc") return EMPTY_RICH_TEXT
  const content = toBlocks(childrenOf(value), 1, { left: RICH_TEXT_MAX_NODES })
  // Порожній редактор тримає один порожній абзац: стертий текст не робить форму зміненою.
  const [first] = content
  const isBlank =
    content.length === 1 && first?.type === "paragraph" && !first.content
  return isBlank ? EMPTY_RICH_TEXT : { type: "doc", content }
}

/**
 * Схема для контрактів і форм: чужий документ чи простий текст дає `RichTextDoc`, а не помилку, щоб
 * читався запис зі старого текстового поля й із новішої версії кіта. Обов'язковість у формі:
 * `richTextSchema.refine((doc) => !isRichTextEmpty(doc))`.
 */
export const richTextSchema = z
  .union([z.string(), z.looseObject({ type: z.literal("doc") })])
  .transform(toRichText)

function inlineToPlain(node: RichTextInline): string {
  switch (node.type) {
    case "text":
      return node.text
    case "mention":
      return `@${node.attrs.label}`
    case "hardBreak":
      return "\n"
  }
}

function blockToPlain(block: RichTextBlock): string {
  switch (block.type) {
    case "paragraph":
      return (block.content ?? []).map(inlineToPlain).join("")
    case "blockquote":
      return block.content.map(blockToPlain).join("\n")
    case "bulletList":
    case "orderedList":
      return block.content
        .map((item) => item.content.map(blockToPlain).join("\n"))
        .join("\n")
  }
}

/** Текст без оформлення: прев'ю в списку, сповіщення, пошук. */
export function richTextToPlain(value: unknown): string {
  return toRichText(value).content.map(blockToPlain).join("\n")
}

/** Порожньо: можна не зберігати. Згадка без тексту порожнечею не вважається. */
export const isRichTextEmpty = (value: unknown): boolean =>
  richTextToPlain(value).trim() === ""

/** Згадані люди без повторів, у порядку появи в тексті. */
export function richTextMentions(value: unknown): readonly RichTextMention[] {
  const found = new Map<string, RichTextMention>()
  const visit = (block: RichTextBlock): void => {
    if (block.type === "paragraph") {
      for (const node of block.content ?? [])
        if (node.type === "mention" && !found.has(node.attrs.id))
          found.set(node.attrs.id, node.attrs)
      return
    }
    for (const child of block.content)
      if (child.type === "listItem") child.content.forEach(visit)
      else visit(child)
  }
  toRichText(value).content.forEach(visit)
  return [...found.values()]
}
