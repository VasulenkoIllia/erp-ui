import { hashKey } from "@tanstack/react-query"
import { useCallback, useMemo, useState } from "react"

import {
  EMPTY_SELECTION,
  isRowSelected,
  selectAllRows,
  setRows,
  toggleRow,
  type RowSelectionState,
} from "@/registry/lib/row-selection"

/**
 * Вибір рядків списку для `DataTable` і масових дій (SPEC §8.1, стан 12; ADR-0018).
 *
 *   const selection = useRowSelection([list.queryFilter, companyId])
 *   <DataTable selection={selection} bulkActions={…} … />
 *
 * `scope` — те, від чого залежить набір записів: фільтр і компанія. Інший набір — вибір скидається
 * (інакше «усі» стали б іншими записами); сортування, сторінка й вигляд — ні.
 */
export interface RowSelection {
  state: RowSelectionState
  isSelected: (id: string) => boolean
  toggle: (id: string) => void
  setRows: (ids: readonly string[], selected: boolean) => void
  /** Усі записи за фільтром (режим `all`). */
  selectAll: () => void
  clear: () => void
}

export function useRowSelection(scope: readonly unknown[]): RowSelection {
  const scopeKey = hashKey(scope)
  const [selection, setSelection] = useState({
    scopeKey,
    state: EMPTY_SELECTION,
  })
  // Інший набір — скинути й збережений вибір: інакше повернення до фільтра A→B→A його оживило б.
  if (selection.scopeKey !== scopeKey)
    setSelection({ scopeKey, state: EMPTY_SELECTION })
  const state =
    selection.scopeKey === scopeKey ? selection.state : EMPTY_SELECTION
  const update = useCallback(
    (change: (current: RowSelectionState) => RowSelectionState) => {
      setSelection((current) => ({
        scopeKey,
        state: change(
          current.scopeKey === scopeKey ? current.state : EMPTY_SELECTION,
        ),
      }))
    },
    [scopeKey],
  )
  return useMemo(
    () => ({
      state,
      isSelected: (id) => isRowSelected(state, id),
      toggle: (id) => {
        update((current) => toggleRow(current, id))
      },
      setRows: (ids, selected) => {
        update((current) => setRows(current, ids, selected))
      },
      selectAll: () => {
        update(selectAllRows)
      },
      clear: () => {
        update(() => EMPTY_SELECTION)
      },
    }),
    [state, update],
  )
}
