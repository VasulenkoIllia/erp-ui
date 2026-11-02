import { ArrowDownIcon, ArrowUpIcon } from "lucide-react"

import { keepFieldFocus } from "@/registry/erp/form"
import { useErpUiT } from "@/registry/lib/i18n"
import { ACTION_ICONS } from "@/registry/lib/icons"
import { cn } from "@/registry/lib/utils"
import { Button } from "@/registry/ui/button"

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
  },
  "4xl": {
    list: "@4xl:gap-2",
    row: "@4xl:flex-row @4xl:items-start @4xl:border-0 @4xl:p-0",
    laterLabels: "@4xl:**:data-[slot=field-label]:sr-only",
    actions: "@4xl:self-stretch",
    spacer: "@4xl:block",
  },
} as const satisfies Record<RepeatingRowsTableFrom, Record<string, string>>

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
  const layout = REPEATING_ROWS_LAYOUTS[tableFrom]
  return (
    <div className={cn("flex shrink-0 flex-col gap-2", layout.actions)}>
      {/* Вирівнює кнопки першого рядка з полями, а не з їхніми підписами. */}
      {isFirst ? (
        <span
          aria-hidden
          className={cn("invisible hidden text-sm leading-snug", layout.spacer)}
        >
          &nbsp;
        </span>
      ) : null}
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
    </div>
  )
}
