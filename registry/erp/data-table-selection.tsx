"use client"

import * as React from "react"
import { XIcon } from "lucide-react"

import type { RowSelection } from "@/registry/hooks/use-row-selection"
import type { DataTableColumn } from "@/registry/lib/data-table-core"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import { selectedCount } from "@/registry/lib/row-selection"
import { Button } from "@/registry/ui/button"
import { Checkbox } from "@/registry/ui/checkbox"

/**
 * Вибір рядків erp/data-table для масових дій (SPEC §7 BulkActionBar, §8.1 стан 12; ADR-0018).
 * Ставиться разом з erp/data-table.
 *
 * - Колонка прапорців — перша й липка; у картках — прапорець перед назвою.
 * - Прапорець у шапці: на сторінці (`rows` + `pagination`) вибирає рядки сторінки, далі панель
 *   пропонує «Вибрати всі N»; у великому списку (`list`) — одразу всі за фільтром, а зняті рядки
 *   стають винятками («Вибрано 9 998 з 10 000»).
 * - Панель вибраного — у рядку стану: лічильник (постійний live-регіон), «Вибрати всі N», масові
 *   дії, «Зняти вибір». Після «Зняти вибір» фокус — на зупинку Tab таблиці (WCAG 2.4.3).
 * - У картках шапки немає: прапорець «вибрати все» з підписом стоїть у рядку стану.
 */

export interface DataTableSelectionOptions<T> {
  selection: RowSelection
  /** Назва рядка для прапорця: «Вибрати 2026-0001». */
  rowLabel: (row: T) => string
  /** Масові дії над вибраним: кнопки в рядку стану. */
  bulkActions?: (count: number) => React.ReactNode
  /** Лічильник: (25, "25", false) → «Вибрано 25 рахунків»; `all` — усі за фільтром. */
  selectionLabel?: (count: number, formatted: string, all: boolean) => string
}

/** Пропси вибору erp/data-table: `selection` лише разом із `rowLabel`. */
export type DataTableSelectionProps<T> =
  | DataTableSelectionOptions<T>
  | {
      selection?: undefined
      rowLabel?: undefined
      bulkActions?: undefined
      selectionLabel?: undefined
    }

/** Що вибирає прапорець у шапці: рядки сторінки чи всі за фільтром. */
export interface SelectionScope {
  kind: "page" | "all"
  /** Рядки поточної сторінки (для `page`). */
  pageIds: readonly string[]
  /** Усього записів за фільтром. */
  total: number
}

const SELECT_COLUMN_ID = "select"
/** Ширина колонки прапорців — ціль дотику 44 px (SPEC §6.5). */
const SELECT_COLUMN_REM = 2.75
/** Область натискання прапорця 44 × 44 px навколо видимих 16 px. */
const TARGET = "after:-inset-3.5"

/** Зупинка Tab таблиці (активна клітинка гріда чи картка) — куди повернути фокус. */
export function tableTabStop(table: Element | null | undefined) {
  const body = '[data-slot="data-table-body"]'
  // У картках прапорці всередині теж мають tabindex="0": спершу — активна картка.
  return (
    table?.querySelector<HTMLElement>(`${body} [data-card][tabindex="0"]`) ??
    table?.querySelector<HTMLElement>(`${body} [tabindex="0"]`) ??
    null
  )
}

interface SelectionContextValue {
  options: DataTableSelectionOptions<never>
  getRowId: (row: never) => string
  scope: SelectionScope
}

const SelectionContext = React.createContext<SelectionContextValue | null>(null)

/**
 * Вибір і обсяг для прапорців колонки й панелі. Через контекст, а не в самій колонці: колонка
 * лишається тією самою між рендерами, тож таблиця не перебудовує колонки на кожен клік (і на нову
 * `rowLabel`). Без `options` — таблиця без вибору.
 */
export function SelectionProvider<T>({
  options,
  getRowId,
  scope,
  children,
}: {
  options: DataTableSelectionOptions<T> | undefined
  getRowId: (row: T) => string
  scope: SelectionScope
  children: React.ReactNode
}) {
  if (!options) return children
  return (
    <SelectionContext value={{ options, getRowId, scope }}>
      {children}
    </SelectionContext>
  )
}

function useSelectionContext<T>() {
  const value = React.useContext(SelectionContext)
  if (!value) throw new Error("SelectionProvider is missing")
  return value as unknown as {
    options: DataTableSelectionOptions<T>
    getRowId: (row: T) => string
    scope: SelectionScope
  }
}

function headerState(selection: RowSelection, scope: SelectionScope) {
  const { state } = selection
  if (scope.kind === "all") {
    const checked = state.mode === "all" && state.except.size === 0
    const some = selectedCount(state, scope.total) > 0
    return { checked, indeterminate: !checked && some }
  }
  const onPage = scope.pageIds.filter(selection.isSelected).length
  const checked = scope.pageIds.length > 0 && onPage === scope.pageIds.length
  return { checked, indeterminate: !checked && onPage > 0 }
}

function HeaderCheckbox() {
  const t = useErpUiT()
  const { options, scope } = useSelectionContext()
  const { selection } = options
  const { checked, indeterminate } = headerState(selection, scope)
  return (
    <Checkbox
      className={TARGET}
      checked={checked}
      indeterminate={indeterminate}
      aria-label={t(
        scope.kind === "page" ? "selection.selectPage" : "selection.selectAll",
      )}
      onCheckedChange={() => {
        if (scope.kind === "page") selection.setRows(scope.pageIds, !checked)
        else if (checked || indeterminate) selection.clear()
        else selection.selectAll()
      }}
    />
  )
}

function RowCheckbox<T>({ row }: { row: T }) {
  const t = useErpUiT()
  const { options, getRowId } = useSelectionContext<T>()
  const id = getRowId(row)
  return (
    <Checkbox
      className={TARGET}
      checked={options.selection.isSelected(id)}
      aria-label={t("selection.row", { label: options.rowLabel(row) })}
      onCheckedChange={() => {
        options.selection.toggle(id)
      }}
    />
  )
}

/** Колонка прапорців для гріда й карток (під SelectionProvider); null — таблиця без вибору. */
function useSelectionColumn<T>(enabled: boolean): DataTableColumn<T> | null {
  const t = useErpUiT()
  return React.useMemo(
    () =>
      enabled
        ? {
            id: SELECT_COLUMN_ID,
            header: t("selection.column"),
            renderHeader: () => <HeaderCheckbox />,
            cell: (row: T) => <RowCheckbox row={row} />,
            minWidth: SELECT_COLUMN_REM,
            grow: 0,
            priority: 0,
            overflow: "keep",
            sticky: true,
            card: "select",
          }
        : null,
    [enabled, t],
  )
}

/**
 * Вибір для erp/data-table: опції (undefined — без вибору), колонки з прапорцями першими й
 * перевірка рядка для підсвітки.
 */
export function useTableSelection<T>(
  {
    selection,
    rowLabel,
    bulkActions,
    selectionLabel,
  }: Partial<DataTableSelectionOptions<T>>,
  columns: readonly DataTableColumn<T>[],
  getRowId: (row: T) => string,
) {
  const options =
    selection && rowLabel
      ? { selection, rowLabel, bulkActions, selectionLabel }
      : undefined
  const selectColumn = useSelectionColumn<T>(options !== undefined)
  const shown = React.useMemo(
    () => (selectColumn ? [selectColumn, ...columns] : columns),
    [selectColumn, columns],
  )
  const isSelected = selection
    ? (row: T) => selection.isSelected(getRowId(row))
    : undefined
  return { options, shown, isSelected }
}

/** Панель вибраного в рядку стану таблиці (під SelectionProvider; без нього — нічого). */
export function SelectionBar({
  cards,
  onCleared,
}: {
  /** Картки: шапки немає, «вибрати все» — тут. */
  cards: boolean
  /** Після «Зняти вибір»: фокус на таблицю, бо кнопка зникає. */
  onCleared: () => void
}) {
  const context = React.useContext(SelectionContext)
  return context ? (
    <SelectionBarContent {...context} cards={cards} onCleared={onCleared} />
  ) : null
}

function SelectionBarContent({
  options,
  scope,
  cards,
  onCleared,
}: Omit<SelectionContextValue, "getRowId"> & {
  cards: boolean
  onCleared: () => void
}) {
  const t = useErpUiT()
  const format = useFormat()
  const actions = React.useRef<HTMLSpanElement>(null)
  // «Вибрати всі N» зникає після кліку — фокус на першу дію панелі (WCAG 2.4.3).
  const focusFirstAction = React.useRef(false)
  React.useLayoutEffect(() => {
    if (!focusFirstAction.current) return
    focusFirstAction.current = false
    actions.current?.querySelector<HTMLElement>("button")?.focus()
  })
  const { selection, bulkActions, selectionLabel } = options
  const count = selectedCount(selection.state, scope.total)
  const all = selection.state.mode === "all"
  const formatted = format.number(count)
  let label = ""
  if (count)
    label =
      selectionLabel?.(count, formatted, all) ??
      t(all ? "selection.selectedAll" : "selection.selected", {
        value: formatted,
      })
  // Уся сторінка вибрана, а записів більше — пропозиція вибрати всі за фільтром (як у Gmail).
  const offersAll =
    scope.kind === "page" &&
    !all &&
    scope.pageIds.length > 0 &&
    scope.pageIds.every(selection.isSelected) &&
    scope.total > count
  return (
    <>
      {cards ? (
        <label className="flex items-center gap-2 text-foreground">
          <HeaderCheckbox />
          {/* Ім'я прапорця — його aria-label; підпис лише для очей. */}
          <span aria-hidden>
            {t(
              scope.kind === "page"
                ? "selection.selectPage"
                : "selection.selectAll",
            )}
          </span>
        </label>
      ) : null}
      {/* Постійний live-регіон: новий елемент із role="status" скрінрідер може не озвучити. */}
      <span
        role="status"
        data-slot="data-table-selection"
        className={
          count ? "font-medium text-foreground tabular-nums" : "sr-only"
        }
      >
        {label}
      </span>
      {count ? (
        <span ref={actions} className="flex flex-wrap items-center gap-2">
          {offersAll ? (
            <Button
              variant="link"
              size="sm"
              onClick={() => {
                focusFirstAction.current = true
                selection.selectAll()
              }}
            >
              {t("selection.selectAllMatching", {
                value: format.number(scope.total),
              })}
            </Button>
          ) : null}
          {bulkActions?.(count)}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onCleared()
              selection.clear()
            }}
          >
            <XIcon aria-hidden />
            {t("selection.clear")}
          </Button>
        </span>
      ) : null}
    </>
  )
}
