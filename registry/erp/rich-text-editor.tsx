import * as React from "react"
// Peer-залежність `@tiptap/suggestion`: реєстр бере пакети елемента лише з імпортів.
import type {} from "@floating-ui/dom"
import type { Attributes, Extensions, JSONContent } from "@tiptap/core"
import Blockquote from "@tiptap/extension-blockquote"
import Bold from "@tiptap/extension-bold"
import Document from "@tiptap/extension-document"
import HardBreak from "@tiptap/extension-hard-break"
import Italic from "@tiptap/extension-italic"
import Link from "@tiptap/extension-link"
import {
  BulletList,
  ListItem,
  ListKeymap,
  OrderedList,
} from "@tiptap/extension-list"
import Mention from "@tiptap/extension-mention"
import Paragraph from "@tiptap/extension-paragraph"
import Text from "@tiptap/extension-text"
import { Placeholder, UndoRedo } from "@tiptap/extensions"
import { PluginKey } from "@tiptap/pm/state"
import { EditorContent, useEditor } from "@tiptap/react"
import { exitSuggestion } from "@tiptap/suggestion"

import { RichTextMentions } from "@/registry/erp/rich-text-mentions"
import {
  richTextBodyClass,
  richTextContentClass,
  richTextFrameClass,
  richTextInvalidClass,
  richTextLinkSlot,
  richTextMentionClass,
} from "@/registry/erp/rich-text-styles"
import { RichTextToolbar } from "@/registry/erp/rich-text-toolbar"
import { useMentionSearch } from "@/registry/hooks/use-mention-search"
import {
  createMentionMenu,
  type MentionMenu,
} from "@/registry/lib/mention-menu"
import {
  safeLinkHref,
  toRichText,
  type MentionSearch,
  type RichTextDoc,
} from "@/registry/lib/rich-text"
import { cn } from "@/registry/lib/utils"

/**
 * Редактор тексту на Tiptap 3 (UI12, ADR-0052). Це єдине місце, разом із `rich-text-toolbar` і
 * `rich-text-mentions`, де кіт торкається Tiptap: файл вантажиться окремим чанком через
 * `erp/rich-text-field`, і напряму його не підключають.
 *
 * - Схема — той самий набір вузлів, що й у `lib/rich-text`. Вставлене ззовні відсікає схема, а значення
 *   зі зворотного боку проходить через `toRichText`: у форму йде документ кіта, а не внутрішні атрибути.
 * - `injectCSS: false`: стилі лише класами Tailwind на токенах, другого рантайму стилів немає (бар'єр 3).
 * - Значення порівнюється за вмістом: react-hook-form віддає копію, і порівняння за посиланням
 *   скидало б курсор на кожній літері.
 */
const MENTION_PLUGIN_KEY = new PluginKey("erp-ui-mention")

const LINK_REL = "noopener noreferrer nofollow"

/** Лише адреса: `class`, `title`, `target` і `rel` зі вставленого HTML не доходять до DOM поля. */
const HrefOnlyLink = Link.extend({
  addAttributes() {
    const { href } = this.parent?.() as Attributes
    return { href }
  },
})

/** Tab виводить із поля, як скрізь у формі: вкладати пункти клавіатурою не можна, і документ не міняється. */
const FormListItem = ListItem.extend({
  addKeyboardShortcuts() {
    return { Enter: () => this.editor.commands.splitListItem(this.name) }
  },
})

/** Вікно посилання й службова зупинка його порталу: фокус звідти повертається в поле. */
const FIELD_PORTALS = `[data-slot="${richTextLinkSlot}"], [data-base-ui-focus-guard]`

const hasModifier = (event: KeyboardEvent) =>
  event.isComposing ||
  event.shiftKey ||
  event.ctrlKey ||
  event.metaKey ||
  event.altKey

/** Стилі, без яких ProseMirror працює неправильно: Tiptap дає їх власним `<style>`. */
const ENGINE_CLASS =
  "relative whitespace-break-spaces outline-none [font-variant-ligatures:none] [&_.ProseMirror-separator]:inline! [&_.ProseMirror-separator]:size-0!"

const PLACEHOLDER_CLASS =
  "[&_p.is-editor-empty:first-child]:before:pointer-events-none [&_p.is-editor-empty:first-child]:before:float-start [&_p.is-editor-empty:first-child]:before:h-0 [&_p.is-editor-empty:first-child]:before:text-muted-foreground [&_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]"

const FOCUS_CLASS =
  "has-[.ProseMirror-focused]:border-ring has-[.ProseMirror-focused]:ring-2 has-[.ProseMirror-focused]:ring-ring"

export interface RichTextHandle {
  focus: () => void
}

export interface RichTextEditorProps {
  id?: string
  /** Документ, простий текст чи порожньо: усе проходить через `toRichText`. */
  value: unknown
  onChange?: (value: RichTextDoc) => void
  onBlur?: () => void
  placeholder?: string
  /** Свій пошук людей; `false` вимикає згадки. Без нього — довідник `users` (`useMentionSearch`). */
  mentions?: MentionSearch | false
  className?: string
  editorRef?: React.Ref<RichTextHandle>
  "aria-label"?: string
  "aria-labelledby"?: string
  "aria-describedby"?: string
  "aria-invalid"?: boolean | "true" | "false"
}

function createExtensions(menu: MentionMenu): Extensions {
  return [
    Document,
    Paragraph,
    Text,
    Bold,
    Italic,
    Blockquote,
    HardBreak,
    BulletList,
    OrderedList,
    FormListItem,
    ListKeymap,
    UndoRedo,
    HrefOnlyLink.configure({
      openOnClick: false,
      // Вставка поверх виділення не питає `isAllowedUri`: посилання зникло б при збереженні мовчки.
      linkOnPaste: false,
      defaultProtocol: "https",
      isAllowedUri: (url) => safeLinkHref(url) !== null,
      HTMLAttributes: { rel: LINK_REL, target: "_blank", class: null },
    }),
    Placeholder.configure({
      // Підпис живе в атрибутах поля: зміна мови не перестворює редактор із набраним текстом.
      placeholder: ({ editor }) => {
        const { attributes } = editor.options.editorProps
        return typeof attributes === "object"
          ? (attributes["aria-placeholder"] ?? "")
          : ""
      },
    }),
    Mention.configure({
      HTMLAttributes: {
        class: richTextMentionClass,
        "data-slot": "rich-text-mention",
      },
      suggestion: {
        pluginKey: MENTION_PLUGIN_KEY,
        render: () => ({
          onStart: menu.update,
          onUpdate: menu.update,
          onExit: menu.close,
          onKeyDown: ({ event }) => {
            // Діалог слухає `document`, а вікно списку до того вже зникло: один Esc закрив би і його.
            if (event.key === "Escape" && menu.getState())
              event.stopPropagation()
            if (hasModifier(event)) return false
            const handled = menu.handleKey(event.key)
            if (handled) event.preventDefault()
            return handled
          },
        }),
      },
    }),
  ]
}

/** Порожній документ редактор будує сам: ProseMirror вимагає хоч один абзац. */
const toContent = (doc: RichTextDoc) =>
  doc.content.length ? (doc as JSONContent) : null

/** Атрибути кореня: ProseMirror записує `undefined` рядком, тож порожні ключі прибираємо. */
function textboxAttributes(
  attributes: Record<string, string | undefined>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(attributes).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
}

/** `<label for>` не фокусує `contenteditable`: клік по підпису робить це вручну. */
function useLabelFocus(labelId: string | undefined, focus: () => void) {
  React.useEffect(() => {
    const label = labelId ? document.getElementById(labelId) : null
    label?.addEventListener("click", focus)
    return () => {
      label?.removeEventListener("click", focus)
    }
  }, [labelId, focus])
}

function Editor({
  id,
  value,
  onChange,
  onBlur,
  placeholder,
  search,
  className,
  editorRef,
  "aria-label": label,
  "aria-labelledby": labelledBy,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
}: Omit<RichTextEditorProps, "mentions"> & { search: MentionSearch | null }) {
  const [menu] = React.useState(createMentionMenu)
  const [extensions] = React.useState(() => createExtensions(menu))
  const [initial] = React.useState(() => {
    const doc = toRichText(value)
    return { content: toContent(doc), json: JSON.stringify(doc) }
  })
  React.useEffect(() => {
    menu.setSearch(search)
  }, [menu, search])
  const isInvalid = invalid === true || invalid === "true"
  const hasMentions = search !== null
  const editorProps = React.useMemo(
    () => ({
      attributes: textboxAttributes({
        id,
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
        "aria-labelledby": labelledBy,
        "aria-describedby": describedBy,
        "aria-invalid": isInvalid ? "true" : undefined,
        "aria-placeholder": placeholder,
        "aria-autocomplete": hasMentions ? "list" : undefined,
        class: cn(
          richTextContentClass,
          richTextBodyClass,
          ENGINE_CLASS,
          PLACEHOLDER_CLASS,
        ),
      }),
    }),
    [id, label, labelledBy, describedBy, isInvalid, placeholder, hasMentions],
  )
  const emitted = React.useRef(initial.json)
  const editor = useEditor({
    extensions,
    content: initial.content,
    editorProps,
    injectCSS: false,
    onUpdate: ({ editor: current }) => {
      const doc = toRichText(current.getJSON())
      emitted.current = JSON.stringify(doc)
      onChange?.(doc)
    },
  })
  React.useEffect(() => {
    const doc = toRichText(value)
    const next = JSON.stringify(doc)
    if (next === emitted.current) return
    emitted.current = next
    // Поза історією: Ctrl+Z не повертає текст попереднього запису у форму.
    editor
      .chain()
      .setMeta("addToHistory", false)
      .setContent(toContent(doc), { emitUpdate: false })
      .run()
  }, [editor, value])
  const focus = React.useCallback(() => {
    editor.commands.focus()
  }, [editor])
  React.useImperativeHandle(editorRef, () => ({ focus }), [focus])
  useLabelFocus(labelledBy, focus)
  const dismissMention = React.useCallback(() => {
    exitSuggestion(editor.view, MENTION_PLUGIN_KEY)
  }, [editor])
  return (
    // eslint-disable-next-line jsx-a11y-x/no-noninteractive-element-interactions -- вихід фокуса з усього поля, а не з кнопки всередині
    <div
      role="group"
      aria-label={label}
      aria-labelledby={labelledBy}
      data-slot="rich-text-field"
      className={cn(
        richTextFrameClass,
        FOCUS_CLASS,
        isInvalid && richTextInvalidClass,
        className,
      )}
      onBlur={(event) => {
        // Список живе, поки курсор у тексті: кнопки панелі теж у межах поля. Перехід в інше вікно
        // його не закриває: людина повернеться дописати ім'я, а закритий запит сам не відкриється.
        if (
          event.target === editor.view.dom &&
          document.hasFocus() &&
          menu.getState()
        )
          dismissMention()
        const next = event.relatedTarget
        if (event.currentTarget.contains(next)) return
        if (next?.closest(FIELD_PORTALS)) return
        onBlur?.()
      }}
    >
      <RichTextToolbar editor={editor} hasMentions={hasMentions} />
      <EditorContent editor={editor} />
      {search ? (
        <RichTextMentions
          editor={editor}
          menu={menu}
          onDismiss={dismissMention}
        />
      ) : null}
    </div>
  )
}

/** Довідник людей вимагає контекст застосунку: поле зі своїм пошуком чи без згадок працює й без нього. */
function DirectoryEditor(props: Omit<RichTextEditorProps, "mentions">) {
  const search = useMentionSearch()
  return <Editor {...props} search={search} />
}

export function RichTextEditor({ mentions, ...props }: RichTextEditorProps) {
  if (mentions === undefined) return <DirectoryEditor {...props} />
  return <Editor {...props} search={mentions || null} />
}
