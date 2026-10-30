import * as React from "react"

import {
  canFireShortcut,
  matchesShortcut,
  type ShortcutDefinition,
} from "@/registry/lib/shortcuts"

/**
 * Клавіша на весь застосунок із реєстру (lib/shortcuts, ADR-0042). `shortcut` — стала (запис
 * `SHORTCUTS` чи константа модуля), `onPress` — у `useCallback`: новий об'єкт щоразу перепідписує
 * слухача. Клавіша всередині компонента сюди не йде, її обробляє сам компонент.
 */
export function useShortcut(
  shortcut: ShortcutDefinition,
  onPress: () => void,
): void {
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!matchesShortcut(event, shortcut)) return
      if (!canFireShortcut(event, shortcut)) return
      event.preventDefault()
      onPress()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [shortcut, onPress])
}
