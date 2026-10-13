"use client"

import * as React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import {
  useAuthErrorText,
  useErpAuthProvider,
} from "@/registry/erp/auth-layout"
import { PageState, SectionSkeleton } from "@/registry/erp/page-state"
import { ACCOUNT_QUERY_KEYS } from "@/registry/lib/account"
import { useErpUiT, type ErpUiKey } from "@/registry/lib/i18n"
import type {
  NotificationSettings,
  QuietHours,
} from "@/registry/lib/notification-settings"
import { Alert, AlertDescription, AlertTitle } from "@/registry/ui/alert"
import { Button } from "@/registry/ui/button"
import { Checkbox } from "@/registry/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"
import { Spinner } from "@/registry/ui/spinner"
import { Switch } from "@/registry/ui/switch"

/**
 * Налаштування сповіщень (ADR-0013, PF10): події проекту × канали (у застосунку, email, push,
 * месенджери), обов'язкові сповіщення безпеки, тихі години. Події й канали дає сервер.
 * Широкий контейнер — таблиця-матриця, вузький — картка на подію.
 */

/** Колонки матриці за кількістю каналів (класи мають бути статичними для Tailwind). */
const COLUMNS: Record<number, string> = {
  1: "@xl:grid-cols-[minmax(0,1fr)_repeat(1,7rem)]",
  2: "@xl:grid-cols-[minmax(0,1fr)_repeat(2,7rem)]",
  3: "@xl:grid-cols-[minmax(0,1fr)_repeat(3,7rem)]",
  4: "@xl:grid-cols-[minmax(0,1fr)_repeat(4,7rem)]",
  5: "@xl:grid-cols-[minmax(0,1fr)_repeat(5,6rem)]",
  6: "@xl:grid-cols-[minmax(0,1fr)_repeat(6,5rem)]",
}

export function NotificationSettingsForm() {
  const provider = useErpAuthProvider()
  const query = useQuery({
    queryKey: ACCOUNT_QUERY_KEYS.notifications,
    queryFn: () => provider.account.getNotificationSettings(),
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
  return <Editor key={query.dataUpdatedAt} data={query.data} />
}

type Permission = NotificationPermission | "unsupported"

function browserPermission(): Permission {
  return typeof Notification === "undefined"
    ? "unsupported"
    : Notification.permission
}

function Editor({ data }: { data: NotificationSettings }) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const queryClient = useQueryClient()
  const errorText = useAuthErrorText()
  const ids = React.useId()
  const [settings, setSettings] = React.useState(data.settings)
  const [quiet, setQuiet] = React.useState<QuietHours>(data.quietHours)
  const [quietError, setQuietError] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [permission, setPermission] = React.useState(browserPermission)

  const dirty =
    JSON.stringify(settings) !== JSON.stringify(data.settings) ||
    JSON.stringify(quiet) !== JSON.stringify(data.quietHours)
  const groups = [...new Set(data.events.map((event) => event.group))]
  const channelLabel = (id: string) => {
    const own = data.channels.find((c) => c.id === id)?.label
    if (own) return own
    const key = `notificationSettings.channels.${id}`
    const text = t(key as ErpUiKey)
    return text === key ? id : text
  }
  const columns = COLUMNS[data.channels.length] ?? COLUMNS[6]
  const pushChosen = Object.values(settings).some((list) =>
    list.includes("push"),
  )

  const toggle = (eventId: string, channel: string, on: boolean) => {
    setSettings((current) => {
      const list = current[eventId] ?? []
      return {
        ...current,
        [eventId]: on
          ? [...list, channel]
          : list.filter((item) => item !== channel),
      }
    })
  }

  return (
    <form
      className="@container space-y-6"
      noValidate
      data-slot="notification-settings"
      onSubmit={(event) => {
        event.preventDefault()
        if (quiet.enabled && (!quiet.from || !quiet.to)) {
          setQuietError(t("notificationSettings.quietInvalid"))
          return
        }
        setQuietError(null)
        setBusy(true)
        setError(null)
        provider.account
          .updateNotificationSettings({ settings, quietHours: quiet })
          .then((next) => {
            queryClient.setQueryData(ACCOUNT_QUERY_KEYS.notifications, next)
            toast.success(t("notificationSettings.saved"))
          })
          .catch((failure: unknown) => {
            setError(errorText(failure))
          })
          .finally(() => {
            setBusy(false)
          })
      }}
    >
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {pushChosen &&
      permission !== "granted" &&
      permission !== "unsupported" ? (
        <Alert>
          <AlertTitle>{t("notificationSettings.pushTitle")}</AlertTitle>
          <AlertDescription className="space-y-2">
            {permission === "denied" ? (
              <p>{t("notificationSettings.pushDenied")}</p>
            ) : (
              <>
                <p>{t("notificationSettings.pushDescription")}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void Notification.requestPermission().then(setPermission)
                  }}
                >
                  {t("notificationSettings.pushAllow")}
                </Button>
              </>
            )}
          </AlertDescription>
        </Alert>
      ) : null}

      {groups.map((group) => (
        <FieldSet key={group} className="gap-2">
          <FieldLegend>{group}</FieldLegend>
          {/* Шапка матриці на широкому екрані; чекбокси мають власні назви. */}
          <div
            aria-hidden
            className={`hidden gap-2 px-3 text-sm text-muted-foreground @xl:grid ${columns}`}
          >
            <span />
            {data.channels.map((channel) => (
              <span key={channel.id} className="text-center">
                {channelLabel(channel.id)}
              </span>
            ))}
          </div>
          <ul className="divide-y rounded-lg border">
            {data.events
              .filter((event) => event.group === group)
              .map((event) => {
                const chosen = settings[event.id] ?? []
                return (
                  <li
                    key={event.id}
                    className={`grid gap-3 p-3 @xl:items-center ${columns}`}
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{event.label}</p>
                      {event.description ? (
                        <p className="text-sm text-muted-foreground">
                          {event.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-2 @xl:contents">
                      {data.channels.map((channel) => {
                        const available = event.channels.includes(channel.id)
                        const required = (event.required ?? []).includes(
                          channel.id,
                        )
                        const name = channelLabel(channel.id)
                        if (!available)
                          return (
                            <span
                              key={channel.id}
                              aria-hidden
                              className="hidden text-center text-muted-foreground @xl:block"
                            >
                              —
                            </span>
                          )
                        const id = `${ids}-${event.id}-${channel.id}`
                        return (
                          <span
                            key={channel.id}
                            className="flex items-center gap-2 @xl:flex-col @xl:gap-1"
                          >
                            <Checkbox
                              id={id}
                              checked={required || chosen.includes(channel.id)}
                              disabled={required}
                              aria-label={`${t(
                                "notificationSettings.channelFor",
                                { channel: name, event: event.label },
                              )}${required ? ` (${t("notificationSettings.required")})` : ""}`}
                              onCheckedChange={(checked) => {
                                toggle(event.id, channel.id, checked)
                              }}
                            />
                            <label
                              htmlFor={id}
                              aria-hidden
                              className="text-sm @xl:sr-only"
                            >
                              {name}
                              {required ? (
                                <span className="text-muted-foreground">
                                  {` · ${t("notificationSettings.required")}`}
                                </span>
                              ) : null}
                            </label>
                            {required ? (
                              <span
                                aria-hidden
                                className="hidden text-xs text-muted-foreground @xl:block"
                              >
                                {t("notificationSettings.required")}
                              </span>
                            ) : null}
                          </span>
                        )
                      })}
                    </div>
                  </li>
                )
              })}
          </ul>
        </FieldSet>
      ))}

      <FieldSet className="gap-3">
        <FieldLegend>{t("notificationSettings.quietTitle")}</FieldLegend>
        <Field orientation="horizontal">
          <Switch
            id={`${ids}-quiet`}
            checked={quiet.enabled}
            aria-describedby={`${ids}-quiet-hint`}
            onCheckedChange={(enabled) => {
              setQuiet((current) => ({ ...current, enabled }))
            }}
          />
          <div className="grid gap-1">
            <FieldLabel htmlFor={`${ids}-quiet`}>
              {t("notificationSettings.quietLabel")}
            </FieldLabel>
            <FieldDescription id={`${ids}-quiet-hint`}>
              {t("notificationSettings.quietHint")}
            </FieldDescription>
          </div>
        </Field>
        {quiet.enabled ? (
          <div className="flex flex-wrap gap-4">
            <Field
              className="w-36"
              data-invalid={quietError ? true : undefined}
            >
              <FieldLabel htmlFor={`${ids}-from`}>
                {t("notificationSettings.quietFrom")}
              </FieldLabel>
              <Input
                id={`${ids}-from`}
                type="time"
                value={quiet.from}
                required
                aria-invalid={quietError ? true : undefined}
                onChange={(event) => {
                  setQuiet((current) => ({
                    ...current,
                    from: event.target.value,
                  }))
                }}
              />
            </Field>
            <Field
              className="w-36"
              data-invalid={quietError ? true : undefined}
            >
              <FieldLabel htmlFor={`${ids}-to`}>
                {t("notificationSettings.quietTo")}
              </FieldLabel>
              <Input
                id={`${ids}-to`}
                type="time"
                value={quiet.to}
                required
                aria-invalid={quietError ? true : undefined}
                onChange={(event) => {
                  setQuiet((current) => ({
                    ...current,
                    to: event.target.value,
                  }))
                }}
              />
            </Field>
          </div>
        ) : null}
        {quietError ? (
          <p role="alert" className="text-sm text-destructive-foreground">
            {quietError}
          </p>
        ) : null}
      </FieldSet>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !dirty}>
          {busy ? <Spinner aria-hidden /> : null}
          {t("notificationSettings.save")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => {
            setSettings(
              Object.fromEntries(
                data.events.map((event) => [event.id, [...event.defaults]]),
              ),
            )
          }}
        >
          {t("notificationSettings.reset")}
        </Button>
      </div>
    </form>
  )
}
