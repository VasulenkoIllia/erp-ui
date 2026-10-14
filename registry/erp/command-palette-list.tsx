"use client"

import * as React from "react"
import { Autocomplete } from "@base-ui/react/autocomplete"
import { SearchIcon } from "lucide-react"

import type { PaletteCommand } from "@/registry/erp/command-palette"
import { useErpUiT, useLanguage } from "@/registry/lib/i18n"
import { Kbd } from "@/registry/ui/kbd"

/**
 * Пошук і список палітри команд (erp/command-palette) на Base UI Autocomplete. Окремий файл, бо
 * палітра вантажить його окремим чанком: Autocomplete не входить у перший екран (ADR-0009).
 */
interface CommandGroup {
  value: string
  items: PaletteCommand[]
}

export function CommandPaletteList({
  commands,
  onRun,
}: {
  commands: PaletteCommand[]
  onRun: (command: PaletteCommand) => void
}) {
  const t = useErpUiT()
  const { locale } = useLanguage()
  const { contains } = Autocomplete.useFilter({ sensitivity: "base", locale })
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Діалог відкрився раніше, ніж завантажився цей файл, і Base UI поставив фокус на сам діалог —
  // переносимо в пошук. Base UI ставить фокус у requestAnimationFrame, тож перевіряємо й після нього.
  // Якщо список був готовий одразу, фокус у пошук ставить сам Base UI.
  React.useEffect(() => {
    const focusSearch = () => {
      const input = inputRef.current
      if (input && document.activeElement === input.closest("[role=dialog]"))
        input.focus()
    }
    focusSearch()
    const frame = requestAnimationFrame(focusSearch)
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [])

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

  return (
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
          ref={inputRef}
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
                        onRun(command)
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
  )
}
