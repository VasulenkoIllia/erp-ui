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

import { announce } from "@/registry/lib/announce"
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
import { Spinner } from "@/registry/ui/spinner"

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

const HEADINGS = { 1: "h1", 2: "h2", 3: "h3" } as const

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
  /**
   * Рівень заголовка: 2 — стан частини сторінки під її h1 (за замовчуванням); 1 — стан замість
   * усієї сторінки («не знайдено», профіль не завантажився); 3 — стан секції чи вкладки під h2.
   */
  headingLevel?: 1 | 2 | 3
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
  headingLevel = 2,
  className,
}: PageStateProps) {
  const t = useErpUiT()
  const config = KINDS[kind]
  const Heading = HEADINGS[headingLevel]
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
          <Heading>{title ?? t(config.title)}</Heading>
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

/** Завантаження блоку всередині сторінки (картка налаштувань, список у секції): лише рядки. */
export function SectionSkeleton({
  rows = 3,
  className,
}: {
  rows?: number
  className?: string
}) {
  const t = useErpUiT()
  return (
    <div
      data-slot="section-skeleton"
      role="status"
      aria-label={t("pageState.loading")}
      aria-busy
      className={cn("space-y-2", className)}
    >
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-row w-full" />
      ))}
    </div>
  )
}

/** SPEC §8.2: до 1 с — без індикатора для скрінрідера. */
const LOADING_ANNOUNCE_DELAY_MS = 1000

/**
 * Оголосити завантаження, якщо воно триває понад 1 с (SPEC §8.2), — через постійний live-регіон
 * (lib/announce): новий `role="status"` скрінрідер часто не озвучує. Для скелетонів і fallback.
 */
export function useLoadingAnnouncement(message: string): void {
  React.useEffect(() => {
    let cancel: (() => void) | undefined
    const timer = setTimeout(() => {
      cancel = announce(message)
    }, LOADING_ANNOUNCE_DELAY_MS)
    return () => {
      clearTimeout(timer)
      cancel?.()
    }
  }, [message])
}

/**
 * Частина, що ще вантажиться (лінивий чанк сторінки, вміст палітри): спінер з `aria-busy`, а якщо
 * вантаження триває понад 1 с, — «Завантаження» через постійний live-регіон (lib/announce):
 * новий `role="status"` у fallback скрінрідер часто не озвучує.
 */
export function LoadingFallback({
  label,
  className,
}: {
  /** Текст оголошення; за замовчуванням «Завантаження». */
  label?: string
  className?: string
}) {
  const t = useErpUiT()
  useLoadingAnnouncement(label ?? t("common.loading"))
  return (
    <div
      data-slot="loading-fallback"
      aria-busy
      className={cn("flex items-center justify-center", className)}
    >
      <Spinner aria-hidden className="size-6" />
    </div>
  )
}
