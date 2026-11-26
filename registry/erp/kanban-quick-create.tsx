import * as React from "react"
import { PlusIcon } from "lucide-react"

import { useErpUiT } from "@/registry/lib/i18n"
import { ukBoard } from "@/registry/lib/i18n-uk-board"
import { Button } from "@/registry/ui/button"
import { Input } from "@/registry/ui/input"
import { Spinner } from "@/registry/ui/spinner"

/**
 * Швидке створення картки в колонці дошки (erp/kanban, UI07, ADR-0100): кнопка «Додати картку» стає
 * полем назви з «Додати» й «Скасувати». Ставиться разом з erp/kanban.
 *
 * - Enter додає, Esc у полі закриває його й повертає фокус на кнопку. Після створення поле порожнє й лишається
 *   відкритим: наступну картку можна вводити одразу.
 * - Помилку (`onCreate` повертає текст) видно під полем, введене не губиться (SPEC §8.3). Порожня назва —
 *   «Заповніть це поле» без запиту. Повторне натискання, поки йде запит, нічого не надсилає.
 */
export interface KanbanQuickCreateProps {
  /** Назва колонки: «Додати картку в колонку «Нові»». */
  column: string
  /** Підпис поля для скрінрідера: «Назва угоди»; за замовчуванням — «Назва». */
  label?: string
  /** Створити картку; повертає текст помилки чи `undefined`, якщо створено. */
  onCreate: (name: string) => Promise<string | undefined>
}

export function KanbanQuickCreate({
  column,
  label,
  onCreate,
}: KanbanQuickCreateProps) {
  const t = useErpUiT(ukBoard)
  const id = React.useId()
  const [isOpen, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [error, setError] = React.useState<string>()
  const [isPending, setPending] = React.useState(false)
  const input = React.useRef<HTMLInputElement>(null)
  const opener = React.useRef<HTMLButtonElement>(null)
  // Поле з'являється замість кнопки й зникає назад — після рендеру фокус іде за ним (WCAG 2.4.3).
  const focusAfterToggle = React.useRef(false)
  React.useLayoutEffect(() => {
    if (!focusAfterToggle.current) return
    focusAfterToggle.current = false
    ;(isOpen ? input : opener).current?.focus()
  }, [isOpen])

  // Форму закрили, поки йшов запит: його відповідь уже нікому не потрібна (стара помилка в новій формі).
  const attempt = React.useRef(0)
  const close = () => {
    attempt.current += 1
    focusAfterToggle.current = true
    setOpen(false)
    setName("")
    setError(undefined)
    setPending(false)
  }
  const submit = async () => {
    if (isPending) return
    const value = name.trim()
    if (!value) {
      setError(t("validation.required"))
      input.current?.focus()
      return
    }
    const current = attempt.current
    setPending(true)
    const failure = await onCreate(value)
    if (attempt.current !== current) return
    setPending(false)
    setError(failure)
    if (failure === undefined) setName("")
    input.current?.focus()
  }

  if (!isOpen)
    return (
      <Button
        ref={opener}
        variant="ghost"
        size="sm"
        aria-label={t("board.quickCreate.openIn", { column })}
        className="w-full justify-start"
        onClick={() => {
          focusAfterToggle.current = true
          setOpen(true)
        }}
      >
        <PlusIcon aria-hidden />
        {t("board.quickCreate.open")}
      </Button>
    )
  const errorId = `${id}-error`
  return (
    <form
      noValidate
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <label htmlFor={id} className="sr-only">
        {label ?? t("board.quickCreate.label")}
      </label>
      <Input
        ref={input}
        id={id}
        value={name}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => {
          setName(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation()
            close()
          }
        }}
      />
      {error ? (
        // role="alert": після Enter фокус лишається в полі, і зміну опису скрінрідер не прочитав би.
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" aria-disabled={isPending || undefined}>
          {isPending ? <Spinner aria-hidden /> : null}
          {t("board.quickCreate.submit")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={close}>
          {t("board.quickCreate.cancel")}
        </Button>
      </div>
    </form>
  )
}
