/**
 * Поточні вподобання вигляду й функція їх зміни (див. lib/appearance).
 * Перемальовує компонент при будь-якій зміні — з меню користувача, налаштувань чи іншої вкладки коду.
 */
import { useSyncExternalStore } from "react"

import {
  getAppearance,
  setAppearance,
  subscribeAppearance,
  type Appearance,
} from "@/registry/lib/appearance"

export function useAppearance(): [
  Appearance,
  (patch: Partial<Appearance>) => void,
] {
  const appearance = useSyncExternalStore(
    subscribeAppearance,
    getAppearance,
    getAppearance,
  )
  return [appearance, setAppearance]
}
