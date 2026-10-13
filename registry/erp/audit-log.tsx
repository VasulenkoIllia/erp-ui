"use client"

import * as React from "react"
import { useInfiniteQuery } from "@tanstack/react-query"
import {
  Building2Icon,
  ChevronDownIcon,
  DatabaseIcon,
  DownloadIcon,
  KeyRoundIcon,
  LogInIcon,
  PlugIcon,
  ShieldIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import { deviceLabel } from "@/registry/erp/account-devices"
import {
  useAuthErrorText,
  useErpAuthProvider,
} from "@/registry/erp/auth-layout"
import { PageState, SectionSkeleton } from "@/registry/erp/page-state"
import { useCompanyId } from "@/registry/hooks/use-company"
import { isApiError } from "@/registry/lib/api"
import {
  AUDIT_CATEGORIES,
  AUDIT_QUERY_KEYS,
  type AuditEvent,
  type AuditFilter,
  type AuditValue,
} from "@/registry/lib/audit"
import { companyScope } from "@/registry/lib/company-scope"
import { useFormat } from "@/registry/lib/format"
import {
  useErpUiT,
  type ErpUiKey,
  type ErpUiTranslate,
} from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"
import { Badge } from "@/registry/ui/badge"
import { Button } from "@/registry/ui/button"
import { Field, FieldLabel } from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/registry/ui/select"
import { Spinner } from "@/registry/ui/spinner"

/**
 * Журнал аудиту (ADR-0013, основа A5): пошук, розділ, період, експорт CSV і подробиці події —
 * причина, «було → стало», пристрій, місце.
 *
 *   <AuditLog />                                              // увесь журнал (право audit:read)
 *   <AuditLog filter={{ targetType: "invoices", targetId }} /> // історія одного запису
 *
 * Дії кіту перекладає сам; дії проекту — `actionLabels` або `actionLabel` від сервера.
 */

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  auth: LogInIcon,
  security: ShieldIcon,
  users: UsersIcon,
  company: Building2Icon,
  integrations: PlugIcon,
  data: DatabaseIcon,
}

const PERIODS = ["all", "day", "week", "month", "quarter"] as const
type Period = (typeof PERIODS)[number]
const PERIOD_DAYS: Record<Period, number | null> = {
  all: null,
  day: 1,
  week: 7,
  month: 30,
  quarter: 90,
}

/** Переклад за динамічним ключем; немає ключа — null. */
function maybe(
  t: ErpUiTranslate,
  key: string,
  options?: Record<string, unknown>,
): string | null {
  const text = t(key as ErpUiKey, options)
  return text === key ? null : text
}

/** Назва дії: від проекту, з кіту, від сервера, за дієсловом запису або сам код. */
export function auditActionLabel(
  event: Pick<AuditEvent, "action" | "actionLabel">,
  t: ErpUiTranslate,
  labels: Record<string, string> = {},
): string {
  const verb = event.action.split(".").at(-1) ?? ""
  return (
    labels[event.action] ??
    maybe(t, `audit.actions.${event.action}`) ??
    event.actionLabel ??
    maybe(t, `audit.verbs.${verb}`) ??
    event.action
  )
}

function valueText(value: AuditValue | undefined, t: ErpUiTranslate): string {
  if (value === undefined || value === null || value === "") return "—"
  if (typeof value === "boolean") return value ? t("audit.yes") : t("audit.no")
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—"
  return String(value)
}

function detailText(
  key: string,
  value: string | number | boolean,
  t: ErpUiTranslate,
) {
  if (key === "method" && typeof value === "string")
    return (
      maybe(t, `auth.signIns.methods.${value}`, {
        provider: t("auth.signIns.ssoUnknown"),
      }) ?? value
    )
  if (key === "type" && typeof value === "string")
    return maybe(t, `auth.factors.types.${value}`) ?? value
  return typeof value === "boolean"
    ? value
      ? t("audit.yes")
      : t("audit.no")
    : String(value)
}

export function AuditLog({
  filter: fixed = {},
  actionLabels,
  perPage = 20,
  filters = true,
  exportable = true,
}: {
  /** Постійний фільтр: історія запису, дії однієї людини. */
  filter?: AuditFilter
  /** Назви дій проекту: { "invoices.paid": "Оплата рахунку" }. */
  actionLabels?: Record<string, string>
  perPage?: number
  /** Показати пошук, розділ і період. */
  filters?: boolean
  exportable?: boolean
}) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const errorText = useAuthErrorText()
  const ids = React.useId()
  const [search, setSearch] = React.useState("")
  const [q, setQ] = React.useState("")
  const [category, setCategory] = React.useState("all")
  const [period, setPeriod] = React.useState<Period>("all")
  const [exporting, setExporting] = React.useState(false)
  // Межа періоду рахується від моменту вибору, а не від кожного рендера.
  const [periodStart, setPeriodStart] = React.useState<string | undefined>()

  // Пошук — після паузи в наборі.
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setQ(search)
    }, 300)
    return () => {
      clearTimeout(timer)
    }
  }, [search])

  const filter: AuditFilter = {
    ...fixed,
    ...(q.trim() ? { q: q.trim() } : {}),
    ...(category !== "all" ? { category: [category] } : {}),
    ...(periodStart ? { from: periodStart } : {}),
  }
  const filtered = Boolean(q.trim()) || category !== "all" || period !== "all"

  const companyId = useCompanyId()
  const query = useInfiniteQuery({
    queryKey: [
      ...AUDIT_QUERY_KEYS.events,
      filter,
      perPage,
      companyScope(companyId),
    ],
    // Журнал — живі дані: щоразу свіжий, навіть якщо застосунок кешує запити довше.
    refetchOnMount: "always",
    queryFn: ({ pageParam }) =>
      provider.audit.getEvents(filter, pageParam, perPage),
    initialPageParam: 1,
    getNextPageParam: (last, pages) =>
      pages.length * perPage < last.total ? pages.length + 1 : undefined,
  })

  const resetFilters = () => {
    setSearch("")
    setQ("")
    setCategory("all")
    setPeriod("all")
    setPeriodStart(undefined)
  }

  const download = () => {
    setExporting(true)
    provider.audit
      .exportEvents(filter)
      .then((blob) => {
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`
        link.click()
        URL.revokeObjectURL(url)
        toast.success(t("audit.exported"))
      })
      .catch((failure: unknown) => {
        toast.error(errorText(failure))
      })
      .finally(() => {
        setExporting(false)
      })
  }

  const categoryItems = [
    { value: "all", label: t("audit.categories.all") },
    ...AUDIT_CATEGORIES.map((value) => ({
      value,
      label: t(`audit.categories.${value}`),
    })),
  ]
  const periodItems = PERIODS.map((value) => ({
    value,
    label: t(`audit.periods.${value}`),
  }))

  let body: React.ReactNode
  if (query.isPending) body = <SectionSkeleton rows={4} />
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
    const events = query.data.pages.flatMap((page) => page.data)
    const total = query.data.pages[0]?.total ?? 0
    body = events.length ? (
      <>
        <ul
          className="divide-y rounded-lg border"
          aria-label={t("audit.listLabel")}
        >
          {events.map((event) => (
            <AuditEventItem
              key={event.id}
              event={event}
              actionLabels={actionLabels}
            />
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {t("audit.shown", { shown: events.length, total })}
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
              {t("audit.more")}
            </Button>
          ) : null}
        </div>
      </>
    ) : (
      <div className="space-y-3 rounded-lg border border-dashed p-6 text-center">
        <p className="text-sm text-muted-foreground">
          {filtered ? t("audit.emptyFiltered") : t("audit.empty")}
        </p>
        {filtered ? (
          <Button variant="outline" size="sm" onClick={resetFilters}>
            {t("audit.resetFilters")}
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="@container space-y-4" data-slot="audit-log">
      {filters || exportable ? (
        <div className="flex flex-col gap-3 @2xl:flex-row @2xl:items-end">
          {filters ? (
            <>
              <Field className="@2xl:flex-1">
                <FieldLabel htmlFor={`${ids}-q`}>
                  {t("audit.searchLabel")}
                </FieldLabel>
                <Input
                  id={`${ids}-q`}
                  type="search"
                  value={search}
                  placeholder={t("audit.searchPlaceholder")}
                  onChange={(event) => {
                    setSearch(event.target.value)
                  }}
                />
              </Field>
              <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @2xl:flex">
                <Field className="@2xl:w-48">
                  <FieldLabel htmlFor={`${ids}-category`}>
                    {t("audit.categoryLabel")}
                  </FieldLabel>
                  <Select
                    items={categoryItems}
                    value={category}
                    onValueChange={(value: string | null) => {
                      setCategory(value ?? "all")
                    }}
                  >
                    <SelectTrigger id={`${ids}-category`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categoryItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field className="@2xl:w-44">
                  <FieldLabel htmlFor={`${ids}-period`}>
                    {t("audit.periodLabel")}
                  </FieldLabel>
                  <Select
                    items={periodItems}
                    value={period}
                    onValueChange={(value: Period | null) => {
                      const next = value ?? "all"
                      const days = PERIOD_DAYS[next]
                      setPeriod(next)
                      setPeriodStart(
                        days === null
                          ? undefined
                          : new Date(
                              Date.now() - days * 86_400_000,
                            ).toISOString(),
                      )
                    }}
                  >
                    <SelectTrigger id={`${ids}-period`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {periodItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </>
          ) : null}
          {exportable ? (
            <Button
              variant="outline"
              className="self-start @2xl:self-end"
              disabled={exporting || !query.isSuccess}
              onClick={download}
            >
              {exporting ? (
                <Spinner aria-hidden />
              ) : (
                <DownloadIcon aria-hidden />
              )}
              {t("audit.export")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {body}
    </div>
  )
}

function AuditEventItem({
  event,
  actionLabels,
}: {
  event: AuditEvent
  actionLabels?: Record<string, string>
}) {
  const t = useErpUiT()
  const format = useFormat()
  const detailsId = React.useId()
  const [open, setOpen] = React.useState(false)
  const Icon =
    event.actor.type === "api_token"
      ? KeyRoundIcon
      : (CATEGORY_ICONS[event.category] ?? DatabaseIcon)
  const action = auditActionLabel(event, t, actionLabels)
  const actor =
    event.actor.type === "system"
      ? t("audit.system")
      : event.actor.type === "api_token"
        ? t("audit.apiToken", { name: event.actor.name })
        : event.actor.name
  const failed = event.result === "failure"
  const hasDetails = Boolean(
    event.reason ||
    event.changes?.length ||
    event.device ||
    event.location ||
    (event.details && Object.keys(event.details).length),
  )

  return (
    <li className="p-3" data-slot="audit-event">
      <div className="flex gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-md",
            failed
              ? "bg-destructive-soft text-destructive-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          <Icon aria-hidden className="size-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
            <span>{action}</span>
            {event.target?.name ? (
              <span className="font-normal text-muted-foreground">
                {event.target.name}
              </span>
            ) : null}
            {failed ? (
              <Badge variant="destructive">{t("audit.failure")}</Badge>
            ) : null}
          </p>
          <p className="text-sm text-muted-foreground">
            {[
              actor,
              format.date(event.at, "dateTime"),
              event.ip ? t("auth.signIns.ip", { ip: event.ip }) : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {event.impersonatedBy ? (
            <p className="text-sm text-warning-foreground">
              {t("audit.impersonatedBy", { name: event.impersonatedBy })}
            </p>
          ) : null}
          {hasDetails ? (
            <Button
              variant="link"
              size="sm"
              className="h-auto min-h-touch px-0"
              aria-expanded={open}
              aria-controls={detailsId}
              aria-label={t("audit.detailsFor", { action })}
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
          ) : null}
          {open ? (
            <div id={detailsId} className="space-y-3 pt-1">
              <dl className="grid gap-x-4 gap-y-1 text-sm @md:grid-cols-[auto_1fr]">
                {event.reason ? (
                  <>
                    <dt className="text-muted-foreground">
                      {t("audit.reason")}
                    </dt>
                    <dd>{event.reason}</dd>
                  </>
                ) : null}
                {event.device ? (
                  <>
                    <dt className="text-muted-foreground">
                      {t("audit.device")}
                    </dt>
                    <dd>{deviceLabel(event.device, t)}</dd>
                  </>
                ) : null}
                {event.location ? (
                  <>
                    <dt className="text-muted-foreground">
                      {t("audit.location")}
                    </dt>
                    <dd>{event.location}</dd>
                  </>
                ) : null}
                {Object.entries(event.details ?? {}).map(([key, value]) => (
                  <React.Fragment key={key}>
                    <dt className="text-muted-foreground">
                      {maybe(t, `audit.detailLabels.${key}`) ?? key}
                    </dt>
                    <dd>{detailText(key, value, t)}</dd>
                  </React.Fragment>
                ))}
              </dl>
              {event.changes?.length ? (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <caption className="sr-only">{t("audit.changes")}</caption>
                    <thead className="bg-muted/50 text-start">
                      <tr>
                        <th
                          scope="col"
                          className="px-3 py-2 text-start font-medium"
                        >
                          {t("audit.field")}
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-start font-medium"
                        >
                          {t("audit.before")}
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-start font-medium"
                        >
                          {t("audit.after")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {event.changes.map((change) => (
                        <tr key={change.field}>
                          <th
                            scope="row"
                            className="px-3 py-2 text-start font-normal text-muted-foreground"
                          >
                            {change.label ?? change.field}
                          </th>
                          <td className="px-3 py-2 break-words">
                            {valueText(change.from, t)}
                          </td>
                          <td className="px-3 py-2 break-words">
                            {valueText(change.to, t)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  )
}
