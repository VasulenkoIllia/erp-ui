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
    // Подія без `id` стосується всього ресурсу.
    if (event.id && event.id !== target.id) return
    timer.current ??= setTimeout(() => {
      timer.current = undefined
      // Догрузку сторінки, яку людина щойно попросила, подія не скасовує.
      void queryClient.invalidateQueries(
        { queryKey: timelineQueryKey(target) },
        { cancelRefetch: false },
      )
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
    queryFn: ({ pageParam, signal }) =>
      provider.timeline.list(
        target,
        filter,
        pageParam,
        TIMELINE_PER_PAGE,
        signal,
      ),
    initialPageParam: 1,
    // `total` міг порахувати записи, яких людина не бачить: порожня сторінка завершує список.
    getNextPageParam: (last, pages) =>
      last.data.length && pages.length * TIMELINE_PER_PAGE < last.total
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
    queryFn: ({ signal }) => provider.timeline.followers(target, signal),
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
      await settledWithin(refresh(), TIMELINE_REFRESH_WAIT_MS)
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
