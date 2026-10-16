"use client"

import * as React from "react"

import { SectionSkeleton } from "@/registry/erp/page-state"
import { useTabInView } from "@/registry/hooks/use-tab-in-view"
import { useErpUiT } from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/registry/ui/tabs"

/**
 * Частина templates/object-page: секції картки вкладками (SPEC §7 Object Page «секції/вкладки»;
 * ADR-0024). Ставиться разом із шаблоном.
 *
 * - Вкладка — секція з тим самим ключем (`id`) і назвою; вкладки розширення — секції слотів
 *   (`useRecordSlots`), тож проект додає, ховає чи переставляє вкладку за ключем (ADR-0020).
 * - Вибрана вкладка — ззовні (`value`, `onValueChange`): застосунок пише її в адресу (`?tab=`).
 *   Невідомий ключ (вкладку сховало розширення, немає права, стара закладка) — перша вкладка.
 * - W3C APG Tabs: одна зупинка Tab на смузі, стрілки й Home/End між вкладками, Enter чи пробіл
 *   вибирає (без вибору на фокусі: вміст вкладки вантажить свої дані), Tab — у вміст вкладки.
 * - Лінивий вміст: змонтована лише вибрана вкладка, тож дані й чанки інших не вантажаться, доки їх
 *   не відкрили. Вміст у своєму `Suspense`: лінивий компонент вкладки показує скелетон секції, а не
 *   ховає всю картку. Перемикання перемонтовує вміст — стан, що має це пережити, тримайте над
 *   шаблоном.
 * - На вузькому контейнері смуга прокручується вбік, активна вкладка — у видимій частині.
 */

/** Ключ вкладки стрічки запису на вузькому контейнері (у вкладках вона остання); секції його не беруть. */
export const OBJECT_PAGE_ASIDE_TAB = "aside"

/** Секції вкладками: вибрана вкладка ззовні (адреса сторінки). */
export interface ObjectPageTabs {
  /** Ключ вибраної вкладки з адреси; порожній чи невідомий — перша. */
  value: string | null | undefined
  onValueChange: (id: string) => void
  /** Назва смуги вкладок для скрінрідера; за замовчуванням — «Розділи запису». */
  label?: string
}

export interface ObjectPageTabItem {
  id: string
  title: string
  actions?: React.ReactNode
  content: React.ReactNode
}

export function ObjectPageTabStrip({
  items,
  value,
  onValueChange,
  label,
}: ObjectPageTabs & { items: readonly ObjectPageTabItem[] }) {
  const t = useErpUiT()
  const active =
    items.find((item) => item.id === value)?.id ?? items[0]?.id ?? ""
  const scroller = useTabInView(active, items.map((item) => item.title).join())
  if (items.length === 0) return null
  return (
    <Tabs
      value={active}
      onValueChange={(next: string) => {
        onValueChange(next)
      }}
      data-slot="object-page-tabs"
      className="min-w-0 gap-4"
    >
      {/* Нижній відступ — місце для лінії активної вкладки всередині області прокрутки. */}
      <div
        ref={scroller}
        className="-mx-1 no-scrollbar overflow-x-auto px-1 pb-1.5"
      >
        <TabsList
          variant="line"
          aria-label={label ?? t("objectPage.tabs")}
          className="min-w-max"
        >
          {items.map((item) => (
            <TabsTrigger
              key={item.id}
              value={item.id}
              data-tab={item.id}
              className="flex-none"
            >
              {item.title}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {items.map((item) => (
        <TabsContent
          key={item.id}
          value={item.id}
          className="min-w-0 space-y-3 text-base"
        >
          <TabHeading title={item.title} actions={item.actions} />
          <React.Suspense fallback={<SectionSkeleton />}>
            {item.content}
          </React.Suspense>
        </TabsContent>
      ))}
    </Tabs>
  )
}

/**
 * Заголовок вкладки: h2 для переходу заголовками (видно назву вже на вкладці — тож лише для
 * скрінрідера) і дії секції праворуч.
 */
function TabHeading({
  title,
  actions,
}: {
  title: string
  actions: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-2",
        !actions && "contents",
      )}
    >
      <h2 className="sr-only">{title}</h2>
      {actions}
    </div>
  )
}
