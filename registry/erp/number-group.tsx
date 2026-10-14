"use client"

import * as React from "react"

import { useErpUiT } from "@/registry/lib/i18n"
import { InputGroup } from "@/registry/ui/input-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/registry/ui/tooltip"

/**
 * Група поля числа й захист поля без дробу — частина `erp/number-input` (0.5d-fix).
 *
 * react-number-format при `decimalScale: 0` відкидає лише роздільник, тож «12,5» з клавіатури
 * ставало 125, а вставлене «12.5» — теж 125. Тому в полі без дробу кома й крапка не вводяться,
 * цифри дробу одразу за ними — теж, вставлений дріб — так само; під полем спливає підказка.
 */

type GuardHandlers = Pick<
  React.ComponentProps<"input">,
  "onKeyDown" | "onBeforeInput" | "onPaste" | "onPointerDown" | "onBlur"
>

/** Клавіші, якими переносять каретку: після них дріб уже не вводиться, навіть на тому ж місці. */
const CARET_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
])

/** Позиція каретки або null, якщо виділено текст. */
const caretOf = (input: HTMLInputElement) =>
  input.selectionStart === input.selectionEnd ? input.selectionStart : null

/**
 * Обробники поля без дробу. «Цифра дробу» — цифра на тому самому місці, де відхилили кому, поки
 * поле не змінилось: стерли, перенесли каретку чи виділили текст — і цифри знову вводяться, хоч
 * якою клавішею (на Android клавіші приходять як «Unidentified»).
 *
 * `handlers` — обробники власника поля (напр. `field.onBlur` з react-hook-form): викликаються
 * першими.
 */
function useWholeNumberGuard(
  isWhole: boolean,
  separators: string[],
  handlers: GuardHandlers,
) {
  const [hinted, setHinted] = React.useState(false)
  // Ref, а не стан: keydown і beforeinput однієї клавіші приходять до рендеру.
  const fractionAt = React.useRef<{ value: string; caret: number } | null>(null)
  const hide = () => {
    fractionAt.current = null
    setHinted(false)
  }
  if (!isWhole) return { guard: {}, hinted: false, hide }

  /** Чи відхилити текст: роздільник або цифра дробу. `typed` — одна клавіша, не вставка. */
  const rejects = (input: HTMLInputElement, text: string, typed: boolean) => {
    if (separators.some((char) => text.includes(char))) {
      const caret = caretOf(input)
      fractionAt.current =
        typed && caret !== null ? { value: input.value, caret } : null
      setHinted(true)
      return true
    }
    const at = fractionAt.current
    if (
      typed &&
      at &&
      /^\d$/.test(text) &&
      at.value === input.value &&
      at.caret === caretOf(input)
    )
      return true
    // Прийнята цифра — дробу вже немає. Пробіл чи літера між комою й цифрою дріб не закінчують.
    if (/\d/.test(text)) hide()
    return false
  }
  /** Поле лише для читання чи клавіша, яку вже обробив власник поля, — не наша справа. */
  const skips = (event: React.SyntheticEvent<HTMLInputElement>) =>
    event.defaultPrevented || event.currentTarget.readOnly

  const guard: GuardHandlers = {
    onKeyDown: (event) => {
      handlers.onKeyDown?.(event)
      if (skips(event)) return
      const { key } = event
      const isChar =
        key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey
      if (isChar && rejects(event.currentTarget, key, true))
        event.preventDefault()
      else if (CARET_KEYS.has(key)) hide()
    },
    // Символ, якого не видно в keydown (Android). Після композиції (IME) текст уже вставлено:
    // скасувати не вийде, тож лише показуємо підказку.
    onBeforeInput: (event) => {
      handlers.onBeforeInput?.(event)
      if (skips(event)) return
      const typed =
        event.data.length === 1 && event.nativeEvent.type !== "compositionend"
      if (rejects(event.currentTarget, event.data, typed))
        event.preventDefault()
    },
    onPaste: (event) => {
      handlers.onPaste?.(event)
      if (skips(event)) return
      const text = event.clipboardData.getData("text")
      if (rejects(event.currentTarget, text, false)) event.preventDefault()
    },
    onPointerDown: (event) => {
      handlers.onPointerDown?.(event)
      hide()
    },
    onBlur: (event) => {
      handlers.onBlur?.(event)
      hide()
    },
  }
  return { guard, hinted, hide }
}

/**
 * Група поля. Без дробу — ще й підказка: спливає під полем, тож не зсуває рядок таблиці чи
 * панель фільтрів, а live-регіон усередині групи озвучує її скрінрідеру.
 */
function NumberGroup({
  isWhole,
  hinted,
  onDismiss,
  className,
  children,
}: {
  isWhole: boolean
  hinted: boolean
  onDismiss: () => void
  className?: string
  children: React.ReactNode
}) {
  const t = useErpUiT()
  const hint = t("validation.number.whole")
  // Обгортка однакова для будь-якої точності: зміна валюти (UAH → JPY) не перемонтовує поле.
  // Поле з дробом підказки не має — `disabled` вимикає слухачі наведення й фокусу.
  return (
    <Tooltip
      open={isWhole && hinted}
      disabled={!isWhole}
      // Escape ховає підказку (WCAG 1.4.13), а наступний — уже закриває діалог, як з будь-якою
      // підказкою. Без цього керований `open` ігнорує закриття, а Base UI глушить Escape.
      onOpenChange={(open, details) => {
        if (!open && details.reason === "escape-key") onDismiss()
      }}
    >
      <TooltipTrigger
        render={(triggerProps) => (
          // data-slot групи, а не тригера: на нього спираються стилі `Field` і `InputGroup`.
          <InputGroup
            {...triggerProps}
            data-slot="input-group"
            className={className}
          >
            {children}
            {isWhole ? (
              <span role="status" className="sr-only">
                {hinted ? hint : null}
              </span>
            ) : null}
          </InputGroup>
        )}
      />
      <TooltipContent side="bottom" align="start">
        {hint}
      </TooltipContent>
    </Tooltip>
  )
}

export { NumberGroup, useWholeNumberGuard }
