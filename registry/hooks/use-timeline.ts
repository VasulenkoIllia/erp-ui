/**
 * Дані стрічки запису (PF05, ADR-0053): записи сторінками, підписники, заплановані дії й зміни.
 *
 * - Оновлення: подія `<ресурс>.timeline` з `id` запису перечитує стрічку не частіше ніж раз на секунду;
 *   подія самого запису й обрив каналу доходять через кеш (`syncRealtimeCache`), бо ключі починаються
 *   з ресурсу. Без каналу — опитування раз на хвилину.
 * - Кожна дія чекає перечитування: кнопка зайнята, доки новий запис не з'явиться в стрічці, тож
 *   поле не стає порожнім раніше.
 */
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import * as React from "react"

import { useErpAuthProvider } from "@/registry/erp/auth-layout"
import { useCompanyId } from "@/registry/hooks/use-company"
import {
  useRealtimeEvent,
  useRealtimeStatus,
} from "@/registry/hooks/use-realtime"
import { companyScope } from "@/registry/lib/company-scope"
import { newImportRequestId } from "@/registry/lib/imports"
import { REALTIME_FLUSH_MS } from "@/registry/lib/realtime-cache"
import {
  TIMELINE_PER_PAGE,
  TIMELINE_POLL_MS,
  timelineEntriesOf,
  timelineEventType,
  timelineQueryKey,
  type TimelineApi,
  type TimelineFilter,
  type TimelineTarget,
} from "@/registry/lib/timeline"

function useTimelineKeys(target: TimelineTarget) {
  const companyId = useCompanyId()
  const root = React.useMemo(() => timelineQueryKey(target), [target])
  const scope = companyScope(companyId)
  return { root, scope }
}

/** Перечитати стрічку за подією каналу: подій може бути багато, запит — один на секунду. */
export function useTimelineRealtime(target: TimelineTarget): void {
  const queryClient = useQueryClient()
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined)
  useRealtimeEvent((event) => {
    if (event.type !== timelineEventType(target.resource)) return
    if (event.id !== target.id) return
    timer.current ??= setTimeout(() => {
      timer.current = undefined
      void queryClient.invalidateQueries({
        queryKey: timelineQueryKey(target),
      })
    }, REALTIME_FLUSH_MS)
  })
  React.useEffect(
    () => () => {
      clearTimeout(timer.current)
    },
    [],
  )
}

/** Опитування лише без каналу: `open` оновлює стрічку за подіями. */
function usePollInterval(): number | false {
  return useRealtimeStatus() === "open" ? false : TIMELINE_POLL_MS
}

export function useTimelineFeed(
  target: TimelineTarget,
  filter: TimelineFilter,
) {
  const provider = useErpAuthProvider()
  const { root, scope } = useTimelineKeys(target)
  const refetchInterval = usePollInterval()
  const query = useInfiniteQuery({
    queryKey: [...root, "entries", filter, scope],
    queryFn: ({ pageParam }) =>
      provider.timeline.list(target, filter, pageParam, TIMELINE_PER_PAGE),
    initialPageParam: 1,
    getNextPageParam: (last, pages) =>
      pages.length * TIMELINE_PER_PAGE < last.total
        ? pages.length + 1
        : undefined,
    // Новий фільтр лишає попередній список, доки не прийде свій: стрічка не блимає скелетоном.
    placeholderData: keepPreviousData,
    refetchInterval,
  })
  const pages = query.data?.pages
  const entries = React.useMemo(() => timelineEntriesOf(pages ?? []), [pages])
  return { query, entries, total: pages?.[0]?.total ?? 0 }
}

export function useTimelineFollowers(target: TimelineTarget, enabled = true) {
  const provider = useErpAuthProvider()
  const { root, scope } = useTimelineKeys(target)
  const refetchInterval = usePollInterval()
  return useQuery({
    queryKey: [...root, "followers", scope],
    queryFn: () => provider.timeline.followers(target),
    enabled,
    refetchInterval,
  })
}

export function useTimelineActivities(target: TimelineTarget, enabled = true) {
  const provider = useErpAuthProvider()
  const { root, scope } = useTimelineKeys(target)
  const refetchInterval = usePollInterval()
  return useQuery({
    queryKey: [...root, "activities", scope],
    queryFn: () => provider.timeline.activities(target),
    enabled,
    refetchInterval,
  })
}

/** Методи API без `target`: дія чекає перечитування стрічки. */
type TargetArgs<F> = F extends (
  target: TimelineTarget,
  ...rest: infer A
) => infer R
  ? (...args: A) => R
  : never
export type TimelineActions = {
  [
    K in Exclude<keyof TimelineApi, "list" | "followers" | "activities">
  ]: TargetArgs<TimelineApi[K]>
} & {
  /** Перечитати стрічку: чужа версія (409) лишає в кеші застарілу дію. */
  refresh: () => Promise<void>
}

export function useTimelineActions(target: TimelineTarget): TimelineActions {
  const provider = useErpAuthProvider()
  const queryClient = useQueryClient()
  return React.useMemo(() => {
    const { timeline } = provider
    const refresh = () =>
      queryClient.invalidateQueries({ queryKey: timelineQueryKey(target) })
    const done = async <T>(result: T) => {
      await refresh()
      return result
    }
    return {
      refresh,
      post: (input) => timeline.post(target, input).then(done),
      updateNote: (entryId, input) =>
        timeline.updateNote(target, entryId, input).then(done),
      remove: (entryId) => timeline.remove(target, entryId).then(done),
      uploadFile: (file, requestId) =>
        timeline.uploadFile(target, file, requestId).then(done),
      follow: (userId) => timeline.follow(target, userId).then(done),
      unfollow: (userId) => timeline.unfollow(target, userId).then(done),
      addActivity: (input) => timeline.addActivity(target, input).then(done),
      updateActivity: (activityId, patch) =>
        timeline.updateActivity(target, activityId, patch).then(done),
    }
  }, [provider, queryClient, target])
}

/**
 * Ключ ідемпотентності запису (ADR-0053): той самий, поки вміст не змінився, тож повтор після втраченої
 * відповіді не надішле лист двічі. `clear` після успіху: такий самий текст далі — новий запис.
 */
export function useTimelineRequestId() {
  const last = React.useRef<{ content: string; requestId: string }>(null)
  return React.useMemo(
    () => ({
      next(content: string) {
        if (last.current?.content !== content)
          last.current = { content, requestId: newImportRequestId() }
        return last.current.requestId
      },
      clear() {
        last.current = null
      },
    }),
    [],
  )
}
