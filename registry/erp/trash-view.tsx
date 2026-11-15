import * as React from "react"
import { useInfiniteQuery } from "@tanstack/react-query"
import { useAuthProvider } from "@/registry/lib/ra-core"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import type { z } from "zod"

import { PageState, SectionSkeleton } from "@/registry/erp/page-state"
import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import { useCompanyId } from "@/registry/hooks/use-company"
import { isFocusLost } from "@/registry/hooks/use-focus-heading"
import {
  useRestoreErrorMessage,
  useTrashRefresh,
  useTrashSettings,
} from "@/registry/hooks/use-trash"
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
 * кошика, порожньо, «Показати ще» зі збоєм наступної сторінки під списком.
 *
 * Відновлення — сповіщення з «Відкрити» картку; запису вже немає чи його місце зайняв інший — причина
 * словами кошика. Рядок зникає, фокус — на «Відновити» сусіднього рядка, без рядків — на заголовок.
 */
export function TrashView<T>({
  resource,
  schema,
  rowLabel,
  rowDescription,
  recordHref,
  headingRef,
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
  const { restore, restoring } = useTrashRestore({
    resource,
    recordHref,
    afterRestore: (index) => {
      focusAfterRemoval(list.current, index, headingRef)
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
        title={t("trash.open")}
        description={t("trash.unsupported")}
      />
    ) : (
      <PageState
        kind={errorStateKind(query.error)}
        className="min-h-40"
        onRetry={retry}
      />
    )

  const unnamed = (id: string) => t("trash.unnamed", { id })
  const shown: ShownEntry[] = query.data.pages
    .flatMap((page) => page.data)
    .map((entry) => {
      const parsed = schema.safeParse(entry.record)
      return parsed.success
        ? {
            entry,
            name: rowLabel(parsed.data) || unnamed(entry.id),
            description: rowDescription?.(parsed.data),
          }
        : { entry, name: unnamed(entry.id), description: undefined }
    })
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
                  restore(item, index)
                }}
              />
            ))}
          </ul>
          <TrashMore query={query} shown={shown.length} total={total} />
        </>
      ) : (
        <PageState
          kind="empty"
          icon={TrashIcon}
          className="min-h-40"
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

/** Лічильник, «Показати ще» і збій наступної сторінки під списком: показане лишається. */
function TrashMore({
  query,
  shown,
  total,
}: {
  query: {
    hasNextPage: boolean
    isFetchingNextPage: boolean
    isFetchNextPageError: boolean
    error: unknown
    fetchNextPage: () => Promise<unknown>
  }
  shown: number
  total: number
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
            onClick={() => {
              void query.fetchNextPage()
            }}
          >
            {query.isFetchingNextPage ? <Spinner aria-hidden /> : null}
            {t("trash.more")}
          </Button>
        ) : null}
      </div>
      {query.isFetchNextPageError ? (
        <p className="text-sm text-destructive-foreground" role="alert">
          {errorMessage(query.error)}
        </p>
      ) : null}
    </>
  )
}

/** Відновлення з кошика: рядок зайнятий, поки йде запит; після — сповіщення й перечитування. */
function useTrashRestore({
  resource,
  recordHref,
  afterRestore,
}: {
  resource: string
  recordHref: ((id: string) => string) | undefined
  afterRestore: (index: number) => void
}) {
  const t = useErpUiT(ukTrash)
  const provider = useAuthProvider<ErpAuthProvider>()
  const navigate = useNavigate()
  const restoreError = useRestoreErrorMessage()
  const refresh = useTrashRefresh()
  const [restoring, setRestoring] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const mark = (id: string, isBusy: boolean) => {
    setRestoring((current) => {
      const next = new Set(current)
      if (isBusy) next.add(id)
      else next.delete(id)
      return next
    })
  }
  const restore = ({ entry, name }: ShownEntry, index: number) => {
    if (!provider || restoring.has(entry.id)) return
    mark(entry.id, true)
    provider.trash
      .restore(resource, entry.id)
      .then(() => {
        const href = recordHref?.(entry.id)
        toast.success(t("trash.restored", { name }), {
          ...(href
            ? {
                action: {
                  label: t("trash.openRestored"),
                  onClick: () => {
                    void navigate(href)
                  },
                },
              }
            : {}),
        })
      })
      .catch((failure: unknown) => {
        toast.error(restoreError(failure))
      })
      .finally(() => {
        void refresh(resource).then(() => {
          mark(entry.id, false)
          afterRestore(index)
        })
      })
  }
  return { restore, restoring }
}

/**
 * Рядок зник разом із кнопкою у фокусі: фокус на «Відновити» рядка, що став на його місце, чи
 * попереднього; без рядків — на заголовок сторінки. Фокус, який людина вже поставила деінде, не чіпаємо.
 */
function focusAfterRemoval(
  list: HTMLUListElement | null,
  index: number,
  heading: React.RefObject<HTMLHeadingElement | null> | undefined,
) {
  requestAnimationFrame(() => {
    if (!isFocusLost()) return
    const buttons =
      list?.querySelectorAll<HTMLButtonElement>("[data-trash-restore]") ?? []
    const next = buttons[index] ?? buttons[index - 1]
    if (next) next.focus()
    else heading?.current?.focus()
  })
}
