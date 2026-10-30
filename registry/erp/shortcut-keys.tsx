import * as React from "react"

import { useErpUiT } from "@/registry/lib/i18n"
import {
  comboLabel,
  isMacPlatform,
  type KeyCombo,
  type ShortcutDefinition,
} from "@/registry/lib/shortcuts"
import { Kbd } from "@/registry/ui/kbd"

/** Символи, які голос читає непередбачувано або мовою системи: для них є слова в мовних пакетах. */
const SPOKEN_KEYS = {
  ArrowUp: "arrowUp",
  ArrowDown: "arrowDown",
  ArrowLeft: "arrowLeft",
  ArrowRight: "arrowRight",
  "+": "plus",
  "-": "minus",
  "?": "question",
} as const

const isSpokenKey = (key: string): key is keyof typeof SPOKEN_KEYS =>
  Object.hasOwn(SPOKEN_KEYS, key)

function ComboKbd({ combo, isMac }: { combo: KeyCombo; isMac: boolean }) {
  const t = useErpUiT()
  const label = comboLabel(combo, isMac)
  const isCommand = combo.mod === true && isMac
  if (!isSpokenKey(combo.key) && !isCommand) return <Kbd>{label}</Kbd>
  const modifier = isCommand
    ? "Command "
    : combo.mod || combo.ctrl
      ? "Ctrl "
      : ""
  return (
    <Kbd>
      <span aria-hidden>{label}</span>
      <span className="sr-only">
        {modifier}
        {isSpokenKey(combo.key)
          ? t(`shortcuts.keys.${SPOKEN_KEYS[combo.key]}`)
          : combo.key.toUpperCase()}
      </span>
    </Kbd>
  )
}

/**
 * Клавіші поєднання з реєстру (lib/shortcuts): на екрані символи, скрінрідеру слова. Кілька клавіш —
 * це варіанти однієї дії, а не послідовність, тож скрінрідер чує між ними «або».
 */
export function ShortcutKeys({ shortcut }: { shortcut: ShortcutDefinition }) {
  const t = useErpUiT()
  const isMac = isMacPlatform()
  return shortcut.keys.map((combo, index) => (
    <React.Fragment
      key={`${combo.mod ? "mod+" : combo.ctrl ? "ctrl+" : ""}${combo.key}`}
    >
      {index > 0 ? (
        <span className="sr-only">{` ${t("shortcuts.or")} `}</span>
      ) : null}
      <ComboKbd combo={combo} isMac={isMac} />
    </React.Fragment>
  ))
}
