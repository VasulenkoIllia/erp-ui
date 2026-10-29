import { useCallback, useRef, type MouseEvent, type Ref } from "react"

import { DeniedAction } from "@/components/erp/permission-gate"
import { Button } from "@/components/ui/button"
import { useRecordAccess } from "@/hooks/use-record-access"
import { ACTION_ICONS } from "@/lib/icons"

/**
 * Дія з правом ресурсу (ADR-0014): «Створити організацію» в шапці списку, «Змінити» в шапці картки.
 * Без права — неактивна з причиною (SPEC §8.4); поки права невідомі — нічого, а не «немає доступу»,
 * що за мить стане кнопкою. З `record` дію забороняє й позначка сервера на записі (спільний запис,
 * ADR-0037): кнопка неактивна з причиною запису.
 */
export function AccessAction({
  resource,
  action,
  icon,
  label,
  deniedReason,
  variant = "outline",
  onClick,
  ref,
  busy = false,
  record,
}: {
  resource: string
  action: "create" | "update"
  icon: keyof typeof ACTION_ICONS
  label: string
  deniedReason: string
  variant?: "default" | "outline"
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
  /** Кнопка дії: сюди повертається фокус, коли елемента, з якого відкрили діалог, уже немає. */
  ref?: Ref<HTMLButtonElement>
  /** Поки зберігається інша зміна запису — неактивна, але фокус лишається на ній. */
  busy?: boolean
  /** Запис, над яким дія (`update` у картці): його позначка сервера теж забороняє дію. */
  record?: unknown
}) {
  const { canAccess, isPending, recordReason } = useRecordAccess({
    resource,
    action,
    record,
  })
  const Icon = ACTION_ICONS[icon]
  if (isPending) return null
  return canAccess ? (
    <Button
      ref={ref}
      variant={variant}
      disabled={busy}
      focusableWhenDisabled
      onClick={onClick}
    >
      <Icon aria-hidden />
      {label}
    </Button>
  ) : (
    <DeniedAction reason={recordReason ?? deniedReason} variant={variant}>
      <Icon aria-hidden />
      {label}
    </DeniedAction>
  )
}

/**
 * Кнопка, що відкрила діалог форми: туди повертається фокус після закриття (`finalFocus`). Сам діалог
 * бере елемент у фокусі під час відкриття, а Safari кнопку кліком не фокусує.
 */
export function useOpener() {
  const ref = useRef<HTMLElement | null>(null)
  // Стабільна: її беруть колонки списку (кнопка в рядку), а новий масив колонок перебудовує таблицю.
  const remember = useCallback((event: MouseEvent<HTMLElement>) => {
    ref.current = event.currentTarget
  }, [])
  return { ref, remember }
}
