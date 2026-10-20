import * as React from "react"

import { useErpUiT } from "@/registry/lib/i18n"
import { SHELL_ICONS } from "@/registry/lib/icons"
import { Button } from "@/registry/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/registry/ui/empty"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/registry/ui/popover"

/**
 * Дзвіник сповіщень у топбарі (UI02). `count` — кількість нових; `children` — вміст панелі
 * (без нього — «Нових сповіщень немає»); `open` / `onOpenChange` — керована панель.
 * Підключений до центру сповіщень — `InboxBell` (erp/notification-inbox, ADR-0014).
 */
export function NotificationBell({
  count = 0,
  open,
  onOpenChange,
  children,
}: {
  count?: number
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children?: React.ReactNode
}) {
  const t = useErpUiT()
  const Bell = SHELL_ICONS.notifications
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={
              count > 0
                ? t("notifications.label", { count })
                : t("notifications.labelNone")
            }
          />
        }
      >
        <Bell aria-hidden />
        {count > 0 ? (
          <span
            aria-hidden
            className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-xs leading-none font-medium text-primary-foreground tabular-nums"
          >
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 sm:w-96">
        <PopoverHeader>
          <PopoverTitle>{t("notifications.title")}</PopoverTitle>
        </PopoverHeader>
        {children ?? (
          <Empty className="p-4">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Bell aria-hidden />
              </EmptyMedia>
              <EmptyDescription>{t("notifications.empty")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </PopoverContent>
    </Popover>
  )
}
