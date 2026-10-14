/**
 * Вибір рядків списку для масових дій (SPEC §8.1, стан 12; ADR-0018) — чиста логіка без React.
 *
 * - `ids` — вибрані записи: вибір переживає перехід між сторінками й прокрутку, лічильник —
 *   «між сторінками».
 * - `all` — усі записи за поточним фільтром, крім знятих (`except`): для 10 000 рядків не треба
 *   знати їхні id, сервер сам візьме записи за фільтром (lib/jobs, `{ filter, exclude }`).
 */
import type { FilterValue } from "@/registry/lib/api"
import type { BulkSelection } from "@/registry/lib/jobs"

export type RowSelectionState =
  | { mode: "ids"; ids: ReadonlySet<string> }
  | { mode: "all"; except: ReadonlySet<string> }

export const EMPTY_SELECTION: RowSelectionState = {
  mode: "ids",
  ids: new Set(),
}

export function isRowSelected(state: RowSelectionState, id: string): boolean {
  return state.mode === "all" ? !state.except.has(id) : state.ids.has(id)
}

/** Скільки вибрано, якщо у списку `total` записів. */
export function selectedCount(state: RowSelectionState, total: number): number {
  return state.mode === "all"
    ? Math.max(total - state.except.size, 0)
    : state.ids.size
}

/** Вибрати чи зняти рядки (сторінку, один рядок). */
export function setRows(
  state: RowSelectionState,
  ids: readonly string[],
  selected: boolean,
): RowSelectionState {
  // У режимі «усі» вибраний рядок — той, якого немає серед знятих.
  const set = new Set(state.mode === "all" ? state.except : state.ids)
  const add = state.mode === "all" ? !selected : selected
  for (const id of ids) {
    if (add) set.add(id)
    else set.delete(id)
  }
  return state.mode === "all"
    ? { mode: "all", except: set }
    : { mode: "ids", ids: set }
}

export function toggleRow(
  state: RowSelectionState,
  id: string,
): RowSelectionState {
  return setRows(state, [id], !isRowSelected(state, id))
}

export function selectAllRows(): RowSelectionState {
  return { mode: "all", except: new Set() }
}

/** Вибір для запиту масової дії: конкретні записи або фільтр списку з винятками. */
export function toBulkSelection(
  state: RowSelectionState,
  filter: Record<string, FilterValue>,
): BulkSelection {
  if (state.mode === "ids") return { ids: [...state.ids] }
  return state.except.size ? { filter, exclude: [...state.except] } : { filter }
}
