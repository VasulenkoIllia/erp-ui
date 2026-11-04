import * as React from "react"

import { DeniedAction } from "@/registry/erp/permission-gate"
import { useErpUiT } from "@/registry/lib/i18n"
import { ACTION_ICONS } from "@/registry/lib/icons"
import { printPage } from "@/registry/lib/print"
import { Button } from "@/registry/ui/button"
import { Spinner } from "@/registry/ui/spinner"

/**
 * Кнопка друку (PF08, ADR-0062): дочекатися логотипа й печатки, які ще вантажаться, і відкрити діалог
 * друку браузера; там же «Зберегти як PDF». Друкує сторінку: на сторінці з аркушем `erp/print-preview`
 * лише аркуш, без нього — сторінку без оболонки (`tokens/base.css`).
 *
 *   <PrintButton title="Рахунок № 2026-0001" />
 */
export interface PrintButtonProps {
  /** Назва документа: на час друку — заголовок сторінки, з нього браузер бере назву файла PDF. */
  title?: string
  /** Чому друкувати ще не можна (аркуш вантажиться): кнопка недоступна з цим поясненням (SPEC §8.4). */
  deniedReason?: string
  variant?: React.ComponentProps<typeof Button>["variant"]
  size?: React.ComponentProps<typeof Button>["size"]
  className?: string
}

export function PrintButton({
  title,
  deniedReason,
  variant = "default",
  size,
  className,
}: PrintButtonProps) {
  const t = useErpUiT()
  const [isPreparing, setPreparing] = React.useState(false)
  const label = t("print.action")
  const Icon = ACTION_ICONS.print
  if (deniedReason)
    return (
      <DeniedAction
        reason={deniedReason}
        variant={variant}
        size={size}
        className={className}
      >
        <Icon aria-hidden />
        {label}
      </DeniedAction>
    )
  const print = () => {
    setPreparing(true)
    void printPage({ title }).finally(() => {
      setPreparing(false)
    })
  }
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      disabled={isPreparing}
      focusableWhenDisabled
      aria-busy={isPreparing || undefined}
      onClick={print}
    >
      {isPreparing ? <Spinner aria-hidden /> : <Icon aria-hidden />}
      {label}
    </Button>
  )
}
