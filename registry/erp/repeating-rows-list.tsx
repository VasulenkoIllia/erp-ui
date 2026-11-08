import * as React from "react"

import {
  ActionsColumn,
  REPEATING_ROWS_LAYOUTS,
  RepeatingRowActions,
  RepeatingRowMenu,
  type RepeatingRowsTableFrom,
  type RowGroupMoves,
} from "@/registry/erp/repeating-row-actions"
import type { RowGroupDirection } from "@/registry/erp/repeating-rows-groups"
import { cn } from "@/registry/lib/utils"

/**
 * Список рядків `erp/repeating-rows` (UI05b, ADR-0060): підписи колонок над таблицею й рядки — усі або
 * віртуальний список `virtualRows.List` (`erp/repeating-rows-virtual`), який сам малює всі рядки до
 * `virtualRows.from`. Віртуальний список підключає той, кому потрібні сотні рядків: решта форм не
 * завантажує TanStack Virtual. Рядок — `RepeatingRowItem` зі стабільними діями `useRowHandlers`.
 */

/** Пропси віртуального списку: `VirtualRowsList` з `erp/repeating-rows-virtual`. */
export interface VirtualRowsProps {
  fields: readonly { readonly rowId: string }[]
  renderItem: (index: number) => React.ReactNode
  tableFrom: RepeatingRowsTableFrom
  /** З якої кількості рядків малювати лише видимі; до неї — усі. */
  from: number
  /** Рядки поза екраном, які лишаються в DOM: перший рядок із помилкою для зведення помилок. */
  keep: readonly number[]
  /** Рядок у фокусі й рядок, куди зараз піде фокус. */
  keepLive: () => readonly number[]
}

/** Віртуальні рядки: з якої кількості рядків і яким списком. */
export interface RepeatingRowsVirtual {
  readonly from: number
  /**
   * Компонент, оголошений поза рендером: інший тип на місці списку перемонтував би всі рядки з їхнім
   * станом. Тому й поріг перетинає сам список, а не `RepeatingRowsList`.
   */
  readonly List: React.ComponentType<VirtualRowsProps>
}

export interface RepeatingRowsListProps {
  fields: readonly { readonly rowId: string }[]
  /** Рядок із полями й діями (`RepeatingRowItem`). */
  renderItem: (index: number) => React.ReactNode
  columnHeader?: React.ReactNode
  rowClassName?: string
  tableFrom: RepeatingRowsTableFrom
  readOnly: boolean
  virtualRows?: RepeatingRowsVirtual
  /** Помилки групи з `formState`: перший рядок із помилкою лишається в DOM для зведення помилок. */
  rowErrors: unknown
  /** Рядок, на який зараз піде фокус з пошуку (`RepeatingRowsHandle.focusRow`): з'являється поза екраном. */
  revealed?: number | null
  keepLive: () => readonly number[]
}

export function RepeatingRowsList({
  fields,
  renderItem,
  columnHeader,
  rowClassName,
  tableFrom,
  readOnly,
  virtualRows,
  rowErrors,
  revealed = null,
  keepLive,
}: RepeatingRowsListProps) {
  const layout = REPEATING_ROWS_LAYOUTS[tableFrom]
  const firstError = Array.isArray(rowErrors)
    ? rowErrors.findIndex(Boolean)
    : -1
  // Зміна набору перераховує видимий діапазон (`useWindowRows`): рядок з'являється в тому самому рендері.
  const keep = React.useMemo(
    () => [firstError, revealed ?? -1].filter((index) => index >= 0),
    [firstError, revealed],
  )
  return (
    <>
      {columnHeader ? (
        // Підписи видно над колонками, а скрінрідер чує підпис кожного поля в рядку. Липнуть під
        // топбаром оболонки (`--app-topbar-height`, tokens/base.css): над рядком 400 видно, що в колонці.
        <div
          aria-hidden
          data-slot="repeating-rows-header"
          className={cn(
            "sticky top-[var(--app-topbar-height,0px)] z-10 hidden gap-2 border-b bg-background py-2",
            layout.header,
          )}
        >
          <div className={cn("grid min-w-0 flex-1 gap-3", rowClassName)}>
            {columnHeader}
          </div>
          {/* Місце колонки дій: лише ширина, щоб липкий рядок підписів не був заввишки з кнопку. */}
          {readOnly ? null : <span className="w-[var(--control-h)] shrink-0" />}
        </div>
      ) : null}
      {virtualRows ? (
        <virtualRows.List
          fields={fields}
          renderItem={renderItem}
          tableFrom={tableFrom}
          from={virtualRows.from}
          keep={keep}
          keepLive={keepLive}
        />
      ) : (
        <ol className={plainRowsClassName(tableFrom)}>
          {plainRowItems(fields, renderItem)}
        </ol>
      )}
    </>
  )
}

/** Клас списку, у якому в DOM усі рядки. */
export const plainRowsClassName = (tableFrom: RepeatingRowsTableFrom) =>
  cn("grid gap-3", REPEATING_ROWS_LAYOUTS[tableFrom].list)

/** Усі рядки в DOM: звичайний список і віртуальний до порога чи у вкладеній прокрутці. */
export const plainRowItems = (
  fields: VirtualRowsProps["fields"],
  renderItem: VirtualRowsProps["renderItem"],
) =>
  fields.map((field, index) => (
    <li key={field.rowId} data-row-index={index} className="min-w-0">
      {renderItem(index)}
    </li>
  ))

/** Що рядок робить зі своїми діями: функції стабільні, рядки від них не перемальовуються. */
export interface RepeatingRowHandlers {
  readonly move: (from: number, to: number) => void
  readonly remove: (index: number) => void
  readonly insert: (index: number, kind: number) => void
  /** Перенести групу з головою `index` цілком (`RepeatingRows.groups`). */
  readonly moveGroup: (index: number, direction: RowGroupDirection) => void
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
  /** Пункти перенесення групи; лише в голови групи, решта рядків їх не має. */
  readonly groupLabels?: RowGroupMoves["labels"]
  readonly canMoveGroupUp?: boolean
  readonly canMoveGroupDown?: boolean
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
  groupLabels,
  canMoveGroupUp,
  canMoveGroupDown,
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
            groupMoves={
              groupLabels && canMoveGroupUp !== undefined
                ? {
                    labels: groupLabels,
                    canUp: canMoveGroupUp,
                    canDown: canMoveGroupDown ?? false,
                  }
                : undefined
            }
            onMoveGroup={handlers.moveGroup}
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
      moveGroup: (index, direction) => {
        latest.current.moveGroup(index, direction)
      },
    }),
    [],
  )
}
