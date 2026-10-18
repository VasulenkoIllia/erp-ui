import { useCanAccess } from "ra-core"
import { useRef, type MouseEvent } from "react"

import { DeniedAction } from "@/components/erp/permission-gate"
import { Button } from "@/components/ui/button"
import { ACTION_ICONS } from "@/lib/icons"

/**
 * Дія з правом ресурсу (ADR-0014): «Створити організацію» в шапці списку, «Змінити» в шапці картки.
 * Без права — неактивна з причиною (SPEC §8.4); поки права невідомі — нічого, а не «немає доступу»,
 * що за мить стане кнопкою.
 */
export function AccessAction({
  resource,
  action,
  icon,
  label,
  deniedReason,
  variant = "outline",
  onClick,
}: {
  resource: string
  action: "create" | "update"
  icon: keyof typeof ACTION_ICONS
  label: string
  deniedReason: string
  variant?: "default" | "outline"
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
}) {
  const { canAccess, isPending } = useCanAccess({ resource, action })
  const Icon = ACTION_ICONS[icon]
  if (isPending) return null
  return canAccess ? (
    <Button variant={variant} onClick={onClick}>
      <Icon aria-hidden />
      {label}
    </Button>
  ) : (
    <DeniedAction reason={deniedReason} variant={variant}>
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
  const remember = (event: MouseEvent<HTMLElement>) => {
    ref.current = event.currentTarget
  }
  return { ref, remember }
}
