import * as React from "react"

import { REPEATING_ROWS_LAYOUTS } from "@/registry/erp/repeating-row-actions"
import {
  plainRowItems,
  plainRowsClassName,
  type VirtualRowsProps,
} from "@/registry/erp/repeating-rows-list"
import { useWindowRows } from "@/registry/hooks/use-window-rows"
import { cn } from "@/registry/lib/utils"

/**
 * Віртуальні рядки `erp/repeating-rows` (UI05b, ADR-0060): від `from` рядків у DOM лише рядки на екрані
 * й поруч, прокручується сама сторінка (`hooks/use-window-rows`). Підключається опцією
 * `RepeatingRows.virtualRows={{ from, List: VirtualRowsList }}`, тож TanStack Virtual завантажують лише
 * форми з сотнями рядків. Рядок каже скрінрідеру своє місце й кількість рядків (`aria-posinset`,
 * `aria-setsize`): решти рядків у DOM немає. До порога й у вкладеній прокрутці (діалог, шторка) — усі
 * рядки. Список в обох режимах — той самий `<ol>` з рядками за `rowId`: на порозі рядки на екрані не
 * перемонтовуються й не губять свого стану.
 */

/** Висота рядка до першого виміру, px: далі — середня з виміряних. */
const ESTIMATED_ROW_PX = 64

export function VirtualRowsList({
  fields,
  renderItem,
  tableFrom,
  from,
  keep,
  keepLive,
}: VirtualRowsProps) {
  const listRef = React.useRef<HTMLOListElement>(null)
  const count = fields.length
  const getItemKey = React.useCallback(
    (index: number) => fields[index]?.rowId ?? index,
    [fields],
  )
  const rows = useWindowRows({
    count,
    enabled: count >= from,
    listRef,
    getItemKey,
    keep,
    keepLive,
    estimateSize: ESTIMATED_ROW_PX,
  })
  if (!rows.items)
    return (
      <ol ref={listRef} className={plainRowsClassName(tableFrom)}>
        {plainRowItems(fields, renderItem)}
      </ol>
    )
  return (
    <ol ref={listRef} className="relative" style={{ height: rows.totalSize }}>
      {rows.items.map(({ index, start }) => (
        <li
          key={fields[index]?.rowId ?? index}
          ref={rows.measureElement}
          data-index={index}
          data-row-index={index}
          aria-posinset={index + 1}
          aria-setsize={count}
          className={cn(
            "absolute inset-x-0 top-0 min-w-0",
            REPEATING_ROWS_LAYOUTS[tableFrom].virtualGap,
          )}
          style={{
            transform: `translateY(${String(rows.offsetOf(start))}px)`,
          }}
        >
          {renderItem(index)}
        </li>
      ))}
    </ol>
  )
}
