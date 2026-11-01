import * as React from "react"
import { Toolbar } from "@base-ui/react/toolbar"
import type { Editor } from "@tiptap/core"
import { useEditorState } from "@tiptap/react"
import {
  AtSignIcon,
  BoldIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  type LucideIcon,
} from "lucide-react"

import { useErpUiT } from "@/registry/lib/i18n"
import { linkFromInput } from "@/registry/lib/rich-text"
import { Button } from "@/registry/ui/button"
import { Field, FieldError, FieldLabel } from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/registry/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/registry/ui/tooltip"

/**
 * Кнопки оформлення (UI12, ADR-0052): одна зупинка Tab, стрілки ходять між кнопками (Base UI Toolbar).
 * Посилання — власне спливне вікно без `<form>`: поле може стояти у формі запису, а вкладена форма
 * віддала б Enter батьківській навіть через портал.
 */
type ToggleName =
  "bold" | "italic" | "bulletList" | "orderedList" | "blockquote"

const TOGGLES: readonly {
  name: ToggleName
  icon: LucideIcon
  run: (editor: Editor) => boolean
}[] = [
  {
    name: "bold",
    icon: BoldIcon,
    run: (editor) => editor.chain().focus().toggleBold().run(),
  },
  {
    name: "italic",
    icon: ItalicIcon,
    run: (editor) => editor.chain().focus().toggleItalic().run(),
  },
  {
    name: "bulletList",
    icon: ListIcon,
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    name: "orderedList",
    icon: ListOrderedIcon,
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    name: "blockquote",
    icon: QuoteIcon,
    run: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
]

function ToolbarButton({
  label,
  icon: Icon,
  pressed,
  trigger,
  isTooltipOff,
  onClick,
}: {
  label: string
  icon: LucideIcon
  pressed?: boolean
  /** Обгортка кнопки: відкриває спливне вікно. */
  trigger?: (button: React.ReactElement) => React.ReactElement
  /** Вікно кнопки відкрито: підказка не перекриває його й не забирає перший Esc. */
  isTooltipOff?: boolean
  onClick?: () => void
}) {
  const button = (
    <Toolbar.Button
      render={
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-pressed={pressed}
          className="aria-pressed:bg-muted aria-pressed:text-foreground forced-colors:aria-pressed:outline-2 forced-colors:aria-pressed:outline-solid"
          onClick={onClick}
        />
      }
    >
      <Icon aria-hidden />
    </Toolbar.Button>
  )
  return (
    <Tooltip disabled={isTooltipOff}>
      <TooltipTrigger render={trigger ? trigger(button) : button} />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** Вставити посилання: на виділений текст, а без виділення — саму адресу. */
function applyLink(editor: Editor, href: string) {
  const chain = editor.chain().focus().extendMarkRange("link")
  if (editor.state.selection.empty && !editor.isActive("link")) {
    chain
      .insertContent({
        type: "text",
        text: href,
        marks: [{ type: "link", attrs: { href } }],
      })
      .run()
  } else {
    chain.setLink({ href }).run()
  }
}

function LinkButton({ editor, active }: { editor: Editor; active: boolean }) {
  const t = useErpUiT()
  const id = React.useId()
  const [open, setOpen] = React.useState(false)
  const [address, setAddress] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const apply = () => {
    const href = linkFromInput(address)
    if (!href) {
      setInvalid(true)
      return
    }
    applyLink(editor, href)
    setOpen(false)
  }
  const remove = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run()
    setOpen(false)
  }
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setAddress(String(editor.getAttributes("link").href ?? ""))
          setInvalid(false)
        }
        setOpen(next)
      }}
    >
      <ToolbarButton
        label={t("richText.link")}
        icon={LinkIcon}
        pressed={active}
        trigger={(button) => <PopoverTrigger render={button} />}
        isTooltipOff={open}
      />
      <PopoverContent
        align="start"
        finalFocus={() => editor.view.dom}
        className="max-w-(--available-width)"
      >
        <Field data-invalid={invalid ? true : undefined}>
          <FieldLabel htmlFor={id}>{t("richText.linkAddress")}</FieldLabel>
          <Input
            id={id}
            type="url"
            inputMode="url"
            value={address}
            aria-invalid={invalid ? true : undefined}
            aria-describedby={invalid ? `${id}-error` : undefined}
            onChange={(event) => {
              setAddress(event.target.value)
              setInvalid(false)
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return
              event.preventDefault()
              apply()
            }}
          />
          {invalid ? (
            <FieldError id={`${id}-error`}>
              {t("richText.linkInvalid")}
            </FieldError>
          ) : null}
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={apply}>
            {t("richText.linkApply")}
          </Button>
          {active ? (
            <Button type="button" size="sm" variant="outline" onClick={remove}>
              {t("richText.linkRemove")}
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** «@» запускає той самий пошук, що й друк: кнопка для дотику й для тих, хто не знає про символ. */
function startMention(editor: Editor) {
  const { from } = editor.state.selection
  const before = editor.state.doc.textBetween(
    Math.max(from - 1, 0),
    from,
    "\n",
    "\n",
  )
  editor
    .chain()
    .focus()
    .insertContent(before && !/\s/.test(before) ? " @" : "@")
    .run()
}

export function RichTextToolbar({
  editor,
  hasMentions,
}: {
  editor: Editor
  hasMentions: boolean
}) {
  const t = useErpUiT()
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      bulletList: current.isActive("bulletList"),
      orderedList: current.isActive("orderedList"),
      blockquote: current.isActive("blockquote"),
      link: current.isActive("link"),
    }),
  })
  return (
    <Toolbar.Root
      aria-label={t("richText.toolbar")}
      data-slot="rich-text-toolbar"
      className="flex flex-wrap items-center gap-0.5 border-b border-input p-1"
    >
      {TOGGLES.map(({ name, icon, run }) => (
        <ToolbarButton
          key={name}
          label={t(`richText.${name}`)}
          icon={icon}
          pressed={active[name]}
          onClick={() => {
            run(editor)
          }}
        />
      ))}
      <LinkButton editor={editor} active={active.link} />
      {hasMentions ? (
        <ToolbarButton
          label={t("richText.mention")}
          icon={AtSignIcon}
          onClick={() => {
            startMention(editor)
          }}
        />
      ) : null}
    </Toolbar.Root>
  )
}
