import * as React from "react"

import {
  ActionsColumn,
  REPEATING_ROWS_LAYOUTS,
  RepeatingRowActions,
  RepeatingRowMenu,
  type RepeatingRowsTableFrom,
} from "@/registry/erp/repeating-row-actions"
import { useWindowRows } from "@/registry/hooks/use-window-rows"
import { cn } from "@/registry/lib/utils"

/**
 * Список рядків `erp/repeating-rows` (UI05b, ADR-0060): підписи колонок над таблицею й рядки — усі або
 * лише видимі у вікні сторінки, коли їх не менше за `virtualizeFrom`. Віртуальний рядок каже
 * скрінрідеру своє місце й кількість рядків (`aria-posinset`, `aria-setsize`): решти рядків у DOM немає.
 * Рядок — `RepeatingRowItem` зі стабільними діями `useRowHandlers`.
 */

export interface RepeatingRowsListProps {
  fields: readonly { readonly rowId: string }[]
  /** Рядок із полями й діями (`RepeatingRowItem`). */
  renderItem: (index: number) => React.ReactNode
  columnHeader?: React.ReactNode
  rowClassName?: string
  tableFrom: RepeatingRowsTableFrom
  readOnly: boolean
  virtualizeFrom?: number
  /** Помилки групи з `formState`: перший рядок із помилкою лишається в DOM для зведення помилок. */
  rowErrors: unknown
  /** Рядок у фокусі й рядок, куди зараз піде фокус. */
  keepLive: () => readonly number[]
}

/** Висота рядка до першого виміру, px: далі — середня з виміряних. */
const ESTIMATED_ROW_PX = 64

export function RepeatingRowsList({
  fields,
  renderItem,
  columnHeader,
  rowClassName,
  tableFrom,
  readOnly,
  virtualizeFrom,
  rowErrors,
  keepLive,
}: RepeatingRowsListProps) {
  const listRef = React.useRef<HTMLOListElement>(null)
  const layout = REPEATING_ROWS_LAYOUTS[tableFrom]
  const count = fields.length
  const firstError = Array.isArray(rowErrors)
    ? rowErrors.findIndex(Boolean)
    : -1
  const keep = React.useMemo(
    () => (firstError >= 0 ? [firstError] : []),
    [firstError],
  )
  const getItemKey = React.useCallback(
    (index: number) => fields[index]?.rowId ?? index,
    [fields],
  )
  const rows = useWindowRows({
    count,
    enabled: virtualizeFrom !== undefined && count >= virtualizeFrom,
    listRef,
    getItemKey,
    keep,
    keepLive,
    estimateSize: ESTIMATED_ROW_PX,
  })
  return (
    <>
      {columnHeader ? (
        // Підписи видно над колонками, а скрінрідер чує підпис кожного поля в рядку.
        <div aria-hidden className={cn("hidden gap-2", layout.header)}>
          <div className={cn("grid min-w-0 flex-1 gap-3", rowClassName)}>
            {columnHeader}
          </div>
          {readOnly ? null : <span className="size-control shrink-0" />}
        </div>
      ) : null}
      <ol
        ref={listRef}
        className={rows.items ? "relative" : cn("grid gap-3", layout.list)}
        style={rows.items ? { height: rows.totalSize } : undefined}
      >
        {rows.items
          ? rows.items.map(({ index, start }) => (
              <li
                key={fields[index]?.rowId ?? index}
                ref={rows.measureElement}
                data-index={index}
                data-row-index={index}
                aria-posinset={index + 1}
                aria-setsize={count}
                className={cn(
                  "absolute inset-x-0 top-0 min-w-0",
                  layout.virtualGap,
                )}
                style={{
                  transform: `translateY(${String(rows.offsetOf(start))}px)`,
                }}
              >
                {renderItem(index)}
              </li>
            ))
          : fields.map((field, index) => (
              <li key={field.rowId} data-row-index={index} className="min-w-0">
                {renderItem(index)}
              </li>
            ))}
      </ol>
    </>
  )
}

/** Що рядок робить зі своїми діями: функції стабільні, рядки від них не перемальовуються. */
export interface RepeatingRowHandlers {
  readonly move: (from: number, to: number) => void
  readonly remove: (index: number) => void
  readonly insert: (index: number, kind: number) => void
}

export interface RepeatingRowItemProps {
  readonly index: number
  readonly rowLabel: string
  readonly readOnly: boolean
  readonly renderRow: (row: {
    readonly index: number
    readonly rowLabel: string
    readonly readOnly: boolean
  }) => React.ReactNode
  readonly fieldsClassName: string
  readonly tableFrom: RepeatingRowsTableFrom
  readonly rowActions: "buttons" | "menu"
  /** Кнопки ще беруть кількість рядків; меню — лише `isLast`, тож новий рядок його не перемальовує. */
  readonly count: number
  readonly isLast: boolean
  /** Відступ під підписами першого рядка таблиці, щоб дії стояли на рівні полів. */
  readonly labelSpacer: boolean
  readonly canReorder: boolean
  readonly canRemove: boolean
  readonly canInsert: boolean
  readonly insertLabels: readonly string[]
  readonly handlers: RepeatingRowHandlers
}

/**
 * Рядок `erp/repeating-rows` з полями й діями (UI05b, ADR-0060): перемальовується, лише коли змінились
 * його пропси. Поля дає `renderRow` рядків.
 */
export const RepeatingRowItem = React.memo(function RepeatingRowItem({
  index,
  rowLabel,
  readOnly,
  renderRow,
  fieldsClassName,
  tableFrom,
  rowActions,
  count,
  isLast,
  labelSpacer,
  canReorder,
  canRemove,
  canInsert,
  insertLabels,
  handlers,
}: RepeatingRowItemProps) {
  return (
    <div
      role="group"
      aria-label={rowLabel}
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3",
        REPEATING_ROWS_LAYOUTS[tableFrom].row,
      )}
    >
      <div data-row-fields className={fieldsClassName}>
        {renderRow({ index, rowLabel, readOnly })}
      </div>
      {readOnly ? null : rowActions === "menu" ? (
        <ActionsColumn
          tableFrom={tableFrom}
          labelSpacer={labelSpacer}
          className="items-end"
        >
          <RepeatingRowMenu
            index={index}
            rowLabel={rowLabel}
            canReorder={canReorder}
            canRemove={canRemove}
            canInsert={canInsert}
            isFirst={index === 0}
            isLast={isLast}
            insertLabels={insertLabels}
            onMove={handlers.move}
            onRemove={handlers.remove}
            onInsert={handlers.insert}
          />
        </ActionsColumn>
      ) : (
        <RepeatingRowActions
          index={index}
          count={count}
          rowLabel={rowLabel}
          canReorder={canReorder}
          canRemove={canRemove}
          isFirst={labelSpacer}
          tableFrom={tableFrom}
          onMove={handlers.move}
          onRemove={handlers.remove}
        />
      )}
    </div>
  )
})

/** Стабільні дії рядків: функції не змінюються між рендерами й викликають найсвіжіші обробники. */
export function useRowHandlers(
  current: RepeatingRowHandlers,
): RepeatingRowHandlers {
  const latest = React.useRef(current)
  React.useLayoutEffect(() => {
    latest.current = current
  })
  return React.useMemo(
    () => ({
      move: (from, to) => {
        latest.current.move(from, to)
      },
      remove: (index) => {
        latest.current.remove(index)
      },
      insert: (index, kind) => {
        latest.current.insert(index, kind)
      },
    }),
    [],
  )
}
