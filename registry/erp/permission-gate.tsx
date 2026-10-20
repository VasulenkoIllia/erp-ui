import * as React from "react"

import { useHasPermission, useMe } from "@/registry/hooks/use-me"
import { Button } from "@/registry/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/registry/ui/tooltip"

/**
 * Показати вміст лише тим, кому дозволено (ADR-0003, ADR-0014): кнопки, розділи, пункти меню.
 * Це косметика інтерфейсу — сервер однаково перевіряє права (SPEC §17).
 *
 *   <PermissionGate resource="invoices" action="delete">
 *     <Button variant="destructive">Видалити</Button>
 *   </PermissionGate>
 *
 * `fallback` — що показати без права (за замовчуванням нічого); поки профіль вантажиться —
 * `loading` (за замовчуванням теж нічого, щоб кнопки не блимали).
 */
export function PermissionGate({
  resource,
  action,
  children,
  fallback = null,
  loading = null,
}: {
  resource: string
  action: string
  children: React.ReactNode
  fallback?: React.ReactNode
  loading?: React.ReactNode
}) {
  const { isPending } = useMe()
  const allowed = useHasPermission(resource, action)
  if (isPending) return <>{loading}</>
  return <>{allowed ? children : fallback}</>
}

/**
 * Дія без права в межах доступного екрана (SPEC §8.4): кнопка видима й у фокусі, але неактивна, а
 * причина — у підказці й для скрінрідера (`aria-describedby`: Tooltip Base UI опису не ставить).
 *
 *   {canApprove ? <Button>Погодити</Button> : <DeniedAction reason="Доступно для ролі «Бухгалтер»">Погодити</DeniedAction>}
 */
export function DeniedAction({
  reason,
  children,
  variant = "outline",
  size,
  className,
  "aria-label": ariaLabel,
}: {
  /** Чому недоступно: «Редагування доступне для ролі «Бухгалтер»». */
  reason: string
  children: React.ReactNode
  /** Назва кнопки-іконки. */
  "aria-label"?: string
  variant?: React.ComponentProps<typeof Button>["variant"]
  size?: React.ComponentProps<typeof Button>["size"]
  className?: string
}) {
  const reasonId = React.useId()
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={variant}
            size={size}
            disabled
            focusableWhenDisabled
            aria-label={ariaLabel}
            aria-describedby={reasonId}
            className={className}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
      <span id={reasonId} className="sr-only">
        {reason}
      </span>
    </Tooltip>
  )
}
