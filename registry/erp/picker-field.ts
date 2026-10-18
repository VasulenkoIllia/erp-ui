import * as React from "react"
import type { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox"

/**
 * Спільне для `erp/record-picker` і `erp/multi-select` (ADR-0023, ADR-0027): клас кнопки поля,
 * пошук із літери на закритому полі й ref кнопки поля разом із `ref` ззовні.
 */

/**
 * Кнопка поля без висоти: вибір запису — один рядок (`h-control`), мультивибір росте з мітками
 * (`min-h-control`).
 */
export const PICKER_FIELD_CLASS =
  "flex w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-start text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-popup-open:border-ring md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"

/** Друкована клавіша без модифікаторів; пробіл лишається кнопці (відкрити список). */
const isPrintableKey = (event: React.KeyboardEvent) =>
  event.key.length === 1 &&
  event.key !== " " &&
  !event.ctrlKey &&
  !event.metaKey &&
  !event.altKey

/** Обробник клавіш кнопки поля. */
export type PickerFieldKeyDown = NonNullable<
  ComboboxPrimitive.Trigger.Props["onKeyDown"]
>

/**
 * Літера на закритому полі: Base UI вибирав би за нею варіант без списку — натомість поле
 * відкриває список із пошуком від цієї літери (`openWith`).
 */
export function openSearchFromLetter(
  event: Parameters<PickerFieldKeyDown>[0],
  openWith: (query: string) => void,
) {
  if (!isPrintableKey(event)) return
  event.preventBaseUIHandler()
  event.preventDefault()
  openWith(event.key)
}

/** `ref` ззовні (react-hook-form фокусує поле з помилкою) — на ту саму кнопку, що й свій. */
function assignRef(
  ref: React.Ref<HTMLButtonElement> | undefined,
  node: HTMLButtonElement | null,
) {
  if (typeof ref === "function") ref(node)
  else if (ref) ref.current = node
}

/** Свій ref кнопки поля (фокус після «Очистити») разом із `ref` ззовні. */
export function useFieldRef(ref: React.Ref<HTMLButtonElement> | undefined) {
  const fieldRef = React.useRef<HTMLButtonElement | null>(null)
  const setFieldRef = React.useCallback(
    (node: HTMLButtonElement | null) => {
      fieldRef.current = node
      assignRef(ref, node)
    },
    [ref],
  )
  return [fieldRef, setFieldRef] as const
}
