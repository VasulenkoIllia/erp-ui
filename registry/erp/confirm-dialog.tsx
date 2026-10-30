import * as React from "react"
import { toast } from "sonner"

import { useErpUiT } from "@/registry/lib/i18n"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/registry/ui/alert-dialog"
import { Button } from "@/registry/ui/button"
import { Field, FieldError, FieldLabel } from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"
import { Spinner } from "@/registry/ui/spinner"

/**
 * Підтвердження дій і три рівні видалення (SPEC §8.2, ADR-0015):
 *
 * 1. Зворотна дія (архів, позначка) — без діалогу: виконати одразу й показати `useUndoToast`
 *    із «Скасувати»; тост не зникає сам.
 * 2. Звичайне видалення — `ConfirmDialog` з кнопкою, що називає наслідок («Видалити 3 рахунки»),
 *    а не «Так/Ні».
 * 3. Критична дія (видалити компанію, усі дані) — `ConfirmDialog` з `confirmWord`: дія виконується,
 *    лише коли введено слово.
 *
 * - `onConfirm` може повернути проміс: поки він триває, кнопка зайнята, а повторне натискання
 *   (кнопка, Enter у полі слова) дію не повторює. Закриття після успіху й показ помилки — справа
 *   виклику (як і до цього в кіті): `onConfirm` ловить свої помилки сам; відхилений проміс діалог
 *   не ковтає, він дійде до `unhandledrejection` (моніторинг помилок).
 * - Після закриття фокус повертається на елемент, з якого діалог відкрили; якщо дія його прибрала
 *   (масова дія зняла вибір разом із панеллю) — на `returnFocus`.
 * - `lockWhileBusy` — незворотна дія: поки проміс триває, діалог не закривається ні «Скасувати», ні
 *   Escape, інакше людина вирішить, що скасувала, а дія однаково виконається.
 * - `children` — вміст під кнопками, напр. вкладений діалог повторного підтвердження (`useReauth`).
 */

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: React.ReactNode
  /** Наслідок дії: «Видалити рахунок», «Вийти на всіх пристроях». */
  confirmLabel: string
  /** Червона кнопка — для видалення й інших руйнівних дій. */
  destructive?: boolean
  /** Рівень 3: слово, яке треба ввести, напр. назва компанії чи «ВИДАЛИТИ». */
  confirmWord?: string
  /** Підпис кнопки відмови; за замовчуванням «Скасувати». */
  cancelLabel?: string
  onClose: () => void
  onConfirm: () => Promise<unknown> | void
  /** Куди повернути фокус, якщо елемента, з якого відкрили, уже немає. */
  returnFocus?: () => HTMLElement | null
  /** Не закривати діалог, поки `onConfirm` триває. */
  lockWhileBusy?: boolean
  children?: React.ReactNode
}

/** Елемент у фокусі до відкриття діалогу; body — не відкривач (Safari не фокусує кнопку кліком). */
function activeOpener(): HTMLElement | null {
  // Рендер на сервері (SSR) — документа немає.
  if (typeof document === "undefined") return null
  const active = document.activeElement
  return active instanceof HTMLElement && active !== document.body
    ? active
    : null
}

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive = false,
  confirmWord,
  cancelLabel,
  onClose,
  onConfirm,
  returnFocus,
  lockWhileBusy = false,
  children,
}: ConfirmDialogProps) {
  const t = useErpUiT()
  const ids = React.useId()
  const [busy, setBusy] = React.useState(false)
  // Замок на той самий кадр: `busy` оновиться лише після рендеру.
  const running = React.useRef(false)
  const [typed, setTyped] = React.useState("")
  const [mismatch, setMismatch] = React.useState(false)
  const wordRef = React.useRef<HTMLInputElement>(null)
  // Діалог керований і без тригера, тож Base UI не знає, куди повернути фокус після закриття,
  // і віддає його іншій кнопці. Запам'ятовуємо елемент, з якого діалог відкрили (SPEC §10):
  // і коли `open` стає true, і коли діалог монтують уже відкритим (`{pending && <ConfirmDialog open />}`).
  const [opener, setOpener] = React.useState<HTMLElement | null>(() =>
    open ? activeOpener() : null,
  )
  // Закрили (кнопкою чи після успіху) — наступне відкриття починається з порожнього слова.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setOpener(activeOpener())
    else {
      setTyped("")
      setMismatch(false)
    }
  }

  const confirm = () => {
    if (running.current) return
    if (confirmWord && typed.trim() !== confirmWord) {
      setMismatch(true)
      wordRef.current?.focus()
      return
    }
    running.current = true
    setBusy(true)
    void Promise.resolve()
      .then(onConfirm)
      .finally(() => {
        running.current = false
        setBusy(false)
      })
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !(lockWhileBusy && running.current)) onClose()
      }}
    >
      <AlertDialogContent
        // Пункт меню, з якого відкрили, уже зник — тоді `returnFocus` чи правило Base UI.
        finalFocus={() =>
          opener?.isConnected ? opener : (returnFocus?.() ?? true)
        }
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {confirmWord ? (
          <Field data-invalid={mismatch ? true : undefined}>
            <FieldLabel htmlFor={`${ids}-word`}>
              {t("confirm.typeToConfirm", { word: confirmWord })}
            </FieldLabel>
            <Input
              ref={wordRef}
              id={`${ids}-word`}
              autoComplete="off"
              spellCheck={false}
              value={typed}
              aria-invalid={mismatch ? true : undefined}
              aria-describedby={mismatch ? `${ids}-mismatch` : undefined}
              onChange={(event) => {
                setTyped(event.target.value)
                setMismatch(false)
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  confirm()
                }
              }}
            />
            {mismatch ? (
              <FieldError id={`${ids}-mismatch`}>
                {t("confirm.wordMismatch", { word: confirmWord })}
              </FieldError>
            ) : null}
          </Field>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={lockWhileBusy && busy}>
            {cancelLabel ?? t("confirm.cancel")}
          </AlertDialogCancel>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={busy}
            focusableWhenDisabled
            aria-busy={busy || undefined}
            onClick={confirm}
          >
            {busy ? <Spinner aria-hidden /> : null}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
        {children}
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Рівень 1: тост зворотної дії з «Скасувати», що не зникає сам (SPEC §8.2). */
function useUndoToast(): (message: string, onUndo: () => void) => void {
  const t = useErpUiT()
  return React.useCallback(
    (message: string, onUndo: () => void) => {
      toast(message, {
        duration: Number.POSITIVE_INFINITY,
        action: { label: t("confirm.undo"), onClick: onUndo },
      })
    },
    [t],
  )
}

export { ConfirmDialog, useUndoToast, type ConfirmDialogProps }
