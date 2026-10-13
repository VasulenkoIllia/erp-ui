"use client"

import * as React from "react"
import { cn } from "@/registry/lib/utils"

// erp-ui: основа — shadcn base-nova/table (shadcn 4.21.4, 13.10.2026); правки erp-ui позначено «erp-ui:».

/** Чи прокручується контейнер по горизонталі (стежить за зміною розміру). */
function useHorizontalOverflow(ref: React.RefObject<HTMLDivElement | null>) {
  const [overflowing, setOverflowing] = React.useState(false)
  React.useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === "undefined") return
    const update = () => {
      setOverflowing(el.scrollWidth > el.clientWidth)
    }
    const observer = new ResizeObserver(update)
    observer.observe(el)
    if (el.firstElementChild) observer.observe(el.firstElementChild)
    update()
    return () => {
      observer.disconnect()
    }
  }, [ref])
  return overflowing
}

// erp-ui: коли таблиця ширша за контейнер, область прокрутки стає зупинкою Tab з підписом
// (WCAG 2.1.1, axe scrollable-region-focusable). label — підпис області (uk; i18n — крок 0.3).
function Table({
  className,
  label = "Таблиця",
  ...props
}: React.ComponentProps<"table"> & { label?: string }) {
  const container = React.useRef<HTMLDivElement>(null)
  const overflowing = useHorizontalOverflow(container)
  return (
    <div
      ref={container}
      data-slot="table-container"
      {...(overflowing
        ? { role: "region", "aria-label": label, tabIndex: 0 }
        : {})}
      className="relative w-full overflow-x-auto rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className,
      )}
      {...props}
    />
  )
}

// erp-ui: висота рядка й заголовка — токен --row-h (44 px звичайна, 32 px компактна).
function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "h-row border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-row px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-2 py-1 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
