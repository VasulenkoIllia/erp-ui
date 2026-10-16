"use client"

import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import { Button } from "@/registry/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/registry/ui/select"

/**
 * Частина erp/data-table: пагінація малого списку — «1–50 з 240», попередня й наступна сторінка;
 * сторінка за межами списку (записи видалили) — перехід на останню; вибір «Рядків на сторінці»,
 * якщо список його пропонує (`perPageOptions` і `onPerPageChange`, ADR-0024).
 */

export interface DataTablePagination {
  /** Сторінка, якій належать показані `rows` (поки летить наступна — ще попередня). */
  page: number
  perPage: number
  total: number
  /** Сторінка за межами списку (записи видалили) — таблиця сама попросить останню. */
  onPageChange: (page: number) => void
  /** Розміри сторінки на вибір; без них і без `onPerPageChange` вибору немає. */
  perPageOptions?: readonly number[]
  onPerPageChange?: (perPage: number) => void
}

export function DataTablePager({
  pagination: {
    page,
    perPage,
    total,
    onPageChange,
    perPageOptions,
    onPerPageChange,
  },
  label,
  shown,
}: {
  pagination: DataTablePagination
  label: string
  shown: number
}) {
  const t = useErpUiT()
  const format = useFormat()
  const to = Math.min((page - 1) * perPage + shown, total)
  const from = Math.min((page - 1) * perPage + 1, Math.max(to, 1))
  return (
    <nav
      aria-label={t("dataTable.pagination", { label })}
      className="flex flex-wrap items-center justify-end gap-2"
    >
      {perPageOptions?.length && onPerPageChange ? (
        <PerPageSelect
          value={perPage}
          options={perPageOptions}
          onValueChange={onPerPageChange}
        />
      ) : null}
      <span className="me-2 text-sm text-muted-foreground tabular-nums">
        {t("dataTable.range", {
          from: format.number(from),
          to: format.number(to),
          total: format.number(total),
        })}
      </span>
      <Button
        variant="outline"
        size="icon"
        aria-label={t("dataTable.previous")}
        disabled={page <= 1}
        onClick={() => {
          onPageChange(page - 1)
        }}
      >
        <ChevronLeftIcon aria-hidden />
      </Button>
      <Button
        variant="outline"
        size="icon"
        aria-label={t("dataTable.next")}
        disabled={to >= total}
        onClick={() => {
          onPageChange(page + 1)
        }}
      >
        <ChevronRightIcon aria-hidden />
      </Button>
    </nav>
  )
}

/**
 * «Рядків на сторінці»: вибір розміру; новий розмір — з першої сторінки (так рахує список). Поки
 * сторінка з новим розміром вантажиться, таблиця показує попередні рядки й `value` — їхній розмір,
 * а вибір — уже новий: до наступної зміни `value`.
 */
function PerPageSelect({
  value,
  options,
  onValueChange,
}: {
  value: number
  options: readonly number[]
  onValueChange: (perPage: number) => void
}) {
  const t = useErpUiT()
  const format = useFormat()
  const id = React.useId()
  const [choice, setChoice] = React.useState({ size: value, base: value })
  if (choice.base !== value) setChoice({ size: value, base: value })
  const items = options.map((size) => ({
    value: String(size),
    label: format.number(size),
  }))
  return (
    <div className="me-auto flex items-center gap-2">
      <label htmlFor={id} className="text-sm text-muted-foreground">
        {t("pageSize.label")}
      </label>
      <Select
        items={items}
        value={String(choice.size)}
        onValueChange={(next: string | null) => {
          const size = Number(next)
          if (!options.includes(size) || size === choice.size) return
          setChoice({ size, base: value })
          onValueChange(size)
        }}
      >
        <SelectTrigger id={id} size="sm" data-slot="page-size">
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
    </div>
  )
}

/** Сторінка за межами списку (записи видалили, інша компанія) — перейти на останню. */
export function useClampPage(
  pagination: DataTablePagination | undefined,
  waiting: boolean,
) {
  const lastPage = pagination
    ? Math.max(Math.ceil(pagination.total / pagination.perPage), 1)
    : 1
  const page = pagination?.page ?? 1
  const onPageChange = pagination?.onPageChange
  // Одна й та сама сторінка — один запит, поки показані рядки не зміняться.
  const requested = React.useRef<number | null>(null)
  React.useEffect(() => {
    if (waiting || page <= lastPage) {
      requested.current = null
      return
    }
    if (requested.current === lastPage) return
    requested.current = lastPage
    onPageChange?.(lastPage)
  }, [waiting, page, lastPage, onPageChange])
}
