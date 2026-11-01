import { useQueryClient } from "@tanstack/react-query"
import { useRef, type RefObject } from "react"

import { useErpAuthProvider } from "@/components/erp/auth-layout"
import { PageState } from "@/components/erp/page-state"
import { RecordLink } from "@/components/erp/record-link"
import { StatusTabs } from "@/components/erp/status-tabs"
import {
  ActivityRow,
  useActivityRows,
} from "@/components/erp/timeline-activities"
import { FeedFooter, FeedLoadState } from "@/components/erp/timeline-feed"
import { Spinner } from "@/components/ui/spinner"
import { useTabParam } from "@/hooks/use-tab-param"
import {
  createTimelineActions,
  useFeedRefreshState,
} from "@/hooks/use-timeline"
import {
  TIMELINE_MAX_PER_PAGE,
  TIMELINE_PER_PAGE,
  type TimelineMyActivity,
} from "@/lib/timeline"
import { cn } from "@/lib/utils"

import { useTimelineModule } from "../module-context"
import { useTimelineT } from "../use-timeline-t"
import {
  MY_ACTIVITY_TABS,
  myActivityKey,
  useMyActivities,
  type MyActivityTab,
} from "./use-my-activities"

const isMyActivityTab = (value: string | null): value is MyActivityTab =>
  MY_ACTIVITY_TABS.some((tab) => tab === value)

/** Назва запису; без адреси картки — текст, а запис без назви показує свій `id`. */
function RecordName({ record }: { record: TimelineMyActivity["record"] }) {
  const { extension } = useTimelineModule()
  const settings = extension.myActivities || undefined
  const name = <bdi>{record.title?.trim() || record.id}</bdi>
  const href = settings?.recordHref?.(record)
  return href ? <RecordLink to={href}>{name}</RecordLink> : name
}

/** Порожній стан не підміняє помилку: збій перечитування порожнього списку показує збій. */
function MyActivitiesState({
  feed,
  tab,
  onShowAll,
}: {
  feed: ReturnType<typeof useMyActivities>
  tab: MyActivityTab
  onShowAll: () => void
}) {
  const t = useTimelineT()
  const { query } = feed
  if (!query.data || query.isRefetchError)
    return <FeedLoadState query={query} headingLevel={2} />
  return tab === "all" ? (
    <PageState
      kind="empty"
      className="min-h-40"
      title={t("myActivities.emptyTitle")}
      description={t("myActivities.emptyDescription")}
    />
  ) : (
    <PageState
      kind="no-results"
      className="min-h-40"
      title={t("myActivities.noResultsTitle")}
      description={t("myActivities.noResultsDescription")}
      onReset={onShowAll}
    />
  )
}

function MyActivitiesList({
  feed,
  tab,
  isSwitching,
  heading,
  onShowAll,
}: {
  feed: ReturnType<typeof useMyActivities>
  tab: MyActivityTab
  isSwitching: boolean
  heading: RefObject<HTMLElement | null>
  onShowAll: () => void
}) {
  const t = useTimelineT()
  const provider = useErpAuthProvider()
  const queryClient = useQueryClient()
  const { query, items, total, today } = feed
  const list = useRef<HTMLOListElement>(null)
  const rows = useActivityRows({
    items,
    actionsFor: ({ record }) =>
      createTimelineActions(provider.timeline, queryClient, {
        resource: record.resource,
        id: record.id,
      }),
    keyOf: myActivityKey,
    focusTarget: heading,
    listRef: list,
  })
  return (
    <>
      {items.length ? (
        <>
          <ol
            ref={list}
            tabIndex={-1}
            aria-label={t("myActivities.listLabel")}
            aria-busy={isSwitching}
            className={cn(
              "divide-y rounded-lg border outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isSwitching && "opacity-60",
            )}
          >
            {items.map((item) => (
              <ActivityRow
                key={myActivityKey(item)}
                activity={item}
                today={today}
                readOnly={false}
                meta={<RecordName record={item.record} />}
                {...rows.rowProps(item)}
              />
            ))}
          </ol>
          <FeedFooter
            query={query}
            shown={items.length}
            total={total}
            listRef={list}
          />
        </>
      ) : (
        <MyActivitiesState feed={feed} tab={tab} onShowAll={onShowAll} />
      )}
      {/* Над списком: остання дія зникає з ним, а діалог має закритись як слід. */}
      {rows.dialogs}
    </>
  )
}

/**
 * «Мої справи» (PF05, ADR-0054): дії людини через усі записи. Вкладка — в адресі, як у списків. Стани
 * SPEC §8.1: скелетон, оновлення з видимими даними, «Показати ще», порожньо, нічого не знайдено,
 * помилка, немає доступу, офлайн, застарілі дані, заборонена дія в рядку (ADR-0037).
 */
export function MyActivities({
  heading,
}: {
  /** Останній рядок зникає разом із кнопкою, на якій стояв фокус: він іде на заголовок сторінки. */
  heading: RefObject<HTMLElement | null>
}) {
  const t = useTimelineT()
  const { extension } = useTimelineModule()
  const { value, onValueChange } = useTabParam()
  const tab: MyActivityTab = isMyActivityTab(value) ? value : "all"
  const settings = extension.myActivities || undefined
  const feed = useMyActivities(
    tab,
    Math.min(settings?.perPage ?? TIMELINE_PER_PAGE, TIMELINE_MAX_PER_PAGE),
  )
  const { isRefreshing, isSwitching } = useFeedRefreshState(feed.query)
  return (
    <div className="@container max-w-3xl min-w-0 space-y-4">
      <div className="flex min-w-0 items-center gap-2">
        <StatusTabs
          className="min-w-0"
          label={t("myActivities.tabsLabel")}
          tabs={MY_ACTIVITY_TABS.map((id) => ({
            id,
            label: t(`myActivities.tabs.${id}`),
            filter: {},
          }))}
          value={tab}
          onValueChange={onValueChange}
        />
        {isRefreshing ? (
          <Spinner
            aria-label={t("myActivities.updating")}
            className="size-4 shrink-0"
          />
        ) : null}
      </div>
      <MyActivitiesList
        feed={feed}
        tab={tab}
        isSwitching={isSwitching}
        heading={heading}
        onShowAll={() => {
          onValueChange("all")
        }}
      />
    </div>
  )
}
