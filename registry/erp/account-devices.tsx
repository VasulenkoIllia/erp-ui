"use client"

import * as React from "react"
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import {
  BanIcon,
  CircleCheckIcon,
  CircleXIcon,
  MonitorIcon,
  SmartphoneIcon,
  TabletIcon,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  useAuthErrorText,
  useErpAuthProvider,
} from "@/registry/erp/auth-layout"
import { ConfirmDialog } from "@/registry/erp/confirm-dialog"
import { PageState, SectionSkeleton } from "@/registry/erp/page-state"
import {
  ACCOUNT_QUERY_KEYS,
  type Device,
  type SecurityOverview,
  type SignInEvent,
} from "@/registry/lib/account"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT, type ErpUiTranslate } from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"
import { Badge } from "@/registry/ui/badge"
import { Button } from "@/registry/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/registry/ui/field"
import { Spinner } from "@/registry/ui/spinner"
import { Switch } from "@/registry/ui/switch"

/**
 * Сесії й пристрої в налаштуваннях безпеки (PF01, ADR-0011): де користувач увійшов і вихід на
 * інших пристроях, довірені пристрої (без другого кроку), журнал входів, лист про новий вхід.
 * Місця й IP надає сервер (приблизно, за IP) мовою з `Accept-Language`.
 */

const DEVICE_ICONS: Record<Device["type"], LucideIcon> = {
  desktop: MonitorIcon,
  mobile: SmartphoneIcon,
  tablet: TabletIcon,
}

/** «Chrome, Windows»; без подробиць — тип пристрою. */
export function deviceLabel(device: Device, t: ErpUiTranslate): string {
  const parts = [device.browser, device.os].filter(Boolean)
  return parts.length
    ? parts.join(", ")
    : t(`auth.devices.types.${device.type}`)
}

export function DeviceIcon({ device }: { device: Device }) {
  const Icon = DEVICE_ICONS[device.type]
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
      <Icon aria-hidden className="size-4" />
    </span>
  )
}

/** Активні сесії: цей пристрій першим, «Вийти» на інших і на всіх інших одразу. */
export function SessionsSection() {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const queryClient = useQueryClient()
  const errorText = useAuthErrorText()
  const format = useFormat()
  const [confirmOthers, setConfirmOthers] = React.useState(false)
  const [ending, setEnding] = React.useState<string | null>(null)
  const query = useQuery({
    queryKey: ACCOUNT_QUERY_KEYS.sessions,
    queryFn: () => provider.account.getSessions(),
  })
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEYS.sessions })

  if (query.isPending) return <SectionSkeleton rows={2} />
  if (query.isError)
    return (
      <PageState
        kind="error"
        className="min-h-40"
        onRetry={() => {
          void query.refetch()
        }}
      />
    )

  const sessions = query.data
  const others = sessions.filter((s) => !s.current)

  return (
    <div className="@container space-y-4" data-slot="sessions-section">
      <ul
        className="divide-y rounded-lg border"
        aria-label={t("auth.devices.sessionsTitle")}
      >
        {sessions.map((session) => {
          const name = deviceLabel(session.device, t)
          return (
            <li
              key={session.id}
              className="flex flex-col gap-3 p-3 @md:flex-row @md:items-center"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <DeviceIcon device={session.device} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {name}
                    {session.current ? (
                      <Badge variant="success">
                        {t("auth.devices.thisDevice")}
                      </Badge>
                    ) : null}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {[
                      session.location,
                      session.ip
                        ? t("auth.signIns.ip", { ip: session.ip })
                        : "",
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
                  disabled={ending === session.id}
                  aria-label={t("auth.devices.signOutDevice", { device: name })}
                  onClick={() => {
                    setEnding(session.id)
                    provider.account
                      .endSession(session.id)
                      .then(() => {
                        toast.success(t("auth.devices.signedOutDevice"))
                        return refresh()
                      })
                      .catch((failure: unknown) => {
                        toast.error(errorText(failure))
                      })
                      .finally(() => {
                        setEnding(null)
                      })
                  }}
                >
                  {ending === session.id ? <Spinner aria-hidden /> : null}
                  {t("auth.devices.signOut")}
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      {others.length ? (
        <Button
          variant="outline"
          onClick={() => {
            setConfirmOthers(true)
          }}
        >
          {t("auth.devices.signOutOthers")}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("auth.devices.noOthers")}
        </p>
      )}
      <ConfirmDialog
        open={confirmOthers}
        title={t("auth.devices.signOutOthersTitle")}
        description={t("auth.devices.signOutOthersDescription")}
        confirmLabel={t("auth.devices.signOutOthers")}
        destructive
        onClose={() => {
          setConfirmOthers(false)
        }}
        onConfirm={() =>
          provider.account.endOtherSessions().then(
            () => {
              setConfirmOthers(false)
              toast.success(t("auth.devices.signedOutOthers"))
              return refresh()
            },
            (failure: unknown) => {
              toast.error(errorText(failure))
            },
          )
        }
      />
    </div>
  )
}

/** Довірені пристрої: «Забути» — наступний вхід із нього знову попросить другий крок. */
export function TrustedDevicesSection() {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const queryClient = useQueryClient()
  const errorText = useAuthErrorText()
  const format = useFormat()
  const [busy, setBusy] = React.useState<string | null>(null)
  const query = useQuery({
    queryKey: ACCOUNT_QUERY_KEYS.trustedDevices,
    queryFn: () => provider.account.getTrustedDevices(),
  })

  const run = (key: string, action: () => Promise<void>) => {
    setBusy(key)
    action()
      .then(() => {
        toast.success(t("auth.devices.forgotten"))
        return queryClient.invalidateQueries({
          queryKey: ACCOUNT_QUERY_KEYS.trustedDevices,
        })
      })
      .catch((failure: unknown) => {
        toast.error(errorText(failure))
      })
      .finally(() => {
        setBusy(null)
      })
  }

  if (query.isPending) return <SectionSkeleton rows={2} />
  if (query.isError)
    return (
      <PageState
        kind="error"
        className="min-h-40"
        onRetry={() => {
          void query.refetch()
        }}
      />
    )

  const devices = query.data
  if (!devices.length)
    return (
      <p className="text-sm text-muted-foreground">
        {t("auth.devices.noTrusted")}
      </p>
    )

  return (
    <div className="@container space-y-4" data-slot="trusted-devices-section">
      <ul
        className="divide-y rounded-lg border"
        aria-label={t("auth.devices.trustedTitle")}
      >
        {devices.map((device) => {
          const name = deviceLabel(device.device, t)
          return (
            <li
              key={device.id}
              className="flex flex-col gap-3 p-3 @md:flex-row @md:items-center"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <DeviceIcon device={device.device} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {name}
                    {device.current ? (
                      <Badge variant="success">
                        {t("auth.devices.thisDevice")}
                      </Badge>
                    ) : null}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {[
                      device.location,
                      t("auth.devices.trustedUntil", {
                        date: format.date(device.expiresAt, "medium"),
                      }),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="self-start @md:self-center"
                disabled={busy !== null}
                aria-label={t("auth.devices.forgetDevice", { device: name })}
                onClick={() => {
                  run(device.id, () => provider.account.forgetDevice(device.id))
                }}
              >
                {busy === device.id ? <Spinner aria-hidden /> : null}
                {t("auth.devices.forget")}
              </Button>
            </li>
          )
        })}
      </ul>
      {devices.length > 1 ? (
        <Button
          variant="outline"
          disabled={busy !== null}
          onClick={() => {
            run("all", () => provider.account.forgetAllDevices())
          }}
        >
          {busy === "all" ? <Spinner aria-hidden /> : null}
          {t("auth.devices.forgetAll")}
        </Button>
      ) : null}
    </div>
  )
}

const RESULT_ICONS: Record<
  SignInEvent["result"],
  { icon: LucideIcon; tone: string }
> = {
  success: { icon: CircleCheckIcon, tone: "text-success-foreground" },
  failed: { icon: CircleXIcon, tone: "text-destructive-foreground" },
  blocked: { icon: BanIcon, tone: "text-warning-foreground" },
}

/** Журнал входів: подія, спосіб, пристрій, місце й час; «Показати ще» довантажує сторінки. */
export function SignInHistory({ perPage = 10 }: { perPage?: number }) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const format = useFormat()
  const query = useInfiniteQuery({
    queryKey: [...ACCOUNT_QUERY_KEYS.signIns, perPage],
    queryFn: ({ pageParam }) => provider.account.getSignIns(pageParam, perPage),
    initialPageParam: 1,
    getNextPageParam: (last, pages) =>
      pages.length * perPage < last.total ? pages.length + 1 : undefined,
  })

  if (query.isPending) return <SectionSkeleton rows={4} />
  if (query.isError)
    return (
      <PageState
        kind="error"
        className="min-h-40"
        onRetry={() => {
          void query.refetch()
        }}
      />
    )

  const events = query.data.pages.flatMap((page) => page.data)
  const total = query.data.pages[0]?.total ?? 0
  if (!events.length)
    return (
      <p className="text-sm text-muted-foreground">{t("auth.signIns.empty")}</p>
    )

  const method = (event: SignInEvent) =>
    event.method === "sso"
      ? t("auth.signIns.methods.sso", {
          provider: event.provider ?? t("auth.signIns.ssoUnknown"),
        })
      : t(`auth.signIns.methods.${event.method}`)

  return (
    <div className="@container space-y-3" data-slot="sign-in-history">
      <ul
        className="divide-y rounded-lg border"
        aria-label={t("auth.signIns.title")}
      >
        {events.map((event) => {
          const { icon: Icon, tone } = RESULT_ICONS[event.result]
          return (
            <li
              key={event.id}
              className="flex flex-col gap-1 p-3 @md:flex-row @md:items-start @md:gap-3"
            >
              <div className="flex min-w-0 flex-1 gap-3">
                <Icon
                  aria-hidden
                  className={cn("mt-0.5 size-4 shrink-0", tone)}
                />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
                    <span>
                      {t(`auth.signIns.results.${event.result}`)} ·{" "}
                      {method(event)}
                    </span>
                    {event.newDevice ? (
                      <Badge variant="info">
                        {t("auth.signIns.newDevice")}
                      </Badge>
                    ) : null}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {[
                      deviceLabel(event.device, t),
                      event.location,
                      event.ip ? t("auth.signIns.ip", { ip: event.ip }) : "",
                      event.impersonatedBy
                        ? t("auth.signIns.impersonatedBy", {
                            name: event.impersonatedBy,
                          })
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </div>
              <time
                dateTime={event.at}
                className="pl-7 text-sm text-muted-foreground tabular-nums @md:pl-0"
              >
                {format.date(event.at, "dateTime")}
              </time>
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground" role="status">
          {t("auth.signIns.shown", { shown: events.length, total })}
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
            {t("auth.signIns.more")}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

/** Перемикач «Лист про вхід з нового пристрою»: зміна видна одразу, помилка повертає назад. */
export function SignInAlertsSwitch() {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const queryClient = useQueryClient()
  const errorText = useAuthErrorText()
  const id = React.useId()
  const query = useQuery({
    queryKey: ACCOUNT_QUERY_KEYS.security,
    queryFn: () => provider.account.getSecurity(),
  })
  if (!query.data) return <SectionSkeleton rows={1} />
  const checked = query.data.newSignInAlerts

  const set = (value: boolean) => {
    queryClient.setQueryData<SecurityOverview>(
      ACCOUNT_QUERY_KEYS.security,
      (old) => (old ? { ...old, newSignInAlerts: value } : old),
    )
    provider.account.setSignInAlerts(value).catch((failure: unknown) => {
      queryClient.setQueryData<SecurityOverview>(
        ACCOUNT_QUERY_KEYS.security,
        (old) => (old ? { ...old, newSignInAlerts: !value } : old),
      )
      toast.error(errorText(failure))
    })
  }

  return (
    <Field orientation="horizontal">
      <Switch
        id={id}
        checked={checked}
        aria-describedby={`${id}-hint`}
        onCheckedChange={set}
      />
      <div className="space-y-1">
        <FieldLabel htmlFor={id}>{t("auth.devices.alertsLabel")}</FieldLabel>
        <FieldDescription id={`${id}-hint`}>
          {t("auth.devices.alertsHint")}
        </FieldDescription>
      </div>
    </Field>
  )
}
