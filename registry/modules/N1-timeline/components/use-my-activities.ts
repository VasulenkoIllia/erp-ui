import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query"
import { useMemo } from "react"

import { useErpAuthProvider } from "@/components/erp/auth-layout"
import { useCompanyId } from "@/hooks/use-company"
import {
  nextTimelinePage,
  useRefreshOnEvent,
  useTimelinePollInterval,
} from "@/hooks/use-timeline"
import { companyScope } from "@/lib/company-scope"
import { addDays, todayIn } from "@/lib/dates"
import {
  TIMELINE_MY_ACTIVITIES_KEY,
  type TimelineDueRange,
  type TimelineMyActivity,
} from "@/lib/timeline"
import { useUserTimeZone } from "@/lib/user-timezone"

/** Вкладки сторінки; перша — без меж терміну. */
export const MY_ACTIVITY_TABS = ["all", "overdue", "today", "upcoming"] as const
export type MyActivityTab = (typeof MY_ACTIVITY_TABS)[number]

/** Межі терміну вкладки: сервер не знає, який сьогодні день у людини. */
export function myActivityRange(
  tab: MyActivityTab,
  today: string,
): TimelineDueRange {
  switch (tab) {
    case "overdue":
      return { dueTo: addDays(today, -1) }
    case "today":
      return { dueFrom: today, dueTo: today }
    case "upcoming":
      return { dueFrom: addDays(today, 1) }
    case "all":
      return {}
  }
}

/** `id` дії унікальний лише в межах запису. */
export const myActivityKey = ({ id, record }: TimelineMyActivity) =>
  `${record.resource}/${record.id}/${id}`

const uniqueRows = (rows: readonly TimelineMyActivity[]) => [
  ...new Map(rows.map((row) => [myActivityKey(row), row])).values(),
]

const isTimelineEvent = ({ type }: { type: string }) =>
  type.endsWith(".timeline")

/**
 * Дії людини сторінками. Подія приходить від будь-якого ресурсу, тож слухаємо всі `<ресурс>.timeline`;
 * без каналу — опитування, як у стрічці. Повернення на сторінку завжди перечитує: людина могла щойно
 * закрити дію на картці.
 */
export function useMyActivities(tab: MyActivityTab, perPage: number) {
  const provider = useErpAuthProvider()
  const companyId = useCompanyId()
  const timeZone = useUserTimeZone()
  const today = todayIn(timeZone)
  const range = myActivityRange(tab, today)
  const refetchInterval = useTimelinePollInterval()
  useRefreshOnEvent(TIMELINE_MY_ACTIVITIES_KEY, isTimelineEvent)
  const query = useInfiniteQuery({
    queryKey: [
      ...TIMELINE_MY_ACTIVITIES_KEY,
      range,
      perPage,
      companyScope(companyId),
    ],
    queryFn: ({ pageParam, signal }) =>
      provider.timeline.myActivities(range, pageParam, perPage, signal),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => nextTimelinePage(last, pages, perPage),
    // Нова вкладка лишає попередній список, доки не прийде свій: сторінка не блимає скелетоном.
    placeholderData: keepPreviousData,
    refetchInterval,
    refetchOnMount: "always",
  })
  const pages = query.data?.pages
  const items = useMemo(
    () => uniqueRows(pages?.flatMap((page) => page.data) ?? []),
    [pages],
  )
  return { query, items, total: pages?.[0]?.total ?? 0, today }
}
