"use client"

import * as React from "react"
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import {
  ChevronDownIcon,
  EllipsisVerticalIcon,
  PlusIcon,
  WebhookIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  useAuthErrorText,
  useErpAuthProvider,
  useFieldError,
} from "@/registry/erp/auth-layout"
import { CopyButton } from "@/registry/erp/copy-button"
import { PageState, SectionSkeleton } from "@/registry/erp/page-state"
import { useReauth } from "@/registry/erp/reauth-dialog"
import { isApiError } from "@/registry/lib/api"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"
import {
  WEBHOOK_QUERY_KEYS,
  webhookUrlIssue,
  type Webhook,
  type WebhookDelivery,
  type WebhookEventType,
  type WebhookInput,
} from "@/registry/lib/webhooks"
import { Alert, AlertDescription } from "@/registry/ui/alert"
import { Badge } from "@/registry/ui/badge"
import { Button } from "@/registry/ui/button"
import { Checkbox } from "@/registry/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/registry/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/registry/ui/dropdown-menu"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/registry/ui/sheet"
import { Spinner } from "@/registry/ui/spinner"
import { Switch } from "@/registry/ui/switch"

/**
 * Вебхуки (ADR-0013, PF11/PF17): підписки на події з адресою, подіями й секретом підпису,
 * увімкнення, тестова подія, новий секрет, журнал доставок із повтором.
 */

type Open =
  | { kind: "create" }
  | { kind: "edit"; webhook: Webhook }
  | { kind: "rotate"; webhook: Webhook }
  | { kind: "remove"; webhook: Webhook }
  | { kind: "secret"; secret: string; title: "created" | "rotated" }
  | { kind: "deliveries"; webhook: Webhook }

export function WebhooksSection() {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const queryClient = useQueryClient()
  const errorText = useAuthErrorText()
  const format = useFormat()
  const { guard, dialog: reauthDialog } = useReauth()
  const [open, setOpen] = React.useState<Open | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const query = useQuery({
    queryKey: WEBHOOK_QUERY_KEYS.list,
    queryFn: () => provider.webhooks.list(),
    // Остання доставка змінюється без участі користувача — свіжі дані при кожному відкритті.
    refetchOnMount: "always",
  })
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: WEBHOOK_QUERY_KEYS.list })
  const close = () => {
    setOpen(null)
  }

  if (query.isPending) return <SectionSkeleton rows={2} />
  if (query.isError)
    return isApiError(query.error) && query.error.status === 403 ? (
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

  const { webhooks, events } = query.data

  const toggle = (webhook: Webhook, active: boolean) => {
    setBusy(webhook.id)
    provider.webhooks
      .update(webhook.id, { active })
      .then(() => {
        toast.success(active ? t("webhooks.enabled") : t("webhooks.disabled"))
        return refresh()
      })
      .catch((failure: unknown) => {
        toast.error(errorText(failure))
      })
      .finally(() => {
        setBusy(null)
      })
  }

  const sendTest = (webhook: Webhook) => {
    setBusy(webhook.id)
    provider.webhooks
      .test(webhook.id)
      .then((delivery) => {
        if (delivery.status === "success")
          toast.success(
            t("webhooks.testSent", { code: delivery.statusCode ?? 200 }),
          )
        else
          toast.error(
            t("webhooks.testFailed", {
              reason: delivery.statusCode
                ? `HTTP ${String(delivery.statusCode)}`
                : (delivery.error ?? t("webhooks.status.failed")),
            }),
          )
        return refresh()
      })
      .catch((failure: unknown) => {
        toast.error(errorText(failure))
      })
      .finally(() => {
        setBusy(null)
      })
  }

  return (
    <div className="@container space-y-4" data-slot="webhooks-section">
      {webhooks.length ? (
        <ul
          className="divide-y rounded-lg border"
          aria-label={t("webhooks.listLabel")}
        >
          {webhooks.map((webhook) => (
            <li
              key={webhook.id}
              className="flex flex-col gap-3 p-3 @lg:flex-row @lg:items-center"
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <WebhookIcon aria-hidden className="size-4" />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-mono text-sm font-medium break-all">
                    {webhook.url}
                  </p>
                  {webhook.description ? (
                    <p className="text-sm">{webhook.description}</p>
                  ) : null}
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                    <span>
                      {[
                        t("webhooks.events", { count: webhook.events.length }),
                        webhook.lastDelivery
                          ? t("webhooks.lastDelivery", {
                              when: format.relative(webhook.lastDelivery.at),
                            })
                          : t("webhooks.noDeliveries"),
                      ].join(" · ")}
                    </span>
                    {webhook.lastDelivery ? (
                      <Badge
                        variant={
                          webhook.lastDelivery.status === "success"
                            ? "success"
                            : "destructive"
                        }
                      >
                        {t(`webhooks.status.${webhook.lastDelivery.status}`)}
                        {webhook.lastDelivery.statusCode
                          ? ` ${String(webhook.lastDelivery.statusCode)}`
                          : ""}
                      </Badge>
                    ) : null}
                  </p>
                  {webhook.failures > 1 ? (
                    <p className="text-sm text-destructive-foreground">
                      {t("webhooks.failing", { count: webhook.failures })}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-2 self-start @lg:self-center">
                <Switch
                  checked={webhook.active}
                  disabled={busy === webhook.id}
                  aria-label={t("webhooks.toggleFor", { url: webhook.url })}
                  onCheckedChange={(checked) => {
                    toggle(webhook, checked)
                  }}
                />
                <span className="w-20 text-sm text-muted-foreground">
                  {webhook.active ? t("webhooks.active") : t("webhooks.paused")}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={busy === webhook.id}
                        aria-label={t("webhooks.actionsFor", {
                          url: webhook.url,
                        })}
                      />
                    }
                  >
                    {busy === webhook.id ? (
                      <Spinner aria-hidden />
                    ) : (
                      <EllipsisVerticalIcon aria-hidden />
                    )}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => {
                        setOpen({ kind: "deliveries", webhook })
                      }}
                    >
                      {t("webhooks.deliveries")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!webhook.active}
                      onClick={() => {
                        sendTest(webhook)
                      }}
                    >
                      {t("webhooks.test")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setOpen({ kind: "edit", webhook })
                      }}
                    >
                      {t("webhooks.edit")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setOpen({ kind: "rotate", webhook })
                      }}
                    >
                      {t("webhooks.rotate")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => {
                        setOpen({ kind: "remove", webhook })
                      }}
                    >
                      {t("webhooks.remove")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t("webhooks.empty")}</p>
      )}
      <Button
        variant="outline"
        disabled={!events.length}
        onClick={() => {
          setOpen({ kind: "create" })
        }}
      >
        <PlusIcon aria-hidden />
        {t("webhooks.create")}
      </Button>

      {open?.kind === "create" || open?.kind === "edit" ? (
        <WebhookDialog
          key={open.kind === "edit" ? open.webhook.id : "new"}
          webhook={open.kind === "edit" ? open.webhook : undefined}
          events={events}
          onClose={close}
          save={(input) =>
            open.kind === "edit"
              ? guard(() => provider.webhooks.update(open.webhook.id, input))
              : guard(() => provider.webhooks.create(input))
          }
          onSaved={(secret) => {
            void refresh()
            if (secret) setOpen({ kind: "secret", secret, title: "created" })
            else {
              toast.success(t("webhooks.saved"))
              close()
            }
          }}
        >
          {reauthDialog}
        </WebhookDialog>
      ) : open?.kind === "rotate" || open?.kind === "remove" ? (
        <ConfirmDialog
          title={
            open.kind === "rotate"
              ? t("webhooks.rotateTitle")
              : t("webhooks.removeTitle")
          }
          description={
            open.kind === "rotate"
              ? t("webhooks.rotateDescription")
              : t("webhooks.removeDescription", { url: open.webhook.url })
          }
          confirm={
            open.kind === "rotate"
              ? t("webhooks.rotateConfirm")
              : t("webhooks.remove")
          }
          destructive={open.kind === "remove"}
          onClose={close}
          onConfirm={() =>
            open.kind === "rotate"
              ? guard(() => provider.webhooks.rotateSecret(open.webhook.id))
                  .then((secret) => {
                    void refresh()
                    setOpen({ kind: "secret", secret, title: "rotated" })
                  })
                  .catch((failure: unknown) => {
                    toast.error(errorText(failure))
                  })
              : provider.webhooks
                  .remove(open.webhook.id)
                  .then(() => {
                    toast.success(t("webhooks.removed"))
                    close()
                    return refresh()
                  })
                  .catch((failure: unknown) => {
                    toast.error(errorText(failure))
                  })
          }
        >
          {reauthDialog}
        </ConfirmDialog>
      ) : (
        reauthDialog
      )}

      <SecretDialog
        secret={open?.kind === "secret" ? open.secret : null}
        title={
          open?.kind === "secret" && open.title === "rotated"
            ? t("webhooks.rotatedTitle")
            : t("webhooks.createdTitle")
        }
        onClose={close}
      />

      <DeliveriesSheet
        webhook={open?.kind === "deliveries" ? open.webhook : null}
        events={events}
        onClose={close}
        onChanged={() => {
          void refresh()
        }}
      />
    </div>
  )
}

/* ---------------------------- Створення й зміна ---------------------------- */

function WebhookDialog({
  webhook,
  events,
  save,
  onClose,
  onSaved,
  children,
}: {
  webhook?: Webhook
  events: WebhookEventType[]
  save: (input: WebhookInput) => Promise<{ secret?: string } | Webhook>
  onClose: () => void
  /** `secret` — лише для нового вебхука. */
  onSaved: (secret?: string) => void
  children?: React.ReactNode
}) {
  const t = useErpUiT()
  const fieldError = useFieldError()
  const errorText = useAuthErrorText()
  const ids = React.useId()
  const [url, setUrl] = React.useState(webhook?.url ?? "")
  const [description, setDescription] = React.useState(
    webhook?.description ?? "",
  )
  const [selected, setSelected] = React.useState<string[]>(
    webhook?.events ?? [],
  )
  const [active, setActive] = React.useState(webhook?.active ?? true)
  const [fields, setFields] = React.useState<{
    url?: string
    events?: string
  }>({})
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const groups = [...new Set(events.map((event) => event.group ?? ""))]

  const urlMessage = (issue: string | null) =>
    issue === "insecure"
      ? t("webhooks.urlInsecure")
      : issue === "required"
        ? t("auth.fieldErrors.required")
        : issue
          ? t("webhooks.urlInvalid")
          : undefined

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            const local: typeof fields = {}
            const issue = urlMessage(webhookUrlIssue(url))
            if (issue) local.url = issue
            if (!selected.length) local.events = t("webhooks.eventsRequired")
            setFields(local)
            if (Object.keys(local).length) return
            setBusy(true)
            setError(null)
            save({
              url: url.trim(),
              description: description.trim(),
              events: selected,
              active,
            })
              .then((result) => {
                onSaved("secret" in result ? result.secret : undefined)
              })
              .catch((failure: unknown) => {
                const code = isApiError(failure)
                  ? failure.fieldErrors?.url
                  : undefined
                const server = {
                  url: code ? urlMessage(code) : undefined,
                  events: fieldError(failure, "events") ?? undefined,
                }
                if (server.url || server.events) setFields(server)
                else if (failure) setError(errorText(failure))
              })
              .finally(() => {
                setBusy(false)
              })
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {webhook ? t("webhooks.editTitle") : t("webhooks.createTitle")}
            </DialogTitle>
            <DialogDescription>{t("webhooks.description")}</DialogDescription>
          </DialogHeader>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Field data-invalid={fields.url ? true : undefined}>
            <FieldLabel htmlFor={`${ids}-url`}>
              {t("webhooks.urlLabel")}
            </FieldLabel>
            <Input
              id={`${ids}-url`}
              type="url"
              inputMode="url"
              value={url}
              autoComplete="off"
              spellCheck={false}
              placeholder="https://"
              aria-invalid={fields.url ? true : undefined}
              aria-describedby={`${ids}-url-hint${fields.url ? ` ${ids}-url-error` : ""}`}
              onChange={(event) => {
                setUrl(event.target.value)
              }}
            />
            <FieldDescription id={`${ids}-url-hint`}>
              {t("webhooks.urlHint")}
            </FieldDescription>
            {fields.url ? (
              <FieldError id={`${ids}-url-error`}>{fields.url}</FieldError>
            ) : null}
          </Field>
          <Field>
            <FieldLabel htmlFor={`${ids}-description`}>
              {t("webhooks.descriptionLabel")}
            </FieldLabel>
            <Input
              id={`${ids}-description`}
              value={description}
              maxLength={200}
              autoComplete="off"
              aria-describedby={`${ids}-description-hint`}
              onChange={(event) => {
                setDescription(event.target.value)
              }}
            />
            <FieldDescription id={`${ids}-description-hint`}>
              {t("webhooks.descriptionHint")}
            </FieldDescription>
          </Field>
          <FieldSet
            data-invalid={fields.events ? true : undefined}
            aria-describedby={`${ids}-events-hint${fields.events ? ` ${ids}-events-error` : ""}`}
          >
            <FieldLegend variant="label">
              {t("webhooks.eventsLabel")}
            </FieldLegend>
            <FieldDescription id={`${ids}-events-hint`}>
              {t("webhooks.eventsHint")}
            </FieldDescription>
            <div className="grid gap-3 sm:grid-cols-2">
              {groups.map((group, index) => (
                <div
                  key={group}
                  role="group"
                  aria-labelledby={
                    group ? `${ids}-group-${String(index)}` : undefined
                  }
                  className="space-y-2"
                >
                  {group ? (
                    <p
                      id={`${ids}-group-${String(index)}`}
                      className="text-sm font-medium"
                    >
                      {group}
                    </p>
                  ) : null}
                  {events
                    .filter((event) => (event.group ?? "") === group)
                    .map((event) => {
                      const checkboxId = `${ids}-${event.id}`
                      return (
                        <Field key={event.id} orientation="horizontal">
                          <Checkbox
                            id={checkboxId}
                            checked={selected.includes(event.id)}
                            onCheckedChange={(checked) => {
                              setSelected((current) =>
                                checked
                                  ? [...current, event.id]
                                  : current.filter((id) => id !== event.id),
                              )
                              setFields((current) => ({
                                ...current,
                                events: undefined,
                              }))
                            }}
                          />
                          <FieldLabel
                            htmlFor={checkboxId}
                            className="font-normal"
                          >
                            {event.label}
                          </FieldLabel>
                        </Field>
                      )
                    })}
                </div>
              ))}
            </div>
            {fields.events ? (
              <FieldError id={`${ids}-events-error`}>
                {fields.events}
              </FieldError>
            ) : null}
          </FieldSet>
          <Field orientation="horizontal">
            <Switch
              id={`${ids}-active`}
              checked={active}
              aria-describedby={`${ids}-active-hint`}
              onCheckedChange={setActive}
            />
            <div className="grid gap-1">
              <FieldLabel htmlFor={`${ids}-active`}>
                {t("webhooks.activeLabel")}
              </FieldLabel>
              <FieldDescription id={`${ids}-active-hint`}>
                {t("webhooks.activeHint")}
              </FieldDescription>
            </div>
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("auth.account.cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Spinner aria-hidden /> : null}
              {webhook ? t("webhooks.submitSave") : t("webhooks.submitCreate")}
            </Button>
          </DialogFooter>
        </form>
        {children}
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------ Секрет і підтвердження ------------------------------ */

function SecretDialog({
  secret,
  title,
  onClose,
}: {
  secret: string | null
  title: string
  onClose: () => void
}) {
  const t = useErpUiT()
  return (
    <Dialog
      open={secret !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {t("webhooks.createdDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <p className="text-sm font-medium">{t("webhooks.secretLabel")}</p>
          <div className="flex items-center gap-2">
            <code
              data-slot="webhook-secret"
              className="min-w-0 flex-1 rounded-md bg-muted px-2 py-1.5 font-mono text-sm break-all"
            >
              {secret}
            </code>
            <CopyButton value={secret ?? ""} label={t("webhooks.copySecret")} />
          </div>
          <p className="pt-1 text-sm text-muted-foreground">
            {t("webhooks.signatureHelp")}
          </p>
        </div>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            {t("webhooks.done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ConfirmDialog({
  title,
  description,
  confirm,
  destructive,
  onClose,
  onConfirm,
  children,
}: {
  title: string
  description: string
  confirm: string
  destructive?: boolean
  onClose: () => void
  onConfirm: () => Promise<unknown>
  children?: React.ReactNode
}) {
  const t = useErpUiT()
  const [busy, setBusy] = React.useState(false)
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("auth.account.cancel")}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void onConfirm().finally(() => {
                setBusy(false)
              })
            }}
          >
            {busy ? <Spinner aria-hidden /> : null}
            {confirm}
          </Button>
        </DialogFooter>
        {children}
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------- Журнал доставок ------------------------------- */

const PER_PAGE = 20

function DeliveriesSheet({
  webhook,
  events,
  onClose,
  onChanged,
}: {
  webhook: Webhook | null
  events: WebhookEventType[]
  onClose: () => void
  onChanged: () => void
}) {
  const t = useErpUiT()
  return (
    <Sheet
      open={webhook !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <SheetContent className="w-full overflow-y-auto data-[side=right]:sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{t("webhooks.deliveriesTitle")}</SheetTitle>
          <SheetDescription className="font-mono break-all">
            {webhook?.url}
          </SheetDescription>
        </SheetHeader>
        {webhook ? (
          <DeliveriesList
            webhook={webhook}
            events={events}
            onChanged={onChanged}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function DeliveriesList({
  webhook,
  events,
  onChanged,
}: {
  webhook: Webhook
  events: WebhookEventType[]
  onChanged: () => void
}) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const queryClient = useQueryClient()
  const queryKey = WEBHOOK_QUERY_KEYS.deliveries(webhook.id)
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      provider.webhooks.getDeliveries(webhook.id, pageParam, PER_PAGE),
    refetchOnMount: "always",
    initialPageParam: 1,
    getNextPageParam: (last, pages) =>
      pages.length * PER_PAGE < last.total ? pages.length + 1 : undefined,
  })

  if (query.isPending) return <SectionSkeleton rows={3} className="px-4" />
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

  const deliveries = query.data.pages.flatMap((page) => page.data)
  const total = query.data.pages[0]?.total ?? 0
  const eventLabel = (id: string) =>
    id === "ping"
      ? t("webhooks.ping")
      : (events.find((event) => event.id === id)?.label ?? id)

  return (
    <div className="space-y-3 px-4 pb-4">
      {deliveries.length ? (
        <ul
          className="divide-y rounded-lg border"
          aria-label={t("webhooks.deliveriesList")}
        >
          {deliveries.map((delivery) => (
            <DeliveryItem
              key={delivery.id}
              delivery={delivery}
              label={eventLabel(delivery.event)}
              onRedelivered={() => {
                onChanged()
                return queryClient.invalidateQueries({ queryKey })
              }}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("webhooks.deliveriesEmpty")}
        </p>
      )}
      {deliveries.length ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {t("webhooks.shown", { shown: deliveries.length, total })}
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
              {t("webhooks.more")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function DeliveryItem({
  delivery,
  label,
  onRedelivered,
}: {
  delivery: WebhookDelivery
  label: string
  onRedelivered: () => Promise<unknown>
}) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const errorText = useAuthErrorText()
  const format = useFormat()
  const detailsId = React.useId()
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  return (
    <li className="space-y-2 p-3" data-slot="webhook-delivery">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant={
            delivery.status === "success"
              ? "success"
              : delivery.status === "failed"
                ? "destructive"
                : "secondary"
          }
        >
          {delivery.statusCode
            ? String(delivery.statusCode)
            : t(`webhooks.status.${delivery.status}`)}
        </Badge>
        <span className="font-medium">{label}</span>
        <code className="text-xs text-muted-foreground">{delivery.event}</code>
      </div>
      <p className="text-sm text-muted-foreground">
        {[
          format.date(delivery.at, "dateTime"),
          t("webhooks.attempt", { n: delivery.attempt }),
          delivery.durationMs !== undefined
            ? t("webhooks.duration", { ms: delivery.durationMs })
            : "",
          delivery.error ?? "",
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="link"
          size="sm"
          className="h-auto min-h-touch px-0"
          aria-expanded={open}
          aria-controls={detailsId}
          aria-label={t("webhooks.deliveryDetails", { event: label })}
          onClick={() => {
            setOpen((value) => !value)
          }}
        >
          {t("audit.details")}
          <ChevronDownIcon
            aria-hidden
            className={cn("transition-transform", open && "rotate-180")}
          />
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            provider.webhooks
              .redeliver(delivery.id)
              .then((retry) => {
                const status = retry.statusCode
                  ? `HTTP ${String(retry.statusCode)}`
                  : t(`webhooks.status.${retry.status}`)
                if (retry.status === "success")
                  toast.success(t("webhooks.redelivered", { status }))
                else toast.error(t("webhooks.redelivered", { status }))
                return onRedelivered()
              })
              .catch((failure: unknown) => {
                toast.error(errorText(failure))
              })
              .finally(() => {
                setBusy(false)
              })
          }}
        >
          {busy ? <Spinner aria-hidden /> : null}
          {t("webhooks.redeliver")}
        </Button>
      </div>
      {open ? (
        <div id={detailsId} className="space-y-3">
          <section className="space-y-1">
            <h4 className="text-sm font-medium">{t("webhooks.request")}</h4>
            <pre
              // Прокручуваний блок має бути досяжним із клавіатури (WCAG 2.1.1).
              // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- прокрутка з клавіатури
              tabIndex={0}
              aria-label={t("webhooks.request")}
              className="max-h-64 overflow-auto rounded-md bg-muted p-2 font-mono text-xs break-all whitespace-pre-wrap"
            >
              {Object.entries(delivery.request.headers)
                .map(([key, value]) => `${key}: ${value}`)
                .join("\n")}
              {"\n\n"}
              {delivery.request.body}
            </pre>
          </section>
          <section className="space-y-1">
            <h4 className="text-sm font-medium">{t("webhooks.response")}</h4>
            <pre
              // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- прокрутка з клавіатури
              tabIndex={0}
              aria-label={t("webhooks.response")}
              className="max-h-40 overflow-auto rounded-md bg-muted p-2 font-mono text-xs break-all whitespace-pre-wrap"
            >
              {delivery.response?.body ??
                delivery.error ??
                t("webhooks.noResponse")}
            </pre>
          </section>
        </div>
      ) : null}
    </li>
  )
}
