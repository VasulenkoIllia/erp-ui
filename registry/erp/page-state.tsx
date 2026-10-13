"use client"

import * as React from "react"
import {
  CircleSlashIcon,
  FileQuestionIcon,
  InboxIcon,
  LockIcon,
  SearchXIcon,
  TriangleAlertIcon,
  WifiOffIcon,
  type LucideIcon,
} from "lucide-react"

import { useErpUiT, type ErpUiKey } from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"
import { Button } from "@/registry/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/registry/ui/empty"
import { Skeleton } from "@/registry/ui/skeleton"

/**
 * Стани сторінки й колекції (SPEC §8.1): порожньо вперше, нічого не знайдено, помилка з повтором,
 * немає доступу, офлайн, сторінку не знайдено; `PageSkeleton` — первинне завантаження.
 *
 * - Тексти за замовчуванням — з рядків кіта; `title`, `description` уточнюють під конкретний екран.
 * - `action` — головна дія стану («Створити рахунок»); для `error`/`offline` — `onRetry`,
 *   для `no-results` — `onReset` дають стандартні кнопки.
 * - Порожній стан ніколи не підміняє помилку: показуйте `error`, якщо дані не завантажились.
 * - Помилка й офлайн оголошуються скрінрідеру (role="alert"), решта — ні.
 */
export type PageStateKind =
  "empty" | "no-results" | "error" | "forbidden" | "offline" | "not-found"

const KINDS: Record<
  PageStateKind,
  { icon: LucideIcon; title: ErpUiKey; description: ErpUiKey; tone?: string }
> = {
  empty: {
    icon: InboxIcon,
    title: "pageState.empty.title",
    description: "pageState.empty.description",
  },
  "no-results": {
    icon: SearchXIcon,
    title: "pageState.noResults.title",
    description: "pageState.noResults.description",
  },
  error: {
    icon: TriangleAlertIcon,
    title: "pageState.error.title",
    description: "pageState.error.description",
    tone: "bg-destructive-soft text-destructive-foreground",
  },
  forbidden: {
    icon: LockIcon,
    title: "pageState.forbidden.title",
    description: "pageState.forbidden.description",
  },
  offline: {
    icon: WifiOffIcon,
    title: "pageState.offline.title",
    description: "pageState.offline.description",
    tone: "bg-warning-soft text-warning-foreground",
  },
  "not-found": {
    icon: FileQuestionIcon,
    title: "pageState.notFound.title",
    description: "pageState.notFound.description",
  },
}

export interface PageStateProps {
  kind: PageStateKind
  title?: string
  description?: string
  /** Іконка замість стандартної (напр. іконка модуля з lib/icons для `empty`). */
  icon?: LucideIcon
  /** Головна дія стану. */
  action?: React.ReactNode
  onRetry?: () => void
  onReset?: () => void
  className?: string
}

export function PageState({
  kind,
  title,
  description,
  icon,
  action,
  onRetry,
  onReset,
  className,
}: PageStateProps) {
  const t = useErpUiT()
  const config = KINDS[kind]
  const Icon = icon ?? config.icon
  const announce = kind === "error" || kind === "offline"
  return (
    <Empty
      data-slot="page-state"
      data-kind={kind}
      role={announce ? "alert" : undefined}
      className={cn("min-h-64 border border-dashed", className)}
    >
      <EmptyHeader>
        <EmptyMedia
          variant="icon"
          className={cn(
            "size-10 [&_svg:not([class*='size-'])]:size-5",
            config.tone,
          )}
        >
          <Icon aria-hidden />
        </EmptyMedia>
        <EmptyTitle>
          <h2>{title ?? t(config.title)}</h2>
        </EmptyTitle>
        <EmptyDescription>
          {description ?? t(config.description)}
        </EmptyDescription>
      </EmptyHeader>
      {action || onRetry || onReset ? (
        <EmptyContent>
          <div className="flex flex-wrap justify-center gap-2">
            {action}
            {onRetry && (kind === "error" || kind === "offline") ? (
              <Button
                variant={action ? "outline" : "default"}
                onClick={onRetry}
              >
                {t(
                  kind === "offline"
                    ? "pageState.offline.retry"
                    : "pageState.error.retry",
                )}
              </Button>
            ) : null}
            {onReset && kind === "no-results" ? (
              <Button variant="outline" onClick={onReset}>
                <CircleSlashIcon aria-hidden />
                {t("pageState.noResults.reset")}
              </Button>
            ) : null}
          </div>
        </EmptyContent>
      ) : null}
    </Empty>
  )
}

/**
 * Первинне завантаження — скелетон у формі майбутнього контенту (SPEC §8.2: лише в контейнерах).
 * `rows` — кількість рядків списку; для скрінрідера — підпис «Завантаження даних».
 */
export function PageSkeleton({
  rows = 6,
  className,
}: {
  rows?: number
  className?: string
}) {
  const t = useErpUiT()
  return (
    <div
      data-slot="page-skeleton"
      role="status"
      aria-label={t("pageState.loading")}
      aria-busy
      className={cn("space-y-3", className)}
    >
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-control w-32" />
      </div>
      <Skeleton className="h-control w-full max-w-md" />
      <div className="space-y-1 rounded-lg border p-2">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-row w-full" />
        ))}
      </div>
    </div>
  )
}
