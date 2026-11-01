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
import type {
  TimelineActions,
  useTimelineFeed,
} from "@/registry/hooks/use-timeline"
import { announce } from "@/registry/lib/announce"
import { errorStateKind } from "@/registry/lib/api"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import type { MentionSearch } from "@/registry/lib/rich-text"
import type { TimelineFilter } from "@/registry/lib/timeline"
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

/** Показані дані застаріли: перечитування чи наступна сторінка не вдались (SPEC §8.1, п. 8, 11). */
function FeedNotice({ query }: { query: TimelineFeedData["query"] }) {
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
}: {
  feed: TimelineFeedData
  actions: TimelineActions
  readOnly: boolean
  mentions?: MentionSearch | false
  renderMention?: RichTextViewProps["renderMention"]
}) {
  const t = useErpUiT()
  const errorText = useApiErrorMessage()
  const { query, entries, total } = feed
  const [deleting, setDeleting] = React.useState<TimelineDeletable | null>(null)
  const list = React.useRef<HTMLOListElement>(null)
  const isFile = deleting?.kind === "file"
  return (
    <>
      <ol
        ref={list}
        tabIndex={-1}
        aria-label={t("timeline.listLabel")}
        className="space-y-4 outline-none"
      >
        {entries.map((entry) => (
          <TimelineEntryItem
            key={entry.id}
            entry={entry}
            actions={actions}
            readOnly={readOnly}
            mentions={mentions}
            renderMention={renderMention}
            onDelete={setDeleting}
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
              void query.fetchNextPage()
            }}
          >
            {query.isFetchingNextPage ? <Spinner aria-hidden /> : null}
            {t("timeline.more")}
          </Button>
        ) : null}
      </div>
      <FeedNotice query={query} />
      <ConfirmDialog
        open={deleting !== null}
        title={t(
          isFile ? "timeline.fileDeleteTitle" : "timeline.noteDeleteTitle",
        )}
        description={
          deleting?.kind === "file"
            ? t("timeline.fileDeleteDescription", { name: deleting.file.name })
            : t("timeline.noteDeleteDescription")
        }
        confirmLabel={t(isFile ? "timeline.fileDelete" : "timeline.noteDelete")}
        destructive
        // Кнопка меню зникла разом із записом: фокус лишається в списку (WCAG 2.4.3).
        returnFocus={() => list.current}
        onClose={() => {
          setDeleting(null)
        }}
        onConfirm={async () => {
          if (!deleting) return
          try {
            await actions.remove(deleting.id)
            announce(t("timeline.deleted"))
          } catch (failure) {
            toast.error(errorText(failure))
          }
          setDeleting(null)
        }}
      />
    </>
  )
}

export function TimelineFeed({
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
