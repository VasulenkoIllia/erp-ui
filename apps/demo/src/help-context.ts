import { createContext } from "react"

import type { ProjectShortcut } from "@/registry/lib/shortcuts"

/**
 * Відкрити довідку клавіш оболонки (ADR-0042). Сторінка демо показує клавіші проекту через неї, а не
 * своїм `ShortcutsHelp`: другий імпорт компонента, навіть лінивий, розсипає спільний код вхідного
 * чанка на дрібні файли (+4 КБ gzip кожній сторінці).
 */
export const OpenHelpContext = createContext<
  (extra?: readonly ProjectShortcut[]) => void
>(() => undefined)
