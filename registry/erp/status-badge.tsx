import type { LucideIcon } from "lucide-react"

import { STATUS_ICONS, type StatusIcon } from "@/registry/lib/icons"
import type { ModuleStatus, StatusTone } from "@/registry/lib/statuses"
import { cn } from "@/registry/lib/utils"
import { Badge } from "@/registry/ui/badge"

/** Тон статусу → варіант бейджа (soft-тло + *-foreground, SPEC §6.3). */
const TONE_VARIANTS = {
  neutral: "secondary",
  info: "info",
  success: "success",
  warning: "warning",
  destructive: "destructive",
} as const satisfies Record<StatusTone, string>

/** Іконка тону, якщо статус не має своєї: колір ніколи не єдиний носій змісту (WCAG 1.4.1). */
const TONE_ICONS = {
  neutral: "archived",
  info: "info",
  success: "success",
  warning: "warning",
  destructive: "destructive",
} as const satisfies Record<StatusTone, StatusIcon>

const KNOWN_ICONS: Readonly<Partial<Record<string, LucideIcon>>> = STATUS_ICONS

interface StatusBadgeProps {
  /** Статус мовою інтерфейсу; рядок — ключ без опису (невідомий статус від сервера). */
  readonly status: ModuleStatus | string
  readonly className?: string
}

/**
 * Бейдж статусу запису модуля (`lib/statuses`): іконка, підпис і колір тону. Невідомий ключ — ключ
 * текстом у нейтральному бейджі, а не порожнє місце.
 */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const resolved: ModuleStatus =
    typeof status === "string"
      ? { id: status, label: status, tone: "neutral" }
      : status
  // Статус із даних (сервер, PF09) може принести тон чи іконку, яких кіт не знає: тоді — нейтральні.
  const tone: StatusTone = Object.hasOwn(TONE_VARIANTS, resolved.tone)
    ? resolved.tone
    : "neutral"
  const Icon: LucideIcon =
    (resolved.icon && KNOWN_ICONS[resolved.icon]) ??
    STATUS_ICONS[TONE_ICONS[tone]]
  // У вузькій колонці таблиці довгий підпис обрізається трикрапкою, а не налазить на сусідню.
  return (
    <Badge
      variant={TONE_VARIANTS[tone]}
      className={cn("max-w-full min-w-0 shrink", className)}
      title={resolved.label}
    >
      <Icon aria-hidden />
      <span className="truncate">{resolved.label}</span>
    </Badge>
  )
}
