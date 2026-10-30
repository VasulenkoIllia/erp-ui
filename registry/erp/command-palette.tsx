import * as React from "react"
import { SearchIcon, type LucideIcon } from "lucide-react"

import { ErrorBoundary } from "@/registry/erp/error-boundary"
import { LoadingFallback } from "@/registry/erp/page-state"
import { ShortcutKeys } from "@/registry/erp/shortcut-keys"
import {
  usePaletteActionGroups,
  type PaletteAction,
} from "@/registry/hooks/use-palette-actions"
import { useShortcut } from "@/registry/hooks/use-shortcut"
import { useErpUiT } from "@/registry/lib/i18n"
import { lazyWithPreload, whenIdle } from "@/registry/lib/lazy"
import {
  ariaKeyShortcuts,
  isMacPlatform,
  SHORTCUTS,
} from "@/registry/lib/shortcuts"
import { cn } from "@/registry/lib/utils"
import { Button } from "@/registry/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/registry/ui/dialog"

/**
 * Палітра команд UI15 (SPEC §7, PF06): Cmd/Ctrl+K з будь-якого місця, пошук розділів і дій.
 * Побудована на Base UI Autocomplete (ADR-0008) — без cmdk.
 *
 * - `commands` — плоский список; групи — за полем `group` у порядку першої появи.
 * - Пошук — за назвою й `keywords` без урахування регістру й діакритики.
 * - Enter виконує підсвічену команду, Esc закриває палітру.
 * - Пошук і список (erp/command-palette-list) — окремий чанк: Autocomplete не входить у перший екран
 *   (ADR-0009). Він вантажиться, коли браузер вільний після старту, а раніше — при наведенні чи
 *   фокусі на кнопці пошуку; збій показує «Спробувати ще» в самій палітрі (erp/error-boundary).
 * - Дії відкритого запису (`usePaletteActions`, ADR-0044) стоять першими; проект їх не передає.
 */
export interface PaletteCommand extends PaletteAction {
  /** Назва групи: «Розділи», «Дії», «Вигляд»… */
  group: string
  icon?: LucideIcon
  /** Підказка праворуч: поєднання клавіш чи розділ. */
  hint?: string
}

const CommandPaletteList = lazyWithPreload(() =>
  import("./command-palette-list").then((m) => m.CommandPaletteList),
)

// Переїхав у lib/shortcuts; цей експорт лишається, бо проекти могли брати його звідси.
export { isMacPlatform }

/** Ctrl+K або ⌘K відкриває палітру — також із поля вводу, як у більшості застосунків. */
export function useCommandPaletteShortcut(onOpen: () => void) {
  // Перше Ctrl+K не чекає на мережу, і набране одразу не губиться.
  React.useEffect(
    () =>
      whenIdle(() => {
        void CommandPaletteList.preload()
      }),
    [],
  )
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Ctrl чи ⌘ натиснули — K, найімовірніше, наступна: список уже в дорозі.
      if (event.key === "Control" || event.key === "Meta")
        void CommandPaletteList.preload()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [])
  useShortcut(SHORTCUTS.palette, onOpen)
}

type ButtonProps = React.ComponentProps<typeof Button>

/** Кнопка пошуку в топбарі: на вузьких екранах — лише іконка. Наведення чи фокус вантажать список. */
export function CommandPaletteTrigger({
  compact = false,
  className,
  onPointerEnter,
  onFocus,
  ...props
}: ButtonProps & { compact?: boolean }) {
  const t = useErpUiT()
  const preload: Pick<ButtonProps, "onPointerEnter" | "onFocus"> = {
    onPointerEnter: (event) => {
      void CommandPaletteList.preload()
      onPointerEnter?.(event)
    },
    onFocus: (event) => {
      void CommandPaletteList.preload()
      onFocus?.(event)
    },
  }
  const keyShortcuts = ariaKeyShortcuts(SHORTCUTS.palette, isMacPlatform())
  if (compact) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("commandPalette.open")}
        aria-keyshortcuts={keyShortcuts}
        className={className}
        {...props}
        {...preload}
      >
        <SearchIcon aria-hidden />
      </Button>
    )
  }
  return (
    <Button
      variant="outline"
      aria-keyshortcuts={keyShortcuts}
      className={cn(
        "justify-start gap-2 font-normal text-muted-foreground",
        className,
      )}
      {...props}
      {...preload}
    >
      <SearchIcon aria-hidden />
      <span className="flex-1 text-left">{t("commandPalette.open")}</span>
      <ShortcutKeys shortcut={SHORTCUTS.palette} />
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
  const recordGroups = usePaletteActionGroups()
  const allCommands = React.useMemo(
    () => [
      ...recordGroups.flatMap(({ key, title, actions }) =>
        actions.map((action) => ({
          ...action,
          id: `record-${key}-${action.id}`,
          group: t("commandPalette.recordGroup", { name: title }),
        })),
      ),
      ...commands,
    ],
    [recordGroups, commands, t],
  )

  const run = (command: PaletteCommand) => {
    if (command.deniedReason) return
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
        <ErrorBoundary className="min-h-0 border-0">
          <React.Suspense fallback={<LoadingFallback className="h-24" />}>
            <CommandPaletteList commands={allCommands} onRun={run} />
          </React.Suspense>
        </ErrorBoundary>
      </DialogContent>
    </Dialog>
  )
}
