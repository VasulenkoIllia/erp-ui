import * as React from "react"
import { ArrowDownIcon, ArrowUpIcon, EllipsisVerticalIcon } from "lucide-react"

import { keepFieldFocus } from "@/registry/erp/form"
import { useErpUiT } from "@/registry/lib/i18n"
import { ACTION_ICONS } from "@/registry/lib/icons"
import { cn } from "@/registry/lib/utils"
import { Button } from "@/registry/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/registry/ui/dropdown-menu"

/** З якої ширини контейнера рядки `erp/repeating-rows` стають таблицею. */
export type RepeatingRowsTableFrom = "lg" | "4xl"

/** Класи таблиці на широкому контейнері: Tailwind бачить лише цілі назви класів. */
export const REPEATING_ROWS_LAYOUTS = {
  lg: {
    list: "@lg:gap-2",
    row: "@lg:flex-row @lg:items-start @lg:border-0 @lg:p-0",
    laterLabels: "@lg:**:data-[slot=field-label]:sr-only",
    actions: "@lg:self-stretch",
    spacer: "@lg:block",
    /** Віртуальний рядок стоїть абсолютно: проміжок між рядками — його нижній відступ. */
    virtualGap: "pb-3 @lg:pb-2",
    header: "@lg:flex",
  },
  "4xl": {
    list: "@4xl:gap-2",
    row: "@4xl:flex-row @4xl:items-start @4xl:border-0 @4xl:p-0",
    laterLabels: "@4xl:**:data-[slot=field-label]:sr-only",
    actions: "@4xl:self-stretch",
    spacer: "@4xl:block",
    virtualGap: "pb-3 @4xl:pb-2",
    header: "@4xl:flex",
  },
} as const satisfies Record<RepeatingRowsTableFrom, Record<string, string>>

/** Колонка дій рядка; `labelSpacer` ставить дії першого рядка таблиці на рівень полів, а не підписів. */
export function ActionsColumn({
  tableFrom,
  labelSpacer,
  className,
  children,
}: {
  tableFrom: RepeatingRowsTableFrom
  labelSpacer: boolean
  className?: string
  children: React.ReactNode
}) {
  const layout = REPEATING_ROWS_LAYOUTS[tableFrom]
  return (
    <div
      className={cn("flex shrink-0 flex-col gap-2", layout.actions, className)}
    >
      {labelSpacer ? (
        <span
          aria-hidden
          className={cn("invisible hidden text-sm leading-snug", layout.spacer)}
        >
          &nbsp;
        </span>
      ) : null}
      {children}
    </div>
  )
}

/** Кнопки рядка `erp/repeating-rows`: порядок і вилучення (UI42, ADR-0047). */
export interface RepeatingRowActionsProps {
  index: number
  count: number
  rowLabel: string
  canReorder: boolean
  canRemove: boolean
  isFirst: boolean
  tableFrom?: RepeatingRowsTableFrom
  onMove: (from: number, to: number) => void
  onRemove: (index: number) => void
}

export function RepeatingRowActions({
  index,
  count,
  rowLabel,
  canReorder,
  canRemove,
  isFirst,
  tableFrom = "lg",
  onMove,
  onRemove,
}: RepeatingRowActionsProps) {
  const t = useErpUiT()
  const Remove = ACTION_ICONS.delete
  return (
    <ActionsColumn tableFrom={tableFrom} labelSpacer={isFirst}>
      <div className="flex justify-end gap-1">
        {canReorder ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              data-row-action="up"
              aria-label={t("repeatingRows.moveUp", { row: rowLabel })}
              disabled={index === 0}
              focusableWhenDisabled
              onMouseDown={keepFieldFocus}
              onClick={() => {
                onMove(index, index - 1)
              }}
            >
              <ArrowUpIcon aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              data-row-action="down"
              aria-label={t("repeatingRows.moveDown", { row: rowLabel })}
              disabled={index === count - 1}
              focusableWhenDisabled
              onMouseDown={keepFieldFocus}
              onClick={() => {
                onMove(index, index + 1)
              }}
            >
              <ArrowDownIcon aria-hidden />
            </Button>
          </>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-row-action="remove"
          aria-label={t("repeatingRows.remove", { row: rowLabel })}
          disabled={!canRemove}
          focusableWhenDisabled
          onMouseDown={keepFieldFocus}
          onKeyDown={(event) => {
            // Фокус іде на таку саму кнопку сусіднього рядка: утримана клавіша вилучила б їх усі.
            if (event.repeat) event.preventDefault()
          }}
          onClick={() => {
            onRemove(index)
          }}
        >
          <Remove aria-hidden />
        </Button>
      </div>
    </ActionsColumn>
  )
}

export interface RepeatingRowMenuProps {
  index: number
  rowLabel: string
  canReorder: boolean
  canRemove: boolean
  /** Ще можна додати рядок: межа `maxRows` не досягнута. */
  canInsert: boolean
  isFirst: boolean
  isLast: boolean
  /** Пункти «Вставити… нижче» за видами рядків: перший — основний вид. */
  insertLabels: readonly string[]
  onMove: (from: number, to: number) => void
  onRemove: (index: number) => void
  onInsert: (index: number, kind: number) => void
}

/**
 * Дії рядка одним меню (UI05b, ADR-0060): порядок, вставка нижче й вилучення там, де рядок не має
 * місця на три кнопки (рядки документа). Дія виконується, коли меню вже закрилось: фокус веде
 * `erp/repeating-rows` (на нове поле чи на меню переміщеного рядка), меню його не повертає собі.
 */
export function RepeatingRowMenu({
  index,
  rowLabel,
  canReorder,
  canRemove,
  canInsert,
  isFirst,
  isLast,
  insertLabels,
  onMove,
  onRemove,
  onInsert,
}: RepeatingRowMenuProps) {
  const t = useErpUiT()
  const Remove = ACTION_ICONS.delete
  // Вибрана дія чекає, доки меню закриється; `chosen` лишається до наступного відкриття: меню може
  // спитати `finalFocus` і після того, як дія вже виконалась.
  const pending = React.useRef<(() => void) | null>(null)
  const chosen = React.useRef(false)
  const choose = (action: () => void) => {
    pending.current = action
    chosen.current = true
  }
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) return
        pending.current = null
        chosen.current = false
      }}
      onOpenChangeComplete={(open) => {
        const action = pending.current
        pending.current = null
        if (!open) action?.()
      }}
    >
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-row-action="menu"
            aria-label={t("repeatingRows.actions", { row: rowLabel })}
            onMouseDown={keepFieldFocus}
          />
        }
      >
        <EllipsisVerticalIcon aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-auto min-w-48"
        finalFocus={() => !chosen.current}
      >
        {canReorder ? (
          <>
            <DropdownMenuItem
              disabled={isFirst}
              onClick={() => {
                choose(() => {
                  onMove(index, index - 1)
                })
              }}
            >
              <ArrowUpIcon aria-hidden />
              {t("repeatingRows.moveUpItem")}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isLast}
              onClick={() => {
                choose(() => {
                  onMove(index, index + 1)
                })
              }}
            >
              <ArrowDownIcon aria-hidden />
              {t("repeatingRows.moveDownItem")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {insertLabels.map((label, kind) => (
          <DropdownMenuItem
            key={label}
            disabled={!canInsert}
            onClick={() => {
              choose(() => {
                onInsert(index, kind)
              })
            }}
          >
            <ACTION_ICONS.create aria-hidden />
            {label}
          </DropdownMenuItem>
        ))}
        {insertLabels.length ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem
          variant="destructive"
          disabled={!canRemove}
          onClick={() => {
            choose(() => {
              onRemove(index)
            })
          }}
        >
          <Remove aria-hidden />
          {t("repeatingRows.removeItem")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
