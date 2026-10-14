"use client"

import * as React from "react"
import { toast } from "sonner"

import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import { useErpUiT } from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"
import { Button } from "@/registry/ui/button"
import { Spinner } from "@/registry/ui/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/registry/ui/tooltip"

/**
 * Редагування в комірці (SPEC §8.1 стан 16, §8.2; ADR-0018): для `cell` колонки erp/data-table,
 * працює й у картках на телефоні.
 *
 * - Значення — кнопка: Enter, пробіл, клік чи F2 відкривають редактор — одне поле в комірці (грід
 *   W3C APG фокусує його сам). Enter — зберегти, Escape — скасувати, вихід фокуса — зберегти, якщо
 *   значення правильне. Фокус повертається на значення.
 * - `validate` — помилка спливає під полем (рядок не зсувається) і звучить для скрінрідера; редактор
 *   лишається, введене не губиться (§8.3).
 * - Оптимістично (`useOptimistic`, §8.2): нове значення видно одразу, поки триває `onSave`.
 *   Відхилений `onSave` — значення повертається саме, а сповіщення пояснює чому й пропонує
 *   «Повторити». `onError` обробляє помилку сам (конфлікт версій — діалог) і повертає true.
 * - Без права (`readOnly`) — лише значення (причину пояснює дія «Редагувати» в рядку, §8.4).
 */

export interface CellEditorProps<V> {
  value: V
  onChange: (value: V) => void
  /**
   * Передати полю: фокус, підпис, стан помилки, клавіші й вихід фокуса. `ref` фокусує поле, щойно
   * воно змонтувалось, тож редактор може бути лінивим (`React.lazy` у `Suspense`).
   */
  inputProps: {
    ref: React.RefCallback<HTMLInputElement>
    "aria-label": string
    "aria-invalid": true | undefined
    "aria-describedby": string | undefined
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void
    onBlur: (event: React.FocusEvent<HTMLInputElement>) => void
  }
}

export interface EditableCellProps<V> {
  value: V
  /** Назва поля: підпис редактора й текст про відкат («Клієнт»). */
  label: string
  /** Запис для сповіщення про відкат: номер рахунку. */
  recordLabel?: string
  display: (value: V) => React.ReactNode
  editor: (props: CellEditorProps<V>) => React.ReactNode
  /** Текст помилки або null. */
  validate?: (value: V) => string | null
  equals?: (a: V, b: V) => boolean
  /** Зберегти; відхилений проміс — відкат і пояснення. */
  onSave: (value: V) => Promise<unknown>
  /** Своя обробка помилки (конфлікт — діалог); true — сповіщення кіта не потрібне. */
  onError?: (error: unknown, value: V) => boolean
  readOnly?: boolean
  align?: "start" | "end"
}

/**
 * Поле редактора монтується лише на час редагування — фокус одразу. Лінивий редактор міг
 * з'явитись, коли людина вже перейшла деінде: тоді фокус не забираємо.
 */
const focusOnMount = (input: HTMLInputElement | null) => {
  const active = input?.ownerDocument.activeElement
  if (input && (!active || active === input.ownerDocument.body)) input.focus()
}

export function EditableCell<V>({
  value,
  label,
  recordLabel,
  display,
  editor,
  validate,
  equals = Object.is,
  onSave,
  onError,
  readOnly = false,
  align = "start",
}: EditableCellProps<V>) {
  const t = useErpUiT()
  const errorMessage = useApiErrorMessage()
  const issueId = React.useId()
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(value)
  const [issue, setIssue] = React.useState<string | null>(null)
  const [shown, setShown] = React.useOptimistic(value)
  const [saving, startSaving] = React.useTransition()
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  // Редактор закривається сам (Enter, Escape): вихід фокуса тоді не зберігає вдруге.
  const closing = React.useRef(false)
  const refocus = React.useRef(false)
  // «Повторити» в сповіщенні — з актуальними обробниками: версія запису могла змінитись.
  const handlers = React.useRef({ onSave, onError })
  React.useLayoutEffect(() => {
    handlers.current = { onSave, onError }
  })

  React.useLayoutEffect(() => {
    if (editing || !refocus.current) return
    refocus.current = false
    buttonRef.current?.focus()
  }, [editing])

  if (readOnly) return <>{display(value)}</>

  const save = (next: V) => {
    startSaving(async () => {
      setShown(next)
      try {
        await handlers.current.onSave(next)
      } catch (error) {
        if (handlers.current.onError?.(error, next)) return
        const field = recordLabel ? `${label}, ${recordLabel}` : label
        toast.error(
          t("editableCell.failed", { field, message: errorMessage(error) }),
          {
            // З дією — до взаємодії (SPEC §8.2).
            duration: Number.POSITIVE_INFINITY,
            action: {
              label: t("editableCell.retry"),
              onClick: () => {
                // Сповіщення зникне: фокус — на комірку, якщо вона ще на екрані.
                buttonRef.current?.focus()
                save(next)
              },
            },
          },
        )
      }
    })
  }

  const close = (focusValue: boolean) => {
    closing.current = true
    refocus.current = focusValue
    setIssue(null)
    setEditing(false)
  }

  const commit = (focusValue: boolean) => {
    const problem = validate?.(draft) ?? null
    if (problem) {
      setIssue(problem)
      return
    }
    close(focusValue)
    if (!equals(draft, shown)) save(draft)
  }

  if (editing)
    return (
      <EditorShell issue={issue} issueId={issueId}>
        <CellEditor
          render={editor}
          value={draft}
          onChange={(next) => {
            setDraft(next)
            setIssue(null)
          }}
          inputProps={{
            ref: focusOnMount,
            "aria-label": label,
            "aria-invalid": issue ? true : undefined,
            "aria-describedby": issue ? issueId : undefined,
            onKeyDown: (event) => {
              // Enter під час набору через IME підтверджує набір, а не значення.
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault()
                commit(true)
              } else if (event.key === "Escape") {
                event.preventDefault()
                close(true)
              }
            },
            onBlur: (event) => {
              // Поле лишилось активним — пішло все вікно (інша програма): редагування триває.
              if (
                closing.current ||
                event.currentTarget === document.activeElement
              )
                return
              commit(false)
            },
          }}
        />
      </EditorShell>
    )

  return (
    <Button
      ref={buttonRef}
      variant="ghost"
      // Від'ємні поля: текст стоїть там, де стояв би без кнопки (під заголовком колонки, на лінії
      // з сусідніми значеннями картки), а ширина — уся комірка. Кнопка виходить за текст на 8 px
      // убік і 4 px угору й униз: картки обрізають із цим запасом (erp/data-table-cards).
      // Зона дотику — 44 px (touch-target кнопки).
      className={cn(
        "-mx-2 -my-1 h-auto max-w-[calc(100%+--spacing(4))] min-w-0 px-2 py-1 font-normal",
        align === "end" ? "justify-end" : "justify-start",
      )}
      onClick={() => {
        closing.current = false
        setDraft(shown)
        setEditing(true)
      }}
      onKeyDown={(event) => {
        if (event.key !== "F2") return
        event.preventDefault()
        event.currentTarget.click()
      }}
    >
      <span className="min-w-0 truncate">{display(shown)}</span>
      {saving ? <Spinner aria-hidden /> : null}
      <span className="sr-only">
        , {saving ? t("editableCell.saving") : t("editableCell.edit")}
      </span>
    </Button>
  )
}

/** Редактор — компонентом: хуки всередині `editor` живуть, лише поки комірка редагується. */
function CellEditor<V>({
  render,
  ...props
}: CellEditorProps<V> & { render: EditableCellProps<V>["editor"] }) {
  return render(props)
}

/** Поле редактора й помилка під ним: спливає (не зсуває рядок) і звучить через live-регіон. */
function EditorShell({
  issue,
  issueId,
  children,
}: {
  issue: string | null
  issueId: string
  children: React.ReactNode
}) {
  return (
    <Tooltip open={issue !== null}>
      <TooltipTrigger
        render={(props) => (
          <div {...props} className="w-full min-w-0">
            {children}
            <span id={issueId} role="status" className="sr-only">
              {issue}
            </span>
          </div>
        )}
      />
      <TooltipContent side="bottom" align="start">
        {issue}
      </TooltipContent>
    </Tooltip>
  )
}
