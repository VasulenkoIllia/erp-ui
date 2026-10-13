"use client"

import * as React from "react"
import { Autocomplete } from "@base-ui/react/autocomplete"
import { SearchIcon, type LucideIcon } from "lucide-react"

import { useErpUiT, useLanguage } from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"
import { Button } from "@/registry/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/registry/ui/dialog"
import { Kbd } from "@/registry/ui/kbd"

/**
 * Палітра команд UI15 (SPEC §7, PF06): Cmd/Ctrl+K з будь-якого місця, пошук розділів і дій.
 * Побудована на Base UI Autocomplete (ADR-0008) — без cmdk.
 *
 * - `commands` — плоский список; групи — за полем `group` у порядку першої появи.
 * - Пошук — за назвою й `keywords` без урахування регістру й діакритики.
 * - Enter виконує підсвічену команду, Esc закриває палітру.
 */
export interface PaletteCommand {
  id: string
  label: string
  /** Назва групи: «Розділи», «Дії», «Вигляд»… */
  group: string
  icon?: LucideIcon
  /** Додаткові слова для пошуку (синоніми, англійська назва, ID модуля). */
  keywords?: string[]
  /** Підказка праворуч: поєднання клавіш чи розділ. */
  hint?: string
  onSelect: () => void
}

interface CommandGroup {
  value: string
  items: PaletteCommand[]
}

export function isMacPlatform(): boolean {
  return (
    typeof navigator !== "undefined" &&
    /Mac|iP(hone|ad)/.test(navigator.userAgent)
  )
}

/** Ctrl+K або ⌘K відкриває палітру — також із поля вводу, як у більшості застосунків. */
export function useCommandPaletteShortcut(onOpen: () => void) {
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        onOpen()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [onOpen])
}

/** Кнопка пошуку в топбарі: на вузьких екранах — лише іконка. */
export function CommandPaletteTrigger({
  compact = false,
  className,
  ...props
}: React.ComponentProps<typeof Button> & { compact?: boolean }) {
  const t = useErpUiT()
  const shortcut = isMacPlatform() ? "⌘K" : "Ctrl K"
  if (compact) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("commandPalette.open")}
        aria-keyshortcuts={isMacPlatform() ? "Meta+K" : "Control+K"}
        className={className}
        {...props}
      >
        <SearchIcon aria-hidden />
      </Button>
    )
  }
  return (
    <Button
      variant="outline"
      aria-keyshortcuts={isMacPlatform() ? "Meta+K" : "Control+K"}
      className={cn(
        "justify-start gap-2 font-normal text-muted-foreground",
        className,
      )}
      {...props}
    >
      <SearchIcon aria-hidden />
      <span className="flex-1 text-left">{t("commandPalette.open")}</span>
      <Kbd>{shortcut}</Kbd>
    </Button>
  )
}

export function CommandPalette({
  open,
  onOpenChange,
  commands,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  commands: PaletteCommand[]
}) {
  const t = useErpUiT()
  const { locale } = useLanguage()
  const { contains } = Autocomplete.useFilter({ sensitivity: "base", locale })

  const groups = React.useMemo(() => {
    const byName = new Map<string, CommandGroup>()
    for (const command of commands) {
      const group = byName.get(command.group)
      if (group) group.items.push(command)
      else byName.set(command.group, { value: command.group, items: [command] })
    }
    return [...byName.values()]
  }, [commands])

  const filter = React.useCallback(
    (command: PaletteCommand, query: string) =>
      contains(command.label, query) ||
      (command.keywords ?? []).some((word) => contains(word, query)),
    [contains],
  )

  const run = (command: PaletteCommand) => {
    onOpenChange(false)
    command.onSelect()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* erp-ui: палітра — угорі екрана, як пошук, а не по центру, як підтвердження. */}
      <DialogContent
        showCloseButton={false}
        className="top-16 max-h-[calc(100dvh-8rem)] translate-y-0 gap-0 overflow-hidden p-0 sm:top-24 sm:max-w-lg" // erp-ui: allow-raw-value — висота під верхнім відступом
      >
        <DialogTitle className="sr-only">
          {t("commandPalette.label")}
        </DialogTitle>
        <Autocomplete.Root
          open
          inline
          items={groups}
          filter={filter}
          itemToStringValue={(command: PaletteCommand) => command.label}
          autoHighlight="always"
          keepHighlight
        >
          <div className="flex items-center gap-2 border-b px-3">
            <SearchIcon
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground"
            />
            <Autocomplete.Input
              aria-label={t("commandPalette.open")}
              placeholder={t("commandPalette.placeholder")}
              className="h-12 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
            />
          </div>
          <div className="min-h-0 overflow-y-auto p-1">
            <Autocomplete.Empty>
              <p className="px-3 py-6 text-center text-muted-foreground">
                {t("commandPalette.empty")}
              </p>
            </Autocomplete.Empty>
            <Autocomplete.List>
              {(group: CommandGroup) => (
                <Autocomplete.Group
                  key={group.value}
                  items={group.items}
                  className="not-last:mb-1"
                >
                  <Autocomplete.GroupLabel className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    {group.value}
                  </Autocomplete.GroupLabel>
                  <Autocomplete.Collection>
                    {(command: PaletteCommand) => {
                      const Icon = command.icon
                      return (
                        <Autocomplete.Item
                          key={command.id}
                          value={command}
                          onClick={() => {
                            run(command)
                          }}
                          className="flex min-h-control cursor-default items-center gap-2 rounded-md px-2 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                        >
                          {Icon ? (
                            <Icon aria-hidden className="size-4 shrink-0" />
                          ) : null}
                          <span className="min-w-0 flex-1 truncate">
                            {command.label}
                          </span>
                          {command.hint ? (
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {command.hint}
                            </span>
                          ) : null}
                        </Autocomplete.Item>
                      )
                    }}
                  </Autocomplete.Collection>
                </Autocomplete.Group>
              )}
            </Autocomplete.List>
          </div>
          <div
            aria-hidden
            className="hidden items-center gap-3 border-t px-3 py-2 text-xs text-muted-foreground sm:flex"
          >
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              {t("commandPalette.navigate")}
            </span>
            <span className="flex items-center gap-1">
              <Kbd>Enter</Kbd>
              {t("commandPalette.run")}
            </span>
            <span className="flex items-center gap-1">
              <Kbd>Esc</Kbd>
              {t("commandPalette.close")}
            </span>
          </div>
        </Autocomplete.Root>
      </DialogContent>
    </Dialog>
  )
}
