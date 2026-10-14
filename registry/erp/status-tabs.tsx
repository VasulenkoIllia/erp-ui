"use client"

import * as React from "react"

import { useElementSize } from "@/registry/hooks/use-element-size"
import type { ListTab } from "@/registry/lib/list-state"
import { useFormat } from "@/registry/lib/format"
import { cn } from "@/registry/lib/utils"
import { Tabs, TabsList, TabsTrigger } from "@/registry/ui/tabs"

/**
 * Вкладки-статуси списку (SPEC §7 List Report, ADR-0017): «Усі · Чернетки · Прострочені…» з
 * лічильниками.
 *
 * - Вкладка — фільтр поверх фільтрів панелі (`ListTab.filter`); лічильники — `useListCounts`.
 * - Стрілки переходять між вкладками, Enter чи пробіл вибирає (без вибору на фокусі: кожна вкладка —
 *   запит до сервера).
 * - На вузькому контейнері вкладки прокручуються вбік, рядок не переноситься; активна вкладка
 *   прокручується у видиму частину.
 * - Число — частина назви вкладки («Прострочені 1 152»); поки лічильника немає, — лише назва.
 */

export interface StatusTabsProps {
  /** Назва групи вкладок для скрінрідера: «Статус рахунку». */
  label: string
  tabs: readonly ListTab[]
  value: string
  onValueChange: (tab: string) => void
  counts?: Readonly<Record<string, number | undefined>>
  className?: string
}

export function StatusTabs({
  label,
  tabs,
  value,
  onValueChange,
  counts,
  className,
}: StatusTabsProps) {
  const format = useFormat()
  const scroller = React.useRef<HTMLDivElement>(null)
  // Активна вкладка (з адреси, з виду) — у видимій частині смуги; лічильники, що прийшли пізніше,
  // розширюють вкладки, а поворот екрана звужує смугу, тож і після них. Не scrollIntoView: той
  // прокрутив би й сторінку.
  const widths = tabs.map((tab) => counts?.[tab.id] ?? "").join()
  const stripWidth = useElementSize(scroller, "width")
  // До кадру: смуга не блимає з активною вкладкою за краєм. Пошук без CSS.escape (його немає в jsdom).
  React.useLayoutEffect(() => {
    const strip = scroller.current
    const tab = Array.from(
      strip?.querySelectorAll<HTMLElement>("[data-tab]") ?? [],
    ).find((item) => item.dataset.tab === value)
    if (!strip || !tab) return
    const box = strip.getBoundingClientRect()
    const { left, right } = tab.getBoundingClientRect()
    if (left < box.left) strip.scrollLeft -= box.left - left
    else if (right > box.right) strip.scrollLeft += right - box.right
  }, [value, widths, stripWidth])
  return (
    <Tabs
      value={value}
      onValueChange={(next: string) => {
        onValueChange(next)
      }}
      data-slot="status-tabs"
      className={cn("min-w-0", className)}
    >
      {/* Нижній відступ — місце для лінії активної вкладки всередині області прокрутки. */}
      <div
        ref={scroller}
        className="-mx-1 no-scrollbar overflow-x-auto px-1 pb-1.5"
      >
        <TabsList variant="line" aria-label={label} className="min-w-max">
          {tabs.map((tab) => {
            const count = counts?.[tab.id]
            return (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                data-tab={tab.id}
                className="flex-none"
              >
                {tab.label}
                {count === undefined ? null : (
                  <span className="text-muted-foreground tabular-nums">
                    {format.number(count)}
                  </span>
                )}
              </TabsTrigger>
            )
          })}
        </TabsList>
      </div>
    </Tabs>
  )
}
