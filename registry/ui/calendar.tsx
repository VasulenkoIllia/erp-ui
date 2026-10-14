"use client"

import * as React from "react"
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react"
import {
  DayPicker,
  getDefaultClassNames,
  type CustomComponents,
  type DayButton,
  type Locale,
} from "react-day-picker"
import { enGB } from "react-day-picker/locale/en-GB"
import { uk } from "react-day-picker/locale/uk"

import { formatDate } from "@/registry/lib/format"
import { useErpUiT, useLanguage, type Language } from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"
import { Button, buttonVariants } from "@/registry/ui/button"

// erp-ui: основа — shadcn base-nova/calendar (ui.shadcn.com, react-day-picker 10.0.2, 14.10.2026); правки erp-ui позначено «erp-ui:».

// erp-ui: локаль react-day-picker за мовою інтерфейсу — з українськими й англійськими підписами для скрінрідера.
const LOCALES: Record<Language, Locale> = { uk, en: enGB }

// erp-ui: тиждень — з понеділка, номери тижнів — ISO 8601 (SPEC §11); клітинка — висота контрола
// з токенів щільності, зона натиску кнопок дня ≥ --touch-min (touch-target у Button).
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  locale,
  formatters,
  components,
  labels,
  ISOWeek = true,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"]
}) {
  const defaultClassNames = getDefaultClassNames()
  const t = useErpUiT()
  const { language, locale: intlLocale } = useLanguage()
  const resolvedLocale = locale ?? LOCALES[language]
  // erp-ui: підпис дня для скрінрідера — дата у форматі кіта («середа, 21 жовтня», без «21-е» і «р.», SPEC §11).
  const dayLabel = (date: Date, today?: boolean, selected?: boolean) =>
    [
      today ? t("dates.today") : null,
      formatDate(date, "weekdayDayMonth", intlLocale),
      selected ? t("dates.selected") : null,
    ]
      .filter(Boolean)
      .join(", ")

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      ISOWeek={ISOWeek}
      className={cn(
        "group/calendar bg-background p-2 [--cell-radius:var(--radius-md)] [--cell-size:var(--control-h)] in-data-[slot=card-content]:bg-transparent in-data-[slot=popover-content]:bg-transparent",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className,
      )}
      captionLayout={captionLayout}
      locale={resolvedLocale}
      labels={{
        labelDayButton: (date, modifiers) =>
          dayLabel(date, modifiers.today, modifiers.selected),
        labelGridcell: (date, modifiers) => dayLabel(date, modifiers?.today),
        ...labels,
      }}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString(resolvedLocale.code, { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn(
          "relative flex flex-col gap-4 md:flex-row",
          defaultClassNames.months,
        ),
        month: cn("flex w-full flex-col gap-4", defaultClassNames.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
          defaultClassNames.nav,
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          "size-(--cell-size) p-0 select-none aria-disabled:opacity-50",
          defaultClassNames.button_previous,
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          "size-(--cell-size) p-0 select-none aria-disabled:opacity-50",
          defaultClassNames.button_next,
        ),
        month_caption: cn(
          "flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)",
          defaultClassNames.month_caption,
        ),
        dropdowns: cn(
          "flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-sm font-medium",
          defaultClassNames.dropdowns,
        ),
        dropdown_root: cn(
          "relative rounded-(--cell-radius)",
          defaultClassNames.dropdown_root,
        ),
        dropdown: cn(
          "absolute inset-0 bg-popover opacity-0",
          defaultClassNames.dropdown,
        ),
        caption_label: cn(
          "font-medium select-none",
          captionLayout === "label"
            ? "text-sm"
            : "flex items-center gap-1 rounded-(--cell-radius) text-sm [&>svg]:size-3.5 [&>svg]:text-muted-foreground",
          defaultClassNames.caption_label,
        ),
        month_grid: cn("w-full border-collapse", defaultClassNames.month_grid),
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "flex-1 rounded-(--cell-radius) text-xs font-normal text-muted-foreground select-none",
          defaultClassNames.weekday,
        ),
        week: cn("mt-2 flex w-full", defaultClassNames.week),
        week_number_header: cn(
          "w-(--cell-size) select-none",
          defaultClassNames.week_number_header,
        ),
        week_number: cn(
          "text-xs text-muted-foreground select-none",
          defaultClassNames.week_number,
        ),
        day: cn(
          "group/day relative aspect-square h-full w-full rounded-(--cell-radius) p-0 text-center select-none [&:last-child[data-selected=true]_button]:rounded-r-(--cell-radius)",
          props.showWeekNumber
            ? "[&:nth-child(2)[data-selected=true]_button]:rounded-l-(--cell-radius)"
            : "[&:first-child[data-selected=true]_button]:rounded-l-(--cell-radius)",
          defaultClassNames.day,
        ),
        range_start: cn(
          "relative isolate z-0 rounded-l-(--cell-radius) bg-muted after:absolute after:inset-y-0 after:right-0 after:w-4 after:bg-muted",
          defaultClassNames.range_start,
        ),
        range_middle: cn("rounded-none", defaultClassNames.range_middle),
        range_end: cn(
          "relative isolate z-0 rounded-r-(--cell-radius) bg-muted after:absolute after:inset-y-0 after:left-0 after:w-4 after:bg-muted",
          defaultClassNames.range_end,
        ),
        today: cn(
          "rounded-(--cell-radius) bg-muted text-foreground data-[selected=true]:rounded-none",
          defaultClassNames.today,
        ),
        outside: cn(
          "text-muted-foreground aria-selected:text-muted-foreground",
          defaultClassNames.outside,
        ),
        disabled: cn(
          "text-muted-foreground opacity-50",
          defaultClassNames.disabled,
        ),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      // erp-ui: компоненти — на рівні модуля, а не стрілками тут: інакше кожен рендер батька
      // (введення в полях періоду) монтував би сітку заново.
      components={{
        Root: CalendarRoot,
        Chevron: CalendarChevron,
        DayButton: CalendarDayButton,
        WeekNumber: CalendarWeekNumber,
        ...components,
      }}
      {...props}
    />
  )
}

const CalendarRoot: CustomComponents["Root"] = ({
  className,
  rootRef,
  ...props
}) => (
  <div
    data-slot="calendar"
    ref={rootRef}
    className={cn(className)}
    {...props}
  />
)

// erp-ui: іконки — lucide (ADR-0006, п.6).
const CalendarChevron: CustomComponents["Chevron"] = ({
  className,
  orientation,
  ...props
}) => {
  if (orientation === "left")
    return <ChevronLeftIcon className={cn("size-4", className)} {...props} />
  if (orientation === "right")
    return <ChevronRightIcon className={cn("size-4", className)} {...props} />
  return <ChevronDownIcon className={cn("size-4", className)} {...props} />
}

const CalendarWeekNumber: CustomComponents["WeekNumber"] = ({
  children,
  ...props
}) => (
  <td {...props}>
    <div className="flex size-(--cell-size) items-center justify-center text-center">
      {children}
    </div>
  </td>
)

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames()

  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  // erp-ui: ref передається кнопці — інакше фокус клавіатури не переходить на день (upstream його губить).
  // erp-ui: у forced-colors тло вибраного дня зникає — вибір показує контур (SPEC §10).
  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      // erp-ui: "2026-10-13" замість дати в локалі — однаково в усіх мовах.
      data-day={day.isoDate}
      data-selected={modifiers.selected || undefined}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        "relative isolate z-10 flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 border-0 leading-none font-normal group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-2 group-data-[focused=true]/day:ring-ring data-[range-end=true]:rounded-(--cell-radius) data-[range-end=true]:rounded-r-(--cell-radius) data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground data-[range-middle=true]:rounded-none data-[range-middle=true]:bg-muted data-[range-middle=true]:text-foreground data-[range-start=true]:rounded-(--cell-radius) data-[range-start=true]:rounded-l-(--cell-radius) data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground dark:hover:text-foreground [&>span]:text-xs [&>span]:opacity-70",
        "forced-colors:data-selected:outline-2 forced-colors:data-selected:-outline-offset-2 forced-colors:data-selected:outline-solid",
        defaultClassNames.day,
        className,
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
