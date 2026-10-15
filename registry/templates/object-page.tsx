"use client"

import * as React from "react"

import { PageState, useLoadingAnnouncement } from "@/registry/erp/page-state"
import { remPx, useElementSize } from "@/registry/hooks/use-element-size"
import { errorStateKind, isApiError } from "@/registry/lib/api"
import { useErpUiT } from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"
import { Skeleton } from "@/registry/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/registry/ui/tabs"

/**
 * Шаблон Object Page — картка запису (SPEC §7, §8.1, §9; ADR-0019).
 *
 * - Склад: «Назад до списку» (`back`), шапка (`RecordHeader` з erp/record-header), смуга етапів
 *   (`RecordStatusBar`), секції (`ObjectPageSection`) і стрічка запису (`aside`, UI01).
 * - Стрічка — праворуч, коли контейнер ширший за `asideBelow` rem; вужчий — вкладки «Подробиці» і
 *   стрічка (`@container`, а не вікно: та сама картка на весь екран і в колонці FCL). Тіло з'являється
 *   після виміру ширини (до першого кадру): інакше на телефоні спершу змонтувалась би широка розкладка
 *   зі стрічкою, і її запити пішли б даремно. Перетин межі (поворот екрана) і перемикання вкладок
 *   перемонтовують секції — стан, що має пережити це, тримайте над шаблоном.
 * - Стани: первинне завантаження — скелетон у формі картки; помилка, офлайн (з повтором), немає
 *   доступу, не знайдено — `PageState`. «Назад» видно в кожному стані, а h1 є завжди: прихований
 *   `title`, поки запису немає, далі — назва запису в шапці.
 * - Запис уже є (з кешу списку), а частина не завантажилась — це стан секції, а не сторінки:
 *   `error` тоді не передається, секція показує свій повтор (SPEC §8.1, стан 8).
 */

const ASIDE_BELOW_REM = 64

export interface ObjectPageAside {
  /** Назва стрічки: вкладка на вузькому контейнері й заголовок колонки на широкому. */
  label: string
  content: React.ReactNode
}

export interface ObjectPageProps {
  /**
   * Назва сторінки, поки запису немає (вантажиться, помилка, не знайдено): прихований h1, щоб
   * сторінка мала заголовок і фокус після переходу мав куди стати. Далі h1 — у `RecordHeader`.
   */
  title: string
  /** Той самий ref, що й `headingRef` шапки: заголовок сторінки в будь-якому стані. */
  headingRef?: React.Ref<HTMLHeadingElement>
  /** Посилання «Назад до списку». */
  back?: React.ReactNode
  header: React.ReactNode
  statusBar?: React.ReactNode
  /** Секції запису (`ObjectPageSection`). */
  children: React.ReactNode
  /** Стрічка запису (UI01): праворуч чи вкладкою. */
  aside?: ObjectPageAside
  /** Нижче цієї ширини контейнера, rem, стрічка — вкладкою. */
  asideBelow?: number
  isPending?: boolean
  /** Помилка завантаження запису (не секції). */
  error?: unknown
  onRetry?: () => void
  className?: string
}

export function ObjectPage({
  title,
  headingRef,
  back,
  header,
  statusBar,
  children,
  aside,
  asideBelow = ASIDE_BELOW_REM,
  isPending = false,
  error,
  onRetry,
  className,
}: ObjectPageProps) {
  const container = React.useRef<HTMLDivElement>(null)
  const width = useElementSize(container, "width")
  // null — ще не виміряно: тіло зі стрічкою не рендеримо, щоб не монтувати не ту розкладку.
  const narrow = React.useMemo(
    () => (width === null ? null : width / remPx() < asideBelow),
    [width, asideBelow],
  )

  let content: React.ReactNode
  if (error) {
    // Запису немає (видалили, інша компанія) — «не знайдено», а не повтор.
    const kind =
      isApiError(error) && error.status === 404
        ? "not-found"
        : errorStateKind(error)
    content = (
      <PageState
        kind={kind}
        onRetry={kind === "error" || kind === "offline" ? onRetry : undefined}
      />
    )
  } else if (isPending) {
    content = <ObjectPageSkeleton />
  } else {
    content = (
      <>
        {header}
        {statusBar}
        {aside ? (
          narrow === null ? null : (
            <ObjectPageBody aside={aside} narrow={narrow}>
              {children}
            </ObjectPageBody>
          )
        ) : (
          <div className="space-y-8">{children}</div>
        )}
      </>
    )
  }

  const showsRecord = !error && !isPending
  return (
    <div
      ref={container}
      data-slot="object-page"
      className={cn("@container min-w-0 space-y-6", className)}
    >
      {back}
      {showsRecord ? null : (
        <h1 ref={headingRef} tabIndex={-1} className="sr-only">
          {title}
        </h1>
      )}
      {content}
    </div>
  )
}

function ObjectPageBody({
  aside,
  narrow,
  children,
}: {
  aside: ObjectPageAside
  narrow: boolean
  children: React.ReactNode
}) {
  const t = useErpUiT()
  const asideId = React.useId()
  if (narrow) {
    return (
      <Tabs defaultValue="details">
        <TabsList className="w-full">
          <TabsTrigger value="details">{t("objectPage.details")}</TabsTrigger>
          <TabsTrigger value="aside">{aside.label}</TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="space-y-8 pt-4 text-base">
          {children}
        </TabsContent>
        <TabsContent value="aside" className="pt-4 text-base">
          {aside.content}
        </TabsContent>
      </Tabs>
    )
  }
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] gap-6">
      <div className="min-w-0 space-y-8">{children}</div>
      <section
        aria-labelledby={asideId}
        data-slot="object-page-aside"
        className="min-w-0 space-y-3 border-s ps-6"
      >
        <h2 id={asideId} className="text-lg font-semibold">
          {aside.label}
        </h2>
        {aside.content}
      </section>
    </div>
  )
}

/** Секція картки з заголовком h2 і діями. */
export function ObjectPageSection({
  title,
  actions,
  children,
  className,
}: {
  title: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  const id = React.useId()
  return (
    <section
      aria-labelledby={id}
      data-slot="object-page-section"
      className={cn("min-w-0 space-y-3", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  )
}

const SKELETON_FIELDS = 4
const SKELETON_ROWS = 4

/** Первинне завантаження: скелетон у формі картки; для скрінрідера — «Завантаження даних». */
function ObjectPageSkeleton() {
  const t = useErpUiT()
  useLoadingAnnouncement(t("pageState.loading"))
  return (
    <div
      role="status"
      aria-label={t("pageState.loading")}
      aria-busy
      data-slot="object-page-skeleton"
      className="space-y-6"
    >
      <div className="space-y-4">
        <Skeleton className="h-8 w-64 max-w-full" />
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 @2xl:grid-cols-4">
          {Array.from({ length: SKELETON_FIELDS }, (_, i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-28 max-w-full" />
            </div>
          ))}
        </div>
      </div>
      <Skeleton className="h-control w-full max-w-md" />
      <div className="space-y-1 rounded-lg border p-2">
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <Skeleton key={i} className="h-row w-full" />
        ))}
      </div>
    </div>
  )
}
