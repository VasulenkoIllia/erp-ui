"use client"

import * as React from "react"
import { ListFilterIcon, SearchIcon, XIcon } from "lucide-react"

import { ErrorBoundary } from "@/registry/erp/error-boundary"
import { LoadingFallback } from "@/registry/erp/page-state"
import { remPx, useElementSize } from "@/registry/hooks/use-element-size"
import {
  activeFilters,
  clearFilters,
  emptyFilter,
  filterValueText,
  writeFilter,
  type FilterDefinition,
  type FilterDraft,
  type FilterTextFormat,
} from "@/registry/lib/filters"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import { lazyWithPreload, whenIdle } from "@/registry/lib/lazy"
import type { ListFilter } from "@/registry/lib/list-state"
import { cn } from "@/registry/lib/utils"
import { Badge } from "@/registry/ui/badge"
import { Button } from "@/registry/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/registry/ui/input-group"
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/registry/ui/popover"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/registry/ui/sheet"

/**
 * Панель фільтрів списку (UI03, SPEC §7 List Report, ADR-0017): пошук, кнопка «Фільтри» з
 * лічильником, чипи активних фільтрів і місце для меню видів.
 *
 * - `value` — фільтри списку з пошуком `q` (ListState.filter); зміни йдуть одним `onValueChange`.
 * - Пошук застосовується через 300 мс після введення, з `{ replace: true }`: кожна літера не стає
 *   записом в історії.
 * - Фільтри редагуються в панелі: поповер на широкому контейнері, нижня шторка на вузькому (UI38).
 * - Чип — назва й значення фільтра та кнопка «Прибрати»; після неї фокус іде на сусідній чип або
 *   на «Фільтри» (WCAG 2.4.3). «Скинути фільтри» прибирає всі, пошук лишає.
 */

export interface FilterBarProps {
  filters: readonly FilterDefinition[]
  value: ListFilter
  onValueChange: (filter: ListFilter, options?: { replace?: boolean }) => void
  /** Підказка в полі пошуку (`q`); без неї поля пошуку немає. */
  searchPlaceholder?: string
  /** Праворуч від «Фільтри»: меню видів, перемикачі подання. */
  actions?: React.ReactNode
  className?: string
}

// Форма тягне календар і поля сум: окремим чанком, поки браузер вільний чи при наведенні (ADR-0009).
const FilterPanelForm = lazyWithPreload(() =>
  import("./filter-panel").then((m) => m.FilterPanelForm),
)

const SEARCH_DEBOUNCE_MS = 300
/** Нижче цієї ширини контейнера, rem, — шторка замість поповера і пошук окремим рядком. */
const NARROW_BELOW_REM = 40

export function FilterBar({
  filters,
  value,
  onValueChange,
  searchPlaceholder,
  actions,
  className,
}: FilterBarProps) {
  const container = React.useRef<HTMLDivElement>(null)
  const width = useElementSize(container, "width")
  const narrow = width !== null && width / remPx() < NARROW_BELOW_REM
  const trigger = React.useRef<HTMLButtonElement>(null)
  const active = activeFilters(filters, value)
  const query = typeof value.q === "string" ? value.q : ""

  const commitSearch = (q: string) => {
    const next = { ...value }
    if (q) next.q = q
    else delete next.q
    onValueChange(next, { replace: true })
  }

  return (
    <div
      ref={container}
      data-slot="filter-bar"
      className={cn("@container min-w-0 space-y-2", className)}
    >
      <div className="flex flex-wrap items-center gap-2">
        {searchPlaceholder ? (
          <SearchField
            value={query}
            placeholder={searchPlaceholder}
            onCommit={commitSearch}
            className={narrow ? "w-full" : "max-w-sm min-w-48 flex-1"}
          />
        ) : null}
        <FilterPanelButton
          ref={trigger}
          narrow={narrow}
          filters={filters}
          value={value}
          activeCount={active.length}
          onApply={(next) => {
            onValueChange(next)
          }}
        />
        {actions ? (
          // На вузькому контейнері дії переносяться в рядку разом із «Фільтри».
          <div
            className={
              narrow ? "contents" : "ms-auto flex min-w-0 items-center gap-2"
            }
          >
            {actions}
          </div>
        ) : null}
      </div>
      {active.length ? (
        <FilterChips
          active={active}
          onRemove={(definition, draft) => {
            onValueChange(writeFilter(definition, value, draft))
          }}
          onClear={() => {
            onValueChange(clearFilters(filters, value))
            trigger.current?.focus()
          }}
          fallbackFocus={trigger}
        />
      ) : null}
    </div>
  )
}

/**
 * Поле пошуку з паузою. Значення ззовні (вид, «Скинути», «Назад») замінює введене, а відлуння
 * власного застосування — ні: людина могла дописати літеру, поки адреса оновлювалась. Відлуння
 * пропускається один раз, тож те саме значення, що прийде ззовні пізніше, знову потрапить у поле.
 */
function SearchField({
  value,
  placeholder,
  onCommit,
  className,
}: {
  value: string
  placeholder: string
  onCommit: (value: string) => void
  className?: string
}) {
  const [text, setText] = React.useState(value)
  const [seen, setSeen] = React.useState(value)
  const [committed, setCommitted] = React.useState<string | null>(null)
  if (value !== seen) {
    setSeen(value)
    if (value === committed) setCommitted(null)
    else setText(value)
  }
  // Новий `onCommit` на кожному рендері батька (лічильники, види) не перезапускає паузу.
  const commit = React.useEffectEvent((next: string) => {
    setCommitted(next)
    onCommit(next)
  })
  React.useEffect(() => {
    const next = text.trim()
    if (next === value) return
    const timer = setTimeout(() => {
      commit(next)
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [text, value])
  return (
    <InputGroup className={className}>
      <InputGroupAddon>
        <SearchIcon aria-hidden />
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={text}
        onChange={(event) => {
          setText(event.target.value)
        }}
      />
    </InputGroup>
  )
}

interface FilterPanelButtonProps {
  ref: React.Ref<HTMLButtonElement>
  narrow: boolean
  filters: readonly FilterDefinition[]
  value: ListFilter
  activeCount: number
  onApply: (filter: ListFilter) => void
}

/** «Фільтри» з лічильником: поповер на широкому контейнері, нижня шторка на вузькому. */
function FilterPanelButton({
  ref,
  narrow,
  filters,
  value,
  activeCount,
  onApply,
}: FilterPanelButtonProps) {
  const t = useErpUiT()
  const [open, setOpen] = React.useState(false)
  // Поки панель відкрита, вигляд не міняється (поворот екрана, смуга прокрутки під шторкою): інакше
  // форма перемонтується й чернетка зникне.
  const [openedNarrow, setOpenedNarrow] = React.useState(narrow)
  const sheet = open ? openedNarrow : narrow
  const onOpenChange = (next: boolean) => {
    if (next) setOpenedNarrow(narrow)
    setOpen(next)
  }
  const label = (
    <>
      <ListFilterIcon aria-hidden />
      {t("filterBar.filters")}
      {activeCount ? (
        <Badge variant="secondary" aria-hidden className="tabular-nums">
          {activeCount}
        </Badge>
      ) : null}
    </>
  )
  // Перше відкриття не чекає на мережу.
  React.useEffect(
    () =>
      whenIdle(() => {
        void FilterPanelForm.preload()
      }),
    [],
  )
  const form = (
    <ErrorBoundary className="m-4 min-h-0">
      <React.Suspense fallback={<LoadingFallback className="h-24" />}>
        <FilterPanelForm
          filters={filters}
          value={value}
          onApply={(next) => {
            setOpen(false)
            onApply(next)
          }}
        />
      </React.Suspense>
    </ErrorBoundary>
  )
  // Число на значку — для очей; скрінрідер чує «Фільтри, 2 активні».
  const button = (
    <Button
      ref={ref}
      variant="outline"
      onPointerEnter={() => {
        void FilterPanelForm.preload()
      }}
      onFocus={() => {
        void FilterPanelForm.preload()
      }}
      aria-label={
        activeCount
          ? `${t("filterBar.filters")}, ${t("filterBar.activeCount", { count: activeCount })}`
          : undefined
      }
    />
  )
  if (sheet)
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetTrigger render={button}>{label}</SheetTrigger>
        <SheetContent
          side="bottom"
          className="max-h-[calc(100dvh-2rem)] gap-0" // erp-ui: allow-raw-value — відступ 1 rem від верху екрана
        >
          <SheetHeader className="pb-2">
            <SheetTitle>{t("filterBar.filters")}</SheetTitle>
          </SheetHeader>
          {form}
        </SheetContent>
      </Sheet>
    )
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={button}>{label}</PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-(--available-height) w-96 max-w-(--available-width) gap-0 overflow-hidden p-0"
      >
        <PopoverTitle className="px-4 pt-4 pb-2 text-base">
          {t("filterBar.filters")}
        </PopoverTitle>
        {form}
      </PopoverContent>
    </Popover>
  )
}

interface FilterChipsProps {
  active: { definition: FilterDefinition; draft: FilterDraft }[]
  onRemove: (definition: FilterDefinition, empty: FilterDraft) => void
  onClear: () => void
  fallbackFocus: React.RefObject<HTMLButtonElement | null>
}

/** Чипи активних фільтрів зі «Прибрати» і «Скинути фільтри» (поза списком: це не фільтр). */
function FilterChips({
  active,
  onRemove,
  onClear,
  fallbackFocus,
}: FilterChipsProps) {
  const t = useErpUiT()
  const format = useFormat()
  const textFormat: FilterTextFormat = {
    date: (value) => format.date(value, "medium"),
    dateRange: (from, to) => format.dateRange(from, to, "medium"),
    money: (amount, currency) => format.money({ amount, currency }),
    from: (value) => t("filterBar.fromValue", { value }),
    to: (value) => t("filterBar.toValue", { value }),
    between: (from, to) => t("filterBar.between", { from, to }),
  }
  const buttons = React.useRef(new Map<string, HTMLButtonElement>())
  const remove = (index: number) => {
    const item = active[index]
    if (!item) return
    const neighbour = active[index + 1] ?? active[index - 1]
    onRemove(item.definition, emptyFilter(item.draft))
    const next = neighbour && buttons.current.get(neighbour.definition.id)
    ;(next ?? fallbackFocus.current)?.focus()
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ul
        aria-label={t("filterBar.active")}
        className="flex min-w-0 flex-wrap gap-2"
      >
        {active.map(({ definition, draft }, index) => (
          <li
            key={definition.id}
            className="flex max-w-full min-w-0 items-center gap-1 rounded-full border bg-muted ps-3 text-sm"
          >
            <span className="truncate">
              <span className="text-muted-foreground">{`${definition.label}: `}</span>
              {filterValueText(definition, draft, textFormat)}
            </span>
            <Button
              ref={(node) => {
                if (node) buttons.current.set(definition.id, node)
                else buttons.current.delete(definition.id)
              }}
              variant="ghost"
              size="icon-sm"
              className="touch-target relative shrink-0 rounded-full"
              aria-label={t("filterBar.remove", { label: definition.label })}
              onClick={() => {
                remove(index)
              }}
            >
              <XIcon aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <Button variant="ghost" size="sm" onClick={onClear}>
        {t("filterBar.clearAll")}
      </Button>
    </div>
  )
}
