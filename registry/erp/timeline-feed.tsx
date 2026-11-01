import type { UseInfiniteQueryResult } from "@tanstack/react-query"
import * as React from "react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/registry/erp/confirm-dialog"
import { PageState, SectionSkeleton } from "@/registry/erp/page-state"
import type { RichTextViewProps } from "@/registry/erp/rich-text-view"
import {
  TimelineEntryItem,
  type TimelineDeletable,
  type TimelineEntryItemProps,
} from "@/registry/erp/timeline-entry"
import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import {
  useLastValue,
  type TimelineActions,
  type useTimelineFeed,
} from "@/registry/hooks/use-timeline"
import { announce } from "@/registry/lib/announce"
import { errorStateKind, isApiError } from "@/registry/lib/api"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import type { MentionSearch } from "@/registry/lib/rich-text"
import { timelineEntryKey, type TimelineFilter } from "@/registry/lib/timeline"
import { cn } from "@/registry/lib/utils"
import { Button } from "@/registry/ui/button"
import { Spinner } from "@/registry/ui/spinner"

/**
 * Список записів стрічки (UI01, ADR-0053) і його стани SPEC §8.1: скелетон, «Показати ще», порожньо,
 * нічого не знайдено, помилка, немає доступу, офлайн, застарілі дані. Порожній стан не підміняє помилку.
 */
export type TimelineFeedData = ReturnType<typeof useTimelineFeed>

/** Те, що беруть стани списку: «Мої справи» мають той самий запит сторінками з іншими рядками. */
type FeedQuery = Pick<
  UseInfiniteQueryResult<unknown>,
  | "isPending"
  | "isFetching"
  | "isFetchingNextPage"
  | "isFetchNextPageError"
  | "isRefetchError"
  | "hasNextPage"
  | "isPlaceholderData"
  | "fetchStatus"
  | "error"
  | "dataUpdatedAt"
  | "refetch"
  | "fetchNextPage"
>

/** Запит без даних: скелетон, офлайн чи помилка замість усієї стрічки або лише списку. */
export function FeedLoadState({
  query,
  headingLevel = 3,
}: {
  query: FeedQuery
  /** Стан на місці всієї сторінки під її h1 — 2. */
  headingLevel?: 2 | 3
}) {
  const retry = () => {
    void query.refetch()
  }
  if (query.isPending)
    // Без мережі запит на паузі, помилки немає: інакше скелетон лишився б назавжди.
    return query.fetchStatus === "paused" ? (
      <PageState
        kind="offline"
        className="min-h-40"
        headingLevel={headingLevel}
        onRetry={retry}
      />
    ) : (
      <SectionSkeleton rows={4} />
    )
  return (
    <PageState
      kind={errorStateKind(query.error)}
      className="min-h-40"
      headingLevel={headingLevel}
      onRetry={retry}
    />
  )
}

/** Немає такого запису: фокус іде на сам список. */
const NO_ENTRY = -1

/**
 * Кнопка зникає разом зі станом, що її показав («Показати ще» на останній сторінці, успішний повтор).
 * Фокус тоді йде на запис із переданим номером, а не на сторінку (WCAG 2.4.3).
 */
function useFocusAfterFetch(
  list: React.RefObject<HTMLOListElement | null>,
  isFetching: boolean,
  count: number,
) {
  const entryIndex = React.useRef<number | null>(null)
  React.useEffect(() => {
    if (isFetching || entryIndex.current === null) return
    const index = entryIndex.current
    entryIndex.current = null
    if (document.activeElement !== document.body) return
    const entry = list.current?.children[index] as HTMLElement | undefined
    const target = entry ?? list.current
    target?.focus({ preventScroll: true })
  }, [isFetching, count, list])
  return (index: number) => {
    entryIndex.current = index
  }
}

/** Показані дані застаріли: перечитування чи наступна сторінка не вдались (SPEC §8.1, п. 8, 11). */
function FeedNotice({
  query,
  onRetry,
}: {
  query: FeedQuery
  onRetry: (isMore: boolean) => void
}) {
  const t = useErpUiT()
  const format = useFormat()
  const isMoreError = query.isFetchNextPageError
  if (!isMoreError && !query.isRefetchError) return null
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
      <span>
        {isMoreError
          ? t("timeline.moreFailed")
          : t("timeline.stale", {
              time: format.date(query.dataUpdatedAt, "time"),
            })}
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={query.isFetching}
        focusableWhenDisabled
        onClick={() => {
          onRetry(isMoreError)
          void (isMoreError ? query.fetchNextPage() : query.refetch())
        }}
      >
        {query.isFetching ? <Spinner aria-hidden /> : null}
        {t(isMoreError ? "pageState.error.retry" : "timeline.refresh")}
      </Button>
    </div>
  )
}

/** Під списком: скільки показано, «Показати ще», застарілі дані. Фокус не падає разом із кнопкою. */
export function FeedFooter({
  query,
  shown,
  total,
  listRef,
}: {
  query: FeedQuery
  shown: number
  total: number
  listRef: React.RefObject<HTMLOListElement | null>
}) {
  const t = useErpUiT()
  const focusAfterFetch = useFocusAfterFetch(listRef, query.isFetching, shown)
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t("timeline.shown", { shown, total })}
        </p>
        {/* Рядки попередньої вкладки: їхні сторінки до нової вкладки не стосуються. */}
        {query.hasNextPage && !query.isPlaceholderData ? (
          <Button
            variant="outline"
            size="sm"
            disabled={query.isFetchingNextPage}
            focusableWhenDisabled
            onClick={() => {
              focusAfterFetch(shown)
              void query.fetchNextPage()
            }}
          >
            {query.isFetchingNextPage ? <Spinner aria-hidden /> : null}
            {t("timeline.more")}
          </Button>
        ) : null}
      </div>
      <FeedNotice
        query={query}
        onRetry={(isMore) => {
          focusAfterFetch(isMore ? shown : NO_ENTRY)
        }}
      />
    </>
  )
}

function FeedList({
  feed,
  actions,
  readOnly,
  mentions,
  renderMention,
  isSwitching,
  listRef,
  onDelete,
}: {
  feed: TimelineFeedData
  actions: TimelineActions
  readOnly: boolean
  mentions?: MentionSearch | false
  renderMention?: RichTextViewProps["renderMention"]
  /** Новий фільтр ще не прийшов, видно попередній список. */
  isSwitching: boolean
  listRef: React.RefObject<HTMLOListElement | null>
  onDelete: TimelineEntryItemProps["onDelete"]
}) {
  const t = useErpUiT()
  const { query, entries, total } = feed
  return (
    <>
      <ol
        ref={listRef}
        tabIndex={-1}
        aria-label={t("timeline.listLabel")}
        aria-busy={isSwitching}
        className={cn(
          "space-y-4 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isSwitching && "opacity-60",
        )}
      >
        {entries.map((entry) => (
          <TimelineEntryItem
            key={timelineEntryKey(entry)}
            entry={entry}
            actions={actions}
            readOnly={readOnly}
            mentions={mentions}
            renderMention={renderMention}
            onDelete={onDelete}
          />
        ))}
      </ol>
      <FeedFooter
        query={query}
        shown={entries.length}
        total={total}
        listRef={listRef}
      />
    </>
  )
}

/** Діалог живе над списком: останній запис зникає зі списком, а діалог має закритись як слід. */
function DeleteDialog({
  deleting,
  actions,
  returnFocus,
  onClose,
}: {
  deleting: TimelineDeletable | null
  actions: TimelineActions
  returnFocus: () => HTMLElement | null
  onClose: () => void
}) {
  const t = useErpUiT()
  const errorText = useApiErrorMessage()
  const shown = useLastValue(deleting)
  const isFile = shown?.kind === "file"
  return (
    <ConfirmDialog
      open={deleting !== null}
      title={t(
        isFile ? "timeline.fileDeleteTitle" : "timeline.noteDeleteTitle",
      )}
      description={
        shown?.kind === "file"
          ? t("timeline.fileDeleteDescription", { name: shown.file.name })
          : t("timeline.noteDeleteDescription")
      }
      confirmLabel={t(isFile ? "timeline.fileDelete" : "timeline.noteDelete")}
      destructive
      lockWhileBusy
      returnFocus={returnFocus}
      onClose={onClose}
      onConfirm={async () => {
        if (!deleting) return
        try {
          await actions.remove(deleting.id)
          announce(t("timeline.deleted"))
        } catch (failure) {
          // Відповідь загубилась чи запис уже видалив колега: 404 і є результат.
          if (isApiError(failure) && failure.status === 404)
            announce(t("timeline.deleted"))
          else toast.error(errorText(failure))
          await actions.refresh()
        }
        onClose()
      }}
    />
  )
}

type FeedContentProps = Omit<
  React.ComponentProps<typeof FeedList>,
  "onDelete" | "listRef"
>

export function TimelineFeed({
  actions,
  ...props
}: FeedContentProps & {
  filter: TimelineFilter
  onResetFilter: () => void
  onCompose: () => void
}) {
  const t = useErpUiT()
  const [deleting, setDeleting] = React.useState<{
    entry: TimelineDeletable
    opener: HTMLElement | null
  } | null>(null)
  const lastDeleting = useLastValue(deleting)
  const root = React.useRef<HTMLDivElement>(null)
  const list = React.useRef<HTMLOListElement>(null)
  return (
    <div
      ref={root}
      role="group"
      tabIndex={-1}
      aria-label={t("timeline.listLabel")}
      className="space-y-4 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <FeedContent
        actions={actions}
        {...props}
        listRef={list}
        onDelete={(entry, opener) => {
          setDeleting({ entry, opener })
        }}
      />
      <DeleteDialog
        deleting={deleting?.entry ?? null}
        actions={actions}
        // Запис лишився — до його меню; зник разом із кнопкою — у стрічку (WCAG 2.4.3).
        returnFocus={() => {
          const opener = lastDeleting?.opener
          return opener?.isConnected ? opener : (list.current ?? root.current)
        }}
        onClose={() => {
          setDeleting(null)
        }}
      />
    </div>
  )
}

function FeedContent({
  feed,
  filter,
  readOnly,
  onResetFilter,
  onCompose,
  ...listProps
}: React.ComponentProps<typeof FeedList> & {
  filter: TimelineFilter
  onResetFilter: () => void
  onCompose: () => void
}) {
  const t = useErpUiT()
  if (!feed.query.data) return <FeedLoadState query={feed.query} />
  if (feed.entries.length)
    return <FeedList feed={feed} readOnly={readOnly} {...listProps} />
  if (filter !== "all")
    return (
      <PageState
        kind="no-results"
        className="min-h-40"
        headingLevel={3}
        onReset={onResetFilter}
      />
    )
  return (
    <PageState
      kind="empty"
      className="min-h-40"
      headingLevel={3}
      title={t("timeline.emptyTitle")}
      description={t("timeline.emptyDescription")}
      action={
        readOnly ? undefined : (
          <Button onClick={onCompose}>{t("timeline.emptyAction")}</Button>
        )
      }
    />
  )
}
