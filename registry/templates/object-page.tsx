import * as React from "react"

import { ErrorBoundary, ReloadPageAction } from "@/registry/erp/error-boundary"
import {
  PageState,
  SectionSkeleton,
  useLoadingAnnouncement,
} from "@/registry/erp/page-state"
import { PermissionGate } from "@/registry/erp/permission-gate"
import { RecordHeader, type RecordField } from "@/registry/erp/record-header"
import { remPx, useElementSize } from "@/registry/hooks/use-element-size"
import { errorStateKind, isApiError } from "@/registry/lib/api"
import { localizedText, type LocalizedText } from "@/registry/lib/auth"
import { mapKeyedChanges, type KeyedChanges } from "@/registry/lib/extensions"
import { isChunkLoadError } from "@/registry/lib/lazy"
import { useErpUiT, useLanguage } from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"
import { Skeleton } from "@/registry/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/registry/ui/tabs"
import { useKeptContent } from "@/registry/templates/object-page-aside"
import {
  OBJECT_PAGE_ASIDE_TAB,
  ObjectPageTabStrip,
  type ObjectPageTabs,
} from "@/registry/templates/object-page-tabs"

// erp-ui: окремі import + export, бо shadcn CLI хибно переписує шляхи в `export … from`.
export { OBJECT_PAGE_ASIDE_TAB }
export type { ObjectPageTabs }

/**
 * Шаблон Object Page — картка запису (SPEC §7, §8.1, §9; ADR-0019).
 *
 * - Склад: «Назад до списку» (`back`), шапка (`RecordHeader` з erp/record-header з даних `header`),
 *   смуга етапів (`RecordStatusBar`), секції з h2 (`sections`) і стрічка запису (`aside`, UI01).
 * - Секції — одна під одною або вкладками (`tabs`, templates/object-page-tabs; ADR-0024): вибрана
 *   вкладка — в адресі, змонтована лише вона; на вузькому контейнері стрічка — остання вкладка.
 * - Ключові поля й дії шапки, секції — списки з ключами (`id`), порядок на екрані — порядок у списку:
 *   розширення модуля додає, ховає чи переставляє елемент за ключем (ADR-0020, lib/extensions).
 * - Стрічка — праворуч, коли контейнер ширший за `asideBelow` rem; вужчий — вкладки «Подробиці» і
 *   стрічка (`@container`, а не вікно: та сама картка на весь екран і в колонці FCL). Тіло з'являється
 *   після виміру ширини (до першого кадру): інакше на телефоні спершу змонтувалась би широка розкладка
 *   зі стрічкою, і її запити пішли б даремно. Перетин межі (поворот екрана) і перемикання вкладок
 *   перемонтовують секції — стан, що має пережити це, тримайте над шаблоном. Стрічка з `keepMounted`
 *   цього не боїться: монтується, коли її вперше показали, і живе, доки відкрита картка (ADR-0054).
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
  /** Написане не зникає з вкладкою чи поворотом екрана: чернетка й захист незбережених змін лишаються. */
  keepMounted?: boolean
}

/** Дія в шапці запису. */
export interface ObjectPageAction {
  id: string
  node: React.ReactNode
}

/** Шапка запису: є лише разом із записом. */
export interface ObjectPageHeader {
  /** Назва запису: «Рахунок 2026-0001» (h1). */
  title: string
  /** Статус (Badge) поруч із назвою. */
  status?: React.ReactNode
  /** Ключові поля під назвою. */
  fields?: readonly RecordField[]
  /** Дії запису, основна — першою. */
  actions?: readonly ObjectPageAction[]
}

/** Секція картки: заголовок h2, дії біля нього й вміст. */
export interface ObjectPageSectionItem {
  id: string
  title: string
  actions?: React.ReactNode
  content: React.ReactNode
}

export interface ObjectPageProps {
  /**
   * Назва сторінки, поки запису немає (вантажиться, помилка, не знайдено): прихований h1, щоб
   * сторінка мала заголовок і фокус після переходу мав куди стати. Далі h1 — у `RecordHeader`.
   */
  title: string
  /** Заголовок сторінки в будь-якому стані: прихований `title` чи назва запису в шапці. */
  headingRef?: React.Ref<HTMLHeadingElement>
  /** Посилання «Назад до списку». */
  back?: React.ReactNode
  /** Шапка запису; поки запису немає — не передається (тоді h1 — прихований `title`). */
  header?: ObjectPageHeader
  /** Смуга під шапкою: «Редагує [ім'я]» (`EditLockNotice`, ADR-0051). */
  notice?: React.ReactNode
  statusBar?: React.ReactNode
  /** Секції запису. */
  sections: readonly ObjectPageSectionItem[]
  /** Секції вкладками: вибрана — ззовні (адреса). Без цього — одна під одною. */
  tabs?: ObjectPageTabs
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
  notice,
  statusBar,
  sections,
  tabs,
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

  const showsRecord = !error && !isPending && header !== undefined
  const keptAside = useKeptContent(aside?.content, aside?.keepMounted === true)
  const shownAside = aside && { ...aside, content: keptAside.slot }
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
    const body = tabs ? (
      <ObjectPageTabStrip items={sections} {...tabs} />
    ) : (
      sections.map((section) => (
        <ObjectPageSection
          key={section.id}
          title={section.title}
          actions={section.actions}
        >
          {section.content}
        </ObjectPageSection>
      ))
    )
    content = (
      <>
        {header ? (
          <RecordHeader
            title={header.title}
            headingRef={headingRef}
            status={header.status}
            fields={header.fields}
            actions={
              header.actions?.length
                ? header.actions.map((action) => (
                    <React.Fragment key={action.id}>
                      {action.node}
                    </React.Fragment>
                  ))
                : undefined
            }
          />
        ) : null}
        {notice}
        {statusBar}
        {shownAside ? (
          narrow === null ? null : narrow && tabs ? (
            // Вузько й вкладками — стрічка остання вкладка, а не окремі «Подробиці / Історія».
            <ObjectPageTabStrip
              items={[
                ...sections,
                {
                  id: OBJECT_PAGE_ASIDE_TAB,
                  title: shownAside.label,
                  content: shownAside.content,
                },
              ]}
              {...tabs}
            />
          ) : (
            <ObjectPageBody aside={shownAside} narrow={narrow}>
              {body}
            </ObjectPageBody>
          )
        ) : (
          <div className="space-y-8">{body}</div>
        )}
      </>
    )
  }

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
      {showsRecord ? keptAside.portal : null}
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
        <TabsList className="w-full" aria-label={t("objectPage.tabs")}>
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

/**
 * Що отримує компонент проекту в слоті картки: запис модуля й ресурс API (`invoices`). Права — з
 * `useCanAccess`, мова — з `useLanguage`, поля розширення — `extensionValue(record, id)`.
 */
export interface RecordSlotProps<T> {
  readonly record: T
  readonly resource: string
}

/** Секція картки з компонентом проекту (ADR-0020, п. 2): заголовок h2 і вміст. */
export interface ExtensionSection<T> {
  readonly id: string
  readonly title: LocalizedText
  readonly component: React.ComponentType<RecordSlotProps<T>>
}

/**
 * Стрічка картки з компонентом проекту: стає на місце блоку модуля, праворуч чи вкладкою. Вміст
 * живе, доки відкрита картка (`keepMounted`), бо в слоті буває чернетка.
 */
export interface ExtensionAside<T> {
  readonly label: LocalizedText
  /**
   * Функція, а не `ComponentType`: один слот на всі картки підходить будь-якому запису з `id`. Лише
   * стала функція з модуля: нова на кожен рендер перемонтує слот і знищить чернетку в ньому.
   */
  readonly component: (props: RecordSlotProps<T>) => React.ReactNode
}

/** Дія в шапці картки з компонентом проекту. */
export interface ExtensionAction<T> {
  readonly id: string
  readonly component: React.ComponentType<RecordSlotProps<T>>
  /**
   * Дія ресурсу модуля, на яку потрібне право: `edit` (не `invoices:edit`). Без права чи коли запис
   * дію забороняє (`deniedActions`, ADR-0037), дії не видно; щоб показати її неактивною з причиною
   * (SPEC §8.4), компонент перевіряє сам (`useRecordAccess`) і ставить `DeniedAction`.
   */
  readonly access?: string
}

/**
 * Секції, дії й стрічка розширення для картки (ADR-0020): компонент проекту в слоті отримує запис і ресурс,
 * кожен — у власній межі помилок: збій слота проекту не валить картку модуля (секція показує помилку
 * з повтором, дія зникає). Дія з `access` видна лише з правом, і коли запис її не забороняє
 * (`PermissionGate` з позначкою сервера `deniedActions`, ADR-0037). Поки запису немає,
 * змін немає. Результат модуль зливає зі своїми секціями й діями (`applyKeyedChanges`).
 */
export function useRecordSlots<
  T,
  S extends string = string,
  A extends string = string,
>({
  record,
  resource,
  sections,
  actions,
  aside,
}: {
  record: T | undefined
  resource: string
  sections?: KeyedChanges<ExtensionSection<T>, S>
  actions?: KeyedChanges<ExtensionAction<T>, A>
  aside?: ExtensionAside<T>
}): {
  sections?: KeyedChanges<ObjectPageSectionItem, S>
  actions?: KeyedChanges<ObjectPageAction, A>
  aside?: ObjectPageAside
} {
  const { language } = useLanguage()
  return React.useMemo(() => {
    if (record === undefined) return {}
    const AsideSlot = aside?.component
    return {
      aside:
        aside && AsideSlot
          ? {
              label: localizedText(aside.label, language) ?? "",
              keepMounted: true,
              content: (
                <ErrorBoundary>
                  <React.Suspense fallback={<SectionSkeleton />}>
                    <AsideSlot record={record} resource={resource} />
                  </React.Suspense>
                </ErrorBoundary>
              ),
            }
          : undefined,
      sections: mapKeyedChanges(sections, ({ id, title, component: Slot }) => ({
        id,
        title: localizedText(title, language) ?? id,
        content: (
          <ErrorBoundary>
            <Slot record={record} resource={resource} />
          </ErrorBoundary>
        ),
      })),
      actions: mapKeyedChanges(actions, ({ id, access, component: Slot }) => {
        const node = (
          <ErrorBoundary fallback={failedAction}>
            <Slot record={record} resource={resource} />
          </ErrorBoundary>
        )
        return {
          id,
          node: access ? (
            <PermissionGate resource={resource} action={access} record={record}>
              {node}
            </PermissionGate>
          ) : (
            node
          ),
        }
      }),
    }
  }, [record, resource, sections, actions, aside, language])
}

/**
 * Дія проекту, що впала, зникає з шапки (React пише помилку в консоль, `onError` — немає). Лише чанк
 * лишає кнопку: інакше після деплою людина вирішила б, що права на дію в неї немає (ADR-0055).
 */
function failedAction(_retry: () => void, error: unknown) {
  return isChunkLoadError(error) ? (
    <div className="flex max-w-64 flex-wrap justify-end gap-2 empty:hidden">
      <ReloadPageAction size="sm" variant="outline" />
    </div>
  ) : null
}

/** Секція картки з заголовком h2 і діями. */
function ObjectPageSection({
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
