import * as React from "react"
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { DeviceIcon, deviceLabel } from "@/registry/erp/account-devices"
import {
  useAuthErrorText,
  useErpAuthProvider,
} from "@/registry/erp/auth-layout"
import { PageState, SectionSkeleton } from "@/registry/erp/page-state"
import { useRefreshAccess } from "@/registry/erp/user-access-data"
import { useCompanyId } from "@/registry/hooks/use-company"
import { isApiError } from "@/registry/lib/api"
import { companyScope } from "@/registry/lib/company-scope"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  ADMIN_QUERY_KEYS,
  type AdminSession,
} from "@/registry/lib/security-policy"
import { Badge } from "@/registry/ui/badge"
import { Button } from "@/registry/ui/button"
import { Field, FieldLabel } from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"
import { Spinner } from "@/registry/ui/spinner"

/**
 * Сесії для адміністратора (ADR-0013): сесії одного користувача з «Завершити» і активні сесії всієї
 * компанії з пошуком за ім'ям чи email (право `users:update`).
 */

function SessionRow({
  session,
  showUser,
  ending,
  onEnd,
}: {
  session: AdminSession
  showUser?: boolean
  ending: boolean
  onEnd: () => void
}) {
  const t = useErpUiT()
  const format = useFormat()
  const device = deviceLabel(session.device, t)
  return (
    <li className="flex flex-col gap-3 p-3 @md:flex-row @md:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <DeviceIcon device={session.device} />
        <div className="min-w-0 flex-1">
          {showUser ? (
            <p className="truncate font-medium">
              {session.user.name}
              <span className="font-normal text-muted-foreground">
                {` · ${session.user.email}`}
              </span>
            </p>
          ) : null}
          <p
            className={
              showUser
                ? "flex flex-wrap items-center gap-2 text-sm"
                : "flex flex-wrap items-center gap-2 font-medium"
            }
          >
            {device}
            {session.current ? (
              <Badge variant="success">{t("userAccess.current")}</Badge>
            ) : null}
          </p>
          <p className="text-sm text-muted-foreground">
            {[
              session.location,
              session.ip ? t("auth.signIns.ip", { ip: session.ip }) : "",
              session.current
                ? t("auth.devices.activeNow")
                : t("auth.devices.lastActive", {
                    when: format.relative(session.lastActiveAt),
                  }),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {session.impersonatedBy ? (
            <p className="text-sm text-warning-foreground">
              {t("auth.devices.impersonatedBy", {
                name: session.impersonatedBy,
              })}
            </p>
          ) : null}
        </div>
      </div>
      {session.current ? null : (
        <Button
          variant="outline"
          size="sm"
          className="self-start @md:self-center"
          disabled={ending}
          aria-label={t("userAccess.endSessionFor", {
            name: session.user.name,
            device,
          })}
          onClick={onEnd}
        >
          {ending ? <Spinner aria-hidden /> : null}
          {t("userAccess.endSession")}
        </Button>
      )}
    </li>
  )
}

/** Сесії одного користувача з відповіді `GET /users/:id/access`: «Завершити» кожну. */
export function UserSessionsList({
  userId,
  sessions,
}: {
  userId: string
  sessions: readonly AdminSession[]
}) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const errorText = useAuthErrorText()
  const refresh = useRefreshAccess()
  const [ending, setEnding] = React.useState<string | null>(null)
  return sessions.length ? (
    <ul
      className="divide-y rounded-lg border"
      aria-label={t("userAccess.sessionsTitle")}
    >
      {sessions.map((session) => (
        <SessionRow
          key={session.id}
          session={session}
          ending={ending === session.id}
          onEnd={() => {
            setEnding(session.id)
            provider.admin
              .endSession(session.id)
              .then(() => {
                toast.success(t("userAccess.sessionEnded"))
                return refresh(userId)
              })
              .catch((failure: unknown) => {
                toast.error(errorText(failure))
              })
              .finally(() => {
                setEnding(null)
              })
          }}
        />
      ))}
    </ul>
  ) : (
    <p className="text-sm text-muted-foreground">
      {t("userAccess.noSessions")}
    </p>
  )
}

/* ------------------------- Активні сесії компанії ------------------------- */

const PER_PAGE = 20

/** Активні сесії всіх користувачів: пошук за ім'ям чи email, завершення сесії. */
export function ActiveSessionsSection() {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const queryClient = useQueryClient()
  const errorText = useAuthErrorText()
  const ids = React.useId()
  const [search, setSearch] = React.useState("")
  const [q, setQ] = React.useState("")
  const [ending, setEnding] = React.useState<string | null>(null)

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setQ(search)
    }, 300)
    return () => {
      clearTimeout(timer)
    }
  }, [search])

  const companyId = useCompanyId()
  const query = useInfiniteQuery({
    queryKey: [...ADMIN_QUERY_KEYS.sessions, q.trim(), companyScope(companyId)],
    queryFn: ({ pageParam }) =>
      provider.admin.getSessions(q, pageParam, PER_PAGE),
    refetchOnMount: "always",
    initialPageParam: 1,
    getNextPageParam: (last, pages) =>
      pages.length * PER_PAGE < last.total ? pages.length + 1 : undefined,
  })

  let body: React.ReactNode
  if (query.isPending) body = <SectionSkeleton rows={3} />
  else if (query.isError)
    body =
      isApiError(query.error) && query.error.status === 403 ? (
        <PageState kind="forbidden" className="min-h-40" />
      ) : (
        <PageState
          kind="error"
          className="min-h-40"
          onRetry={() => {
            void query.refetch()
          }}
        />
      )
  else {
    const sessions = query.data.pages.flatMap((page) => page.data)
    const total = query.data.pages[0]?.total ?? 0
    body = sessions.length ? (
      <>
        <ul
          className="divide-y rounded-lg border"
          aria-label={t("userAccess.allSessionsLabel")}
        >
          {sessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              showUser
              ending={ending === session.id}
              onEnd={() => {
                setEnding(session.id)
                provider.admin
                  .endSession(session.id)
                  .then(() => {
                    toast.success(t("userAccess.sessionEnded"))
                    return Promise.all([
                      queryClient.invalidateQueries({
                        queryKey: ADMIN_QUERY_KEYS.sessions,
                      }),
                      queryClient.invalidateQueries({
                        queryKey: ADMIN_QUERY_KEYS.userAccess(session.user.id),
                      }),
                    ])
                  })
                  .catch((failure: unknown) => {
                    toast.error(errorText(failure))
                  })
                  .finally(() => {
                    setEnding(null)
                  })
              }}
            />
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {t("userAccess.shown", { shown: sessions.length, total })}
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
              {t("userAccess.more")}
            </Button>
          ) : null}
        </div>
      </>
    ) : (
      <p className="text-sm text-muted-foreground">
        {t("userAccess.noSessions")}
      </p>
    )
  }

  return (
    <div className="@container space-y-4" data-slot="active-sessions">
      <Field className="@md:max-w-sm">
        <FieldLabel htmlFor={`${ids}-q`}>
          {t("userAccess.searchLabel")}
        </FieldLabel>
        <Input
          id={`${ids}-q`}
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
          }}
        />
      </Field>
      {body}
    </div>
  )
}
