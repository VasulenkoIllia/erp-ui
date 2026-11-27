import * as React from "react"
import type { RaRecord } from "@/registry/lib/ra-core"

import type { KanbanDrag } from "@/registry/erp/kanban"
import { KanbanCard, type KanbanCardMove } from "@/registry/erp/kanban-card"
import {
  useRecordDenialReason,
  type RecordDenialText,
} from "@/registry/hooks/use-record-access"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import { ukBoard } from "@/registry/lib/i18n-uk-board"
import type { RowSelection } from "@/registry/lib/row-selection"
import type { BoardActions } from "@/registry/templates/board-actions"
import type { BoardColumnData } from "@/registry/templates/board-data"

/**
 * Частина templates/board (ADR-0103): картка дошки — меню «Перемістити в…», вибір, перетягування й ключ стану,
 * за яким erp/kanban перемальовує лише змінені картки.
 */

export interface BoardCardOptions<T extends RaRecord> {
  field: string
  /** Усі колонки модуля: пункти «Перемістити в…». */
  allColumns: readonly { id: string; label: string }[]
  /** Колонки з сервера, без перенесених ще не збережених: вибрані картки для групи. */
  data: readonly BoardColumnData<T>[]
  selection: RowSelection
  cardLabel: (record: T) => string
  renderCard: (record: T) => React.ReactNode
  lockedBy?: ((record: T) => string | undefined) | undefined
  actions: BoardActions<T>
  reasonOf: (record: T) => string | undefined
  isSelectable: boolean
  /** Права ще не відомі: ні меню, ні перетягування. */
  isAccessPending: boolean
}

export const recordId = (record: RaRecord) => String(record.id)

export function useBoardCard<T extends RaRecord>(
  props: BoardCardOptions<T>,
): {
  drag: KanbanDrag<T>
  cardKey: (record: T) => string
  renderCard: (record: T) => React.ReactNode
} {
  const { field, selection, actions, reasonOf, isSelectable } = props
  const { locale, timeZone } = useFormat()
  // Картка малюється знову лише за своїм ключем, тож її обробники беруть свіжі вибір і дії, а не з її рендера:
  // інакше після зміни вкладки клік по прапорцю пішов би в старий вибір.
  const latest = React.useRef({ selection, actions })
  React.useLayoutEffect(() => {
    latest.current = { selection, actions }
  })

  const moveOf = (record: T): KanbanCardMove | undefined => {
    if (props.isAccessPending) return undefined
    const reason = reasonOf(record)
    return {
      columns: props.allColumns,
      current: String(record[field]),
      onMove: (column) => {
        void latest.current.actions.moveCard(record, column)
      },
      ...(reason ? { disabledReason: reason } : {}),
    }
  }

  // Вибрану картку тягнуть разом з усіма вибраними; невибрану — саму.
  const drag: KanbanDrag<T> = {
    canDrag: (record) =>
      !props.isAccessPending &&
      !actions.movingIds.has(recordId(record)) &&
      reasonOf(record) === undefined,
    onDrop: (record, column) => {
      const isGroup =
        isSelectable &&
        selection.state.mode === "ids" &&
        selection.isSelected(recordId(record))
      void actions.moveCards(
        isGroup ? selectedCards(props.data, selection) : [record],
        column,
        { reasonOf, moveFocus: false },
      )
    },
  }

  // Усе, від чого залежить картка, крім запису: колонка на 500 карток не перемальовується вся.
  const cardKey = (record: T) => {
    const id = recordId(record)
    return JSON.stringify([
      actions.movingIds.has(id),
      isSelectable,
      isSelectable && selection.isSelected(id),
      props.isAccessPending,
      reasonOf(record) ?? "",
      props.lockedBy?.(record) ?? "",
      locale,
      timeZone,
    ])
  }

  const renderCard = (record: T) => {
    const id = recordId(record)
    return (
      <KanbanCard
        label={props.cardLabel(record)}
        move={moveOf(record)}
        lockedBy={props.lockedBy?.(record)}
        busy={actions.movingIds.has(id)}
        {...(isSelectable
          ? {
              selected: selection.isSelected(id),
              onSelectedChange: () => {
                latest.current.selection.toggle(id)
              },
            }
          : {})}
      >
        {props.renderCard(record)}
      </KanbanCard>
    )
  }

  return { drag, cardKey, renderCard }
}

/** Чому картку не можна перенести: редагує інший, запис забороняє, немає права; `undefined` — можна. */
export function useMoveReason<T extends RaRecord>(
  props: {
    lockedBy?: (record: T) => string | undefined
    denialText?: RecordDenialText
    moveDenied?: string
  },
  canUpdate: boolean,
) {
  const t = useErpUiT(ukBoard)
  const recordReason = useRecordDenialReason(props.denialText)
  return (record: T) => {
    const holder = props.lockedBy?.(record)
    if (holder) return t("board.card.lockedReason", { name: holder })
    return (
      recordReason(record, "update") ??
      (canUpdate ? undefined : (props.moveDenied ?? t("board.card.noRight")))
    )
  }
}

/** Вибрані картки серед завантажених (вибір «за id»; «усі за фільтром» дошка не переносить). */
export function selectedCards<T extends RaRecord>(
  data: readonly { cards: readonly T[] | undefined }[],
  selection: RowSelection,
): T[] {
  if (selection.state.mode !== "ids") return []
  return data
    .flatMap((column) => column.cards ?? [])
    .filter((card) => selection.isSelected(String(card.id)))
}
