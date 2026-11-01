import * as React from "react"
import type { Editor } from "@tiptap/core"

import { announce } from "@/registry/lib/announce"
import { useErpUiT, type ErpUiTranslate } from "@/registry/lib/i18n"
import type { MentionMenu, MentionMenuState } from "@/registry/lib/mention-menu"
import { Button } from "@/registry/ui/button"
import { Popover, PopoverContent } from "@/registry/ui/popover"
import { Spinner } from "@/registry/ui/spinner"

/**
 * Список згадок під курсором (UI12, ADR-0052). Фокус лишається в тексті: людина далі друкує, а стрілки
 * міняють `aria-activedescendant` поля. Це підказка під час введення, а не вибір значення, тому
 * на телефоні вона теж біля курсора: нижня шторка (UI38) сховала б клавіатуру.
 *
 * Спливне вікно Base UI, а не `mount` плагіна: усередині діалогу воно входить у його дерево, тож клік
 * у списку не закриває сам діалог. Esc до діалогу не доходить: його зупиняє редактор.
 */
const keepEditorFocus = (event: React.MouseEvent) => {
  event.preventDefault()
}

const isVisible = (state: MentionMenuState) =>
  state.status !== "loading" || state.items.length > 0 || state.slow

/** Поле тексту веде скрінрідер по списку, хоч фокус у ньому. */
function useTextboxLink(
  editor: Editor,
  listId: string | undefined,
  activeId: string | undefined,
) {
  React.useEffect(() => {
    // Без списку `editor.view` не чіпаємо: на першому рендері редактор ще не змонтовано.
    if (!listId || !activeId) return
    const { dom } = editor.view
    dom.setAttribute("aria-controls", listId)
    dom.setAttribute("aria-activedescendant", activeId)
    document.getElementById(activeId)?.scrollIntoView({ block: "nearest" })
    return () => {
      dom.removeAttribute("aria-controls")
      dom.removeAttribute("aria-activedescendant")
    }
  }, [editor, listId, activeId])
}

function useResultAnnouncement(
  status: MentionMenuState["status"] | undefined,
  count: number,
  t: ErpUiTranslate,
) {
  React.useEffect(() => {
    if (status === "ready")
      return announce(
        count
          ? t("richText.mentionsFound", { count })
          : t("richText.mentionsEmpty"),
      )
    if (status === "failed") return announce(t("richText.mentionsFailed"))
  }, [status, count, t])
}

function MentionOptions({
  id,
  state,
  menu,
}: {
  id: string
  state: MentionMenuState
  menu: MentionMenu
}) {
  const t = useErpUiT()
  return (
    <div
      id={id}
      role="listbox"
      aria-label={t("richText.mention")}
      aria-busy={state.status === "loading" || undefined}
      className="max-h-64 overflow-y-auto"
    >
      {state.items.map((item, index) => (
        <button
          key={item.id}
          id={`${id}-${index}`}
          type="button"
          role="option"
          aria-selected={index === state.active}
          tabIndex={-1}
          className="group flex min-h-touch w-full min-w-0 flex-col justify-center rounded-md px-2 py-1 text-start text-sm outline-none hover:bg-muted aria-selected:bg-accent aria-selected:text-accent-foreground forced-colors:aria-selected:outline-2 forced-colors:aria-selected:outline-solid"
          onClick={() => {
            menu.select(index)
          }}
        >
          <span className="truncate font-medium">{item.label}</span>
          {item.hint ? (
            <span className="truncate text-xs text-muted-foreground group-aria-selected:text-accent-foreground">
              {item.hint}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  )
}

function MentionStatus({
  state,
  menu,
}: {
  state: MentionMenuState
  menu: MentionMenu
}) {
  const t = useErpUiT()
  if (state.status === "failed")
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 p-1">
        <span>{t("richText.mentionsFailed")}</span>
        <Button type="button" size="sm" variant="outline" onClick={menu.retry}>
          {t("pageState.error.retry")}
        </Button>
      </div>
    )
  if (state.status === "ready")
    return (
      <p className="p-1 text-muted-foreground">{t("richText.mentionsEmpty")}</p>
    )
  return (
    <p className="flex items-center gap-2 p-1 text-muted-foreground">
      <Spinner aria-hidden className="size-4" />
      {t("richText.mentionsSearching")}
    </p>
  )
}

/** Вікно монтується лише зі станом списку: до першого «@» редактор ще може бути не змонтований. */
function MentionPopup({
  editor,
  menu,
  state,
  id,
  hasList,
  onDismiss,
}: {
  editor: Editor
  menu: MentionMenu
  state: MentionMenuState
  id: string
  hasList: boolean
  onDismiss: () => void
}) {
  const t = useErpUiT()
  const anchor = React.useMemo(
    () => ({
      contextElement: editor.view.dom,
      getBoundingClientRect: () =>
        menu.getState()?.anchor() ?? new DOMRect(0, 0, 0, 0),
    }),
    [editor, menu],
  )
  return (
    <Popover
      open={isVisible(state)}
      onOpenChange={(next) => {
        if (!next) onDismiss()
      }}
    >
      <PopoverContent
        anchor={anchor}
        align="start"
        role="group"
        aria-label={t("richText.mention")}
        data-slot="rich-text-mentions"
        initialFocus={false}
        finalFocus={false}
        className="max-w-(--available-width) gap-0 p-1"
        onMouseDown={keepEditorFocus}
      >
        {hasList ? (
          <MentionOptions id={id} state={state} menu={menu} />
        ) : (
          <MentionStatus state={state} menu={menu} />
        )}
      </PopoverContent>
    </Popover>
  )
}

export function RichTextMentions({
  editor,
  menu,
  onDismiss,
}: {
  editor: Editor
  menu: MentionMenu
  /** Закрили Esc чи кліком поза списком: плагін має вийти із запиту. */
  onDismiss: () => void
}) {
  const t = useErpUiT()
  const state = React.useSyncExternalStore(menu.subscribe, menu.getState)
  const id = React.useId()
  const count = state?.items.length ?? 0
  const hasList = state !== null && isVisible(state) && count > 0
  useTextboxLink(
    editor,
    hasList ? id : undefined,
    hasList ? `${id}-${state.active}` : undefined,
  )
  useResultAnnouncement(state?.status, count, t)
  if (!state) return null
  return (
    <MentionPopup
      editor={editor}
      menu={menu}
      state={state}
      id={id}
      hasList={hasList}
      onDismiss={onDismiss}
    />
  )
}
