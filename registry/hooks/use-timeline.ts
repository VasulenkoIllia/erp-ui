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
  type QueryClient,
  type QueryKey,
  type UseInfiniteQueryResult,
} from "@tanstack/react-query"
import * as React from "react"
import { z } from "zod"

import { useErpAuthProvider } from "@/registry/erp/auth-layout"
import { useCompanyId } from "@/registry/hooks/use-company"
import {
  useRealtimeEvent,
  useRealtimeStatus,
} from "@/registry/hooks/use-realtime"
import { companyScope } from "@/registry/lib/company-scope"
import { useErpUiT } from "@/registry/lib/i18n"
import { newImportRequestId } from "@/registry/lib/imports"
import { REALTIME_FLUSH_MS } from "@/registry/lib/realtime-cache"
import { isRichTextEmpty, richTextSchema } from "@/registry/lib/rich-text"
import type { RealtimeEvent } from "@/registry/lib/realtime"
import {
  TIMELINE_MY_ACTIVITIES_KEY,
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

/** Менше за секунду індикатор лише блимав би (SPEC §8.2). */
const REFRESH_INDICATOR_DELAY_MS = 1_000

/** Правда лише через `delayMs` після початку: короткий стан не блимає. */
function useDelayed(value: boolean, delayMs: number): boolean {
  const [isShown, setIsShown] = React.useState(false)
  React.useEffect(() => {
    if (!value) return
    const timer = setTimeout(() => {
      setIsShown(true)
    }, delayMs)
    return () => {
      clearTimeout(timer)
      setIsShown(false)
    }
  }, [value, delayMs])
  return value && isShown
}

/** Індикатор оновлення з видимими даними й приглушення рядків попереднього відбору, із затримкою. */
export function useFeedRefreshState(
  query: Pick<
    UseInfiniteQueryResult<unknown>,
    | "isFetching"
    | "isPending"
    | "isFetchingNextPage"
    | "isPlaceholderData"
    | "fetchStatus"
  >,
) {
  // Без мережі запит нового відбору на паузі: `isFetching` мовчить, а список ще попередній.
  const isRefreshing = useDelayed(
    (query.isFetching && !query.isPending && !query.isFetchingNextPage) ||
      query.isPlaceholderData,
    REFRESH_INDICATOR_DELAY_MS,
  )
  // Новий відбір ще не прийшов; без мережі запит на паузі, і приглушувати список немає чого чекати.
  const isSwitching = useDelayed(
    query.isPlaceholderData && query.fetchStatus === "fetching",
    REFRESH_INDICATOR_DELAY_MS,
  )
  return { isRefreshing, isSwitching }
}

/** Перечитати список за подіями каналу: подій може бути багато, запит — один на секунду. */
export function useRefreshOnEvent(
  queryKey: QueryKey,
  isRelevant: (event: RealtimeEvent) => boolean,
): void {
  const queryClient = useQueryClient()
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined)
  const flush = () => {
    // Догрузку сторінки, яку людина щойно попросила, подія не скасовує: чекає її кінця.
    const isLoadingMore = queryClient
      .getQueryCache()
      .findAll({ queryKey, fetchStatus: "fetching" })
      .some((query) => query.state.fetchMeta)
    timer.current = isLoadingMore
      ? setTimeout(flush, REALTIME_FLUSH_MS)
      : undefined
    if (!isLoadingMore) void queryClient.invalidateQueries({ queryKey })
  }
  useRealtimeEvent((event) => {
    if (isRelevant(event))
      timer.current ??= setTimeout(flush, REALTIME_FLUSH_MS)
  })
  React.useEffect(
    () => () => {
      clearTimeout(timer.current)
    },
    [],
  )
}

/** Перечитати стрічку за подією каналу. Подія без `id` стосується всього ресурсу. */
export function useTimelineRealtime(target: TimelineTarget): void {
  useRefreshOnEvent(
    timelineQueryKey(target),
    (event) =>
      event.type === timelineEventType(target.resource) &&
      (!event.id || event.id === target.id),
  )
}

/** Опитування лише без каналу: `open` оновлює стрічку за подіями. */
export function useTimelinePollInterval(): number | false {
  return useRealtimeStatus() === "open" ? false : TIMELINE_POLL_MS
}

/** Наступна сторінка: `total` міг порахувати те, чого людина не бачить, тож порожня завершує список. */
export const nextTimelinePage = (
  last: { readonly data: readonly unknown[]; readonly total: number },
  pages: readonly unknown[],
  perPage: number,
) =>
  last.data.length && pages.length * perPage < last.total
    ? pages.length + 1
    : undefined

export function useTimelineFeed(
  target: TimelineTarget,
  filter: TimelineFilter,
) {
  const provider = useErpAuthProvider()
  const { root, scope } = useTimelineKeys(target)
  const refetchInterval = useTimelinePollInterval()
  const query = useInfiniteQuery({
    queryKey: [...root, "entries", filter, scope],
    queryFn: ({ pageParam, signal }) =>
      provider.timeline.list(
        target,
        filter,
        pageParam,
        TIMELINE_PER_PAGE,
        signal,
      ),
    initialPageParam: 1,
    getNextPageParam: (last, pages) =>
      nextTimelinePage(last, pages, TIMELINE_PER_PAGE),
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
  const refetchInterval = useTimelinePollInterval()
  return useQuery({
    queryKey: [...root, "followers", scope],
    queryFn: ({ signal }) => provider.timeline.followers(target, signal),
    enabled,
    refetchInterval,
  })
}

export function useTimelineActivities(target: TimelineTarget, enabled = true) {
  const provider = useErpAuthProvider()
  const { root, scope } = useTimelineKeys(target)
  const refetchInterval = useTimelinePollInterval()
  return useQuery({
    queryKey: [...root, "activities", scope],
    queryFn: ({ signal }) => provider.timeline.activities(target, signal),
    enabled,
    refetchInterval,
  })
}

/** Перечитування, що затягнулось, не тримає кнопку: запис уже збережено, стрічка наздожене сама. */
const TIMELINE_REFRESH_WAIT_MS = 5_000

const settledWithin = (work: Promise<unknown>, waitMs: number) =>
  new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(finish, waitMs)
    void work.then(finish, finish)
  })

/** Методи API без `target`: дія чекає перечитування стрічки. */
type TargetArgs<F> = F extends (
  target: TimelineTarget,
  ...rest: infer A
) => infer R
  ? (...args: A) => R
  : never
export type TimelineActions = {
  [
    K in Exclude<
      keyof TimelineApi,
      "list" | "followers" | "activities" | "myActivities"
    >
  ]: TargetArgs<TimelineApi[K]>
} & {
  /** Перечитати стрічку: чужа версія (409) лишає в кеші застарілу дію. */
  refresh: () => Promise<void>
}

/** Дії над одним записом; «Мої справи» будують їх на кожен рядок, тож без хука. */
export function createTimelineActions(
  timeline: TimelineApi,
  queryClient: QueryClient,
  target: TimelineTarget,
): TimelineActions {
  const refresh = () =>
    settledWithin(
      Promise.all([
        queryClient.invalidateQueries({ queryKey: timelineQueryKey(target) }),
        queryClient.invalidateQueries({
          queryKey: TIMELINE_MY_ACTIVITIES_KEY,
        }),
      ]),
      TIMELINE_REFRESH_WAIT_MS,
    )
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
}

export function useTimelineActions(target: TimelineTarget): TimelineActions {
  const provider = useErpAuthProvider()
  const queryClient = useQueryClient()
  return React.useMemo(
    () => createTimelineActions(provider.timeline, queryClient, target),
    [provider, queryClient, target],
  )
}

/**
 * Запис змінили на цій картці: без каналу подія не прийде, а зміна поля має з'явитись у стрічці одразу
 * (як `useHistoryRefresh`). Перша версія після завантаження — не зміна.
 */
export function useTimelineVersionRefresh(
  target: TimelineTarget,
  version: number | undefined,
): void {
  const queryClient = useQueryClient()
  const seen = React.useRef(version)
  React.useEffect(() => {
    const previous = seen.current
    seen.current = version
    if (previous === undefined || previous === version) return
    void queryClient.invalidateQueries({ queryKey: timelineQueryKey(target) })
  }, [queryClient, target, version])
}

/** Текст нотатки чи повідомлення: порожній на сервер не йде. */
export function useTimelineBodySchema() {
  const t = useErpUiT()
  return React.useMemo(
    () =>
      z.object({
        body: richTextSchema.refine(
          (doc) => !isRichTextEmpty(doc),
          t("timeline.composer.required"),
        ),
      }),
    [t],
  )
}

/** Останнє значення, поки діалог закривається: стан уже порожній, а вміст ще видно. */
export function useLastValue<T>(value: T | null): T | null {
  const [last, setLast] = React.useState(value)
  if (value !== null && value !== last) setLast(value)
  return value ?? last
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
