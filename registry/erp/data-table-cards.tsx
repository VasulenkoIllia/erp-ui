"use client"

import * as React from "react"
import type { SortPayload } from "ra-core"
import { flushSync } from "react-dom"

import { WindowFailed } from "@/registry/erp/data-table-cells"
import { useVirtualRows } from "@/registry/hooks/use-virtual-rows"
import type {
  DataTableColumn,
  DataTableSource,
  RowWindowState,
} from "@/registry/lib/data-table-core"
import { useErpUiT } from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/registry/ui/select"
import { Skeleton } from "@/registry/ui/skeleton"

/**
 * Картки erp/data-table на вузькому контейнері (SPEC §9: таблиця на телефоні → картки).
 * Ставиться разом з erp/data-table.
 *
 * - W3C APG Feed: `role="feed"`, картки — `article` з `aria-posinset`/`aria-setsize` на весь список;
 *   PageDown/PageUp (і стрілки на самій картці) переводять фокус між картками, Tab — у дії картки.
 * - Вміст картки — з тих самих колонок: `card: "title"` — назва (нею названо картку), `subtitle` —
 *   рядок під назвою, `badge` — позначка поруч, `actions` — дії праворуч угорі, `field` — пари
 *   «підпис і значення» у дві колонки.
 * - Великий список — віртуальний, у власній області на висоту екрана (вікторина 14.10.2026).
 */

export interface DataTableCardsProps<T> {
  label: string
  columns: readonly DataTableColumn<T>[]
  getRowId: (row: T) => string
  source: DataTableSource<T>
  height?: string
  busy: boolean
}

const CARD_ESTIMATE_PX = 120
const GAP_PX = 8
const OVERSCAN = 4
const FEED_KEYS: Record<string, -1 | 1> = {
  PageDown: 1,
  ArrowDown: 1,
  PageUp: -1,
  ArrowUp: -1,
}

type CardRole = NonNullable<DataTableColumn<unknown>["card"]>

function roleOf<T>(column: DataTableColumn<T>, index: number): CardRole {
  return column.card ?? (index === 0 || column.sticky ? "title" : "field")
}

export function DataTableCards<T>({
  label,
  columns,
  getRowId,
  source,
  height,
  busy,
}: DataTableCardsProps<T>) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const id = React.useId()
  const [active, setActive] = React.useState(0)
  const [shownKey, setShownKey] = React.useState(source.listKey)
  if (shownKey !== source.listKey) {
    setShownKey(source.listKey)
    setActive(0)
  }
  const activeIndex = Math.min(active, source.rowCount - 1)

  const { virtualizer, items, failedRows } = useVirtualRows<T, HTMLElement>({
    source,
    scrollRef,
    activeIndex,
    estimateSize: CARD_ESTIMATE_PX,
    overscan: OVERSCAN,
    gap: GAP_PX,
  })

  const byRole = (role: CardRole) =>
    columns.filter((column, index) => roleOf(column, index) === role)
  const roles: CardRoles<T> = {
    title: byRole("title"),
    subtitle: byRole("subtitle"),
    badge: byRole("badge"),
    field: byRole("field"),
    actions: byRole("actions"),
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const step = FEED_KEYS[event.key]
    const target = event.target as HTMLElement
    const isCard = target.dataset.card !== undefined
    // Усередині картки стрілки лишаються елементам; PageUp/PageDown — завжди між картками.
    if (!step || (!isCard && event.key.startsWith("Arrow"))) return
    const card = target.closest<HTMLElement>("[data-card]")
    if (!card) return
    const next = Math.min(
      Math.max(Number(card.dataset.card) + step, 0),
      source.rowCount - 1,
    )
    event.preventDefault()
    flushSync(() => {
      setActive(next)
    })
    const nextCard = scrollRef.current?.querySelector<HTMLElement>(
      `[data-card="${String(next)}"]`,
    )
    nextCard?.focus({ preventScroll: true })
    nextCard?.scrollIntoView({ block: "nearest" })
  }

  const onFocus = (event: React.FocusEvent<HTMLElement>) => {
    const card = event.target.closest<HTMLElement>("[data-card]")
    if (card) setActive(Number(card.dataset.card))
  }

  return (
    // W3C APG Feed: стрічка сама веде фокус між картками (PageUp/PageDown).
    // eslint-disable-next-line jsx-a11y-x/no-noninteractive-element-interactions
    <div
      ref={scrollRef}
      role="feed"
      aria-label={label}
      aria-busy={busy || undefined}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      className="overflow-auto"
      style={{ height }}
    >
      <div
        className={source.virtual ? "relative" : "space-y-2"}
        style={
          source.virtual ? { height: virtualizer.getTotalSize() } : undefined
        }
      >
        {items.map((item) => {
          const row = source.rowAt(item.index)
          const titleId = `${id}-${String(item.index)}`
          return (
            // W3C APG Feed: картка фокусується, щоб PageUp/PageDown переводили між картками.
            <article
              key={item.key}
              ref={source.virtual ? virtualizer.measureElement : undefined}
              data-index={item.index}
              data-card={item.index}
              aria-posinset={source.rowOffset + item.index + 1}
              aria-setsize={source.totalCount}
              aria-labelledby={row ? titleId : undefined}
              aria-busy={row ? undefined : true}
              tabIndex={item.index === activeIndex ? 0 : -1}
              className="rounded-lg border bg-card p-3 text-card-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={
                source.virtual
                  ? { position: "absolute", insetInline: 0, top: item.start }
                  : undefined
              }
            >
              {row ? (
                <CardBody
                  key={getRowId(row)}
                  row={row}
                  roles={roles}
                  titleId={titleId}
                />
              ) : (
                <CardPlaceholder
                  state={source.windowAt(item.index)}
                  showError={failedRows.has(item.index)}
                />
              )}
            </article>
          )
        })}
      </div>
    </div>
  )
}

type CardRoles<T> = Record<Exclude<CardRole, "none">, DataTableColumn<T>[]>

const cellsOf = <T,>(columns: DataTableColumn<T>[], row: T) =>
  columns.map((column) => (
    <React.Fragment key={column.id}>{column.cell(row)}</React.Fragment>
  ))

function CardBody<T>({
  row,
  roles,
  titleId,
}: {
  row: T
  roles: CardRoles<T>
  titleId: string
}) {
  return (
    <>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div id={titleId} className="font-medium">
            {cellsOf(roles.title, row)}
          </div>
          {roles.subtitle.length ? (
            <div className="truncate text-sm text-muted-foreground">
              {cellsOf(roles.subtitle, row)}
            </div>
          ) : null}
        </div>
        {cellsOf(roles.badge, row)}
        {roles.actions.length ? (
          <div className="-my-1 flex shrink-0 gap-1">
            {cellsOf(roles.actions, row)}
          </div>
        ) : null}
      </div>
      {roles.field.length ? (
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          {roles.field.map((column) => (
            <div
              key={column.id}
              className={cn("min-w-0", column.align === "end" && "text-end")}
            >
              <dt className="text-xs text-muted-foreground">{column.header}</dt>
              <dd className="truncate">{column.cell(row)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </>
  )
}

function CardPlaceholder({
  state,
  showError,
}: {
  state: RowWindowState | undefined
  showError: boolean
}) {
  const t = useErpUiT()
  if (state?.status === "error")
    // Повідомлення з повтором — у першій картці невдалого вікна, решта порожні (як у гріді).
    return showError ? (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <WindowFailed state={state} onRetry={state.retry} />
      </div>
    ) : (
      <div className="h-5" />
    )
  return (
    <div className="space-y-2">
      <span className="sr-only">{t("dataTable.loadingRow")}</span>
      <Skeleton aria-hidden className="h-5 w-1/2" />
      <Skeleton aria-hidden className="h-4 w-3/4" />
      <Skeleton aria-hidden className="h-4 w-2/3" />
    </div>
  )
}

/**
 * Сортування в картковому вигляді: заголовків колонок немає, тож вибір «колонка й напрям» —
 * у рядку стану таблиці. Лише колонки з `sortField`.
 */
export function CardSortSelect<T>({
  columns,
  sort,
  onSortChange,
}: {
  columns: readonly DataTableColumn<T>[]
  sort: SortPayload
  onSortChange: (sort: SortPayload) => void
}) {
  const t = useErpUiT()
  const id = React.useId()
  const items = columns.flatMap((column) =>
    column.sortField
      ? (["ASC", "DESC"] as const).map((order) => ({
          value: `${column.sortField ?? ""}:${order}`,
          label: t(
            order === "ASC" ? "dataTable.ascending" : "dataTable.descending",
            { column: column.header },
          ),
        }))
      : [],
  )
  if (!items.length) return null
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {t("dataTable.sortBy")}
      </label>
      <Select
        items={items}
        value={`${sort.field}:${sort.order}`}
        onValueChange={(value: string | null) => {
          const [field, order] = (value ?? "").split(":")
          if (field && (order === "ASC" || order === "DESC"))
            onSortChange({ field, order })
        }}
      >
        <SelectTrigger id={id} size="sm" className="ms-auto">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  )
}
