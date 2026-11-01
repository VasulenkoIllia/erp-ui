import * as React from "react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/registry/erp/confirm-dialog"
import { PageState, SectionSkeleton } from "@/registry/erp/page-state"
import type { RichTextViewProps } from "@/registry/erp/rich-text-view"
import {
  TimelineEntryItem,
  type TimelineDeletable,
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

/** Запит без даних: скелетон, офлайн чи помилка замість усієї стрічки або лише списку. */
export function FeedLoadState({ query }: { query: TimelineFeedData["query"] }) {
  const retry = () => {
    void query.refetch()
  }
  if (query.isPending)
    // Без мережі запит на паузі, помилки немає: інакше скелетон лишився б назавжди.
    return query.fetchStatus === "paused" ? (
      <PageState
        kind="offline"
        className="min-h-40"
        headingLevel={3}
        onRetry={retry}
      />
    ) : (
      <SectionSkeleton rows={4} />
    )
  return (
    <PageState
      kind={errorStateKind(query.error)}
      className="min-h-40"
      headingLevel={3}
      onRetry={retry}
    />
  )
}

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
  query: TimelineFeedData["query"]
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

function FeedList({
  feed,
  actions,
  readOnly,
  mentions,
  renderMention,
  onDelete,
}: {
  feed: TimelineFeedData
  actions: TimelineActions
  readOnly: boolean
  mentions?: MentionSearch | false
  renderMention?: RichTextViewProps["renderMention"]
  onDelete: (entry: TimelineDeletable) => void
}) {
  const t = useErpUiT()
  const { query, entries, total } = feed
  const list = React.useRef<HTMLOListElement>(null)
  const focusAfterFetch = useFocusAfterFetch(
    list,
    query.isFetching,
    entries.length,
  )
  return (
    <>
      <ol
        ref={list}
        tabIndex={-1}
        aria-label={t("timeline.listLabel")}
        aria-busy={query.isPlaceholderData}
        className={cn(
          "space-y-4 outline-none",
          query.isPlaceholderData && "opacity-60",
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
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t("timeline.shown", { shown: entries.length, total })}
        </p>
        {query.hasNextPage ? (
          <Button
            variant="outline"
            size="sm"
            disabled={query.isFetchingNextPage}
            focusableWhenDisabled
            onClick={() => {
              focusAfterFetch(entries.length)
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
          focusAfterFetch(isMore ? entries.length : 0)
        }}
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
          void actions.refresh()
        }
        onClose()
      }}
    />
  )
}

type FeedContentProps = Omit<React.ComponentProps<typeof FeedList>, "onDelete">

export function TimelineFeed({
  actions,
  ...props
}: FeedContentProps & {
  filter: TimelineFilter
  onResetFilter: () => void
  onCompose: () => void
}) {
  const [deleting, setDeleting] = React.useState<TimelineDeletable | null>(null)
  const root = React.useRef<HTMLDivElement>(null)
  return (
    <div ref={root} tabIndex={-1} className="space-y-4 outline-none">
      <FeedContent actions={actions} {...props} onDelete={setDeleting} />
      <DeleteDialog
        deleting={deleting}
        actions={actions}
        // Кнопка меню зникла разом із записом: фокус лишається в стрічці (WCAG 2.4.3).
        returnFocus={() => root.current}
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
