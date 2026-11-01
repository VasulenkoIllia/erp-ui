import * as React from "react"
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import {
  BellIcon,
  CheckIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  useAuthErrorText,
  useErpAuthProvider,
} from "@/registry/erp/auth-layout"
import { NotificationBell } from "@/registry/erp/notification-bell"
import { PageState, SectionSkeleton } from "@/registry/erp/page-state"
import { useCompanyId } from "@/registry/hooks/use-company"
import { usePushSync } from "@/registry/hooks/use-push-sync"
import { useRealtimeStatus } from "@/registry/hooks/use-realtime"
import { useTabCounter } from "@/registry/hooks/use-tab-counter"
import { errorStateKind } from "@/registry/lib/api"
import { safeRedirectPath } from "@/registry/lib/auth"
import { companyScope } from "@/registry/lib/company-scope"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  INBOX_QUERY_KEYS,
  type AppNotification,
} from "@/registry/lib/notifications"
import { cn } from "@/registry/lib/utils"
import { Button } from "@/registry/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/registry/ui/empty"
import { Spinner } from "@/registry/ui/spinner"
import { Tabs, TabsList, TabsTrigger } from "@/registry/ui/tabs"

/**
 * Центр сповіщень (ADR-0014, PF10/UI02): дзвіник із лічильником і останніми сповіщеннями,
 * сторінка «Сповіщення» з фільтром «Усі / Непрочитані», позначками й «Прочитати все».
 *
 *   <InboxBell onNavigate={navigate} onShowAll={() => navigate("/notifications")} />
 *   <NotificationInbox onNavigate={navigate} />
 *
 * `onNavigate(link)` — перехід за `link` сповіщення роутером застосунку; без нього — звичайне
 * посилання. Лічильник оновлюється за подіями каналу (ADR-0051), без каналу — раз на хвилину, а ще
 * при поверненні у вкладку й коли прийшов web push. Його видно й у назві вкладки (ADR-0046).
 */

type Status = "all" | "unread"

/** Опитування лічильника, коли каналу реального часу немає. */
const UNREAD_POLL_MS = 60_000

const SEVERITY: Record<
  NonNullable<AppNotification["severity"]>,
  { icon: LucideIcon; className: string }
> = {
  info: { icon: InfoIcon, className: "bg-info-soft text-info-foreground" },
  success: {
    icon: CircleCheckIcon,
    className: "bg-success-soft text-success-foreground",
  },
  warning: {
    icon: TriangleAlertIcon,
    className: "bg-warning-soft text-warning-foreground",
  },
  error: {
    icon: CircleAlertIcon,
    className: "bg-destructive-soft text-destructive-foreground",
  },
}

/** Кількість непрочитаних для дзвіника: за подіями каналу, а без нього — опитування раз на хвилину. */
export function useUnreadNotifications(enabled = true) {
  const provider = useErpAuthProvider()
  // Сповіщення можуть бути свої в кожній компанії: лічильник іншої не показуємо.
  const companyId = useCompanyId()
  const isLive = useRealtimeStatus() === "open"
  return useQuery({
    queryKey: [...INBOX_QUERY_KEYS.count, companyScope(companyId)],
    queryFn: () => provider.inbox.unreadCount(),
    enabled,
    refetchInterval: isLive ? false : UNREAD_POLL_MS,
    refetchOnWindowFocus: true,
  })
}

/** Позначити прочитаним чи непрочитаним, «Прочитати все» — і оновити лічильник і списки. */
function useInboxActions() {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const queryClient = useQueryClient()
  const errorText = useAuthErrorText()
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: INBOX_QUERY_KEYS.all })
  return {
    markRead: (notification: AppNotification, read: boolean) =>
      provider.inbox
        .markRead(notification.id, read)
        .then(refresh)
        .catch((failure: unknown) => {
          toast.error(errorText(failure))
        }),
    markAllRead: () =>
      provider.inbox
        .markAllRead()
        .then(() => {
          toast.success(t("inbox.allRead"))
          return refresh()
        })
        .catch((failure: unknown) => {
          toast.error(errorText(failure))
        }),
  }
}

/* ------------------------------ Одне сповіщення ------------------------------ */

/** Лише шлях цього застосунку, як і в push: у `link` сервер міг покласти що завгодно. */
const appLink = ({ link }: AppNotification) => safeRedirectPath(link, "")

function NotificationItem({
  notification,
  compact,
  onOpen,
  onToggleRead,
}: {
  notification: AppNotification
  compact?: boolean
  onOpen?: (notification: AppNotification) => void
  onToggleRead: (read: boolean) => void
}) {
  const t = useErpUiT()
  const format = useFormat()
  const unread = notification.readAt === null
  const severity = SEVERITY[notification.severity ?? "info"]
  const Icon = severity.icon
  const title = (
    <span className={cn("text-sm", unread && "font-medium")}>
      {notification.title}
    </span>
  )
  const link = appLink(notification)

  return (
    <li
      className={cn(
        "flex items-start gap-3",
        compact ? "px-2 py-2.5" : "p-3",
        unread && "bg-muted/50",
      )}
      data-unread={unread ? true : undefined}
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md",
          severity.className,
        )}
      >
        <Icon aria-hidden className="size-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="flex items-start gap-1.5">
          {unread ? (
            <span className="sr-only">{`${t("inbox.new")}: `}</span>
          ) : null}
          {link ? (
            onOpen ? (
              <button
                type="button"
                className="text-start underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
                onClick={() => {
                  onOpen(notification)
                }}
              >
                {title}
              </button>
            ) : (
              <a
                href={link}
                className="underline-offset-4 hover:underline"
                onClick={() => {
                  if (unread) onToggleRead(true)
                }}
              >
                {title}
              </a>
            )
          ) : (
            title
          )}
        </p>
        {notification.body ? (
          <p
            className={cn(
              "text-sm text-muted-foreground",
              compact && "line-clamp-2",
            )}
          >
            {notification.body}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {[notification.actor?.name, format.relative(notification.createdAt)]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        className="shrink-0"
        aria-label={
          unread
            ? t("inbox.markReadFor", { title: notification.title })
            : t("inbox.markUnreadFor", { title: notification.title })
        }
        onClick={() => {
          onToggleRead(unread)
        }}
      >
        <span
          aria-hidden
          className={cn(
            "size-2.5 rounded-full border-2",
            unread
              ? "border-primary bg-primary"
              : "border-muted-foreground bg-transparent",
          )}
        />
      </Button>
    </li>
  )
}

/* ------------------------------ Сторінка ------------------------------ */

const PER_PAGE = 20

/** Сторінка «Сповіщення»: «Усі / Непрочитані», позначки прочитаного, «Прочитати все», ще. */
export function NotificationInbox({
  onNavigate,
  perPage = PER_PAGE,
}: {
  onNavigate?: (link: string) => void
  perPage?: number
}) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const actions = useInboxActions()
  const errorText = useAuthErrorText()
  const [status, setStatus] = React.useState<Status>("all")
  const [markingAll, setMarkingAll] = React.useState(false)
  const companyId = useCompanyId()
  const query = useInfiniteQuery({
    queryKey: [
      ...INBOX_QUERY_KEYS.list(status),
      perPage,
      companyScope(companyId),
    ],
    // Сповіщення приходять будь-коли — щоразу свіжий список.
    refetchOnMount: "always",
    queryFn: ({ pageParam }) => provider.inbox.list(status, pageParam, perPage),
    initialPageParam: 1,
    getNextPageParam: (last, pages) =>
      pages.length * perPage < last.total ? pages.length + 1 : undefined,
  })
  const first = query.data?.pages[0]
  const items = query.data?.pages.flatMap((page) => page.data) ?? []
  const unread = first?.unread ?? 0

  const open = (notification: AppNotification) => {
    if (notification.readAt === null) void actions.markRead(notification, true)
    const link = appLink(notification)
    if (link) onNavigate?.(link)
  }

  // Збій «Показати ще» повторює саме цю сторінку: `refetch` перечитав би лише показані.
  const retry = () => {
    void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch())
  }

  let body: React.ReactNode
  if (query.isPending)
    // Без мережі запит на паузі, помилки немає: інакше скелетон лишився б назавжди.
    body =
      query.fetchStatus === "paused" ? (
        <PageState kind="offline" className="min-h-40" onRetry={retry} />
      ) : (
        <SectionSkeleton rows={4} />
      )
  else if (!query.data)
    body = (
      <PageState
        kind={errorStateKind(query.error)}
        className="min-h-40"
        onRetry={retry}
      />
    )
  else if (!items.length)
    body = (
      <Empty className="rounded-lg border p-6">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            {status === "unread" ? (
              <CheckIcon aria-hidden />
            ) : (
              <BellIcon aria-hidden />
            )}
          </EmptyMedia>
          <EmptyDescription>
            {status === "unread" ? t("inbox.emptyUnread") : t("inbox.empty")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  else
    body = (
      <div className="space-y-3">
        <ul
          className="divide-y overflow-hidden rounded-lg border"
          aria-label={t("inbox.listLabel")}
        >
          {items.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onOpen={onNavigate ? open : undefined}
              onToggleRead={(read) => {
                void actions.markRead(notification, read)
              }}
            />
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {t("inbox.shown", {
              shown: items.length,
              total: first?.total ?? 0,
            })}
          </p>
          {query.hasNextPage ? (
            <Button
              variant="outline"
              size="sm"
              disabled={query.isFetchingNextPage}
              onClick={() => {
                void query.fetchNextPage()
              }}
            >
              {query.isFetchingNextPage ? <Spinner aria-hidden /> : null}
              {t("inbox.more")}
            </Button>
          ) : null}
        </div>
        {query.isError ? (
          <div className="flex flex-wrap items-center gap-3" role="alert">
            <p className="text-sm text-destructive-foreground">
              {errorText(query.error)}
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={query.isFetching}
              onClick={retry}
            >
              {query.isFetching ? <Spinner aria-hidden /> : null}
              {t("pageState.error.retry")}
            </Button>
          </div>
        ) : null}
      </div>
    )

  return (
    <div className="@container space-y-4" data-slot="notification-inbox">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={status}
          onValueChange={(value) => {
            setStatus(value as Status)
          }}
        >
          <TabsList aria-label={t("inbox.filterLabel")}>
            <TabsTrigger value="all">{t("inbox.all")}</TabsTrigger>
            <TabsTrigger value="unread">
              {unread && status === "all"
                ? t("inbox.unreadCount", { count: unread })
                : t("inbox.unread")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Button
          variant="outline"
          size="sm"
          disabled={!unread || markingAll}
          onClick={() => {
            setMarkingAll(true)
            void actions.markAllRead().finally(() => {
              setMarkingAll(false)
            })
          }}
        >
          {markingAll ? <Spinner aria-hidden /> : <CheckIcon aria-hidden />}
          {t("inbox.markAllRead")}
        </Button>
      </div>
      {body}
    </div>
  )
}

/* ------------------------------ Дзвіник ------------------------------ */

const PREVIEW = 5

/** Останні сповіщення в панелі дзвіника: «Прочитати все» й «Усі сповіщення». */
export function NotificationPreview({
  onNavigate,
  onShowAll,
}: {
  onNavigate?: (link: string) => void
  onShowAll?: () => void
}) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const actions = useInboxActions()
  const companyId = useCompanyId()
  const query = useQuery({
    queryKey: [
      ...INBOX_QUERY_KEYS.list("all"),
      "preview",
      companyScope(companyId),
    ],
    queryFn: () => provider.inbox.list("all", 1, PREVIEW),
    refetchOnMount: "always",
  })

  if (query.isPending) return <SectionSkeleton rows={2} />
  if (query.isError)
    return (
      <PageState
        kind="error"
        className="min-h-32"
        onRetry={() => {
          void query.refetch()
        }}
      />
    )

  const { data, unread } = query.data
  return (
    <div className="space-y-2">
      {data.length ? (
        <ul
          className="-mx-2 max-h-96 divide-y overflow-y-auto"
          aria-label={t("inbox.listLabel")}
        >
          {data.map((notification) => (
            <NotificationItem
              key={notification.id}
              compact
              notification={notification}
              onOpen={
                onNavigate
                  ? (item) => {
                      if (item.readAt === null)
                        void actions.markRead(item, true)
                      const link = appLink(item)
                      if (link) onNavigate(link)
                    }
                  : undefined
              }
              onToggleRead={(read) => {
                void actions.markRead(notification, read)
              }}
            />
          ))}
        </ul>
      ) : (
        <Empty className="p-4">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BellIcon aria-hidden />
            </EmptyMedia>
            <EmptyDescription>{t("notifications.empty")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      <div className="flex flex-wrap justify-between gap-2 border-t pt-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={!unread}
          onClick={() => {
            void actions.markAllRead()
          }}
        >
          {t("inbox.markAllRead")}
        </Button>
        {onShowAll ? (
          <Button variant="ghost" size="sm" onClick={onShowAll}>
            {t("inbox.showAll")}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Дзвіник із лічильником непрочитаних і останніми сповіщеннями; закривається після переходу.
 * Той самий лічильник — у назві вкладки (`tabCounter={false}` вимикає). Клік за web push теж іде
 * через `onNavigate` (ADR-0046). Дзвіник один на застосунок: другий дав би ще одного слухача push,
 * а один клік за сповіщенням — два переходи.
 */
export function InboxBell({
  onNavigate,
  onShowAll,
  tabCounter = true,
}: {
  onNavigate?: (link: string) => void
  onShowAll?: () => void
  tabCounter?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const { data: count = 0 } = useUnreadNotifications()
  useTabCounter(tabCounter ? count : 0)
  usePushSync(onNavigate)
  return (
    <NotificationBell count={count} open={open} onOpenChange={setOpen}>
      {open ? (
        <NotificationPreview
          onNavigate={
            onNavigate
              ? (link) => {
                  setOpen(false)
                  onNavigate(link)
                }
              : undefined
          }
          onShowAll={
            onShowAll
              ? () => {
                  setOpen(false)
                  onShowAll()
                }
              : undefined
          }
        />
      ) : null}
    </NotificationBell>
  )
}
