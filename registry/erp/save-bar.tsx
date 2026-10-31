import * as React from "react"

import { ConfirmDialog } from "@/registry/erp/confirm-dialog"
import { keepFieldFocus } from "@/registry/erp/form"
import { useErpUiT } from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"
import { Button } from "@/registry/ui/button"
import { Spinner } from "@/registry/ui/spinner"

/**
 * Липка панель збереження довгої форми налаштувань (PF11, ADR-0047). Ставиться останньою в `<form>`:
 * липне до низу екрана в межах форми, на телефоні — над нижньою панеллю оболонки.
 *
 * - Панель є завжди, а не лише зі змінами: кнопка не зникає з-під фокуса після збереження, а «Зберегти»
 *   не вимикається (SPEC §8.3). Без змін запит не йде: форма показує «Змін немає».
 * - Стан форми — постійний live-регіон: скрінрідер чує «Є незбережені зміни» один раз, а не на кожну
 *   літеру.
 * - «Скасувати зміни» питає: введене не повернути. Без змін кнопка неактивна, але лишається у фокусі.
 * - Елемент у фокусі не ховається під панеллю (WCAG 2.4.11): поки вона на екрані, `tokens/base.css`
 *   збільшує `scroll-padding-bottom`. Висота панелі на телефоні враховує перенос кнопок у другий ряд.
 */
export interface SaveBarProps {
  /** Є незбережені зміни. */
  readonly isDirty: boolean
  /** Йде запит: кнопки зайняті, а не зникають. */
  readonly isSaving: boolean
  /** Повернути збережені значення. */
  readonly onDiscard: () => void
  /** Підпис кнопки відправки; за замовчуванням «Зберегти». */
  readonly submitLabel?: string
  readonly className?: string
}

function SaveBar({
  isDirty,
  isSaving,
  onDiscard,
  submitLabel,
  className,
}: SaveBarProps) {
  const t = useErpUiT()
  const [isConfirming, setConfirming] = React.useState(false)
  const discardRef = React.useRef<HTMLButtonElement>(null)
  const state = isSaving
    ? t("saveBar.saving")
    : isDirty
      ? t("saveBar.dirty")
      : t("saveBar.clean")
  return (
    <div
      role="group"
      aria-label={t("saveBar.label")}
      data-slot="save-bar"
      data-dirty={isDirty || undefined}
      className={cn(
        "sticky bottom-[calc(var(--bottom-nav-height,0px)+0.5rem)] z-10 flex flex-wrap items-center justify-end gap-x-3 gap-y-2 rounded-lg border bg-card p-2 text-card-foreground shadow-sm", // erp-ui: allow-raw-value — відступ над нижньою панеллю оболонки, висота якої змінна
        className,
      )}
    >
      <p
        role="status"
        className={cn(
          "min-w-0 flex-1 basis-40 px-1 text-sm",
          !isDirty && "text-muted-foreground",
        )}
      >
        {state}
      </p>
      <Button
        ref={discardRef}
        type="button"
        variant="outline"
        disabled={!isDirty || isSaving}
        focusableWhenDisabled
        onMouseDown={keepFieldFocus}
        onClick={() => {
          setConfirming(true)
        }}
      >
        {t("saveBar.discard")}
      </Button>
      <Button
        type="submit"
        disabled={isSaving}
        focusableWhenDisabled
        onMouseDown={keepFieldFocus}
      >
        {isSaving ? <Spinner aria-hidden /> : null}
        {submitLabel ?? t("saveBar.save")}
      </Button>
      <ConfirmDialog
        open={isConfirming}
        title={t("saveBar.discardTitle")}
        description={t("saveBar.discardDescription")}
        confirmLabel={t("saveBar.discardConfirm")}
        cancelLabel={t("saveBar.discardCancel")}
        destructive
        // Мишею фокус лишається в полі (`keepFieldFocus`), а поле рядка зникає разом зі скинутими рядками.
        returnFocus={() => discardRef.current}
        onClose={() => {
          setConfirming(false)
        }}
        onConfirm={() => {
          setConfirming(false)
          onDiscard()
        }}
      />
    </div>
  )
}

export { SaveBar }
