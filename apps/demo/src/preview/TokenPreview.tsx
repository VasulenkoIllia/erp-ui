import {
  CircleAlert,
  CircleCheck,
  CircleX,
  Clock,
  Download,
  FileText,
  LayoutDashboard,
  Package,
  Plus,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react"

import { strings, type StatusKind } from "@/strings"

/**
 * Прев'ю токенів: міні-оболонка зі списком рахунків. Лише для перевірки тем і щільності;
 * справжні примітиви й ERP-компоненти з'являться в реєстрі на кроках 0.2–0.6.
 */

const NAV_ICONS: LucideIcon[] = [
  LayoutDashboard,
  FileText,
  Users,
  Package,
  Settings,
]
const ACTIVE_NAV = 1

const STATUS_STYLES: Record<
  StatusKind,
  { className: string; icon: LucideIcon }
> = {
  success: {
    className: "bg-success-soft text-success-foreground",
    icon: CircleCheck,
  },
  warning: {
    className: "bg-warning-soft text-warning-foreground",
    icon: CircleAlert,
  },
  destructive: {
    className: "bg-destructive-soft text-destructive-foreground",
    icon: CircleX,
  },
  info: { className: "bg-info-soft text-info-foreground", icon: Clock },
}

const CHART_CLASSES = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
]

function StatusBadge({ kind }: { kind: StatusKind }) {
  const { className, icon: Icon } = STATUS_STYLES[kind]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${className}`}
    >
      <Icon aria-hidden className="size-3.5" />
      {strings.preview.statuses[kind]}
    </span>
  )
}

export function TokenPreview() {
  const p = strings.preview

  return (
    <section
      aria-labelledby="preview-title"
      className="@container overflow-hidden rounded-xl border border-border bg-card text-card-foreground"
    >
      <h2 id="preview-title" className="sr-only">
        {p.title}
      </h2>
      <div className="flex">
        <nav
          aria-label={p.nav}
          className="hidden w-52 shrink-0 flex-col gap-1 border-r border-sidebar-border bg-sidebar p-2 text-sidebar-foreground @2xl:flex"
        >
          {p.navItems.map((item, index) => {
            const Icon = NAV_ICONS[index] ?? FileText
            const active = index === ACTIVE_NAV
            return (
              <button
                key={item}
                type="button"
                aria-current={active ? "page" : undefined}
                className={`flex min-h-control items-center gap-2 rounded-md px-2 text-left ${
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "hover:bg-sidebar-accent"
                }`}
              >
                <Icon
                  aria-hidden
                  className={`size-4 ${active ? "text-sidebar-primary" : ""}`}
                />
                {item}
              </button>
            )
          })}
        </nav>

        <div className="min-w-0 flex-1 space-y-4 p-4 @2xl:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xl font-semibold">{p.pageTitle}</h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex min-h-touch items-center gap-2 rounded-md border border-input bg-card px-3 font-medium hover:bg-accent"
              >
                <Download aria-hidden className="size-4" />
                {p.export}
              </button>
              <button
                type="button"
                className="inline-flex min-h-touch items-center gap-2 rounded-md bg-primary px-3 font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Plus aria-hidden className="size-4" />
                {p.create}
              </button>
            </div>
          </div>

          <div className="max-w-md space-y-1.5">
            <label htmlFor="preview-search" className="font-medium">
              {p.search}
            </label>
            <input
              id="preview-search"
              type="search"
              placeholder={p.searchPlaceholder}
              className="block h-control w-full rounded-md border border-input bg-card px-3 placeholder:text-muted-foreground"
            />
          </div>

          {/* Прокрутка на вузьких екранах має бути доступна з клавіатури (WCAG 2.1.1). */}
          <div
            role="region"
            aria-label={p.tableCaption}
            tabIndex={0}
            className="overflow-x-auto rounded-md"
          >
            <table className="w-full border-collapse">
              <caption className="sr-only">{p.tableCaption}</caption>
              <thead>
                <tr className="h-row border-b border-border text-left text-muted-foreground">
                  <th scope="col" className="px-2 font-medium">
                    {p.columns.number}
                  </th>
                  <th scope="col" className="px-2 font-medium">
                    {p.columns.client}
                  </th>
                  <th scope="col" className="px-2 text-right font-medium">
                    {p.columns.amount}
                  </th>
                  <th scope="col" className="px-2 font-medium">
                    {p.columns.status}
                  </th>
                </tr>
              </thead>
              <tbody>
                {p.rows.map((row) => (
                  <tr
                    key={row.number}
                    className="h-row border-b border-border last:border-0"
                  >
                    <td className="px-2 whitespace-nowrap tabular-nums">
                      {row.number}
                    </td>
                    <td className="px-2">{row.client}</td>
                    <td className="px-2 text-right whitespace-nowrap tabular-nums">
                      {row.amount}
                    </td>
                    <td className="px-2">
                      <StatusBadge kind={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <figure className="space-y-2">
            <figcaption className="font-medium">{p.charts}</figcaption>
            <ul className="flex flex-wrap gap-x-4 gap-y-2">
              {CHART_CLASSES.map((className, index) => (
                <li
                  key={className}
                  className="inline-flex items-center gap-2 text-muted-foreground"
                >
                  <span
                    aria-hidden
                    className={`size-3 rounded-sm ${className}`}
                  />
                  {p.series} {index + 1}
                </li>
              ))}
            </ul>
          </figure>
        </div>
      </div>
    </section>
  )
}
