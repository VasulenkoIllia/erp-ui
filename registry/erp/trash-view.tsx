import * as React from "react"
import { useInfiniteQuery } from "@tanstack/react-query"
import { useAuthProvider } from "@/registry/lib/ra-core"
import type { z } from "zod"

import { PageState, SectionSkeleton } from "@/registry/erp/page-state"
import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import { useCompanyId } from "@/registry/hooks/use-company"
import { isFocusLost } from "@/registry/hooks/use-focus-heading"
import { useTrashSettings } from "@/registry/hooks/use-trash"
import { useTrashRestore } from "@/registry/hooks/use-trash-restore"
import { errorStateKind } from "@/registry/lib/api"
import type { ErpAuthProvider } from "@/registry/lib/auth"
import { companyScope } from "@/registry/lib/company-scope"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import { ukTrash } from "@/registry/lib/i18n-uk-trash"
import { ACTION_ICONS } from "@/registry/lib/icons"
import {
  isTrashUnsupported,
  TRASH_PURGE_SOON_DAYS,
  TRASH_QUERY_KEYS,
  type TrashEntry,
  type TrashPage,
} from "@/registry/lib/trash"
import { Button } from "@/registry/ui/button"
import { Spinner } from "@/registry/ui/spinner"

const RestoreIcon = ACTION_ICONS.restore
const TrashIcon = ACTION_ICONS.delete

const TRASH_PER_PAGE = 20
const DAY_MS = 86_400_000

export interface TrashViewProps<T> {
  /** Ресурс API, записи якого показує кошик: `organizations`. */
  resource: string
  /** Схема рядка списку ресурсу: запис, що її не пройшов, підписано «Запис <id>». */
  schema: z.ZodType<T>
  /** Назва запису словами модуля: номер документа, назва організації. */
  rowLabel: (record: T) => string
  /** Друга строка: клієнт і дата чернетки, код організації. */
  rowDescription?: (record: T) => string | undefined
  /** Картка запису: «Відкрити» в сповіщенні після відновлення. */
  recordHref?: (id: string) => string
  /** Заголовок сторінки: фокус, коли відновили останній рядок. */
  headingRef?: React.RefObject<HTMLHeadingElement | null>
  /** Рівень заголовків станів (порожньо, помилка): 3 — кошик усередині розділу з h2. */
  headingLevel?: 2 | 3
  perPage?: number
}

interface ShownEntry {
  readonly entry: TrashEntry
  readonly name: string
  readonly description: string | undefined
}

/**
 * Кошик ресурсу (PF16, ADR-0095): видалені записи, новіші першими, хто й коли видалив, коли сервер
 * видалить назавжди (за `TRASH_PURGE_SOON_DAYS` до того — попередження словами, не лише кольором),
 * «Відновити» в кожному рядку. Стани: завантаження, офлайн, помилка з повтором, немає права, бекенд без
 * кошика, порожньо, «Показати ще»; збій наступної сторінки чи перечитування — під списком із повтором,
 * показане лишається.
 *
 * Відновлення — сповіщення з «Відкрити» картку; запису вже немає чи його місце зайняв інший — причина
 * словами кошика. Рядок зникає одразу, фокус — на «Відновити» сусіднього рядка, без рядків — на
 * заголовок; після «Показати ще» — на перший новий рядок, коли кнопка зникла разом із фокусом.
 */
export function TrashView<T>({
  resource,
  schema,
  rowLabel,
  rowDescription,
  recordHref,
  headingRef,
  headingLevel = 2,
  perPage = TRASH_PER_PAGE,
}: TrashViewProps<T>) {
  const t = useErpUiT(ukTrash)
  const provider = useAuthProvider<ErpAuthProvider>()
  const companyId = useCompanyId()
  const { settings } = useTrashSettings()
  const list = React.useRef<HTMLUListElement>(null)
  // Мить відкриття кошика: «скоро видалить назавжди» рахуємо від неї, а не від кожного перемальовування.
  const [now] = React.useState(() => Date.now())
  const query = useInfiniteQuery({
    queryKey: [
      ...TRASH_QUERY_KEYS.entries,
      resource,
      perPage,
      companyScope(companyId),
    ],
    refetchOnMount: "always",
    queryFn: ({ pageParam }) => {
      if (!provider) throw new Error("authProvider is required")
      return provider.trash.list(resource, pageParam, perPage)
    },
    initialPageParam: 1,
    getNextPageParam: (last, pages) =>
      pages.length * perPage < last.total ? pages.length + 1 : undefined,
    enabled: Boolean(provider),
  })
  // Куди поставити фокус після відновлення чи «Показати ще»: ефект бачить уже оновлений список.
  const [focusAt, setFocusAt] = React.useState<{ index: number } | null>(null)
  React.useEffect(() => {
    if (focusAt) focusAfterChange(list.current, focusAt.index, headingRef)
  }, [focusAt, headingRef])
  const { restore, restoring } = useTrashRestore({
    resource,
    recordHref,
    afterRestore: (index) => {
      setFocusAt({ index })
    },
  })

  const retry = () => {
    if (query.isFetchNextPageError) void query.fetchNextPage()
    else void query.refetch()
  }

  if (query.isPending)
    return query.fetchStatus === "paused" ? (
      <PageState kind="offline" className="min-h-40" onRetry={retry} />
    ) : (
      <SectionSkeleton rows={4} />
    )
  if (!query.data)
    return isTrashUnsupported(query.error) ? (
      <PageState
        kind="empty"
        icon={TrashIcon}
        className="min-h-40"
        headingLevel={headingLevel}
        title={t("trash.open")}
        description={t("trash.unsupported")}
      />
    ) : (
      <PageState
        kind={errorStateKind(query.error)}
        className="min-h-40"
        headingLevel={headingLevel}
        onRetry={retry}
      />
    )

  const unnamed = (id: string) => t("trash.unnamed", { id })
  const shown: ShownEntry[] = uniqueEntries(query.data.pages).map((entry) => {
    const parsed = schema.safeParse(entry.record)
    return parsed.success
      ? {
          entry,
          name: rowLabel(parsed.data) || unnamed(entry.id),
          description: rowDescription?.(parsed.data),
        }
      : { entry, name: unnamed(entry.id), description: undefined }
  })
  const showMore = () => {
    const from = shown.length
    void query.fetchNextPage().then((result) => {
      if (!result.isFetchNextPageError) setFocusAt({ index: from })
    })
  }
  const total = query.data.pages[0]?.total ?? 0
  const lead = settings
    ? t("trash.lead", { count: settings.retentionDays })
    : undefined

  return (
    <div className="@container space-y-4" data-slot="trash-view">
      {lead ? <p className="text-sm text-muted-foreground">{lead}</p> : null}
      {shown.length ? (
        <>
          <ul
            ref={list}
            className="divide-y rounded-lg border"
            aria-label={t("trash.listLabel")}
          >
            {shown.map((item, index) => (
              <TrashEntryItem
                key={`${item.entry.resource}:${item.entry.id}`}
                item={item}
                now={now}
                isRestoring={restoring.has(item.entry.id)}
                onRestore={() => {
                  restore(item.entry, item.name, index)
                }}
              />
            ))}
          </ul>
          <TrashMore
            query={query}
            shown={shown.length}
            total={total}
            onMore={showMore}
            onRetry={retry}
          />
        </>
      ) : (
        <PageState
          kind="empty"
          icon={TrashIcon}
          className="min-h-40"
          headingLevel={headingLevel}
          title={t("trash.empty")}
          description={t("trash.emptyHint")}
        />
      )}
    </div>
  )
}

function TrashEntryItem({
  item: { entry, name, description },
  now,
  isRestoring,
  onRestore,
}: {
  item: ShownEntry
  now: number
  isRestoring: boolean
  onRestore: () => void
}) {
  const t = useErpUiT(ukTrash)
  const format = useFormat()
  const purgeDate = format.date(entry.purgeAt, "date")
  const isSoon =
    Date.parse(entry.purgeAt) - now <= TRASH_PURGE_SOON_DAYS * DAY_MS
  return (
    <li className="flex flex-col gap-3 p-4 @md:flex-row @md:items-center">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium break-words">{name}</p>
        {description ? (
          <p className="text-sm break-words text-muted-foreground">
            {description}
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {t("trash.deletedAt", {
            date: format.date(entry.deletedAt, "dateTime"),
          })}
          {entry.deletedBy
            ? ` · ${t("trash.deletedBy", { name: entry.deletedBy.name })}`
            : null}
        </p>
        <p
          className={
            isSoon
              ? "text-sm text-warning-foreground"
              : "text-sm text-muted-foreground"
          }
        >
          {isSoon
            ? t("trash.purgeSoon", { date: purgeDate })
            : t("trash.purgeAt", { date: purgeDate })}
        </p>
      </div>
      <Button
        variant="outline"
        className="self-start @md:self-center"
        data-trash-restore=""
        aria-label={t("trash.restoreFor", { name })}
        disabled={isRestoring}
        onClick={onRestore}
      >
        {isRestoring ? <Spinner aria-hidden /> : <RestoreIcon aria-hidden />}
        {t("trash.restore")}
      </Button>
    </li>
  )
}

/**
 * Лічильник, «Показати ще» і збій під списком із повтором: наступна сторінка чи перечитування після
 * відновлення (рядок, який уже відновили, інакше лишився б із кнопкою). Показане лишається.
 */
function TrashMore({
  query,
  shown,
  total,
  onMore,
  onRetry,
}: {
  query: {
    hasNextPage: boolean
    isFetchingNextPage: boolean
    isFetching: boolean
    isError: boolean
    error: unknown
  }
  shown: number
  total: number
  onMore: () => void
  onRetry: () => void
}) {
  const t = useErpUiT(ukTrash)
  const errorMessage = useApiErrorMessage()
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t("trash.shown", { shown, total })}
        </p>
        {query.hasNextPage ? (
          <Button
            variant="outline"
            disabled={query.isFetchingNextPage}
            onClick={onMore}
          >
            {query.isFetchingNextPage ? <Spinner aria-hidden /> : null}
            {t("trash.more")}
          </Button>
        ) : null}
      </div>
      {query.isError ? (
        <div className="flex flex-wrap items-center gap-3" role="alert">
          <p className="text-sm text-destructive-foreground">
            {errorMessage(query.error)}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={query.isFetching}
            onClick={onRetry}
          >
            {query.isFetching ? <Spinner aria-hidden /> : null}
            {t("pageState.error.retry")}
          </Button>
        </div>
      ) : null}
    </>
  )
}

/**
 * Кнопка у фокусі зникла (рядок відновили, «Показати ще» дійшло до кінця) чи вимкнулась на час запиту:
 * фокус на «Відновити» рядка `index`, інакше попереднього; без рядків — на заголовок сторінки. Фокус,
 * який людина вже поставила деінде, не чіпаємо. Викликається з ефекту: список уже оновлено.
 */
function focusAfterChange(
  list: HTMLUListElement | null,
  index: number,
  heading: React.RefObject<HTMLHeadingElement | null> | undefined,
) {
  if (!isFocusLost()) return
  const buttons =
    list?.querySelectorAll<HTMLButtonElement>("[data-trash-restore]") ?? []
  const next = buttons[index] ?? buttons[index - 1]
  if (next) next.focus()
  else heading?.current?.focus()
}

/** Записи сторінок без повторів: нове видалення між сторінками зсуває рядок на наступну. */
function uniqueEntries(pages: readonly TrashPage[]): TrashEntry[] {
  const seen = new Set<string>()
  return pages
    .flatMap((page) => page.data)
    .filter((entry) => {
      const key = `${entry.resource}:${entry.id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}
