import * as React from "react"

import {
  richTextContentClass,
  richTextMentionClass,
} from "@/registry/erp/rich-text-styles"
import {
  toRichText,
  type RichTextBlock,
  type RichTextInline,
  type RichTextMention,
  type RichTextTextNode,
} from "@/registry/lib/rich-text"
import { cn } from "@/registry/lib/utils"

/**
 * Показ збереженого тексту без редактора (UI12, ADR-0052): стрічка з сотнею нотаток не вантажить
 * Tiptap. Елементи будуються лише з дозволених вузлів, HTML із документа ніколи не вставляється, а
 * `toRichText` уже відкинув небезпечні посилання.
 *
 * Значення — будь-яке: документ, простий текст бекенду без оформлення чи `null`. Порожнє показує
 * `empty`. `renderMention` робить згадку посиланням на людину: підпис у документі приходить від
 * браузера автора, тож перевірений запис людини проект бере за `mention.id`.
 */
export interface RichTextViewProps {
  value: unknown
  renderMention?: (mention: RichTextMention) => React.ReactNode
  empty?: React.ReactNode
  className?: string
}

function renderText(node: RichTextTextNode): React.ReactNode {
  let content: React.ReactNode = node.text
  for (const mark of node.marks ?? []) {
    if (mark.type === "bold") content = <strong>{content}</strong>
    else if (mark.type === "italic") content = <em>{content}</em>
    else if (mark.type === "link")
      content = (
        <a
          href={mark.attrs.href}
          target="_blank"
          rel="noopener noreferrer nofollow"
        >
          {content}
        </a>
      )
  }
  return content
}

function renderInline(
  node: RichTextInline,
  key: number,
  renderMention: RichTextViewProps["renderMention"],
): React.ReactNode {
  switch (node.type) {
    case "text":
      return <React.Fragment key={key}>{renderText(node)}</React.Fragment>
    case "hardBreak":
      return <br key={key} />
    case "mention":
      return (
        <React.Fragment key={key}>
          {renderMention ? (
            renderMention(node.attrs)
          ) : (
            <span
              data-slot="rich-text-mention"
              className={richTextMentionClass}
            >
              @{node.attrs.label}
            </span>
          )}
        </React.Fragment>
      )
  }
}

function renderBlock(
  block: RichTextBlock,
  key: number,
  renderMention: RichTextViewProps["renderMention"],
): React.ReactNode {
  const blocks = (children: readonly RichTextBlock[]) =>
    children.map((child, index) => renderBlock(child, index, renderMention))
  const items = (children: readonly { content: readonly RichTextBlock[] }[]) =>
    children.map((item, index) => <li key={index}>{blocks(item.content)}</li>)
  switch (block.type) {
    case "paragraph":
      return (
        <p key={key}>
          {block.content?.map((node, index) =>
            renderInline(node, index, renderMention),
          )}
        </p>
      )
    case "blockquote":
      return <blockquote key={key}>{blocks(block.content)}</blockquote>
    case "bulletList":
      return <ul key={key}>{items(block.content)}</ul>
    case "orderedList":
      return (
        <ol key={key} start={block.attrs?.start}>
          {items(block.content)}
        </ol>
      )
  }
}

export function RichTextView({
  value,
  renderMention,
  empty = "—",
  className,
}: RichTextViewProps) {
  const doc = React.useMemo(() => toRichText(value), [value])
  return (
    <div
      data-slot="rich-text-view"
      className={cn(richTextContentClass, "text-sm", className)}
    >
      {doc.content.length
        ? doc.content.map((block, index) =>
            renderBlock(block, index, renderMention),
          )
        : empty}
    </div>
  )
}
