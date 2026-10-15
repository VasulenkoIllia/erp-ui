"use client"

import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import { Button } from "@/registry/ui/button"

/**
 * Частина erp/data-table: пагінація малого списку — «1–50 з 240», попередня й наступна сторінка;
 * сторінка за межами списку (записи видалили) — перехід на останню.
 */

export interface DataTablePagination {
  /** Сторінка, якій належать показані `rows` (поки летить наступна — ще попередня). */
  page: number
  perPage: number
  total: number
  /** Сторінка за межами списку (записи видалили) — таблиця сама попросить останню. */
  onPageChange: (page: number) => void
}

export function DataTablePager({
  pagination: { page, perPage, total, onPageChange },
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
      className="flex items-center justify-end gap-2"
    >
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
