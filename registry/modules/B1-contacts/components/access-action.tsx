import { useCallback, useId, useRef, type MouseEvent, type Ref } from "react"

import { DeniedAction } from "@/components/erp/permission-gate"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { PaletteAction } from "@/hooks/use-palette-actions"
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
  lockReason,
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
  /** Запис редагує інша людина (`useEditLock`, ADR-0051): кнопка неактивна з цією причиною. */
  lockReason?: string | undefined
  /** Запис, над яким дія (`update` у картці): його позначка сервера теж забороняє дію. */
  record?: unknown
}) {
  const { canAccess, isPending, recordReason } = useRecordAccess({
    resource,
    action,
    record,
  })
  const Icon = ACTION_ICONS[icon]
  const reasonId = useId()
  if (isPending) return null
  if (!canAccess)
    return (
      <DeniedAction reason={recordReason ?? deniedReason} variant={variant}>
        <Icon aria-hidden />
        {label}
      </DeniedAction>
    )
  // Та сама кнопка, а не `DeniedAction`: блокування приходить подією, і фокус не має пропасти разом із нею.
  return (
    <Tooltip disabled={lockReason === undefined}>
      <TooltipTrigger
        render={
          <Button
            ref={ref}
            variant={variant}
            disabled={busy || lockReason !== undefined}
            focusableWhenDisabled
            aria-describedby={lockReason === undefined ? undefined : reasonId}
            onClick={onClick}
          />
        }
      >
        <Icon aria-hidden />
        {label}
      </TooltipTrigger>
      {lockReason === undefined ? null : (
        <>
          <TooltipContent>{lockReason}</TooltipContent>
          <span id={reasonId} className="sr-only">
            {lockReason}
          </span>
        </>
      )}
    </Tooltip>
  )
}

/**
 * Та сама дія в палітрі команд (ADR-0044): права й причина ті самі, що в кнопки. Поки права невідомі,
 * дії немає, як і кнопки.
 */
export function useAccessPaletteAction({
  id,
  resource,
  action,
  icon,
  label,
  deniedReason,
  record,
  lockReason,
  onSelect,
}: {
  id: string
  resource: string
  action: "create" | "update"
  icon: keyof typeof ACTION_ICONS
  label: string
  deniedReason: string
  record?: unknown
  lockReason?: string | undefined
  onSelect: () => void
}): PaletteAction | null {
  const { canAccess, isPending, recordReason } = useRecordAccess({
    resource,
    action,
    record,
  })
  if (isPending) return null
  return {
    id,
    label,
    icon: ACTION_ICONS[icon],
    deniedReason: canAccess ? lockReason : (recordReason ?? deniedReason),
    onSelect,
  }
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
